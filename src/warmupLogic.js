import { isValidRepCount } from "./workoutLogic.js";

export const MAX_WARMUP_SETS = 20;

export function isValidWarmupWeight(value) {
  return (typeof value === "number" || typeof value === "string") &&
    String(value).trim() !== "" && Number.isFinite(Number(value)) &&
    Number(value) >= 0 && Number(value) <= Number.MAX_SAFE_INTEGER;
}

export function getIntermediateSetCount(workingWeight) {
  if (!isValidWarmupWeight(workingWeight) || Number(workingWeight) <= 50) return 1;
  if (Number(workingWeight) <= 200) return 2;
  // Above 400 lb, add an intermediate set for each further 200 lb band.
  return Math.min(MAX_WARMUP_SETS - 2, Math.ceil(Number(workingWeight) / 200) + 1);
}

export function createWarmup(weightIncrement = 5) {
  return {
    enabled: false,
    easyWeight: "",
    weightIncrement,
    intermediateSets: null,
    potentiationPercent: 100,
    sets: []
  };
}

export function getWarmupPlanError(workingWeight, settings) {
  if (!isValidWarmupWeight(workingWeight)) return "Enter a working weight of 0 lb or more.";
  if (!isValidWarmupWeight(settings.easyWeight)) return "Enter an easy warm-up weight of 0 lb or more.";
  if (Number(settings.easyWeight) > Number(workingWeight)) {
    return "The easy warm-up weight cannot exceed the working weight.";
  }
  if (!isValidWarmupWeight(settings.weightIncrement) || Number(settings.weightIncrement) < 0.01) {
    return "Enter a weight step of at least 0.01 lb.";
  }
  const count = settings.intermediateSets ?? getIntermediateSetCount(workingWeight);
  if (!isValidRepCount(count) || Number(count) < 1 || Number(count) > MAX_WARMUP_SETS - 2) {
    return `Enter 1 to ${MAX_WARMUP_SETS - 2} intermediate sets.`;
  }
  if (![100, 110].includes(Number(settings.potentiationPercent))) {
    return "Choose 100% or 110% for the final warm-up weight.";
  }
  return "";
}

function roundDownToStep(weight, increment) {
  return Math.round(Math.floor((weight + 1e-9) / increment) * increment * 100) / 100;
}

export function buildWarmupSets(workingWeight, settings) {
  const error = getWarmupPlanError(workingWeight, settings);
  if (error) throw new Error(error);

  const weight = Number(workingWeight);
  const easyWeight = Number(settings.easyWeight);
  const increment = Number(settings.weightIncrement);
  const count = Number(settings.intermediateSets ?? getIntermediateSetCount(weight));
  const midpoint = (easyWeight + weight) / 2;
  const sets = [{ id: "easy", kind: "easy", weight: easyWeight, reps: 10, completed: false }];

  for (let index = 0; index < count; index += 1) {
    // The first intermediate set is halfway; remaining sets approach the working load.
    const target = midpoint + (weight - midpoint) * index / count;
    sets.push({
      id: `intermediate-${index + 1}`,
      kind: "intermediate",
      weight: Math.min(weight, Math.max(easyWeight, roundDownToStep(target, increment))),
      reps: 6,
      completed: false
    });
  }

  const potentiationWeight = Number(settings.potentiationPercent) === 110
    ? Math.max(weight, roundDownToStep(weight * 1.1, increment))
    : weight;
  sets.push({ id: "potentiation", kind: "potentiation", weight: potentiationWeight, reps: 2, completed: false });
  return sets;
}

export function getWarmupSetError(set) {
  if (!set || !isValidWarmupWeight(set.weight)) return "Enter a weight of 0 lb or more for each warm-up set.";
  if (!isValidRepCount(set.reps)) return "Enter whole reps (0 or more) for each warm-up set.";
  return "";
}

export function getWarmupError(warmup) {
  if (!warmup?.enabled) return "";
  if (!Array.isArray(warmup.sets) || warmup.sets.length === 0) {
    return "Generate warm-up sets or turn warm-ups off before saving.";
  }
  if (warmup.sets.length > MAX_WARMUP_SETS) return `Use no more than ${MAX_WARMUP_SETS} warm-up sets.`;
  return warmup.sets.map(getWarmupSetError).find(Boolean) || "";
}

export function normalizeWarmup(warmup) {
  if (!warmup?.enabled) return null;
  const error = getWarmupError(warmup);
  if (error) throw new Error(error);
  return {
    ...warmup,
    enabled: true,
    sets: warmup.sets.map((set) => ({
      id: set.id,
      kind: set.kind,
      weight: Number(set.weight),
      reps: Number(set.reps),
      completed: set.completed === true
    }))
  };
}

export function updateWarmupSet(warmup, id, field, value) {
  return {
    ...warmup,
    sets: warmup.sets.map((set) => set.id === id
      ? { ...set, [field]: value, completed: field === "completed" ? value === true : false }
      : set)
  };
}

export function getWarmupSetLabel(set, index) {
  if (set.kind === "easy") return "Easy warm-up";
  if (set.kind === "potentiation") return "Potentiation";
  return `Intermediate ${index}`;
}
