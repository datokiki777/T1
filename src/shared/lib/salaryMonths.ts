import type { ClientRow, Group, Period } from "../types/domain";
import { parseMoney } from "./money";
import { getPeriodsForGroup } from "./entityLookup";
import { parseDateOnly } from "./dates";

/**
 * Salary months.
 *
 * A group's salary is MONTHLY. The month boundaries are anchored on the
 * day-of-month of the group's earliest client: if the first client is on
 * the 7th, every salary month runs from the 7th to the 7th of the next
 * month (an anchor like the 31st is clamped to the month's last day).
 *
 * A client belongs to exactly one salary month: the one that contains the
 * MAJORITY of its days (visitDate .. visitDate + visitDays − 1). On a tie
 * the earlier month wins. A client with no visit date is placed, in order:
 *   1. in the salary month of the nearest neighbouring client (same
 *      period, list order) that has a visit date;
 *   2. otherwise by its period's own date (start date, else end date);
 *   3. otherwise it can't be placed ("undated").
 *
 * My € of a salary month = Amount − Expense − salary owed for the days of
 * ALL recorded clients (same daily rate, same once-per-day rule).
 *
 * Income of a salary month =
 *   Unpaid − (Expense of the unpaid clients) − (salary share), where the
 *   salary share = monthly salary / length of that salary month × the number
 *   of days covered by the unpaid clients (a day shared by several unpaid
 *   clients counts once; an unpaid client with no own visit date counts its
 *   own visitDays, default 1).
 *
 * A salary month's key is the calendar month it STARTS in ("2026-10" =
 * 7 Oct → 6 Nov).
 */

export interface SalaryMonthStats {
  key: string; // YYYY-MM of the month the salary month starts in
  amount: number;
  expense: number;
  myEur: number;
  unpaid: number;
  /** Expense of the unpaid clients only. */
  unpaidExpense: number;
  /** Days covered by the unpaid clients. */
  unpaidDays: number;
  /** Salary owed for the unpaid clients' days (used by Income). */
  unpaidSalary: number;
  /** Days covered by all recorded clients. */
  days: number;
  /** Salary owed for all recorded days (subtracted in My €). */
  salary: number;
  income: number;
  clients: number;
}

export interface GroupSalaryMonths {
  anchorDay: number | null;
  months: SalaryMonthStats[];
  /** Non-"wrong" clients with money entered but no usable date. */
  undatedRows: number;
  /** Salary owed for each period's own recorded days (periodId -> amount). */
  periodSalary: Record<string, number>;
}

export function rowAmounts(row: Pick<ClientRow, "amount" | "expense">): {
  hasMoney: boolean;
  amount: number;
  expense: number;
} {
  const amountRaw = row.amount.trim();
  const expenseRaw = row.expense.trim();
  const hasAmount = amountRaw !== "";
  const hasExpense = expenseRaw !== "";
  if (!hasAmount && !hasExpense) return { hasMoney: false, amount: 0, expense: 0 };
  const a = hasAmount ? Math.round(parseMoney(amountRaw)) : 0;
  const e = hasExpense ? Math.round(parseMoney(expenseRaw)) : 0;
  return {
    hasMoney: true,
    amount: Number.isFinite(a) ? a : 0,
    expense: Number.isFinite(e) ? e : 0,
  };
}

export function rowSpanDays(row: Pick<ClientRow, "visitDays">): number {
  const n = Math.round(row.visitDays ?? 1);
  return Math.min(5, Math.max(1, Number.isFinite(n) ? n : 1));
}

function periodDate(period: Period | undefined): Date | null {
  return parseDateOnly(period?.fromDate ?? null) ?? parseDateOnly(period?.toDate ?? null);
}

function effectiveAnchor(year: number, monthIndex0: number, anchorDay: number): number {
  const lastDay = new Date(year, monthIndex0 + 1, 0).getDate();
  return Math.min(anchorDay, lastDay);
}

