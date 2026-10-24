import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_LOGGED_SETS,
  buildDeloadRecommendation,
  buildRecommendation,
  formatExerciseSummary,
  getExerciseSetError,
  getSetReps,
  isValidRepCount,
  matchesSuggestion,
  normalizeExerciseSets,
  updateExerciseSetCount
} from "./workoutLogic.js";

test("old exercises and recommendation targets prefill one rep field per set", () => {
  const old = Object.freeze({ sets: 3, reps: 12, weight: 100 });
  assert.deepEqual(getSetReps(old), [12, 12, 12]);
  assert.equal(old.setReps, undefined);
  const recommendation = buildRecommendation(old, 5);
  assert.deepEqual(getSetReps(recommendation), [13, 13, 13]);
});

test("saving different reps preserves every set and a conservative legacy baseline", () => {
  const draft = Object.freeze({ sets: "3", reps: 14, setReps: Object.freeze(["14", "12", "10"]) });
  assert.deepEqual(normalizeExerciseSets(draft), { sets: 3, reps: 10, setReps: [14, 12, 10] });
  assert.deepEqual(draft.setReps, ["14", "12", "10"]);
});

test("one set and zero completed reps are saved exactly as entered", () => {
  assert.deepEqual(normalizeExerciseSets({ sets: 1, setReps: ["0"] }), {
    sets: 1, reps: 0, setReps: [0]
  });
  assert.deepEqual(normalizeExerciseSets({ sets: 1, reps: 12 }), {
    sets: 1, reps: 12, setReps: [12]
  });
});

test("adding a set preserves previous entries and prefills only the new set", () => {
  const draft = Object.freeze({ sets: 3, reps: 14, setReps: Object.freeze(["14", "12", "10"]) });
  const updated = updateExerciseSetCount(draft, "4");
  assert.deepEqual(updated.setReps, ["14", "12", "10", 14]);
  assert.deepEqual(draft.setReps, ["14", "12", "10"]);
});

test("editing the set count does not erase hidden reps before saving", () => {
  const draft = { sets: 3, reps: 14, setReps: [14, 12, 10] };
  const blank = updateExerciseSetCount(draft, "");
  assert.deepEqual(blank.setReps, [14, 12, 10]);
  assert.ok(getExerciseSetError(blank));
  const reduced = updateExerciseSetCount(blank, "1");
  assert.deepEqual(getSetReps(reduced), [14]);
  const restored = updateExerciseSetCount(reduced, "3");
  assert.deepEqual(getSetReps(restored), [14, 12, 10]);
  assert.deepEqual(normalizeExerciseSets(reduced), { sets: 1, reps: 14, setReps: [14] });
});

test("cleared, fractional, negative, and nonnumeric reps cannot be saved", () => {
  for (const reps of ["", " ", "-1", "1.5", "abc", Infinity, null, undefined, true]) {
    const draft = { sets: 3, setReps: [14, reps, 10] };
    assert.equal(isValidRepCount(reps), false);
    assert.ok(getExerciseSetError(draft));
    assert.throws(() => normalizeExerciseSets(draft));
  }
  for (const reps of [0, "0", 1, "14", 25]) assert.equal(isValidRepCount(reps), true);
});

test("set count validation prevents fractional counts and unbounded field allocation", () => {
  for (const sets of ["", 0, -1, 1.5, MAX_LOGGED_SETS + 1, Infinity]) {
    const item = { sets, reps: 12, setReps: [12, 11] };
    assert.ok(getExerciseSetError(item));
    assert.throws(() => normalizeExerciseSets(item));
    assert.ok(getSetReps(item).length <= MAX_LOGGED_SETS);
  }
  assert.equal(normalizeExerciseSets({ sets: 5, reps: 12 }).sets, 5);
});

