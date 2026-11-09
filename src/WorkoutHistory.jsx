import React, { memo, useMemo, useRef, useState } from "react";
import { ArrowUp, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, Trash2, Upload, X } from "lucide-react";
import { filterHistory, getHistoryMonths, getHistoryPage } from "./historyLogic";
import { formatExerciseSummary, getRepRange, isProgressionEligible } from "./workoutLogic";
import { WarmupSummary } from "./WarmupSets";

function WorkoutHistory({ sessions, onDelete, onExport, onImport, formatDate, styles }) {
  const [visible, setVisible] = useState(true);
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("");
  const [requestedPage, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const headingRef = useRef(null);
  const importRef = useRef(null);
  const searchRef = useRef(null);
  const months = useMemo(() => getHistoryMonths(sessions), [sessions]);
  const filtered = useMemo(() => filterHistory(sessions, query, month), [sessions, query, month]);
  const page = getHistoryPage(filtered, requestedPage);

  function changeFilter(setter, value) {
    setter(value);
    setPage(0);
    setExpandedId(null);
  }

  function changePage(nextPage) {
    setPage(nextPage);
    setExpandedId(null);
    headingRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }

  function pagination(location) {
    return (
      <nav aria-label={`History pages (${location})`} style={historyStyles.pagination}>
        <span style={historyStyles.count}>Page {page.page + 1} of {page.pageCount}</span>
        <div style={historyStyles.actions}>
          <button
            type="button"
            title="Newer sessions"
            aria-label="Newer sessions"
            style={page.page === 0 ? { ...historyStyles.iconButton, ...styles.disabledButton } : historyStyles.iconButton}
            disabled={page.page === 0}
            onClick={() => changePage(page.page - 1)}
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            title="Older sessions"
            aria-label="Older sessions"
            style={page.page + 1 === page.pageCount ? { ...historyStyles.iconButton, ...styles.disabledButton } : historyStyles.iconButton}
            disabled={page.page + 1 === page.pageCount}
            onClick={() => changePage(page.page + 1)}
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      </nav>
    );
  }

  return (
    <section aria-labelledby="history-heading" style={historyStyles.section}>
      <div style={styles.headerRow}>
        <h2 id="history-heading" ref={headingRef} style={historyStyles.heading}>History</h2>
        <div style={historyStyles.actions}>
          <button type="button" style={historyStyles.iconButton} title="Export all history" aria-label="Export all history" onClick={onExport}>
            <Download size={20} aria-hidden="true" />
          </button>
          <button type="button" style={historyStyles.iconButton} title="Import history" aria-label="Import history" onClick={() => importRef.current?.click()}>
            <Upload size={20} aria-hidden="true" />
          </button>
          <input ref={importRef} type="file" accept="application/json" onChange={onImport} style={{ display: "none" }} />
          <button
            type="button"
            style={historyStyles.iconButton}
            title={visible ? "Minimize history" : "Show history"}
            aria-label={visible ? "Minimize history" : "Show history"}
            aria-expanded={visible}
            aria-controls="history-content"
            onClick={() => setVisible((value) => !value)}
          >
            {visible ? <ChevronUp size={20} aria-hidden="true" /> : <ChevronDown size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>
      {visible && (
        <div id="history-content">
          {sessions.length === 0 ? <p>No saved sessions yet.</p> : (
            <>
              <div style={historyStyles.filters}>
                <div style={historyStyles.searchField}>
                  <label htmlFor="history-search" style={styles.label}>Search History</label>
                  <div style={historyStyles.searchRow}>
                    <input
                      ref={searchRef}
                      id="history-search"
                      type="search"
                      style={styles.input}
                      placeholder="Exercise, session, or date"
                      value={query}
                      onChange={(event) => changeFilter(setQuery, event.target.value)}
                    />
                    {query && (
                      <button
                        type="button"
                        style={historyStyles.iconButton}
                        title="Clear search"
                        aria-label="Clear search"
                        onClick={() => {
                          changeFilter(setQuery, "");
                          searchRef.current?.focus({ preventScroll: true });
                        }}
                      >
                        <X size={18} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
                <div style={historyStyles.monthField}>
                  <label htmlFor="history-month" style={styles.label}>Month</label>
                  <select id="history-month" style={styles.input} value={month} onChange={(event) => changeFilter(setMonth, event.target.value)}>
                    <option value="">All months</option>
                    {months.map((value) => (
                      <option key={value} value={value}>
                        {new Date(`${value}-01T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                      </option>
                    ))}
                    {month && !months.includes(month) && <option value={month}>{month}</option>}
                  </select>
                </div>
              </div>
              <div style={historyStyles.resultRow}>
                <p style={historyStyles.count} role="status">
                  {page.total ? `${page.first}-${page.last} of ${page.total} sessions` : "No matching sessions"}
                </p>
                <a href="#current-session" style={historyStyles.returnLink}>
                  <ArrowUp size={16} aria-hidden="true" /> Current Session
                </a>
              </div>
              {page.total === 0 ? (
                <button type="button" style={styles.secondaryButton} onClick={() => {
                  setQuery("");
                  changeFilter(setMonth, "");
                }}>Clear Filters</button>
              ) : (
                <>
                  {page.pageCount > 1 && pagination("top")}
                  <div>
                    {page.sessions.map((session) => {
                      const expanded = expandedId === session.id;
                      return (
                        <article key={session.id} style={historyStyles.session}>
                          <button
                            type="button"
                            style={historyStyles.sessionToggle}
                            aria-expanded={expanded}
                            aria-controls={`history-session-${session.id}`}
                            aria-label={`${expanded ? "Collapse" : "Expand"} ${session.sessionName}, ${formatDate(session.date)}`}
                            onClick={() => setExpandedId(expanded ? null : session.id)}
                          >
                            <span style={historyStyles.sessionLabel}>
                              <span style={historyStyles.date}>{formatDate(session.date)}</span>
                              <span style={styles.historyTitleRow}>
                                <strong>{session.sessionName}</strong>
                                {session.workoutMode === "deload" && <span style={styles.deloadBadge}>Deload</span>}
                              </span>
                              <span style={historyStyles.preview}>
                                {session.exercises.length} {session.exercises.length === 1 ? "exercise" : "exercises"}
                                {session.exercises.length > 0 && `: ${session.exercises.slice(0, 3).map((item) => item.exercise).join(", ")}`}
                                {session.exercises.length > 3 && ` +${session.exercises.length - 3} more`}
                              </span>
                            </span>
                            {expanded ? <ChevronUp size={20} style={historyStyles.chevron} aria-hidden="true" /> : <ChevronDown size={20} style={historyStyles.chevron} aria-hidden="true" />}
                          </button>
                          {expanded && (
                            <div id={`history-session-${session.id}`}>
                              {session.exercises.map((item) => {
                                const usedForProgression = isProgressionEligible(session, item);
                                return (
                                  <div key={item.id} style={historyStyles.exercise}>
                                    <strong>{item.exercise}</strong>
                                    <div>{formatExerciseSummary(item)}</div>
                                    <WarmupSummary warmup={item.warmup} styles={styles} />
                                    {item.repRange && <div style={styles.rangeSummary}>Progression range: {getRepRange(item.repRange).id} reps</div>}
                                    {!usedForProgression && <div style={styles.progressionExcluded}>Not used for future recommendations</div>}
                                    {session.workoutMode === "deload" && usedForProgression && <div style={styles.progressionIncluded}>Used for future recommendations</div>}
                                  </div>
                                );
                              })}
                              <div style={historyStyles.sessionFooter}>
                                <button
                                  type="button"
                                  style={{ ...historyStyles.iconButton, color: "#b91c1c" }}
                                  title="Delete session"
                                  aria-label={`Delete ${session.sessionName}, ${formatDate(session.date)}`}
                                  onClick={() => {
                                    if (!window.confirm(`Delete ${session.sessionName} from ${formatDate(session.date)}? This cannot be undone.`)) return;
                                    onDelete(session.id);
                                    setExpandedId(null);
                                  }}
                                >
                                  <Trash2 size={20} aria-hidden="true" />
                                </button>
                                <button type="button" style={historyStyles.iconButton} title="Collapse session" aria-label="Collapse session" onClick={() => {
                                  setExpandedId(null);
                                  headingRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
                                }}>
                                  <ChevronUp size={20} aria-hidden="true" />
                                </button>
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                  {page.pageCount > 1 && pagination("bottom")}
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default memo(WorkoutHistory);

const historyStyles = {
  section: { background: "#fff", padding: 20, marginBottom: 20, borderTop: "2px solid #d6dce2", overflowWrap: "anywhere" },
  heading: { margin: 0, scrollMarginTop: 20 },
  actions: { display: "flex", gap: 6, alignItems: "center" },
  iconButton: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, flex: "0 0 44px", padding: 0, border: "1px solid #cbd0d6", borderRadius: 6, color: "#333", background: "#fff", cursor: "pointer" },
  filters: { display: "flex", gap: 12, flexWrap: "wrap", marginBlock: 20 },
  searchField: { flex: "2 1 220px", minWidth: 0 },
  searchRow: { display: "flex", gap: 6 },
  monthField: { flex: "1 1 180px", minWidth: 0 },
  resultRow: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 12 },
  returnLink: { display: "inline-flex", gap: 4, alignItems: "center", minHeight: 44, color: "#1d4ed8", fontWeight: 600 },
  count: { margin: 0, color: "#555", fontSize: 14 },
  pagination: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBlock: 12 },
  session: { borderTop: "1px solid #d6dce2" },
  sessionToggle: { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", minHeight: 96, padding: "16px 0", gap: 12, border: 0, background: "transparent", color: "#222", textAlign: "left", font: "inherit", cursor: "pointer", overflowWrap: "anywhere" },
  sessionLabel: { display: "grid", gap: 6, minWidth: 0 },
  date: { color: "#555", fontSize: 14 },
  preview: { color: "#555", fontSize: 14, lineHeight: 1.5 },
  chevron: { flex: "0 0 20px" },
  exercise: { paddingBlock: 14, borderTop: "1px solid #e3e3e3", lineHeight: 1.5 },
  sessionFooter: { display: "flex", justifyContent: "space-between", paddingBlock: 12, gap: 12 }
};
