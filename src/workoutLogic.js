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
export const MAX_LOGGED_SETS = 100;

export function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function isValidRepCount(value) {
  return (typeof value === "number" || typeof value === "string") &&
    String(value).trim() !== "" && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
}

export function isValidSetCount(value) {
  return isValidRepCount(value) && Number(value) >= MIN_LOGGED_SETS &&
    Number(value) <= MAX_LOGGED_SETS;
}

export function getSetReps(item) {
  const savedReps = Array.isArray(item.setReps) ? item.setReps : [];
  const count = isValidSetCount(item.sets)
    ? Number(item.sets)
    : Math.min(MAX_LOGGED_SETS, savedReps.length || 3);

  return Array.from({ length: count }, (_, index) =>
    index < savedReps.length ? savedReps[index] : item.reps ?? MIN_REPS
  );
}

export function updateExerciseSetCount(item, sets) {
  const setReps = Array.isArray(item.setReps) ? item.setReps : getSetReps(item);
  const next = { ...item, sets, setReps: [...setReps] };

  // Retain hidden draft values while the count is edited; trim only when saved.
  if (isValidSetCount(sets) && Number(sets) > setReps.length) {
    next.setReps = getSetReps(next);
  }
  return next;
}

export function getExerciseSetError(item) {
  if (!isValidSetCount(item.sets)) {
    return `Enter a whole number of sets from 1 to ${MAX_LOGGED_SETS}.`;
  }
  if (!getSetReps(item).every(isValidRepCount)) {
    return "Enter a whole number of reps (0 or more) for every set.";
  }
  return "";
}

export function normalizeExerciseSets(item) {
  const error = getExerciseSetError(item);
  if (error) throw new Error(error);
  const setReps = getSetReps(item).map(Number);
  // Keep a scalar baseline for older clients; per-set values remain authoritative.
  return { sets: setReps.length, reps: Math.min(...setReps), setReps };
}

export function matchesSuggestion(item) {
  if (!item.suggested || getExerciseSetError(item) || getExerciseSetError(item.suggested)) return false;
  const suggestedReps = getSetReps(item.suggested);
  return Number(item.sets) === Number(item.suggested.sets) &&
    safeNumber(item.weight) === safeNumber(item.suggested.weight) &&
    getSetReps(item).every((reps, index) => Number(reps) === Number(suggestedReps[index]));
}

export function formatExerciseSummary(item) {
  if (Array.isArray(item.setReps)) {
    const setReps = getSetReps(item);
    return `${setReps.length} ${setReps.length === 1 ? "set" : "sets"} (${setReps.join(" / ")} reps) @ ${item.weight} lb`;
  }
  return `${item.sets} sets \u00d7 ${item.reps} reps @ ${item.weight} lb`;
}

function getProgressionReps(item, fallback) {
  if (Array.isArray(item.setReps) && item.setReps.length > 0) {
    return Math.min(...getSetReps(item).map((value) => isValidRepCount(value) ? Number(value) : 0));
  }
  return safeNumber(item.reps, fallback);
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

export function orderRecommendationsByWorkout(recommendations, previousExercises = []) {
  const positions = new Map();

  for (const item of previousExercises) {
    if (!positions.has(item.exercise)) {
      positions.set(item.exercise, positions.size);
    }
  }

  // Keep unmatched recommendations in their existing order, after the previous workout.
  return [...recommendations].sort((a, b) => {
    const aPosition = positions.get(a.exercise) ?? positions.size;
    const bPosition = positions.get(b.exercise) ?? positions.size;
    return aPosition - bPosition;
  });
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
  const completedSetReps = getSetReps(entry).map((value) => isValidRepCount(value) ? Number(value) : 0);
  const lowestReps = Math.min(...completedSetReps);
  const completedWeight = Math.max(0, safeNumber(entry.weight, 0));
  let weight = completedWeight;
  let setReps;

  if (lowestReps >= maximum) {
    const progression = simpleProgression(completedWeight, lowestReps, weightIncrement, minimum, maximum);
    weight = progression.weight;
    setReps = completedSetReps.map(() => progression.targetReps);
  } else {
    // Add one total rep, breaking ties in set order and leaving stronger sets unchanged.
    const lowestIndex = completedSetReps.indexOf(lowestReps);
    setReps = completedSetReps.map((reps, index) => index === lowestIndex ? reps + 1 : reps);
  }

  return {
    sets: setReps.length,
    reps: Math.min(...setReps),
    setReps,
    weight
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
  const completedReps = Math.max(1, getProgressionReps(entry, minimum));
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
