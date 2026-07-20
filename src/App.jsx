import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut
} from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, firebaseConfigured, googleProvider } from "./firebase";

const STORAGE_KEY = "workout-tracker-v1";
const HIDDEN_RECOMMENDATIONS_KEY = "workout-tracker-hidden-recommendations-v1";

const EXERCISES = [
  { name: "Bench Press", increment: 2.5 },
  { name: "Squat", increment: 5 },
  { name: "Deadlift", increment: 5 },
  { name: "Overhead Press", increment: 2.5 },
  { name: "Row", increment: 5 },
  { name: "Lat Pulldown", increment: 5 },
  { name: "Leg Press", increment: 10 },
  { name: "Romanian Deadlift", increment: 5 },
  { name: "Bulgarian Split Squat", increment: 5 },
  { name: "Shoulder Press", increment: 2.5 },
  { name: "Face Pull", increment: 5 },
  { name: "Custom Exercise", increment: 5 }
];

const MIN_REPS = 10;
const MAX_REPS = 20;
const MIN_SETS = 2;
const MAX_SETS = 4;
const MIN_LOGGED_SETS = 1;

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseLocalDate(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) return new Date(dateString);

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function getLocalDateValue(date = new Date()) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function formatDate(dateString) {
  return parseLocalDate(dateString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function roundToIncrement(value, increment) {
  if (!increment || increment <= 0) return value;
  return Math.round(value / increment) * increment;
}

function getExerciseMeta(name) {
  return EXERCISES.find((e) => e.name === name) || { increment: 5 };
}

function getVolume(entry) {
  return entry.sets * entry.reps * entry.weight;
}

function getWeekDifference(fromDate, toDate) {
  const diffMs = new Date(toDate).getTime() - parseLocalDate(fromDate).getTime();
  return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7)));
}

function getSessionTime(session) {
  return session.createdAt
    ? new Date(session.createdAt).getTime()
    : parseLocalDate(session.date).getTime();
}

function loadLocalSessions() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (err) {
    console.error("Failed to load saved data", err);
    return [];
  }
}

