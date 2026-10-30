import assert from "node:assert/strict";
import test from "node:test";
import { buildDeloadRecommendation, buildRecommendation, normalizeExerciseSets } from "./workoutLogic.js";
import {
  MAX_WARMUP_SETS,
  buildWarmupSets,
  createWarmup,
  getIntermediateSetCount,
  getWarmupError,
  getWarmupPlanError,
  getWarmupSetError,
  getWarmupSetLabel,
  normalizeWarmup,
  updateWarmupSet
} from "./warmupLogic.js";

const settings = (overrides = {}) => ({ ...createWarmup(5), enabled: true, ...overrides });
const plan = (workingWeight = 100, overrides = {}) => {
  const config = settings(overrides);
  return { ...config, generatedForWeight: workingWeight, sets: buildWarmupSets(workingWeight, config) };
};

test("warm-ups are optional and can generate without a manually entered starting weight", () => {
  assert.deepEqual(createWarmup(2.5), {
    enabled: false, weightIncrement: 2.5, intermediateSets: null, sets: []
  });
  assert.equal(getWarmupError(undefined), "");
  assert.equal(normalizeWarmup(undefined), null);
  assert.equal(getWarmupPlanError(100, createWarmup()), "");
  assert.equal(buildWarmupSets(100, createWarmup())[0].weight, 35);
});

test("the easy set uses 35 percent of working weight rounded up to the equipment step", () => {
  for (const [workingWeight, weightIncrement, expected] of [
    [100, 5, 35], [135, 5, 50], [150, 5, 55], [50, 5, 20],
    [120, 2.5, 42.5], [135, 2.5, 47.5], [100, 10, 40],
    [10.1, 0.1, 3.6], [10, 0.1, 3.5], [10, 0.01, 3.5], [20, 0.05, 7]
  ]) {
    const first = buildWarmupSets(workingWeight, settings({ weightIncrement }))[0];
    assert.equal(first.weight, expected, `${workingWeight} lb with a ${weightIncrement} lb step`);
    assert.equal(first.reps, 10);
    assert.equal(first.completed, false);
  }
});

test("automatic intermediate counts have unambiguous pound boundaries", () => {
  for (const [weight, expected] of [
    [0, 1], [25, 1], [50, 1], [50.01, 2], [135, 2], [200, 2],
    [200.01, 3], [300, 3], [400, 3], [400.01, 4], [600, 4],
    [600.01, 5], [800, 5], [1000, 6]
  ]) assert.equal(getIntermediateSetCount(weight), expected, `working weight ${weight}`);
});

test("light weights get easy, midpoint and potentiation sets", () => {
  assert.deepEqual(buildWarmupSets(50, settings()), [
    { id: "easy", kind: "easy", weight: 20, reps: 10, completed: false },
    { id: "intermediate-1", kind: "intermediate", weight: 35, reps: 6, completed: false },
    { id: "potentiation", kind: "potentiation", weight: 50, reps: 2, completed: false }
  ]);
});

test("multiple intermediate sets start halfway and approach the working weight", () => {
  const two = buildWarmupSets(100, settings());
  assert.deepEqual(two.map((set) => set.weight), [35, 65, 80, 100]);
  assert.deepEqual(two.map((set) => set.reps), [10, 6, 6, 2]);
  const three = buildWarmupSets(300, settings());
  assert.deepEqual(three.map((set) => set.weight), [105, 200, 235, 265, 300]);
  assert.deepEqual(three.map((set) => set.reps), [10, 6, 6, 6, 2]);
});

test("the final set is exactly the working weight, not a rounded heavier load", () => {
  assert.equal(buildWarmupSets(133, settings()).at(-1).weight, 133);
  assert.equal(buildWarmupSets(133, settings()).at(-1).reps, 2);
});

test("legacy easy-weight and final-percentage settings cannot change newly generated targets", () => {
  for (const easyWeight of ["", 0, 20, 200, null]) {
    for (const potentiationPercent of [100, 110, "110", "", null]) {
      const legacy = settings({ easyWeight, potentiationPercent });
      assert.equal(getWarmupPlanError(100, legacy), "");
      assert.deepEqual(buildWarmupSets(100, legacy), buildWarmupSets(100, settings()));
    }
  }
});

test("equipment steps round the easy set up and intermediate sets down", () => {
  const fractional = buildWarmupSets(120, settings({ weightIncrement: 2.5 }));
  assert.deepEqual(fractional.map((set) => set.weight), [42.5, 80, 100, 120]);
  assert.deepEqual(buildWarmupSets(10, settings()).map((set) => set.weight), [5, 5, 10]);
});

test("bodyweight and very light exercises do not acquire negative or heavier warm-up loads", () => {
  assert.deepEqual(buildWarmupSets(0, settings()).map((set) => set.weight), [0, 0, 0]);
  assert.deepEqual(buildWarmupSets(0.5, settings()).map((set) => set.weight), [0.5, 0.5, 0.5]);
  assert.deepEqual(buildWarmupSets(10, settings({ weightIncrement: 20 })).map((set) => set.weight), [10, 10, 10]);
});

