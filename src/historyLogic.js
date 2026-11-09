export const HISTORY_PAGE_SIZE = 5;

export function getHistoryMonths(sessions) {
  return [...new Set(sessions.map((session) => session.date?.slice(0, 7))
    .filter((month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month)))].sort().reverse();
}

export function filterHistory(sessions, query = "", month = "") {
  const search = query.trim().toLocaleLowerCase();
  return sessions.filter((session) => {
    if (month && session.date?.slice(0, 7) !== month) return false;
    if (!search) return true;
    return [session.sessionName, session.date, ...session.exercises.map((item) => item.exercise)]
      .some((value) => String(value ?? "").toLocaleLowerCase().includes(search));
  });
}

export function getHistoryPage(sessions, requestedPage = 0) {
  const pageCount = Math.max(1, Math.ceil(sessions.length / HISTORY_PAGE_SIZE));
  const page = Math.max(0, Math.min(pageCount - 1, Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 0));
  const start = page * HISTORY_PAGE_SIZE;
  return {
    sessions: sessions.slice(start, start + HISTORY_PAGE_SIZE),
    page,
    pageCount,
    first: sessions.length ? start + 1 : 0,
    last: Math.min(start + HISTORY_PAGE_SIZE, sessions.length),
    total: sessions.length
  };
}
