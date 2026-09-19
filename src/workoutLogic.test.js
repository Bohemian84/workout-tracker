import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeloadRecommendation,
  buildRecommendation,
  getRepRange,
  isProgressionEligible,
  normalizeRepRanges,
  simpleProgression
} from "./workoutLogic.js";

test("the default range adds reps until 14, then increases weight", () => {
  assert.deepEqual(buildRecommendation({ sets: 3, reps: 13, weight: 50 }, 5), {
    sets: 3, reps: 14, weight: 50
  });
  assert.deepEqual(buildRecommendation({ sets: 3, reps: 14, weight: 50 }, 5), {
    sets: 3, reps: 8, weight: 55
  });
});

test("weight increases keep the percentage-based rep-drop estimate", () => {
  assert.deepEqual(buildRecommendation({ sets: 3, reps: 14, weight: 100 }, 5), {
    sets: 3, reps: 11, weight: 105
  });
  assert.deepEqual(buildRecommendation({ sets: 3, reps: 14, weight: 100 }, 2.5), {
    sets: 3, reps: 12, weight: 102.5
  });
});

test("the higher rep range keeps the previous progression behavior", () => {
  const recommendation = buildRecommendation(
    { sets: 3, reps: 20, weight: 50 },
    5,
    "10-20"
  );

  assert.deepEqual(recommendation, { sets: 3, reps: 14, weight: 55 });
  assert.deepEqual(buildRecommendation({ sets: 3, reps: 14, weight: 50 }, 5, "10-20"), {
    sets: 3, reps: 15, weight: 50
  });
  assert.deepEqual(buildRecommendation({ sets: 3, reps: 19, weight: 50 }, 5, "10-20"), {
    sets: 3, reps: 20, weight: 50
  });
});

test("old workouts use the new default without modifying recorded actuals", () => {
  const entry = Object.freeze({ sets: 1, reps: 25, weight: 50 });
  assert.deepEqual(buildRecommendation(entry, 5), { sets: 2, reps: 8, weight: 55 });
  assert.deepEqual(entry, { sets: 1, reps: 25, weight: 50 });
});

test("zero weight and large increments have bounded rep targets", () => {
  assert.deepEqual(simpleProgression(0, 14, 5), { weight: 5, targetReps: 8 });
  assert.deepEqual(simpleProgression(10, 14, 5), { weight: 15, targetReps: 8 });
  assert.deepEqual(simpleProgression(10, 20, 5, 10, 20), { weight: 15, targetReps: 10 });
});

test("rep range preferences accept supported values and default safely", () => {
  assert.deepEqual(getRepRange(), { id: "8-14", minimum: 8, maximum: 14 });
  assert.equal(getRepRange("invalid").id, "8-14");
  assert.equal(getRepRange("10-20").maximum, 20);
  assert.deepEqual(normalizeRepRanges({
    Row: "8-14", "Face Pull": "10-20", Invalid: "1-99", " ": "8-14"
  }), { Row: "8-14", "Face Pull": "10-20" });
  for (const invalid of [null, undefined, [], "8-14", 8]) {
    assert.deepEqual(normalizeRepRanges(invalid), {});
  }
});

test("deload recommendations reduce a typical workout", () => {
  const recommendation = buildDeloadRecommendation(
    { sets: 3, reps: 14, weight: 50 },
    5
  );

  assert.deepEqual(recommendation, { sets: 2, reps: 11, weight: 45 });
});

test("deload reps follow each exercise's range", () => {
  assert.equal(buildDeloadRecommendation({ reps: 20 }, 5).reps, 11);
  assert.equal(buildDeloadRecommendation({ reps: 20 }, 5, "10-20").reps, 15);
  assert.equal(buildDeloadRecommendation({ reps: 10 }, 5, "10-20").reps, 8);
  assert.equal(buildDeloadRecommendation({ reps: 14 }, 5).reps, 11);
});

test("deload recommendations never increase low rep workouts", () => {
  const recommendation = buildDeloadRecommendation(
    { sets: 2, reps: 8, weight: 100 },
    5
  );

  assert.deepEqual(recommendation, { sets: 1, reps: 6, weight: 90 });
});

test("coarse equipment increments do not cut weight by more than 25 percent", () => {
  const recommendation = buildDeloadRecommendation(
    { sets: 3, reps: 20, weight: 10 },
    5
  );

  assert.deepEqual(recommendation, { sets: 2, reps: 11, weight: 10 });
});

test("bodyweight exercises retain zero added weight", () => {
  const recommendation = buildDeloadRecommendation(
    { sets: 4, reps: 16, weight: 0 },
    5
  );

  assert.deepEqual(recommendation, { sets: 2, reps: 11, weight: 0 });
});

test("deload recommendations never exceed completed reps, sets, or weight", () => {
  for (const range of ["8-14", "10-20"]) {
    for (let reps = 1; reps <= 25; reps += 1) {
      const entry = Object.freeze({ sets: 1, reps, weight: 10 });
      const recommendation = buildDeloadRecommendation(entry, 5, range);
      assert.ok(recommendation.reps >= 1 && recommendation.reps <= reps);
      assert.equal(recommendation.sets, 1);
      assert.ok(recommendation.weight <= entry.weight);
    }
  }
});

test("progression eligibility supports old and mixed workout data", () => {
  assert.equal(isProgressionEligible({}, {}), true);
  assert.equal(isProgressionEligible({ workoutMode: "deload" }, {}), false);
  assert.equal(
    isProgressionEligible(
      { workoutMode: "deload" },
      { useForProgression: true }
    ),
    true
  );
  assert.equal(
    isProgressionEligible(
      { workoutMode: "normal" },
      { useForProgression: false }
    ),
    false
  );
});