test("the intermediate count can be edited while automatic counts follow working weight", () => {
  const automatic = settings();
  assert.equal(buildWarmupSets(50, automatic).length, 3);
  assert.equal(buildWarmupSets(400, automatic).length, 5);
  assert.equal(buildWarmupSets(100, settings({ intermediateSets: "4" })).length, 6);
  assert.equal(buildWarmupSets(400, settings({ intermediateSets: "1" })).length, 3);
  assert.deepEqual(buildWarmupSets("100", settings({ weightIncrement: "5" })), buildWarmupSets(100, settings()));
});

test("invalid or missing weights cannot generate a plan", () => {
  for (const value of ["", " ", -1, "bad", Infinity, 1e308, NaN, null, undefined, true]) {
    assert.ok(getWarmupPlanError(value, settings()));
    assert.throws(() => buildWarmupSets(value, settings()));
  }
});

test("invalid increments and fractional counts are rejected", () => {
  for (const weightIncrement of ["", 0, -5, 0.001, "bad", Infinity, true]) {
    assert.throws(() => buildWarmupSets(100, settings({ weightIncrement })));
  }
  for (const intermediateSets of ["", 0, -1, 1.5, Infinity, true, MAX_WARMUP_SETS - 1]) {
    assert.throws(() => buildWarmupSets(100, settings({ intermediateSets })));
  }
});

test("warm-up generation is bounded and does not mutate its settings", () => {
  const config = Object.freeze(settings());
  assert.equal(buildWarmupSets(1000000, config).length, MAX_WARMUP_SETS);
  assert.deepEqual(config, settings());
  assert.equal(new Set(buildWarmupSets(1000000, config).map((set) => set.id)).size, MAX_WARMUP_SETS);
});

test("generated weights stay in order between the rounded 35 percent target and working weight", () => {
  for (const workingWeight of [0, 0.5, 1, 49.5, 50, 51, 200, 201, 400, 401, 650, 1000]) {
    for (const weightIncrement of [0.01, 0.1, 0.5, 2.5, 5, 20, 1000]) {
      const generated = buildWarmupSets(workingWeight, settings({ weightIncrement }));
      assert.equal(generated.length, getIntermediateSetCount(workingWeight) + 2);
      assert.ok(generated[0].weight >= workingWeight * 0.35 - 1e-9);
      assert.ok(generated[0].weight < workingWeight * 0.35 + weightIncrement + 1e-9);
      if (generated[0].weight < workingWeight) {
        const steps = generated[0].weight / weightIncrement;
        assert.ok(Math.abs(steps - Math.round(steps)) < 1e-9);
      }
      for (let index = 1; index < generated.length; index += 1) {
        assert.ok(generated[index].weight >= generated[index - 1].weight);
        assert.ok(Number.isFinite(generated[index].weight));
      }
      assert.ok(generated.every((set) => set.weight <= workingWeight));
      assert.equal(generated.at(-1).weight, workingWeight);
    }
  }
});

test("enabled warm-ups need generated, valid rows before saving", () => {
  assert.ok(getWarmupError(settings()));
  assert.throws(() => normalizeWarmup(settings()));
  assert.ok(getWarmupError({ enabled: true, sets: [null] }));
  assert.ok(getWarmupError({ enabled: true, sets: Array(MAX_WARMUP_SETS + 1).fill({ weight: 20, reps: 10 }) }));
  assert.equal(getWarmupError(plan()), "");
});

test("warm-up actuals can differ from targets, including zero reps, without being overwritten", () => {
  let draft = plan();
  draft = updateWarmupSet(draft, "easy", "weight", "20.75");
  draft = updateWarmupSet(draft, "easy", "reps", "8");
  draft = updateWarmupSet(draft, "intermediate-1", "reps", "0");
  draft = updateWarmupSet(draft, "intermediate-2", "weight", "77.5");
  draft = updateWarmupSet(draft, "potentiation", "reps", "3");
  const saved = normalizeWarmup(draft);
  assert.deepEqual(saved.sets.map((set) => set.reps), [8, 0, 6, 3]);
  assert.deepEqual(saved.sets.map((set) => set.weight), [20.75, 65, 77.5, 100]);
  assert.equal(saved.sets.every((set) => !set.completed), true);
});

test("invalid edited actuals block saving instead of silently becoming zero", () => {
  for (const reps of ["", " ", -1, 1.5, Infinity, true, null]) {
    const draft = updateWarmupSet(plan(), "easy", "reps", reps);
    assert.ok(getWarmupError(draft));
    assert.throws(() => normalizeWarmup(draft));
  }
  for (const weight of ["", -1, Infinity, true, null]) {
    assert.ok(getWarmupSetError({ weight, reps: 10 }));
    assert.throws(() => normalizeWarmup(updateWarmupSet(plan(), "easy", "weight", weight)));
  }
});

