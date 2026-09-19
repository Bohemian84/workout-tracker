export const MIN_REPS = 8;
export const MAX_REPS = 14;
export const DEFAULT_REP_RANGE = "8-14";
export const REP_RANGES = [
  { id: DEFAULT_REP_RANGE, minimum: MIN_REPS, maximum: MAX_REPS },
  { id: "10-20", minimum: 10, maximum: 20 }
];
export const MIN_SETS = 2;
export const MAX_SETS = 4;
export const MIN_LOGGED_SETS = 1;

export function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function getRepRange(value) {
  return REP_RANGES.find((range) => range.id === value) || REP_RANGES[0];
}

export function normalizeRepRanges(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter(
      ([name, range]) => name.trim() && REP_RANGES.some((option) => option.id === range)
    )
  );
}

export function simpleProgression(
  weight,
  completedReps,
  weightIncrement,
  minimumReps = MIN_REPS,
  maximumReps = MAX_REPS
) {
  if (completedReps >= maximumReps) {
    const newWeight = weight + weightIncrement;

    if (weight <= 0) {
      return {
        weight: newWeight,
        targetReps: minimumReps
      };
    }

    const percentageIncrease = newWeight / weight;
    const percentIncrease = (percentageIncrease - 1) * 100;
    const estimatedRepDrop = Math.ceil(percentIncrease * 0.6 - 1e-9);

    return {
      weight: newWeight,
      targetReps: Math.max(minimumReps, maximumReps - estimatedRepDrop)
    };
  }

  return {
    weight,
    targetReps: Math.min(
      maximumReps,
      Math.max(minimumReps, completedReps + 1)
    )
  };
}

export function buildRecommendation(entry, weightIncrement, repRange = DEFAULT_REP_RANGE) {
  const { minimum, maximum } = getRepRange(repRange);
  const sets = Math.min(MAX_SETS, Math.max(MIN_SETS, safeNumber(entry.sets, 3)));
  const completedReps = Math.max(1, safeNumber(entry.reps, minimum));
  const completedWeight = Math.max(0, safeNumber(entry.weight, 0));
  const progression = simpleProgression(
    completedWeight,
    completedReps,
    weightIncrement,
    minimum,
    maximum
  );

  return {
    sets,
    reps: progression.targetReps,
    weight: progression.weight
  };
}

function roundWeight(value) {
  return Math.round(value * 100) / 100;
}

function getDeloadWeight(weight, weightIncrement) {
  if (weight <= 0 || weightIncrement <= 0) return weight;

  const desiredWeight = weight * 0.9;
  const roundedDown = roundWeight(
    Math.floor((desiredWeight + 1e-9) / weightIncrement) * weightIncrement
  );

  if (roundedDown <= 0 || roundedDown < weight * 0.75) {
    return weight;
  }

  return roundedDown;
}

export function buildDeloadRecommendation(entry, weightIncrement, repRange = DEFAULT_REP_RANGE) {
  const { minimum, maximum } = getRepRange(repRange);
  const completedSets = Math.max(
    MIN_LOGGED_SETS,
    safeNumber(entry.sets, MIN_SETS)
  );
  const completedReps = Math.max(1, safeNumber(entry.reps, minimum));
  const completedWeight = Math.max(0, safeNumber(entry.weight, 0));
  const cappedReps = Math.min(maximum, completedReps);
  const reducedReps = Math.round(cappedReps * 0.75);

  return {
    sets: Math.max(MIN_LOGGED_SETS, Math.ceil(completedSets * 0.5)),
    reps: Math.max(1, reducedReps),
    weight: getDeloadWeight(completedWeight, weightIncrement)
  };
}

export function isProgressionEligible(session, exercise) {
  if (typeof exercise.useForProgression === "boolean") {
    return exercise.useForProgression;
  }

  return session.workoutMode !== "deload";
}
