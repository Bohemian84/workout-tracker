import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeloadRecommendation,
  buildRecommendation,
  isProgressionEligible
} from "./workoutLogic.js";

test("normal recommendations keep the existing progression formula", () => {
  const recommendation = buildRecommendation(
    { sets: 3, reps: 20, weight: 50 },
    5
  );

  assert.deepEqual(recommendation, { sets: 3, reps: 14, weight: 55 });
});

test("deload recommendations reduce a typical workout", () => {
  const recommendation = buildDeloadRecommendation(
    { sets: 3, reps: 20, weight: 50 },
    5
  );

  assert.deepEqual(recommendation, { sets: 2, reps: 15, weight: 45 });
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

  assert.deepEqual(recommendation, { sets: 2, reps: 15, weight: 10 });
});

test("bodyweight exercises retain zero added weight", () => {
  const recommendation = buildDeloadRecommendation(
    { sets: 4, reps: 16, weight: 0 },
    5
  );

  assert.deepEqual(recommendation, { sets: 2, reps: 12, weight: 0 });
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
