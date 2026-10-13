import type { Period } from "../types/domain";

/** Faithful port of the old app's date/week helpers (js/10-calc-dates.js). */

export function parseDateOnly(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const s = String(dateStr).trim();

  const buildSafeDate = (y: number, m: number, d: number): Date | null => {
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
    const out = new Date(y, m, d);
    if (
      Number.isNaN(out.getTime()) ||
      out.getFullYear() !== y ||
      out.getMonth() !== m ||
      out.getDate() !== d
    ) {
      return null;
    }
    return out;
  };

  if (s.includes("-")) {
    const parts = s.split("-");
    if (parts.length === 3) {
      const y = Number(parts[0]);
      const m = Number(parts[1]) - 1;
      const d = Number(parts[2]);
      return buildSafeDate(y, m, d);
    }
  }

  if (s.includes("/")) {
    const parts = s.split("/");
    if (parts.length === 3) {
      const d = Number(parts[0]);
      const m = Number(parts[1]) - 1;
      const y = Number(parts[2]);
      return buildSafeDate(y, m, d);
    }
  }

  return null;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * A DST-safe integer "which calendar day is this" number, built from a
 * Date's local year/month/day components via Date.UTC() (which never has
 * daylight saving — it's pure calendar arithmetic). Subtracting two of
 * these always gives an exact whole number of days, even when the range
 * between them crosses a DST transition in the local timezone — unlike
 * subtracting two local-midnight Date objects' getTime() directly, which
 * is off by exactly one hour for any range crossing a "clocks back"
 * transition (23 vs 24 vs 25-hour local days), silently inflating a
 * Math.ceil-based day/week count by one. This was a real bug: a period
 * spanning late October (around Europe's DST changeover) showed one
 * extra "week" in its paid-weeks badge purely because of this.
 */
function calendarDayNumber(d: Date): number {
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

export function daysBetweenInclusive(a: Date, b: Date): number {
  return calendarDayNumber(b) - calendarDayNumber(a) + 1;
}

export function monthKeyFromDateObj(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function formatMonthKey(monthKey: string | null | undefined): string {
  if (!monthKey) return "No data";
  const [y, m] = monthKey.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

export function getMonthStart(monthKey: string): Date {
  const [y, m] = monthKey.split("-");
  return new Date(Number(y), Number(m) - 1, 1);
}

export function getMonthEnd(monthKey: string): Date {
  const [y, m] = monthKey.split("-");
  return new Date(Number(y), Number(m), 0);
}

export function getOverlapDaysInclusive(
  periodFrom: Date,
  periodTo: Date,
  monthStart: Date,
  monthEnd: Date
): number {
  const start = periodFrom > monthStart ? periodFrom : monthStart;
  const end = periodTo < monthEnd ? periodTo : monthEnd;
  if (start > end) return 0;
  return daysBetweenInclusive(start, end);
}

export function getDurationMonthsDays(
  from: Date,
  to: Date
): { months: number; days: number } {
  if (!from || !to) return { months: 0, days: 0 };
  const start = new Date(from);
  const end = new Date(to);
  if (start > end) return { months: 0, days: 0 };

  let months = 0;
  let temp = new Date(start);

  while (true) {
    const next = new Date(temp);
    next.setMonth(next.getMonth() + 1);
    if (next <= end) {
      temp = next;
      months++;
    } else {
      break;
    }
  }

  const days = calendarDayNumber(end) - calendarDayNumber(temp);
  return { months, days };
}

export function formatDateForRange(date: Date | null): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

/**
 * Formats a stored ISO date string (as produced by <input type="date">,
 * e.g. "2026-01-31") for display as DD/MM/YYYY. Returns "—" for missing or
 * unparsable dates. This is the single source of truth for date display
 * everywhere in the app — the underlying stored/input value stays ISO.
 */
/**
 * Formats a stored ISO date string (as produced by <input type="date">,
 * e.g. "2026-01-31") for display as DD/MM/YYYY. Returns "—" for missing or
 * unparsable dates. This is the single source of truth for date display
 * everywhere in the app — the underlying stored/input value stays ISO.
 */
export function formatPeriodDate(iso: string | null | undefined): string {
  const parsed = parseDateOnly(iso);
  if (!parsed) return "—";
  return formatDateForRange(parsed);
}

/**
 * True if two inclusive date ranges genuinely overlap — sharing a boundary
 * day (one period's end date is the very next one's start date) does NOT
 * count as overlap, since ending one period and starting the next on the
 * same day is completely normal. Only a real overlap beyond that boundary
 * triggers this. Only meaningful when both ranges are fully specified — a
 * period with a missing from/to date isn't checked.
 */
export function dateRangesOverlap(
  aFrom: string | null,
  aTo: string | null,
  bFrom: string | null,
  bTo: string | null
): boolean {
  if (!aFrom || !aTo || !bFrom || !bTo) return false;
  const aStart = parseDateOnly(aFrom);
  const aEnd = parseDateOnly(aTo);
  const bStart = parseDateOnly(bFrom);
  const bEnd = parseDateOnly(bTo);
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart < bEnd && bStart < aEnd;
}

/**
 * How many whole weeks a period's date range actually spans, and whether
 * the recorded paidWeeks covers that in full. Returns null for `spanWeeks`
 * when the period doesn't have both dates set (nothing reliable to
 * compare against).
 */
export function getPeriodPaidStatus(period: Pick<Period, "fromDate" | "toDate" | "paidWeeks">): {
  spanWeeks: number | null;
  fullyPaid: boolean | null;
} {
  const from = parseDateOnly(period.fromDate);
  const to = parseDateOnly(period.toDate);
  if (!from || !to) return { spanWeeks: null, fullyPaid: null };
  const spanWeeks = weeksBetweenRounded(from, to);
  const paidWeeks = period.paidWeeks ?? 0;
  return { spanWeeks, fullyPaid: paidWeeks >= spanWeeks };
}

/**
 * Sorts periods earliest-first by From date (periods with no date yet
 * sort last; ties or missing dates fall back to creation order). Shared
 * by every place periods are listed (Edit mode, Review mode) so they're
 * always in the same, predictable order regardless of which one was
 * created first.
 */
export function sortPeriodsByDate<T extends Pick<Period, "fromDate" | "createdAt">>(
  periods: T[]
): T[] {
  return [...periods].sort((a, b) => {
    const aTime = a.fromDate ? Date.parse(a.fromDate) : Infinity;
    const bTime = b.fromDate ? Date.parse(b.fromDate) : Infinity;
    if (aTime !== bTime) return aTime - bTime;
    return a.createdAt - b.createdAt;
  });
}

/**
 * Whether today's date falls within the period's own [fromDate, toDate]
 * range (inclusive on both ends) — used to highlight "this is the period
 * that's actually running right now" in the period list. A period
 * missing either date can never be "current". `today` is injectable for
 * tests; defaults to the real current date.
 */
export function isPeriodCurrentToday(
  period: Pick<Period, "fromDate" | "toDate">,
  today: Date = new Date()
): boolean {
  const from = parseDateOnly(period.fromDate);
  const to = parseDateOnly(period.toDate);
  if (!from || !to) return false;
  const t = startOfDay(today).getTime();
  return t >= startOfDay(from).getTime() && t <= startOfDay(to).getTime();
}

export function getPeriodsDateRange(periods: Period[]): {
  min: Date | null;
  max: Date | null;
} {
  let min: Date | null = null;
  let max: Date | null = null;

  for (const p of periods) {
    const from = parseDateOnly(p.fromDate);
    const to = parseDateOnly(p.toDate);
    if (from && (!min || from < min)) min = from;
    if (to && (!max || to > max)) max = to;
  }

  return { min, max };
}

export function getAllMonthKeys(periods: Period[]): string[] {
  const keys = new Set<string>();

  for (const p of periods) {
    const from = parseDateOnly(p.fromDate);
    const to = parseDateOnly(p.toDate);
    if (!from || !to) continue;

    let cur = new Date(from.getFullYear(), from.getMonth(), 1);
    const last = new Date(to.getFullYear(), to.getMonth(), 1);

    while (cur <= last) {
      keys.add(monthKeyFromDateObj(cur));
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
  }

  return [...keys].sort();
}

export function weeksBetweenRounded(from: Date, to: Date): number {
  if (!(from instanceof Date) || !(to instanceof Date) || from > to) return 0;
  const elapsedDays = calendarDayNumber(to) - calendarDayNumber(from);
  if (elapsedDays <= 0) return 1;
  return Math.ceil(elapsedDays / 7);
}

/**
 * Merges overlapping/adjacent period date-ranges (that pass `predicate`) and
 * sums the resulting non-overlapping weeks. Matches calcCoveredWeeks exactly.
 */
export function calcCoveredWeeks(
  periods: Period[],
  predicate: (p: Period) => boolean
): number {
  const ranges = periods
    .filter(predicate)
    .map((p) => {
      const from = parseDateOnly(p.fromDate);
      const to = parseDateOnly(p.toDate);
      if (!from || !to || from > to) return null;
      return { from: startOfDay(from), to: startOfDay(to) };
    })
    .filter((r): r is { from: Date; to: Date } => r !== null)
    .sort((a, b) => a.from.getTime() - b.from.getTime());

  if (!ranges.length) return 0;

  let weeks = 0;
  let currentFrom = ranges[0].from;
  let currentTo = ranges[0].to;

  for (let i = 1; i < ranges.length; i++) {
    const range = ranges[i];
    const nextDayAfterCurrent = new Date(currentTo);
    nextDayAfterCurrent.setDate(nextDayAfterCurrent.getDate() + 1);

    if (range.from <= nextDayAfterCurrent) {
      if (range.to > currentTo) currentTo = range.to;
      continue;
    }

    weeks += weeksBetweenRounded(currentFrom, currentTo);
    currentFrom = range.from;
    currentTo = range.to;
  }

  weeks += weeksBetweenRounded(currentFrom, currentTo);
  return weeks;
}
