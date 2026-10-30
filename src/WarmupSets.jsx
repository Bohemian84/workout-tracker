import React, { useState } from "react";
import { isValidRepCount } from "./workoutLogic";
import {
  MAX_WARMUP_SETS,
  buildWarmupSets,
  createWarmup,
  getIntermediateSetCount,
  getWarmupError,
  getWarmupPlanError,
  getWarmupSetError,
  getWarmupSetLabel,
  isValidWarmupWeight,
  updateWarmupSet
} from "./warmupLogic";

export function WarmupSummary({ warmup, styles }) {
  if (!warmup?.enabled || !warmup.sets?.length) return null;
  const completed = warmup.sets.filter((set) => set.completed).length;
  return (
    <details style={warmupStyles.section}>
      <summary style={warmupStyles.summary}>Warm-ups: {completed} of {warmup.sets.length} completed</summary>
      <ol style={warmupStyles.historyList}>
        {warmup.sets.map((set, index) => (
          <li key={set.id} style={warmupStyles.historyItem}>
            <strong>{getWarmupSetLabel(set, index)}</strong>
            <div>{set.reps} reps @ {set.weight} lb</div>
            <div style={styles.rangeSummary}>{set.completed ? "Completed" : "Not completed"}</div>
          </li>
        ))}
      </ol>
    </details>
  );
}

