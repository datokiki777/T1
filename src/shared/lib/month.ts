import type { Period } from "../types/domain";

export function monthKey(year: number, monthIndex0: number): string {
  return `${year}-${String(monthIndex0 + 1).padStart(2, "0")}`;
}

export function monthLabel(year: number, monthIndex0: number): string {
  const d = new Date(year, monthIndex0, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * Attributes a period to the month of its start date (fromDate).
 * If fromDate is missing, the period is excluded from monthly stats.
 */
export function periodMonthKey(period: Period): string | null {
  if (!period.fromDate) return null;
  const d = new Date(period.fromDate);
  if (Number.isNaN(d.getTime())) return null;
  return monthKey(d.getFullYear(), d.getMonth());
}