/** Absolute index (year*12 + month) of the salary month containing `d`. */
export function salaryMonthIndex(d: Date, anchorDay: number): number {
  const y = d.getFullYear();
  const m = d.getMonth();
  return d.getDate() >= effectiveAnchor(y, m, anchorDay) ? y * 12 + m : y * 12 + m - 1;
}

function salaryMonthStart(idx: number, anchorDay: number): Date {
  const y = Math.floor(idx / 12);
  const m = idx - y * 12;
  return new Date(y, m, effectiveAnchor(y, m, anchorDay));
}

/** Number of calendar days in the salary month with this index. */
export function salaryMonthLength(idx: number, anchorDay: number): number {
  const a = salaryMonthStart(idx, anchorDay);
  const b = salaryMonthStart(idx + 1, anchorDay);
  return Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
      Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) /
      86400000
  );
}

export function keyFromMonthIndex(idx: number): string {
  const y = Math.floor(idx / 12);
  const m = idx - y * 12;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** The salary month holding the majority of the client's days (tie → earlier). */
export function assignSalaryMonthIndex(start: Date, days: number, anchorDay: number): number {
  const counts = new Map<number, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const idx = salaryMonthIndex(d, anchorDay);
    counts.set(idx, (counts.get(idx) ?? 0) + 1);
  }
  let best = Number.POSITIVE_INFINITY;
  let bestCount = -1;
  for (const [idx, count] of counts) {
    if (count > bestCount || (count === bestCount && idx < best)) {
      best = idx;
      bestCount = count;
    }
  }
  return best;
}

