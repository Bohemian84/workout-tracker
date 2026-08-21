import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut
} from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, firebaseConfigured, googleProvider } from "./firebase";
import {
  MAX_REPS,
  MIN_LOGGED_SETS,
  buildDeloadRecommendation,
  buildRecommendation,
  isProgressionEligible,
  safeNumber
} from "./workoutLogic";

const STORAGE_KEY = "workout-tracker-v1";
const HIDDEN_RECOMMENDATIONS_KEY = "workout-tracker-hidden-recommendations-v1";
const DRAFT_SESSION_KEY = "workout-tracker-draft-session-v1";

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

function getExerciseMeta(name) {
  return EXERCISES.find((e) => e.name === name) || { increment: 5 };
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

function loadDraftSession() {
  try {
    const saved = localStorage.getItem(DRAFT_SESSION_KEY);
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed?.exercises)) return null;
    return parsed;
  } catch (err) {
    console.error("Failed to load current workout", err);
    return null;
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

function SortableDraftExercise({
  item,
  onComplete,
  onEdit,
  onRemove,
  onUpdate
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        ...styles.listItem,
        ...(item.completed ? styles.completedListItem : {}),
        transform: CSS.Transform.toString(transform),
        transition,
        boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.16)" : "none",
        opacity: isDragging ? 0.9 : 1,
        position: "relative",
        zIndex: isDragging ? 1 : "auto"
      }}
    >
      <div style={styles.draftItemToolbar}>
        <button
          ref={setActivatorNodeRef}
          type="button"
          style={styles.dragHandle}
          title="Drag to reorder"
          aria-label={`Drag ${item.exercise} to reorder`}
          {...attributes}
          {...listeners}
        >
          <span aria-hidden="true">⋮⋮</span>
        </button>
        <div style={styles.draftItemActions}>
          {item.completed && (
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => onEdit(item.id)}
            >
              Edit
            </button>
          )}
          <button
            type="button"
            style={styles.deleteButton}
            onClick={() => onRemove(item.id)}
          >
            Remove
          </button>
        </div>
      </div>

      {item.completed ? (
        <div style={styles.completedExercise}>
          <div style={styles.completedExerciseHeading}>
            <strong style={styles.completedExerciseName}>{item.exercise}</strong>
            <span style={styles.completedBadge}>Completed</span>
          </div>
          <div style={styles.completedExerciseSummary}>
            {item.sets} sets × {item.reps} reps @ {item.weight} lb
          </div>
        </div>
      ) : (
        <div style={styles.draftDetails}>
          <label style={styles.label}>Exercise</label>
          <input
            style={styles.input}
            value={item.exercise}
            onChange={(e) => onUpdate(item.id, "exercise", e.target.value)}
          />

          {item.suggested && (
            <div style={styles.suggestionReference}>
              {item.suggested.mode === "deload" ? "Deload target" : "Suggested"}: {item.suggested.sets} sets × {item.suggested.reps} reps @{" "}
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
                onChange={(e) => onUpdate(item.id, "sets", e.target.value)}
              />
            </div>
            <div>
              <label style={styles.label}>Actual Reps</label>
              <input
                style={styles.input}
                type="number"
                min="1"
                value={item.reps}
                onChange={(e) => onUpdate(item.id, "reps", e.target.value)}
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
                onChange={(e) => onUpdate(item.id, "weight", e.target.value)}
              />
            </div>
          </div>
          <div style={styles.actualSummary}>
            Will save: {item.sets} sets × {item.reps} reps @ {item.weight} lb
          </div>
          <div style={styles.buttonRow}>
            <button
              type="button"
              style={styles.completeButton}
              onClick={() => onComplete(item.id)}
            >
              Save Exercise
            </button>
          </div>
        </div>
      )}
      <label style={styles.progressionControl}>
        <input
          type="checkbox"
          style={styles.progressionCheckbox}
          checked={item.useForProgression !== false}
          onChange={(event) =>
            onUpdate(item.id, "useForProgression", event.target.checked)
          }
        />
        <span>Use this exercise for future recommendations</span>
      </label>
    </div>
  );
}

