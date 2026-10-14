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
 * the earlier month wins. A client with no visit date falls back to its
 * period's start date; with neither, it can't be placed ("undated").
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
  salary: number;
  income: number;
  clients: number;
}

export interface GroupSalaryMonths {
  anchorDay: number | null;
  months: SalaryMonthStats[];
  /** Non-"wrong" clients with money entered but no usable date. */
  undatedRows: number;
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

function rowStartDate(row: ClientRow, period: Period | undefined): Date | null {
  return parseDateOnly(row.visitDate) ?? parseDateOnly(period?.fromDate ?? null);
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

  const candidates: { row: ClientRow; start: Date | null }[] = [];
  for (const row of rows) {
    const period = periodById.get(row.periodId);
    if (!period || row.status === "wrong") continue;
    if (!rowAmounts(row).hasMoney) continue;
    candidates.push({ row, start: rowStartDate(row, period) });
  }

  const dated = candidates.filter((c): c is { row: ClientRow; start: Date } => c.start !== null);
  const undatedRows = candidates.length - dated.length;
  if (!dated.length) return { anchorDay: null, months: [], undatedRows };

  const earliest = dated.reduce((min, c) => (c.start < min ? c.start : min), dated[0].start);
  const anchorDay = earliest.getDate();

  const placed = dated.map((c) => ({
    row: c.row,
    idx: assignSalaryMonthIndex(c.start, rowSpanDays(c.row), anchorDay),
  }));
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
      salary,
      income: 0,
      clients: 0,
    });
  }

  for (const { row, idx } of placed) {
    const stats = byIdx.get(idx)!;
    const { amount, expense } = rowAmounts(row);
    stats.amount += amount;
    stats.expense += expense;
    stats.myEur += amount - expense;
    if (row.status === "unpaid") stats.unpaid += amount;
    stats.clients += 1;
  }

  const months = [...byIdx.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, s]) => ({ ...s, income: s.unpaid - s.expense - s.salary }));

  return { anchorDay, months, undatedRows };
}
