export const MIN_REPS = 10;
export const MAX_REPS = 20;
export const MIN_SETS = 2;
export const MAX_SETS = 4;
export const MIN_LOGGED_SETS = 1;

export function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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

export function buildRecommendation(entry, weightIncrement) {
  const sets = Math.min(MAX_SETS, Math.max(MIN_SETS, safeNumber(entry.sets, 3)));
  const completedReps = Math.max(1, safeNumber(entry.reps, MIN_REPS));
  const completedWeight = Math.max(0, safeNumber(entry.weight, 0));
  const progression = simpleProgression(
    completedWeight,
    completedReps,
    weightIncrement
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

export function buildDeloadRecommendation(entry, weightIncrement) {
  const completedSets = Math.max(
    MIN_LOGGED_SETS,
    safeNumber(entry.sets, MIN_SETS)
  );
  const completedReps = Math.max(1, safeNumber(entry.reps, MIN_REPS));
  const completedWeight = Math.max(0, safeNumber(entry.weight, 0));
  const cappedReps = Math.min(MAX_REPS, completedReps);
  const reducedReps = Math.round(cappedReps * 0.75);

  return {
    sets: Math.max(MIN_LOGGED_SETS, Math.ceil(completedSets * 0.5)),
    reps:
      completedReps < MIN_REPS
        ? Math.max(1, reducedReps)
        : Math.min(15, Math.max(MIN_REPS, reducedReps)),
    weight: getDeloadWeight(completedWeight, weightIncrement)
  };
}

export function isProgressionEligible(session, exercise) {
  if (typeof exercise.useForProgression === "boolean") {
    return exercise.useForProgression;
  }

  return session.workoutMode !== "deload";
}