export default function App() {
  const [initialDraft] = useState(loadDraftSession);
  const initialSessionMode = initialDraft?.workoutMode === "deload" ? "deload" : "normal";
  const [sessions, setSessions] = useState([]);
  const [sessionName, setSessionName] = useState(initialDraft?.sessionName || "Gym Session");
  const [sessionDate, setSessionDate] = useState(initialDraft?.date || getLocalDateValue());
  const [sessionMode, setSessionMode] = useState(initialSessionMode);

  const [exercise, setExercise] = useState("Bench Press");
  const [customExercise, setCustomExercise] = useState("");
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState("10");
  const [weight, setWeight] = useState("135");

  const [draftExercises, setDraftExercises] = useState(
    (initialDraft?.exercises || []).map((item) => ({
      ...item,
      useForProgression:
        typeof item.useForProgression === "boolean"
          ? item.useForProgression
          : initialSessionMode !== "deload"
    }))
  );
  const [draftSaveError, setDraftSaveError] = useState("");
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
  const dragSensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 6
      }
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 5
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

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
    try {
      if (draftExercises.length === 0) {
        localStorage.removeItem(DRAFT_SESSION_KEY);
        setDraftSaveError("");
        return;
      }

      localStorage.setItem(
        DRAFT_SESSION_KEY,
        JSON.stringify({
          sessionName,
          date: sessionDate,
          workoutMode: sessionMode,
          exercises: draftExercises,
          updatedAt: new Date().toISOString()
        })
      );
      setDraftSaveError("");
    } catch (err) {
      console.error("Failed to save current workout", err);
      setDraftSaveError("This current workout could not be saved on this device.");
    }
  }, [sessionName, sessionDate, sessionMode, draftExercises]);

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
        if (!isProgressionEligible(session, item)) continue;

        if (!map[item.exercise]) {
          map[item.exercise] = {
            ...item,
            date: session.date,
            sessionName: session.sessionName,
            sessionId: session.id,
            workoutMode: session.workoutMode || "normal"
          };
        }
      }
    }

    return map;
  }, [sortedSessions]);

  const recommendations = useMemo(() => {
    return Object.values(latestByExercise)
      .map((entry) => {
        const increment = getExerciseMeta(entry.exercise).increment;
        const normalRecommendation = buildRecommendation(entry, increment);
        const deloadRecommendation = buildDeloadRecommendation(entry, increment);

        return {
          exercise: entry.exercise,
          date: entry.date,
          sessionName: entry.sessionName,
          sessionId: entry.sessionId,
          baseline: {
            sets: entry.sets,
            reps: entry.reps,
            weight: entry.weight
          },
          recommendation:
            sessionMode === "deload" ? deloadRecommendation : normalRecommendation
        };
      })
      .filter((item) => hiddenRecommendations[item.exercise] !== item.sessionId)
      .sort((a, b) => a.exercise.localeCompare(b.exercise));
  }, [hiddenRecommendations, latestByExercise, sessionMode]);

  const hiddenRecommendationCount = useMemo(() => {
    return Object.values(latestByExercise).filter(
      (entry) => hiddenRecommendations[entry.exercise] === entry.sessionId
    ).length;
  }, [hiddenRecommendations, latestByExercise]);

  const draftExerciseNames = useMemo(
    () => new Set(draftExercises.map((item) => item.exercise)),
    [draftExercises]
  );

  const remainingRecommendationCount = useMemo(
    () => recommendations.filter((item) => !draftExerciseNames.has(item.exercise)).length,
    [draftExerciseNames, recommendations]
  );

  const completedExerciseCount = useMemo(
    () => draftExercises.filter((item) => item.completed).length,
    [draftExercises]
  );
  const completionSummary = `${completedExerciseCount} of ${draftExercises.length} ${
    draftExercises.length === 1 ? "exercise" : "exercises"
  } completed`;

  function getRecommendationForMode(exerciseName, mode) {
    const entry = latestByExercise[exerciseName];
    if (!entry) return null;

    const increment = getExerciseMeta(exerciseName).increment;
    return mode === "deload"
      ? buildDeloadRecommendation(entry, increment)
      : buildRecommendation(entry, increment);
  }

  function matchesSuggestion(item) {
    if (!item.suggested) return false;

    return ["sets", "reps", "weight"].every(
      (field) => safeNumber(item[field]) === safeNumber(item.suggested[field])
    );
  }

  function changeSessionMode(nextMode) {
    if (nextMode === sessionMode) return;

    setDraftExercises((currentExercises) =>
      currentExercises.map((item) => {
        const nextRecommendation = getRecommendationForMode(item.exercise, nextMode);
        const shouldUpdateTarget =
          !item.completed && nextRecommendation && matchesSuggestion(item);

        return {
          ...item,
          ...(shouldUpdateTarget
            ? {
                ...nextRecommendation,
                suggested: {
                  ...nextRecommendation,
                  mode: nextMode
                }
              }
            : {}),
          useForProgression: nextMode !== "deload"
        };
      })
    );

    setSessionMode(nextMode);
    setSessionName((currentName) => {
      if (nextMode === "deload" && ["Gym Session", "Recommended Session"].includes(currentName)) {
        return "Deload Session";
      }
      if (nextMode === "normal" && currentName === "Deload Session") {
        return "Gym Session";
      }
      return currentName;
    });
  }

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
        weight: parsedWeight,
        useForProgression: sessionMode !== "deload"
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

  function reorderDraftExercises({ active, over }) {
    if (!over || active.id === over.id) return;

    setDraftExercises((currentExercises) => {
      const oldIndex = currentExercises.findIndex((item) => item.id === active.id);
      const newIndex = currentExercises.findIndex((item) => item.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return currentExercises;
      return arrayMove(currentExercises, oldIndex, newIndex);
    });
  }

  function normalizeDraftExercise(item) {
    return {
      id: item.id,
      exercise: item.exercise.trim() || "Exercise",
      sets: Math.max(MIN_LOGGED_SETS, safeNumber(item.sets, 3)),
      reps: Math.max(1, safeNumber(item.reps, 10)),
      weight: Math.max(0, safeNumber(item.weight, 0)),
      useForProgression:
        typeof item.useForProgression === "boolean"
          ? item.useForProgression
          : sessionMode !== "deload"
    };
  }

  function completeDraftExercise(id) {
    setDraftExercises((currentExercises) =>
      currentExercises.map((item) => {
        if (item.id !== id) return item;

        return {
          ...item,
          ...normalizeDraftExercise(item),
          completed: true
        };
      })
    );
  }

  function editDraftExercise(id) {
    setDraftExercises((currentExercises) =>
      currentExercises.map((item) =>
        item.id === id ? { ...item, completed: false } : item
      )
    );
  }

  function saveSession() {
    if (draftExercises.length === 0) return;

    const newSession = {
      id: crypto.randomUUID(),
      sessionName: sessionName.trim() || "Gym Session",
      date: sessionDate,
      workoutMode: sessionMode,
      createdAt: new Date().toISOString(),
      exercises: draftExercises.map(normalizeDraftExercise)
    };

    setSessions((prev) => [newSession, ...prev]);
    setDraftExercises([]);
    setSessionName("Gym Session");
    setSessionDate(getLocalDateValue());
    setSessionMode("normal");
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
            useForProgression: sessionMode !== "deload",
            suggested: {
              sets: item.recommendation.sets,
              reps: item.recommendation.reps,
              weight: item.recommendation.weight,
              mode: sessionMode
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
            useForProgression: sessionMode !== "deload",
            suggested: {
              sets: item.recommendation.sets,
              reps: item.recommendation.reps,
              weight: item.recommendation.weight,
              mode: sessionMode
            }
          }));

        return [...prev, ...additions];
      });

      setSessionName(sessionMode === "deload" ? "Deload Session" : "Recommended Session");
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
          Build to 20 reps, then add weight and adjust reps for the size of the weight increase.
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

          <div style={styles.modeField}>
            <label style={styles.label}>Workout Mode</label>
            <div style={styles.segmentedControl} role="group" aria-label="Workout mode">
              <button
                type="button"
                aria-pressed={sessionMode === "normal"}
                style={
                  sessionMode === "normal"
                    ? styles.activeNormalSegment
                    : styles.inactiveSegment
                }
                onClick={() => changeSessionMode("normal")}
              >
                Normal
              </button>
              <button
                type="button"
                aria-pressed={sessionMode === "deload"}
                style={
                  sessionMode === "deload"
                    ? styles.activeDeloadSegment
                    : styles.inactiveSegment
                }
                onClick={() => changeSessionMode("deload")}
              >
                Deload
              </button>
            </div>
            {sessionMode === "deload" && (
              <p style={styles.deloadNotice}>
                Deload targets use your last progression workout and are excluded from future
                recommendations unless you opt an exercise back in.
              </p>
            )}
          </div>

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
            <div style={styles.currentSessionHeading}>
              <h3 style={styles.flushHeading}>Current Session</h3>
              {sessionMode === "deload" && <span style={styles.deloadBadge}>Deload</span>}
            </div>

            {draftExercises.length > 0 && (
              <>
                <p
                  aria-live="polite"
                  style={draftSaveError ? styles.errorText : styles.draftStatus}
                >
                  {draftSaveError || "Current workout saved on this device"}
                </p>
                <div style={styles.completionStatus} aria-live="polite">
                  <strong>{completionSummary}</strong>
                  <progress
                    style={styles.completionProgress}
                    max={draftExercises.length}
                    value={completedExerciseCount}
                    aria-label={completionSummary}
                  />
                </div>
              </>
            )}

            {draftExercises.length === 0 ? (
              <p>No exercises added yet.</p>
            ) : (
              <DndContext
                sensors={dragSensors}
                collisionDetection={closestCenter}
                onDragEnd={reorderDraftExercises}
              >
                <SortableContext
                  items={draftExercises.map((item) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {draftExercises.map((item) => (
                    <SortableDraftExercise
                      key={item.id}
                      item={item}
                      onComplete={completeDraftExercise}
                      onEdit={editDraftExercise}
                      onRemove={removeDraftExercise}
                      onUpdate={updateDraftExercise}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}

            <div style={styles.buttonRow}>
              <button style={styles.button} onClick={saveSession} disabled={draftExercises.length === 0}>
                Save Full Session
              </button>
            </div>
          </div>
        </div>

        <div ref={recommendationsSectionRef} style={styles.section}>
          <div style={styles.headerRow}>
            <div style={styles.currentSessionHeading}>
              <h2 style={styles.flushHeading}>Recommendations</h2>
              {sessionMode === "deload" && <span style={styles.deloadBadge}>Deload</span>}
            </div>
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
                disabled={remainingRecommendationCount === 0}
              >
                {recommendations.length === 0
                  ? "No Recommendations"
                  : remainingRecommendationCount === 0
                  ? "All Recommendations Added"
                  : sessionMode === "deload"
                  ? `Use All Deload Targets (${remainingRecommendationCount})`
                  : `Use All Recommendations (${remainingRecommendationCount})`}
              </button>
            </div>
          </div>

          {showRecommendations && (
            recommendations.length === 0 ? (
              <p>
                {hiddenRecommendationCount > 0
                  ? "No active suggestions. Restore deleted suggestions to see hidden ones again."
                  : "Save an exercise that is used for progression to see recommendations."}
              </p>
            ) : (
              recommendations.map((item) => (
                <div key={item.exercise} style={styles.card}>
                  <strong>{item.exercise}</strong>
                  <div style={{ marginTop: 8 }}>
                    Last progression workout: {formatDate(item.date)}
                  </div>
                  <div>From session: {item.sessionName}</div>
                  {sessionMode === "deload" && (
                    <div>
                      Based on: {item.baseline.sets} sets × {item.baseline.reps} reps @{" "}
                      {item.baseline.weight} lb
                    </div>
                  )}
                  <div style={{ marginTop: 8 }}>
                    {sessionMode === "deload" ? "Deload target" : "Recommended"}:{" "}
                    {item.recommendation.sets} sets × {item.recommendation.reps} reps @{" "}
                    {item.recommendation.weight} lb
                  </div>
                  <div style={{ marginTop: 8, color: "#555" }}>
                    {sessionMode === "deload"
                      ? "Rule: use 90% weight, half the sets, and 75% of the reps from the last progression workout. Weight rounds down unless that would reduce it by more than 25%. Keep every set comfortably short of failure."
                      : "Rule: add one rep at a time up to 20. After 20, add weight and reduce the rep target based on the percentage weight increase, with a minimum of 10 reps."}
                  </div>
                  <div style={styles.buttonRow}>
                    <button
                      style={
                        draftExerciseNames.has(item.exercise)
                          ? styles.addedButton
                          : styles.secondaryButton
                      }
                      onClick={() => addRecommendationToDraft(item)}
                      disabled={draftExerciseNames.has(item.exercise)}
                    >
                      {draftExerciseNames.has(item.exercise)
                        ? "Added to Current Workout"
                        : sessionMode === "deload"
                        ? "Use Deload Target"
                        : "Use Recommendation"}
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
                      <div style={styles.historyTitleRow}>
                        <strong>{session.sessionName}</strong>
                        {session.workoutMode === "deload" && (
                          <span style={styles.deloadBadge}>Deload</span>
                        )}
                      </div>
                      <div>{formatDate(session.date)}</div>
                    </div>
                    <button style={styles.deleteButton} onClick={() => deleteSession(session.id)}>
                      Delete
                    </button>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    {session.exercises.map((item) => {
                      const usedForProgression = isProgressionEligible(session, item);

                      return (
                        <div key={item.id} style={styles.smallCard}>
                          <strong>{item.exercise}</strong>
                          <div>
                            {item.sets} sets × {item.reps} reps @ {item.weight} lb
                          </div>
                          {!usedForProgression && (
                            <div style={styles.progressionExcluded}>
                              Not used for future recommendations
                            </div>
                          )}
                          {session.workoutMode === "deload" && usedForProgression && (
                            <div style={styles.progressionIncluded}>
                              Used for future recommendations
                            </div>
                          )}
                        </div>
                      );
                    })}
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
  draftStatus: {
    color: "#166534",
    marginTop: 6,
    marginBottom: 14,
    fontWeight: 600
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
  modeField: {
    marginBottom: 16
  },
  segmentedControl: {
    display: "inline-grid",
    gridTemplateColumns: "repeat(2, minmax(100px, 1fr))",
    border: "1px solid #aeb5bd",
    borderRadius: 8,
    overflow: "hidden"
  },
  inactiveSegment: {
    minHeight: 44,
    padding: "8px 16px",
    border: "none",
    background: "#fff",
    color: "#333",
    cursor: "pointer"
  },
  activeNormalSegment: {
    minHeight: 44,
    padding: "8px 16px",
    border: "none",
    background: "#2563eb",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer"
  },
  activeDeloadSegment: {
    minHeight: 44,
    padding: "8px 16px",
    border: "none",
    background: "#167547",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer"
  },
  deloadNotice: {
    maxWidth: 680,
    marginTop: 10,
    marginBottom: 0,
    padding: "10px 12px",
    borderLeft: "4px solid #167547",
    background: "#f1f8f3",
    color: "#28543a"
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
  completeButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    background: "#167547",
    color: "#fff",
    cursor: "pointer"
  },
  addedButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #86b893",
    background: "#eef8f0",
    color: "#166534",
    cursor: "default"
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
    border: "1px solid #e3e3e3",
    borderRadius: 8,
    padding: 12,
    background: "#fff",
    marginBottom: 10
  },
  currentSessionHeading: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap"
  },
  flushHeading: {
    margin: 0
  },
  deloadBadge: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 26,
    padding: "2px 8px",
    borderRadius: 8,
    background: "#dff3e5",
    color: "#166534",
    fontSize: 13,
    fontWeight: 700
  },
  completedListItem: {
    borderColor: "#86b893",
    background: "#f5fbf6"
  },
  draftItemToolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 10
  },
  draftItemActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flexWrap: "wrap"
  },
  dragHandle: {
    width: 44,
    height: 44,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    border: "1px solid #bbb",
    background: "#fff",
    color: "#444",
    cursor: "grab",
    fontSize: 22,
    lineHeight: 1,
    touchAction: "none",
    userSelect: "none"
  },
  draftDetails: {
    width: "100%"
  },
  progressionControl: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    marginTop: 14,
    paddingTop: 12,
    borderTop: "1px solid #e3e3e3",
    fontWeight: 600,
    cursor: "pointer"
  },
  progressionCheckbox: {
    width: 20,
    height: 20,
    flex: "0 0 20px",
    margin: 0,
    accentColor: "#2563eb"
  },
  completedExercise: {
    width: "100%"
  },
  completedExerciseHeading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap"
  },
  completedExerciseName: {
    overflowWrap: "anywhere"
  },
  completedBadge: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 28,
    padding: "3px 9px",
    borderRadius: 8,
    background: "#dff3e5",
    color: "#166534",
    fontSize: 14,
    fontWeight: 700
  },
  completedExerciseSummary: {
    marginTop: 8,
    color: "#28543a",
    fontWeight: 600
  },
  historyTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap"
  },
  progressionExcluded: {
    marginTop: 6,
    color: "#666",
    fontSize: 14,
    fontWeight: 600
  },
  progressionIncluded: {
    marginTop: 6,
    color: "#166534",
    fontSize: 14,
    fontWeight: 600
  },
  suggestionReference: {
    color: "#555",
    marginTop: 10
  },
  actualSummary: {
    fontWeight: 600
  },
  completionStatus: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
    flexWrap: "wrap"
  },
  completionProgress: {
    width: 180,
    maxWidth: "100%",
    height: 12,
    accentColor: "#167547"
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
