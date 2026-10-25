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

const settings = (overrides = {}) => ({ ...createWarmup(5), enabled: true, easyWeight: 20, ...overrides });
const plan = (workingWeight = 100, overrides = {}) => {
  const config = settings(overrides);
  return { ...config, generatedForWeight: workingWeight, sets: buildWarmupSets(workingWeight, config) };
};

test("warm-ups are optional and never invent a 20RM starting weight", () => {
  assert.deepEqual(createWarmup(2.5), {
    enabled: false, easyWeight: "", weightIncrement: 2.5,
    intermediateSets: null, potentiationPercent: 100, sets: []
  });
  assert.equal(getWarmupError(undefined), "");
  assert.equal(normalizeWarmup(undefined), null);
  assert.ok(getWarmupPlanError(100, createWarmup()));
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
  assert.deepEqual(two.map((set) => set.weight), [20, 60, 80, 100]);
  assert.deepEqual(two.map((set) => set.reps), [10, 6, 6, 2]);
  const three = buildWarmupSets(300, settings({ easyWeight: 100 }));
  assert.deepEqual(three.map((set) => set.weight), [100, 200, 230, 265, 300]);
  assert.deepEqual(three.map((set) => set.reps), [10, 6, 6, 6, 2]);
});

test("the default final set is exactly the working weight, not a rounded heavier load", () => {
  assert.equal(buildWarmupSets(133, settings()).at(-1).weight, 133);
  assert.equal(buildWarmupSets(133, settings()).at(-1).reps, 2);
});

test("110 percent is explicit and rounds down without going below working weight", () => {
  assert.equal(buildWarmupSets(135, settings({ potentiationPercent: 110 })).at(-1).weight, 145);
  assert.equal(buildWarmupSets(10, settings({ easyWeight: 5, weightIncrement: 5, potentiationPercent: 110 })).at(-1).weight, 10);
  assert.equal(buildWarmupSets(100, settings({ potentiationPercent: "110" })).at(-1).weight, 110);
});

test("user-entered easy weight is preserved and equipment steps affect only generated loads", () => {
  const fractional = buildWarmupSets(120, settings({ easyWeight: 30, weightIncrement: 2.5 }));
  assert.deepEqual(fractional.map((set) => set.weight), [30, 75, 97.5, 120]);
  assert.equal(buildWarmupSets(100, settings({ easyWeight: 20.75 }))[0].weight, 20.75);
  assert.deepEqual(buildWarmupSets(10, settings({ easyWeight: 8, weightIncrement: 5 })).map((set) => set.weight), [8, 8, 10]);
});

test("bodyweight and very light exercises do not acquire negative or heavier warm-up loads", () => {
  assert.deepEqual(buildWarmupSets(0, settings({ easyWeight: 0 })).map((set) => set.weight), [0, 0, 0]);
  assert.deepEqual(buildWarmupSets(0.5, settings({ easyWeight: 0 })).map((set) => set.weight), [0, 0, 0.5]);
});

test("the intermediate count can be edited while automatic counts follow working weight", () => {
  const automatic = settings();
  assert.equal(buildWarmupSets(50, automatic).length, 3);
  assert.equal(buildWarmupSets(400, automatic).length, 5);
  assert.equal(buildWarmupSets(100, settings({ intermediateSets: "4" })).length, 6);
  assert.equal(buildWarmupSets(400, settings({ intermediateSets: "1" })).length, 3);
  assert.deepEqual(buildWarmupSets("100", settings({ easyWeight: "20", weightIncrement: "5" })), buildWarmupSets(100, settings()));
});

test("invalid or missing weights cannot generate a plan", () => {
  for (const value of ["", " ", -1, "bad", Infinity, 1e308, NaN, null, undefined, true]) {
    assert.ok(getWarmupPlanError(value, settings()));
    assert.throws(() => buildWarmupSets(value, settings()));
    assert.ok(getWarmupPlanError(100, settings({ easyWeight: value })));
  }
  assert.ok(getWarmupPlanError(100, settings({ easyWeight: 101 })));
});