function loadHiddenRecommendations() {
  try {
    const saved = localStorage.getItem(HIDDEN_RECOMMENDATIONS_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch (err) {
    console.error("Failed to load hidden recommendations", err);
    return {};
  }
}

function mergeSessions(primarySessions, secondarySessions) {
  const seen = new Set();
  return [...primarySessions, ...secondarySessions].filter((session) => {
    if (!session?.id || seen.has(session.id)) return false;
    seen.add(session.id);
    return true;
  });
}

function getMigrationKey(uid) {
  return `${STORAGE_KEY}-cloud-migrated-${uid}`;
}

function buildRecommendation(entry) {
  let sets = Math.min(MAX_SETS, Math.max(MIN_SETS, safeNumber(entry.sets, 3)));
  let reps = Math.min(MAX_REPS, Math.max(MIN_REPS, safeNumber(entry.reps, 10)));
  let weight = safeNumber(entry.weight, 0);

  const increment = getExerciseMeta(entry.exercise).increment;
  const targetVolume = getVolume(entry) * Math.pow(1.05, getWeekDifference(entry.date, new Date()));

  while (sets * reps * weight < targetVolume) {
    if (reps < MAX_REPS) {
      reps += 1;
      continue;
    }

    if (weight > 0) {
      weight = roundToIncrement(weight + increment, increment);
      reps = MIN_REPS;

      if (sets * reps * weight >= targetVolume) {
        break;
      }

      continue;
    }

    if (sets < MAX_SETS) {
      sets += 1;
      continue;
    }

    break;
  }

  return {
    sets,
    reps,
    weight,
    targetVolume: Math.round(targetVolume)
  };
}

export default function App() {
  const [sessions, setSessions] = useState([]);
  const [sessionName, setSessionName] = useState("Gym Session");
  const [sessionDate, setSessionDate] = useState(getLocalDateValue());

  const [exercise, setExercise] = useState("Bench Press");
  const [customExercise, setCustomExercise] = useState("");
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState("10");
  const [weight, setWeight] = useState("135");

  const [draftExercises, setDraftExercises] = useState([]);
  const [hiddenRecommendations, setHiddenRecommendations] = useState({});
  const [showRecommendations, setShowRecommendations] = useState(true);
  const [showHistory, setShowHistory] = useState(true);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(!firebaseConfigured);
  const [cloudReady, setCloudReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState(firebaseConfigured ? "Checking sign-in..." : "Local-only mode");
  const [syncError, setSyncError] = useState("");
  const lastCloudDataJson = useRef("");
  const recommendationsSectionRef = useRef(null);

  useEffect(() => {
    setSessions(loadLocalSessions());
    setHiddenRecommendations(loadHiddenRecommendations());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (err) {
      console.error("Failed to save data", err);
    }
  }, [sessions]);

  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_RECOMMENDATIONS_KEY, JSON.stringify(hiddenRecommendations));
    } catch (err) {
      console.error("Failed to save hidden recommendations", err);
    }
  }, [hiddenRecommendations]);

  useEffect(() => {
    if (!auth) return undefined;

    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.error("Failed to set auth persistence", err);
      setSyncError("This browser may not keep you signed in between visits.");
    });

    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      setCloudReady(false);
      setSyncError("");
      setSyncStatus(currentUser ? "Loading cloud history..." : "Signed out. Saving on this device only.");
    });
  }, []);

  useEffect(() => {
    if (!user || !db) return undefined;

    const historyRef = doc(db, "users", user.uid, "workoutData", "history");

    return onSnapshot(
      historyRef,
      async (snapshot) => {
        const remoteSessions = Array.isArray(snapshot.data()?.sessions) ? snapshot.data().sessions : [];
        const remoteHiddenRecommendations =
          snapshot.data()?.hiddenRecommendations && typeof snapshot.data().hiddenRecommendations === "object"
            ? snapshot.data().hiddenRecommendations
            : {};
        const localSessions = loadLocalSessions();
        const localHiddenRecommendations = loadHiddenRecommendations();
        const migrationKey = getMigrationKey(user.uid);
        const alreadyMigrated = localStorage.getItem(migrationKey) === "true";
        const mergedSessions = alreadyMigrated ? remoteSessions : mergeSessions(remoteSessions, localSessions);
        const mergedHiddenRecommendations = alreadyMigrated
          ? remoteHiddenRecommendations
          : { ...remoteHiddenRecommendations, ...localHiddenRecommendations };
        const hasLocalSessionsToUpload = !alreadyMigrated && mergedSessions.length > remoteSessions.length;
        const hasHiddenRecommendationsToUpload =
          !alreadyMigrated &&
          JSON.stringify(mergedHiddenRecommendations) !== JSON.stringify(remoteHiddenRecommendations);
        const hasLocalDataToUpload = hasLocalSessionsToUpload || hasHiddenRecommendationsToUpload;

        lastCloudDataJson.current = JSON.stringify({
          sessions: mergedSessions,
          hiddenRecommendations: mergedHiddenRecommendations
        });
        setSessions(mergedSessions);
        setHiddenRecommendations(mergedHiddenRecommendations);
        setCloudReady(true);
        setSyncStatus(hasLocalDataToUpload ? "Uploading local history..." : "Cloud history loaded.");

        if (hasLocalDataToUpload) {
          try {
            await setDoc(
              historyRef,
              {
                sessions: mergedSessions,
                hiddenRecommendations: mergedHiddenRecommendations,
                updatedAt: serverTimestamp()
              },
              { merge: true }
            );
            lastCloudDataJson.current = JSON.stringify({
              sessions: mergedSessions,
              hiddenRecommendations: mergedHiddenRecommendations
            });
            localStorage.setItem(migrationKey, "true");
            setSyncStatus("Local history added to your account.");
          } catch (err) {
            console.error("Failed to upload local history", err);
            setSyncError("Could not upload local history. Your device copy is still saved.");
          }
        } else {
          localStorage.setItem(migrationKey, "true");
        }
      },
      (err) => {
        console.error("Failed to sync cloud history", err);
        setCloudReady(false);
        setSyncError("Could not load cloud history. Changes are still saved on this device.");
      }
    );
  }, [user]);

  useEffect(() => {
    if (!user || !db || !cloudReady) return;

    const cloudDataJson = JSON.stringify({ sessions, hiddenRecommendations });
    if (cloudDataJson === lastCloudDataJson.current) return;

    const saveCloudHistory = async () => {
      try {
        await setDoc(
          doc(db, "users", user.uid, "workoutData", "history"),
          {
            sessions,
            hiddenRecommendations,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );
        lastCloudDataJson.current = cloudDataJson;
        setSyncStatus("Cloud history saved.");
        setSyncError("");
      } catch (err) {
        console.error("Failed to save cloud history", err);
        setSyncError("Could not save to cloud. Your device copy is still saved.");
      }
    };

    saveCloudHistory();
  }, [sessions, hiddenRecommendations, user, cloudReady]);

  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      const dateDiff = parseLocalDate(b.date) - parseLocalDate(a.date);
      return dateDiff || getSessionTime(b) - getSessionTime(a);
    });
  }, [sessions]);

  const latestByExercise = useMemo(() => {
    const map = {};

    for (const session of sortedSessions) {
      for (const item of session.exercises) {
        if (!map[item.exercise]) {
          map[item.exercise] = {
            ...item,
            date: session.date,
            sessionName: session.sessionName,
            sessionId: session.id
          };
        }
      }
    }

    return map;
  }, [sortedSessions]);

  const recommendations = useMemo(() => {
    return Object.values(latestByExercise)
      .map((entry) => ({
        exercise: entry.exercise,
        date: entry.date,
        sessionName: entry.sessionName,
        sessionId: entry.sessionId,
        recommendation: buildRecommendation(entry)
      }))
      .filter((item) => hiddenRecommendations[item.exercise] !== item.sessionId)
      .sort((a, b) => a.exercise.localeCompare(b.exercise));
  }, [hiddenRecommendations, latestByExercise]);

  const hiddenRecommendationCount = useMemo(() => {
    return Object.values(latestByExercise).filter(
      (entry) => hiddenRecommendations[entry.exercise] === entry.sessionId
    ).length;
  }, [hiddenRecommendations, latestByExercise]);

  function resetExerciseForm() {
    setExercise("Bench Press");
    setCustomExercise("");
    setSets("3");
    setReps("10");
    setWeight("135");
  }

  function addExerciseToDraft() {
    const finalExercise = exercise === "Custom Exercise" ? customExercise.trim() : exercise;
    if (!finalExercise) return;

    const parsedSets = Math.max(MIN_LOGGED_SETS, safeNumber(sets, 3));
    const parsedReps = Math.max(1, safeNumber(reps, 10));
    const parsedWeight = Math.max(0, safeNumber(weight, 0));

    setDraftExercises((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        exercise: finalExercise,
        sets: parsedSets,
        reps: parsedReps,
        weight: parsedWeight
      }
    ]);

    resetExerciseForm();
  }

  function removeDraftExercise(id) {
    setDraftExercises((prev) => prev.filter((item) => item.id !== id));
  }

  function updateDraftExercise(id, field, value) {
    setDraftExercises((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  }

  function normalizeDraftExercise(item) {
    return {
      id: item.id,
      exercise: item.exercise.trim() || "Exercise",
      sets: Math.max(MIN_LOGGED_SETS, safeNumber(item.sets, 3)),
      reps: Math.max(1, safeNumber(item.reps, 10)),
      weight: Math.max(0, safeNumber(item.weight, 0))
    };
  }

  function saveSession() {
    if (draftExercises.length === 0) return;

    const newSession = {
      id: crypto.randomUUID(),
      sessionName: sessionName.trim() || "Gym Session",
      date: sessionDate,
      createdAt: new Date().toISOString(),
      exercises: draftExercises.map(normalizeDraftExercise)
    };

    setSessions((prev) => [newSession, ...prev]);
    setDraftExercises([]);
    setSessionName("Gym Session");
    setSessionDate(getLocalDateValue());
    resetExerciseForm();
  }

  function deleteSession(id) {
    setSessions((prev) => prev.filter((session) => session.id !== id));
  }

  function hideRecommendation(item) {
    setHiddenRecommendations((prev) => ({
      ...prev,
      [item.exercise]: item.sessionId
    }));
  }

  function restoreHiddenRecommendations() {
    setHiddenRecommendations({});
  }

  function preserveRecommendationsPosition(update) {
    const previousTop = recommendationsSectionRef.current?.getBoundingClientRect().top;
    update();

    if (previousTop === undefined) return;

    requestAnimationFrame(() => {
      const currentTop = recommendationsSectionRef.current?.getBoundingClientRect().top;
      if (currentTop !== undefined) {
        window.scrollBy(0, currentTop - previousTop);
      }
    });
  }

  function addRecommendationToDraft(item) {
    preserveRecommendationsPosition(() => {
      setDraftExercises((prev) => {
        const alreadyExists = prev.some((exercise) => exercise.exercise === item.exercise);
        if (alreadyExists) return prev;

        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            exercise: item.exercise,
            sets: item.recommendation.sets,
            reps: item.recommendation.reps,
            weight: item.recommendation.weight,
            suggested: {
              sets: item.recommendation.sets,
              reps: item.recommendation.reps,
              weight: item.recommendation.weight
            }
          }
        ];
      });
    });
  }

  function useAllRecommendations() {
    preserveRecommendationsPosition(() => {
      setDraftExercises((prev) => {
        const existingNames = new Set(prev.map((x) => x.exercise));

        const additions = recommendations
          .filter((item) => !existingNames.has(item.exercise))
          .map((item) => ({
            id: crypto.randomUUID(),
            exercise: item.exercise,
            sets: item.recommendation.sets,
            reps: item.recommendation.reps,
            weight: item.recommendation.weight,
            suggested: {
              sets: item.recommendation.sets,
              reps: item.recommendation.reps,
              weight: item.recommendation.weight
            }
          }));

        return [...prev, ...additions];
      });

      setSessionName("Recommended Session");
      setSessionDate(getLocalDateValue());
    });
  }

  async function signInWithGoogle() {
    if (!auth) return;

    try {
      setSyncError("");
      setSyncStatus("Opening Google sign-in...");
      await setPersistence(auth, browserLocalPersistence);
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Failed to sign in", err);
      setSyncStatus("Signed out. Saving on this device only.");
      setSyncError("Google sign-in did not finish. Try again when you are ready.");
    }
  }

  async function signOutOfGoogle() {
    if (!auth) return;

    try {
      await signOut(auth);
      setCloudReady(false);
    } catch (err) {
      console.error("Failed to sign out", err);
      setSyncError("Could not sign out. Please try again.");
    }
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(sessions, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "workout-sessions.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(String(e.target?.result || "[]"));
        if (Array.isArray(parsed)) {
          setSessions(parsed);
        }
      } catch (err) {
        console.error("Invalid import file", err);
      }
    };
    reader.readAsText(file);
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>Workout Tracker</h1>
        <p style={styles.subtitle}>
          Log full gym sessions and get recommendations that increase reps first, then weight, then sets.
        </p>

        <div style={styles.section}>
          <div style={styles.headerRow}>
            <div>
              <h2>Account</h2>
              {user ? (
                <p style={styles.statusText}>
                  Signed in as {user.displayName || user.email}. {syncStatus}
                </p>
              ) : (
                <p style={styles.statusText}>
                  {firebaseConfigured
                    ? "Sign in with Google to sync workout history between devices."
                    : "Firebase is not configured yet. History is saved on this device only."}
                </p>
              )}
              {syncError && <p style={styles.errorText}>{syncError}</p>}
            </div>
            {firebaseConfigured && (
              user ? (
                <button style={styles.secondaryButton} onClick={signOutOfGoogle}>
                  Sign Out
                </button>
              ) : (
                <button style={styles.button} onClick={signInWithGoogle} disabled={!authReady}>
                  Sign In with Google
                </button>
              )
            )}
          </div>
        </div>

        <div style={styles.section}>
          <h2>Log Session</h2>

          <div style={styles.grid}>
            <div>
              <label style={styles.label}>Session Name</label>
              <input
                style={styles.input}
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
              />
            </div>

            <div>
              <label style={styles.label}>Date</label>
              <input
                style={styles.input}
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
              />
            </div>
          </div>

          <div style={styles.card}>
            <h3>Add Exercise</h3>

            <div style={styles.grid}>
              <div>
                <label style={styles.label}>Exercise</label>
                <select
                  style={styles.input}
                  value={exercise}
                  onChange={(e) => setExercise(e.target.value)}
                >
                  {EXERCISES.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              {exercise === "Custom Exercise" && (
                <div>
                  <label style={styles.label}>Custom Exercise Name</label>
                  <input
                    style={styles.input}
                    value={customExercise}
                    onChange={(e) => setCustomExercise(e.target.value)}
                  />
                </div>
              )}

              <div>
                <label style={styles.label}>Sets</label>
                <input
                  style={styles.input}
                  type="number"
                  min="1"
                  value={sets}
                  onChange={(e) => setSets(e.target.value)}
                />
              </div>

              <div>
                <label style={styles.label}>Reps</label>
                <input
                  style={styles.input}
                  type="number"
                  min="1"
                  value={reps}
                  onChange={(e) => setReps(e.target.value)}
                />
              </div>

              <div>
                <label style={styles.label}>Weight</label>
                <input
                  style={styles.input}
                  type="number"
                  step="0.5"
                  min="0"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </div>
            </div>

            <div style={styles.buttonRow}>
              <button style={styles.button} onClick={addExerciseToDraft}>
                Add Exercise
              </button>
              <button style={styles.secondaryButton} onClick={resetExerciseForm}>
                Reset
              </button>
            </div>
          </div>

          <div style={styles.card}>
            <h3>Current Session</h3>

            {draftExercises.length === 0 ? (
              <p>No exercises added yet.</p>
            ) : (
              draftExercises.map((item) => (
                <div key={item.id} style={styles.listItem}>
                  <div style={styles.draftDetails}>
                    <label style={styles.label}>Exercise</label>
                    <input
                      style={styles.input}
                      value={item.exercise}
                      onChange={(e) => updateDraftExercise(item.id, "exercise", e.target.value)}
                    />

                    {item.suggested && (
                      <div style={styles.suggestionReference}>
                        Suggested: {item.suggested.sets} sets × {item.suggested.reps} reps @{" "}
                        {item.suggested.weight} lb
                      </div>
                    )}

                    <div style={styles.compactGrid}>
                      <div>
                        <label style={styles.label}>Actual Sets</label>
                        <input
                          style={styles.input}
                          type="number"
                          min="1"
                          value={item.sets}
                          onChange={(e) => updateDraftExercise(item.id, "sets", e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={styles.label}>Actual Reps</label>
                        <input
                          style={styles.input}
                          type="number"
                          min="1"
                          value={item.reps}
                          onChange={(e) => updateDraftExercise(item.id, "reps", e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={styles.label}>Actual Weight</label>
                        <input
                          style={styles.input}
                          type="number"
                          step="0.5"
                          min="0"
                          value={item.weight}
                          onChange={(e) => updateDraftExercise(item.id, "weight", e.target.value)}
                        />
                      </div>
                    </div>
                    <div style={styles.actualSummary}>
                      Will save: {item.sets} sets × {item.reps} reps @ {item.weight} lb
                    </div>
                  </div>
                  <button style={styles.deleteButton} onClick={() => removeDraftExercise(item.id)}>
                    Remove
                  </button>
                </div>
              ))
            )}

            <div style={styles.buttonRow}>
              <button style={styles.button} onClick={saveSession} disabled={draftExercises.length === 0}>
                Save Session
              </button>
            </div>
          </div>
        </div>

        <div ref={recommendationsSectionRef} style={styles.section}>
          <div style={styles.headerRow}>
            <h2>Recommendations</h2>
            <div style={styles.buttonRow}>
              <button style={styles.secondaryButton} onClick={() => setShowRecommendations((show) => !show)}>
                {showRecommendations ? "Minimize" : "Show"}
              </button>
              {hiddenRecommendationCount > 0 && (
                <button style={styles.secondaryButton} onClick={restoreHiddenRecommendations}>
                  Restore Deleted Suggestions
                </button>
              )}
              <button
                style={styles.button}
                onClick={useAllRecommendations}
                disabled={recommendations.length === 0}
              >
                Use All Recommendations
              </button>
            </div>
          </div>

          {showRecommendations && (
            recommendations.length === 0 ? (
              <p>
                {hiddenRecommendationCount > 0
                  ? "No active suggestions. Restore deleted suggestions to see hidden ones again."
                  : "Save your first session to see recommendations."}
              </p>
            ) : (
              recommendations.map((item) => (
                <div key={item.exercise} style={styles.card}>
                  <strong>{item.exercise}</strong>
                  <div style={{ marginTop: 8 }}>Last logged: {formatDate(item.date)}</div>
                  <div>From session: {item.sessionName}</div>
                  <div style={{ marginTop: 8 }}>
                    Recommended: {item.recommendation.sets} sets × {item.recommendation.reps} reps @{" "}
                    {item.recommendation.weight} lb
                  </div>
                  <div style={{ marginTop: 8, color: "#555" }}>
                    Rule: increase reps first, then weight, then sets. Reps stay between 10 and 20.
                    Sets stay between 2 and 4.
                  </div>
                  <div style={styles.buttonRow}>
                    <button style={styles.secondaryButton} onClick={() => addRecommendationToDraft(item)}>
                      Use Recommendation
                    </button>
                    <button style={styles.deleteButton} onClick={() => hideRecommendation(item)}>
                      Delete Suggestion
                    </button>
                  </div>
                </div>
              ))
            )
          )}
        </div>

        <div style={styles.section}>
          <div style={styles.headerRow}>
            <h2>History</h2>
            <div style={styles.buttonRow}>
              <button style={styles.secondaryButton} onClick={() => setShowHistory((show) => !show)}>
                {showHistory ? "Minimize" : "Show"}
              </button>
              <button style={styles.secondaryButton} onClick={exportData}>
                Export
              </button>
              <label style={styles.uploadLabel}>
                Import
                <input
                  type="file"
                  accept="application/json"
                  onChange={importData}
                  style={{ display: "none" }}
                />
              </label>
            </div>
          </div>

          {showHistory && (
            sortedSessions.length === 0 ? (
              <p>No saved sessions yet.</p>
            ) : (
              sortedSessions.map((session) => (
                <div key={session.id} style={styles.card}>
                  <div style={styles.headerRow}>
                    <div>
                      <strong>{session.sessionName}</strong>
                      <div>{formatDate(session.date)}</div>
                    </div>
                    <button style={styles.deleteButton} onClick={() => deleteSession(session.id)}>
                      Delete
                    </button>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    {session.exercises.map((item) => (
                      <div key={item.id} style={styles.smallCard}>
                        <strong>{item.exercise}</strong>
                        <div>
                          {item.sets} sets × {item.reps} reps @ {item.weight} lb
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    background: "#f4f6f8",
    minHeight: "100vh",
    padding: 20,
    fontFamily: "Arial, sans-serif"
  },
  container: {
    maxWidth: 900,
    margin: "0 auto"
  },
  title: {
    marginBottom: 8
  },
  subtitle: {
    color: "#555",
    marginBottom: 24
  },
  statusText: {
    color: "#555",
    marginTop: 6,
    marginBottom: 0
  },
  errorText: {
    color: "#b91c1c",
    marginTop: 8,
    marginBottom: 0
  },
  section: {
    background: "#fff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)"
  },
  card: {
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: 16,
    marginTop: 16,
    background: "#fafafa"
  },
  smallCard: {
    border: "1px solid #e3e3e3",
    borderRadius: 8,
    padding: 12,
    background: "#fff",
    marginBottom: 8
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12
  },
  label: {
    display: "block",
    marginBottom: 6,
    fontWeight: 600
  },
  input: {
    width: "100%",
    padding: 10,
    borderRadius: 8,
    border: "1px solid #ccc",
    boxSizing: "border-box"
  },
  buttonRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 12
  },
  button: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    background: "#2563eb",
    color: "#fff",
    cursor: "pointer"
  },
  secondaryButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #ccc",
    background: "#fff",
    cursor: "pointer"
  },
  deleteButton: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #d33",
    background: "#fff",
    color: "#d33",
    cursor: "pointer"
  },
  uploadLabel: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #ccc",
    background: "#fff",
    cursor: "pointer",
    display: "inline-block"
  },
  listItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    border: "1px solid #e3e3e3",
    borderRadius: 8,
    padding: 12,
    background: "#fff",
    marginBottom: 10
  },
  draftDetails: {
    flex: "1 1 520px"
  },
  suggestionReference: {
    color: "#555",
    marginTop: 10
  },
  actualSummary: {
    fontWeight: 600
  },
  compactGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: 12,
    marginTop: 12,
    marginBottom: 8
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap"
  }
};
