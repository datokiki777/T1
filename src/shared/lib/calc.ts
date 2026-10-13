import type {
  ClientRow,
  Group,
  GroupFinancials,
  Period,
  PeriodTotals,
  StatusCounts,
} from "../types/domain";
import { parseMoney, clampRate } from "./money";
import { getPeriodsForGroup } from "./entityLookup";
import {
  calcCoveredWeeks,
  daysBetweenInclusive,
  getMonthEnd,
  getMonthStart,
  getOverlapDaysInclusive,
  parseDateOnly,
} from "./dates";

/**
 * Faithful port of the old app's calcPeriodTotals() (js/12-calc-totals.js).
 *
 * - Rows marked "wrong" are excluded entirely from every total.
 * - Gross/Net are free-text; "" (not entered) is different from "0" (entered).
 * - The app doesn't support cents anywhere: Gross/Net are rounded to whole
 *   numbers the moment they're parsed, before any math happens on them.
 * - "My €" per row = (Net if entered, else Gross if entered, else 0) * rate.
 * - "Unpaid" per row = Gross * rate, only when Gross is entered but Net isn't
 *   (i.e. money billed but not yet reconciled against a net/paid amount).
 *
 * `ratePercent` is the GROUP's rate (old app stores it per group, not per
 * period — every period in a group shares one rate).
 */
export function computePeriodTotals(
  period: Pick<Period, "id">,
  rows: ClientRow[],
  ratePercent: number
): PeriodTotals {
  const rate = clampRate(ratePercent) / 100;
  const periodRows = rows.filter((r) => r.periodId === period.id);

  let gross = 0;
  let net = 0;
  let myEur = 0;
  let unpaid = 0;

  for (const row of periodRows) {
    if (row.status === "wrong") continue;

    const grossRaw = row.gross.trim();
    const netRaw = row.net.trim();
    const hasGross = grossRaw !== "";
    const hasNet = netRaw !== "";

    if (!hasGross && !hasNet) continue;

    const grossVal = hasGross ? Math.round(parseMoney(grossRaw)) : 0;
    const netVal = hasNet ? Math.round(parseMoney(netRaw)) : 0;

    if (Number.isFinite(grossVal)) gross += grossVal;
    if (Number.isFinite(netVal)) net += netVal;

    if (!hasNet && hasGross && Number.isFinite(grossVal)) {
      unpaid += grossVal * rate;
    }

    let base = 0;
    if (hasNet && Number.isFinite(netVal)) {
      base = netVal;
    } else if (hasGross && Number.isFinite(grossVal)) {
      base = grossVal;
    }
    myEur += base * rate;
  }

  return { gross, net, myEur, unpaid };
}

function periodHasMoneyValue(period: Period, rows: ClientRow[], key: "gross" | "net"): boolean {
  return rows.some((row) => {
    if (row.periodId !== period.id) return false;
    if (row.status === "wrong") return false;
    const raw = row[key].trim();
    if (!raw) return false;
    return Number.isFinite(parseMoney(raw));
  });
}

/**
 * Faithful port of calcGroupFinancials() (js/12-calc-totals.js): sums every
 * period's totals, then derives salary accrual/payment and income from
 * covered weeks vs paid weeks.
 */
export function computeGroupFinancials(
  group: Group,
  periods: Period[],
  rows: ClientRow[]
): GroupFinancials {
  const groupPeriods = getPeriodsForGroup(periods, group.id);

  const totals = groupPeriods.reduce(
    (acc, p) => {
      const t = computePeriodTotals(p, rows, group.defaultRate);
      acc.gross += t.gross;
      acc.net += t.net;
      acc.myEur += t.myEur;
      acc.unpaid += t.unpaid;
      return acc;
    },
    { gross: 0, net: 0, myEur: 0, unpaid: 0 }
  );

  const weeklySalary = Math.max(0, Math.round(group.defaultSalary)) / 4;
  const grossWeeks = calcCoveredWeeks(groupPeriods, (p) => periodHasMoneyValue(p, rows, "gross"));
  const paidWeeks = groupPeriods.reduce((sum, p) => sum + Math.max(0, Math.floor(p.paidWeeks ?? 0)), 0);
  const salaryAccrued = weeklySalary * grossWeeks;
  const salaryPaid = weeklySalary * Math.min(paidWeeks, grossWeeks);
  const salary = Math.max(0, salaryAccrued - salaryPaid);
  const income = totals.unpaid - salary;

  return {
    ...totals,
    salary,
    salaryAccrued,
    salaryPaid,
    income,
    grossWeeks,
    paidWeeks,
  };
}