test("invalid increments, fractional counts and unsupported potentiation percentages are rejected", () => {
  for (const weightIncrement of ["", 0, -5, 0.001, "bad", Infinity, true]) {
    assert.throws(() => buildWarmupSets(100, settings({ weightIncrement })));
  }
  for (const intermediateSets of ["", 0, -1, 1.5, Infinity, true, MAX_WARMUP_SETS - 1]) {
    assert.throws(() => buildWarmupSets(100, settings({ intermediateSets })));
  }
  for (const potentiationPercent of ["", 0, 105, 120, Infinity, true]) {
    assert.throws(() => buildWarmupSets(100, settings({ potentiationPercent })));
  }
});

test("warm-up generation is bounded and does not mutate its settings", () => {
  const config = Object.freeze(settings());
  assert.equal(buildWarmupSets(1000000, config).length, MAX_WARMUP_SETS);
  assert.deepEqual(config, settings());
  assert.equal(new Set(buildWarmupSets(1000000, config).map((set) => set.id)).size, MAX_WARMUP_SETS);
});

test("generated weights stay in order and respect the working and optional 110 percent limits", () => {
  for (const workingWeight of [0, 0.5, 1, 49.5, 50, 51, 200, 201, 400, 401, 650, 1000]) {
    for (const fraction of [0, 0.2, 0.5, 1]) {
      for (const weightIncrement of [0.1, 0.5, 2.5, 5, 20, 1000]) {
        for (const potentiationPercent of [100, 110]) {
          const easyWeight = workingWeight * fraction;
          const generated = buildWarmupSets(workingWeight, settings({ easyWeight, weightIncrement, potentiationPercent }));
          assert.equal(generated.length, getIntermediateSetCount(workingWeight) + 2);
          for (let index = 1; index < generated.length; index += 1) {
            assert.ok(generated[index].weight >= generated[index - 1].weight);
            assert.ok(Number.isFinite(generated[index].weight));
          }
          assert.ok(generated.slice(0, -1).every((set) => set.weight <= workingWeight));
          assert.ok(generated.at(-1).weight >= workingWeight);
          assert.ok(generated.at(-1).weight <= workingWeight * potentiationPercent / 100 + 1e-9);
        }
      }
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
  draft = updateWarmupSet(draft, "easy", "reps", "8");
  draft = updateWarmupSet(draft, "intermediate-1", "reps", "0");
  draft = updateWarmupSet(draft, "intermediate-2", "weight", "77.5");
  draft = updateWarmupSet(draft, "potentiation", "reps", "3");
  const saved = normalizeWarmup(draft);
  assert.deepEqual(saved.sets.map((set) => set.reps), [8, 0, 6, 3]);
  assert.deepEqual(saved.sets.map((set) => set.weight), [20, 60, 77.5, 100]);
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
  assert.deepEqual(secondChecked.sets.map((set) => set.weight), [20, 60, 80, 100]);
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
  const warmup = normalizeWarmup(plan(100, { potentiationPercent: 110 }));
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
  const existing = plan();
  const item = { weight: 100, warmup: existing };
  const changed = { ...item, weight: 135, warmup: { ...existing, easyWeight: 45 } };
  assert.deepEqual(changed.warmup.sets.map((set) => set.weight), [20, 60, 80, 100]);
  assert.equal(changed.warmup.generatedForWeight, 100);
  assert.deepEqual(buildWarmupSets(changed.weight, changed.warmup).map((set) => set.weight), [45, 90, 110, 135]);
  assert.deepEqual(item.warmup.sets, existing.sets);
});

test("warm-up labels distinguish easy, intermediate and potentiation sets", () => {
  assert.deepEqual(plan().sets.map(getWarmupSetLabel), ["Easy warm-up", "Intermediate 1", "Intermediate 2", "Potentiation"]);
});