export default function WarmupSets({ item, defaultIncrement, onChange, styles }) {
  const [expanded, setExpanded] = useState(true);
  const warmup = item.warmup || createWarmup(defaultIncrement);
  const sets = Array.isArray(warmup.sets) ? warmup.sets : [];
  const planError = getWarmupPlanError(item.weight, warmup);
  const savedSetError = sets.length ? getWarmupError(warmup) : "";
  const count = warmup.intermediateSets ?? getIntermediateSetCount(item.weight);
  const completed = sets.filter((set) => set.completed).length;
  const staleWeight = sets.length > 0 && Number(warmup.generatedForWeight) !== Number(item.weight);
  const updateSettings = (field, value) => onChange({ ...warmup, [field]: value });

  function generate() {
    if (planError) return;
    if (sets.length && !window.confirm("Replace this exercise's warm-up sets? Any edited values and completion checkmarks will be reset. Working sets will stay unchanged.")) return;
    onChange({
      ...warmup,
      generatedForWeight: Number(item.weight),
      sets: buildWarmupSets(item.weight, warmup)
    });
  }

  return (
    <section style={warmupStyles.section} aria-label={`Warm-ups for ${item.exercise}`}>
      <label style={warmupStyles.toggle}>
        <input
          type="checkbox"
          style={styles.progressionCheckbox}
          checked={warmup.enabled === true}
          onChange={(event) => updateSettings("enabled", event.target.checked)}
        />
        <span>Include warm-up sets</span>
      </label>
      {warmup.enabled && (
        <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
          <summary style={warmupStyles.summary}>
            {sets.length ? `Warm-ups: ${completed} of ${sets.length} completed` : "Warm-up plan"}
          </summary>
          <div style={styles.setRepGrid}>
            <div>
              <label style={styles.label} htmlFor={`warmup-increment-${item.id}`}>Weight step (lb)</label>
              <input
                id={`warmup-increment-${item.id}`}
                style={styles.input}
                type="number"
                inputMode="decimal"
                min="0.01"
                step="any"
                value={warmup.weightIncrement}
                onChange={(event) => updateSettings("weightIncrement", event.target.value)}
              />
            </div>
            <div>
              <label style={styles.label} htmlFor={`warmup-count-${item.id}`}>Intermediate sets</label>
              <input
                id={`warmup-count-${item.id}`}
                style={styles.input}
                type="number"
                inputMode="numeric"
                min="1"
                max={MAX_WARMUP_SETS - 2}
                step="1"
                value={count}
                onChange={(event) => updateSettings("intermediateSets", event.target.value)}
              />
            </div>
          </div>
          {planError && <p style={styles.errorText} role="alert">{planError}</p>}
          <div style={styles.buttonRow}>
            <button
              type="button"
              style={planError ? { ...styles.secondaryButton, ...styles.disabledButton } : styles.secondaryButton}
              disabled={Boolean(planError)}
              onClick={generate}
            >
              {sets.length ? "Regenerate Warm-ups" : "Generate Warm-ups"}
            </button>
          </div>
          {staleWeight && (
            <p style={warmupStyles.notice} role="status">
              Warm-up plan: {warmup.generatedForWeight} lb working weight. Current working weight: {isValidWarmupWeight(item.weight) ? item.weight : "not set"} lb.
            </p>
          )}
          <div role="group" aria-label={`${item.exercise} warm-up sets`}>
            {sets.map((set, index) => {
              const prefix = `warmup-${item.id}-${set.id}`;
              const label = getWarmupSetLabel(set, index);
              const setError = getWarmupSetError(set);
              const updateSet = (field, value) => onChange(updateWarmupSet(warmup, set.id, field, value));
              return (
                <div key={set.id} role="group" aria-label={label} style={warmupStyles.row}>
                  <div style={warmupStyles.rowHeading}>
                    <strong style={warmupStyles.setName}>{index + 1}. {label}</strong>
                    <label style={warmupStyles.doneLabel}>
                      <input
                        type="checkbox"
                        style={styles.progressionCheckbox}
                        aria-label={`Complete ${label} for ${item.exercise}`}
                        checked={set.completed === true}
                        disabled={Boolean(setError)}
                        onChange={(event) => updateSet("completed", event.target.checked)}
                      />
                      <span>Done</span>
                    </label>
                  </div>
                  <div style={warmupStyles.fields}>
                    <div>
                      <label style={styles.label} htmlFor={`${prefix}-weight`}>Weight (lb)</label>
                      <input
                        id={`${prefix}-weight`}
                        style={isValidWarmupWeight(set.weight) ? styles.input : { ...styles.input, ...styles.invalidInput }}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        aria-invalid={!isValidWarmupWeight(set.weight)}
                        value={set.weight}
                        onChange={(event) => updateSet("weight", event.target.value)}
                      />
                    </div>
                    <div>
                      <label style={styles.label} htmlFor={`${prefix}-reps`}>Reps</label>
                      <input
                        id={`${prefix}-reps`}
                        style={isValidRepCount(set.reps) ? styles.input : { ...styles.input, ...styles.invalidInput }}
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        aria-invalid={!isValidRepCount(set.reps)}
                        value={set.reps}
                        onChange={(event) => updateSet("reps", event.target.value)}
                      />
                    </div>
                  </div>
                  {set.kind === "intermediate" && <div style={styles.rangeSummary}>Rest: 2-3 min</div>}
                </div>
              );
            })}
          </div>
          {savedSetError && <p style={styles.errorText} role="alert">{savedSetError}</p>}
        </details>
      )}
    </section>
  );
}

const warmupStyles = {
  section: { marginBlock: 16, paddingBlock: 12, borderTop: "1px solid #d6dce2", borderBottom: "1px solid #d6dce2" },
  toggle: { display: "flex", alignItems: "center", gap: 9, minHeight: 44, fontWeight: 600, cursor: "pointer" },
  summary: { paddingBlock: 10, minHeight: 24, lineHeight: 1.5, cursor: "pointer", fontWeight: 600, overflowWrap: "anywhere" },
  row: { paddingBlock: 12, borderBottom: "1px solid #e3e3e3" },
  rowHeading: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  setName: { overflowWrap: "anywhere" },
  doneLabel: { display: "inline-flex", alignItems: "center", minHeight: 44, gap: 8, cursor: "pointer", color: "#166534" },
  fields: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 },
  notice: { color: "#555", fontSize: 14, lineHeight: 1.5, marginBottom: 0 },
  historyList: { marginBlock: 0, paddingLeft: 22 },
  historyItem: { paddingBlock: 8, overflowWrap: "anywhere" }
};