/** Faithful port of calcGrandTotalsByMode(): sums computeGroupFinancials across groups. */
export function computeGrandTotals(
  groups: Group[],
  periods: Period[],
  rows: ClientRow[]
): GroupFinancials {
  return groups.reduce(
    (acc, group) => {
      const t = computeGroupFinancials(group, periods, rows);
      acc.gross += t.gross;
      acc.net += t.net;
      acc.myEur += t.myEur;
      acc.unpaid += t.unpaid;
      acc.salary += t.salary;
      acc.salaryAccrued += t.salaryAccrued;
      acc.salaryPaid += t.salaryPaid;
      acc.income += t.income;
      acc.grossWeeks += t.grossWeeks;
      acc.paidWeeks += t.paidWeeks;
      return acc;
    },
    {
      gross: 0,
      net: 0,
      myEur: 0,
      unpaid: 0,
      salary: 0,
      salaryAccrued: 0,
      salaryPaid: 0,
      income: 0,
      grossWeeks: 0,
      paidWeeks: 0,
    }
  );
}

/** Faithful port of calcGroupStatusCounts()/calcStatusCountsByMode(): plain counts, not month-filtered. */
export function computeStatusCounts(rows: ClientRow[]): StatusCounts {
  const counts: StatusCounts = { done: 0, fail: 0, fixed: 0, wrong: 0 };
  for (const row of rows) {
    if (row.status === "done") counts.done++;
    else if (row.status === "fail") counts.fail++;
    else if (row.status === "fixed") counts.fixed++;
    else if (row.status === "wrong") counts.wrong++;
  }
  return counts;
}

/** Faithful port of getMarkedClientsCount(): any row with a non-"none" status. */
export function computeMarkedClientsCount(rows: ClientRow[]): number {
  const c = computeStatusCounts(rows);
  return c.done + c.fail + c.fixed + c.wrong;
}

/**
 * Faithful port of calcMonthlyTotals(): prorates each period's totals by the
 * fraction of its days that fall within the given month.
 */
export function computeMonthlyTotals(
  monthKey: string | null,
  groups: Group[],
  periods: Period[],
  rows: ClientRow[]
): { gross: number; net: number; myEur: number } {
  const result = { gross: 0, net: 0, myEur: 0 };
  if (!monthKey) return result;

  const monthStart = getMonthStart(monthKey);
  const monthEnd = getMonthEnd(monthKey);
  const rateByGroupId = new Map(groups.map((g) => [g.id, g.defaultRate]));

  for (const period of periods) {
    const rate = rateByGroupId.get(period.groupId);
    if (rate === undefined) continue;

    const from = parseDateOnly(period.fromDate);
    const to = parseDateOnly(period.toDate);
    if (!from || !to || to < from) continue;

    const totalDays = daysBetweenInclusive(from, to);
    const overlapDays = getOverlapDaysInclusive(from, to, monthStart, monthEnd);
    if (overlapDays <= 0 || totalDays <= 0) continue;

    const ratio = overlapDays / totalDays;
    const t = computePeriodTotals(period, rows, rate);

    result.gross += t.gross * ratio;
    result.net += t.net * ratio;
    result.myEur += t.myEur * ratio;
  }

  return result;
}

/** Formats an amount with no cents — the app displays whole numbers only. */
export function formatMoney(n: number): string {
  return String(Math.round(n || 0));
}
