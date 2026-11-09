import assert from "node:assert/strict";
import test from "node:test";
import { filterHistory, getHistoryMonths, getHistoryPage, HISTORY_PAGE_SIZE } from "./historyLogic.js";

const sessions = Array.from({ length: 13 }, (_, index) => ({
  id: String(index),
  sessionName: index % 2 ? "Lower Body" : "Upper Body",
  date: `${index < 6 ? "2026-11" : "2026-10"}-${String(28 - index).padStart(2, "0")}`,
  exercises: [{ exercise: index % 2 ? "Squat" : "Bench Press", sets: 3, setReps: [14, 12, 10] }]
}));

test("history shows five recent sessions without changing stored order or data", () => {
  const before = structuredClone(sessions);
  const result = getHistoryPage(sessions);
  assert.equal(HISTORY_PAGE_SIZE, 5);
  assert.deepEqual(result.sessions, sessions.slice(0, 5));
  assert.deepEqual([result.page, result.pageCount, result.first, result.last, result.total], [0, 3, 1, 5, 13]);
  assert.deepEqual(sessions, before);
});

test("every saved session remains reachable across pages, including the partial final page", () => {
  const pages = [0, 1, 2].map((page) => getHistoryPage(sessions, page));
  assert.deepEqual(pages.flatMap((page) => page.sessions), sessions);
  assert.deepEqual([pages[2].first, pages[2].last], [11, 13]);
});

test("empty history has a valid empty first page", () => {
  assert.deepEqual(getHistoryPage([], 20), { sessions: [], page: 0, pageCount: 1, first: 0, last: 0, total: 0 });
});

test("pages clamp after deleting the last entry or shrinking filtered results", () => {
  assert.equal(getHistoryPage(sessions.slice(0, 5), 2).page, 0);
  assert.equal(getHistoryPage(sessions, -1).page, 0);
  assert.equal(getHistoryPage(sessions, NaN).page, 0);
  assert.equal(getHistoryPage(sessions, Infinity).page, 0);
  assert.equal(getHistoryPage(sessions, 1.9).page, 1);
});

test("search finds exercise names, session names, and dates across all pages", () => {
  assert.equal(filterHistory(sessions, "  bEnCh  ").length, 7);
  assert.equal(filterHistory(sessions, "lower body").length, 6);
  assert.deepEqual(filterHistory(sessions, sessions[12].date), [sessions[12]]);
  assert.deepEqual(filterHistory(sessions, "not found"), []);
  assert.deepEqual(filterHistory(sessions, "  "), sessions);
});

test("month filters combine with search and preserve date order", () => {
  assert.deepEqual(getHistoryMonths(sessions), ["2026-11", "2026-10"]);
  assert.deepEqual(filterHistory(sessions, "bench", "2026-10"), sessions.filter((session, index) => index >= 6 && index % 2 === 0));
  assert.deepEqual(filterHistory(sessions, "", "2020-01"), []);
  assert.deepEqual(getHistoryMonths([{ date: "bad" }, {}, { date: "2026-13-01" }]), []);
});