test("checking off a warm-up is independent and editing clears only that set's checkmark", () => {
  const original = plan();
  const checked = updateWarmupSet(original, "easy", "completed", true);
  assert.equal(original.sets[0].completed, false);
  assert.equal(checked.sets[0].completed, true);
  const secondChecked = updateWarmupSet(checked, "intermediate-1", "completed", true);
  const edited = updateWarmupSet(secondChecked, "easy", "weight", 15);
  assert.equal(edited.sets[0].completed, false);
  assert.equal(edited.sets[1].completed, true);
  const saved = normalizeWarmup(edited);
  assert.deepEqual(saved.sets.map((set) => set.completed), [false, true, false, false]);
  assert.deepEqual(secondChecked.sets.map((set) => set.weight), [35, 65, 80, 100]);
});

test("disabling warm-ups excludes them from saved history without changing the draft rows", () => {
  const draft = updateWarmupSet(plan(), "easy", "reps", "");
  const disabled = { ...draft, enabled: false };
  assert.equal(getWarmupError(disabled), "");
  assert.equal(normalizeWarmup(disabled), null);
  assert.equal(disabled.sets[0].reps, "");
  assert.ok(getWarmupError({ ...disabled, enabled: true }));
});

test("normal and deload recommendations ignore all warm-up weights, reps and completion states", () => {
  const working = { sets: 3, reps: 14, setReps: [14, 12, 10], weight: 100 };
  const warmup = normalizeWarmup(plan());
  for (const completed of [false, true]) {
    warmup.sets = warmup.sets.map((set) => ({ ...set, completed }));
    const logged = { ...working, warmup };
    assert.deepEqual(buildRecommendation(logged, 5), buildRecommendation(working, 5));
    assert.deepEqual(buildDeloadRecommendation(logged, 5), buildDeloadRecommendation(working, 5));
    assert.deepEqual(normalizeExerciseSets(logged), normalizeExerciseSets(working));
  }
  const maxed = { ...working, setReps: [14, 14, 14] };
  assert.deepEqual(buildRecommendation({ ...maxed, warmup }, 5), buildRecommendation(maxed, 5));
});

test("saving and reloading history retains warm-ups without changing older workouts", () => {
  const old = { id: "old", exercise: "Row", sets: 3, reps: 12, weight: 100 };
  const draft = { id: "new", exercise: "Row", sets: "3", setReps: ["14", "12", "10"], weight: 100,
    warmup: updateWarmupSet(plan(), "easy", "completed", true) };
  const restoredDraft = JSON.parse(JSON.stringify(draft));
  assert.deepEqual(restoredDraft, draft);
  const saved = { ...draft, ...normalizeExerciseSets(draft), warmup: normalizeWarmup(draft.warmup) };
  const backup = { version: 4, sessions: [{ exercises: [old, saved] }] };
  const imported = JSON.parse(JSON.stringify(backup));
  assert.deepEqual(imported.sessions[0].exercises, [old, saved]);
  assert.equal(imported.sessions[0].exercises[0].warmup, undefined);
  assert.equal(imported.sessions[0].exercises[1].warmup.sets[0].completed, true);
  assert.equal(imported.sessions[0].exercises[1].sets, 3);
});

test("changed working weight or settings do not rewrite an existing plan", () => {
  const existing = updateWarmupSet(plan(), "easy", "completed", true);
  const item = { weight: 100, warmup: existing };
  const changed = { ...item, weight: 135, warmup: { ...existing, weightIncrement: 10 } };
  assert.deepEqual(changed.warmup.sets.map((set) => set.weight), [35, 65, 80, 100]);
  assert.equal(changed.warmup.sets[0].completed, true);
  assert.equal(changed.warmup.generatedForWeight, 100);
  const regenerated = buildWarmupSets(changed.weight, changed.warmup);
  assert.deepEqual(regenerated.map((set) => set.weight), [50, 90, 110, 135]);
  assert.ok(regenerated.every((set) => !set.completed));
  assert.deepEqual(item.warmup.sets, existing.sets);
});

test("legacy logged warm-ups retain their original starting and 110 percent final weights", () => {
  const legacy = plan(100, { easyWeight: 20, potentiationPercent: 110 });
  legacy.sets[0] = { ...legacy.sets[0], weight: 20, completed: true };
  legacy.sets[legacy.sets.length - 1] = { ...legacy.sets.at(-1), weight: 110, completed: true };
  const restored = JSON.parse(JSON.stringify(legacy));
  assert.equal(getWarmupError(restored), "");
  assert.deepEqual(normalizeWarmup(restored), legacy);
  const regenerated = buildWarmupSets(100, restored);
  assert.equal(regenerated[0].weight, 35);
  assert.equal(regenerated.at(-1).weight, 100);
  assert.equal(restored.sets[0].weight, 20);
  assert.equal(restored.sets.at(-1).weight, 110);
  assert.equal(restored.sets.at(-1).completed, true);
});

test("warm-up labels distinguish easy, intermediate and potentiation sets", () => {
  assert.deepEqual(plan().sets.map(getWarmupSetLabel), ["Easy warm-up", "Intermediate 1", "Intermediate 2", "Potentiation"]);
});