test("saving, reopening, and editing an exercise retains its other set values", () => {
  const saved = { ...normalizeExerciseSets({ sets: 3, setReps: [14, 12, 10] }), completed: true };
  const edited = { ...saved, completed: false, setReps: [14, "11", 10] };
  assert.deepEqual(normalizeExerciseSets(edited), { sets: 3, reps: 10, setReps: [14, 11, 10] });
  assert.deepEqual(saved.setReps, [14, 12, 10]);
});

test("draft and history JSON round trips preserve per-set values and old records", () => {
  const draft = { sets: "3", reps: 14, setReps: ["14", "", "10"] };
  const restored = JSON.parse(JSON.stringify(draft));
  assert.deepEqual(getSetReps(restored), ["14", "", "10"]);
  assert.ok(getExerciseSetError(restored));
  const old = { sets: 3, reps: 12, weight: 100 };
  const current = { ...normalizeExerciseSets({ sets: 3, setReps: [14, 12, 10] }), weight: 100 };
  const backup = { version: 3, sessions: [{ exercises: [old, current] }] };
  assert.deepEqual(JSON.parse(JSON.stringify(backup)).sessions[0].exercises, [old, current]);
});

test("summaries show each new set while retaining the legacy history format", () => {
  assert.equal(formatExerciseSummary({ sets: 3, setReps: [14, 12, 10], weight: 100 }),
    "3 sets (14 / 12 / 10 reps) @ 100 lb");
  assert.equal(formatExerciseSummary({ sets: 1, setReps: [0], weight: 100 }),
    "1 set (0 reps) @ 100 lb");
  assert.equal(formatExerciseSummary({ sets: 3, reps: 12, weight: 100 }),
    "3 sets \u00d7 12 reps @ 100 lb");
});

test("normal progression uses the lowest set, never a stale scalar or the best set", () => {
  const actuals = { sets: 3, reps: 14, setReps: [14, 12, 10], weight: 100 };
  assert.deepEqual(buildRecommendation(actuals, 5), { sets: 3, reps: 11, weight: 100 });
  assert.equal(buildRecommendation({ ...actuals, setReps: [14, 14, 13] }, 5).weight, 100);
  assert.deepEqual(buildRecommendation({ ...actuals, setReps: [14, 15, 14] }, 5), {
    sets: 3, reps: 11, weight: 105
  });
  assert.equal(buildRecommendation({ ...actuals, setReps: [14, 14, 0] }, 5).weight, 100);
});

test("the higher rep range also requires every set to reach its upper limit", () => {
  const actuals = { sets: 3, reps: 20, setReps: [20, 18, 16], weight: 100 };
  assert.deepEqual(buildRecommendation(actuals, 5, "10-20"), { sets: 3, reps: 17, weight: 100 });
  assert.deepEqual(buildRecommendation({ ...actuals, setReps: [20, 20, 20] }, 5, "10-20"), {
    sets: 3, reps: 17, weight: 105
  });
});

test("deload targets use actual per-set reps without changing saved counts", () => {
  const actuals = Object.freeze({ sets: 3, reps: 14, setReps: Object.freeze([14, 12, 10]), weight: 100 });
  assert.deepEqual(buildDeloadRecommendation(actuals, 5), { sets: 2, reps: 8, weight: 90 });
  assert.deepEqual(actuals.setReps, [14, 12, 10]);
});

test("switching modes recognizes any edited set instead of overwriting it", () => {
  const suggested = { sets: 3, reps: 14, weight: 100 };
  const draft = { ...suggested, setReps: [14, "14", 14], suggested };
  assert.equal(matchesSuggestion(draft), true);
  assert.equal(matchesSuggestion({ ...draft, setReps: [14, 12, 14] }), false);
  assert.equal(matchesSuggestion({ ...draft, setReps: [14, "", 14] }), false);
  assert.equal(matchesSuggestion({ ...draft, sets: 2 }), false);
  assert.equal(matchesSuggestion({ ...draft, weight: 95 }), false);
  assert.equal(matchesSuggestion({ ...suggested, suggested }), true);
  assert.equal(matchesSuggestion(suggested), false);
});