export function computeGroupSalaryMonths(
  group: Group,
  periods: Period[],
  rows: ClientRow[]
): GroupSalaryMonths {
  const groupPeriods = getPeriodsForGroup(periods, group.id);
  const periodById = new Map(groupPeriods.map((p) => [p.id, p]));
  const salary = Math.max(0, Math.round(group.defaultSalary || 0));

  interface Cand {
    row: ClientRow;
    own: Date | null; // the client's own visit date
    byPeriod: Date | null; // its period's date
  }
  const cands: Cand[] = [];
  for (const row of rows) {
    const period = periodById.get(row.periodId);
    if (!period || row.status === "wrong") continue;
    if (!rowAmounts(row).hasMoney) continue;
    cands.push({ row, own: parseDateOnly(row.visitDate), byPeriod: periodDate(period) });
  }

  // Anchor: the earliest client's own visit date; only if NO client has one,
  // fall back to the earliest period date.
  const ownDates = cands.map((c) => c.own).filter((d): d is Date => d !== null);
  const periodDates = cands.map((c) => c.byPeriod).filter((d): d is Date => d !== null);
  const pool = ownDates.length ? ownDates : periodDates;
  if (!pool.length) return { anchorDay: null, months: [], undatedRows: cands.length, periodSalary: {} };
  const earliest = pool.reduce((min, d) => (d < min ? d : min), pool[0]);
  const anchorDay = earliest.getDate();

  // 1) clients with their own date.
  const idxByRowId = new Map<string, number>();
  for (const c of cands) {
    if (c.own) {
      idxByRowId.set(c.row.id, assignSalaryMonthIndex(c.own, rowSpanDays(c.row), anchorDay));
    }
  }

  // 2) clients without a date: nearest dated neighbour in the same period
  //    (list order; the previous one wins a distance tie), else the period's date.
  const byPeriodId = new Map<string, Cand[]>();
  for (const c of cands) {
    const list = byPeriodId.get(c.row.periodId) ?? [];
    list.push(c);
    byPeriodId.set(c.row.periodId, list);
  }
  for (const list of byPeriodId.values()) {
    list.sort((a, b) => a.row.createdAt - b.row.createdAt || a.row.id.localeCompare(b.row.id));
    list.forEach((c, i) => {
      if (c.own) return;
      let found: number | undefined;
      for (let dist = 1; dist < list.length && found === undefined; dist++) {
        const prev = list[i - dist];
        const next = list[i + dist];
        if (prev?.own) found = idxByRowId.get(prev.row.id);
        else if (next?.own) found = idxByRowId.get(next.row.id);
      }
      if (found === undefined && c.byPeriod) {
        found = assignSalaryMonthIndex(c.byPeriod, rowSpanDays(c.row), anchorDay);
      }
      if (found !== undefined) idxByRowId.set(c.row.id, found);
    });
  }

  const placed = cands
    .filter((c) => idxByRowId.has(c.row.id))
    .map((c) => ({ row: c.row, idx: idxByRowId.get(c.row.id)! }));
  const undatedRows = cands.length - placed.length;
  if (!placed.length) return { anchorDay, months: [], undatedRows, periodSalary: {} };

  const minIdx = Math.min(...placed.map((p) => p.idx));
  const maxIdx = Math.max(...placed.map((p) => p.idx));

  const byIdx = new Map<number, SalaryMonthStats>();
  for (let idx = minIdx; idx <= maxIdx; idx++) {
    byIdx.set(idx, {
      key: keyFromMonthIndex(idx),
      amount: 0,
      expense: 0,
      myEur: 0,
      unpaid: 0,
      unpaidExpense: 0,
      unpaidDays: 0,
      unpaidSalary: 0,
      days: 0,
      salary: 0,
      income: 0,
      clients: 0,
    });
  }
  const dayNo = (d: Date) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  // Days covered, per salary month: a day shared by several clients counts
  // once; a client with no own visit date adds its own days.
  interface DayBook {
    set: Set<number>;
    extra: number;
  }
  const newBook = (): DayBook => ({ set: new Set<number>(), extra: 0 });
  const unpaidBooks = new Map<number, DayBook>(); // idx -> unpaid clients' days
  const allBooks = new Map<number, DayBook>(); // idx -> all clients' days
  const periodBooks = new Map<string, Map<number, DayBook>>(); // periodId -> idx -> days
  const book = (m: Map<number, DayBook>, idx: number): DayBook => {
    let b = m.get(idx);
    if (!b) {
      b = newBook();
      m.set(idx, b);
    }
    return b;
  };
  const addDays = (b: DayBook, own: Date | null, days: number) => {
    if (own) for (let i = 0; i < days; i++) b.set.add(dayNo(own) + i);
    else b.extra += days;
  };

  for (const { row, idx } of placed) {
    const stats = byIdx.get(idx)!;
    const { amount, expense } = rowAmounts(row);
    stats.amount += amount;
    stats.expense += expense;
    stats.myEur += amount - expense;
    const own = parseDateOnly(row.visitDate);
    const days = rowSpanDays(row);
    addDays(book(allBooks, idx), own, days);
    let pb = periodBooks.get(row.periodId);
    if (!pb) {
      pb = new Map();
      periodBooks.set(row.periodId, pb);
    }
    addDays(book(pb, idx), own, days);
    if (row.status === "unpaid") {
      stats.unpaid += amount;
      stats.unpaidExpense += expense;
      addDays(book(unpaidBooks, idx), own, days);
    }
    stats.clients += 1;
  }

  const countDays = (b: DayBook | undefined) => (b ? b.set.size + b.extra : 0);
  const shareFor = (idx: number, days: number) => {
    const length = salaryMonthLength(idx, anchorDay);
    return length > 0 ? Math.min(salary, (salary / length) * days) : 0;
  };

  const months = [...byIdx.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([idx, st]) => {
      const unpaidDays = countDays(unpaidBooks.get(idx));
      const days = countDays(allBooks.get(idx));
      const unpaidSalary = shareFor(idx, unpaidDays);
      const monthSalary = shareFor(idx, days);
      return {
        ...st,
        unpaidDays,
        unpaidSalary,
        days,
        salary: monthSalary,
        myEur: st.amount - st.expense - monthSalary,
        income: st.unpaid - st.unpaidExpense - unpaidSalary,
      };
    });

  const periodSalary: Record<string, number> = {};
  for (const [periodId, perIdx] of periodBooks) {
    let total = 0;
    for (const [idx, b] of perIdx) total += shareFor(idx, countDays(b));
    periodSalary[periodId] = total;
  }

  return { anchorDay, months, undatedRows, periodSalary };
}
