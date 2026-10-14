import type {
  ClientRow,
  Group,
  GroupFinancials,
  Period,
  PeriodTotals,
  StatusCounts,
} from "../types/domain";
import { getPeriodsForGroup } from "./entityLookup";
import { computeGroupSalaryMonths, rowAmounts } from "./salaryMonths";


/**
 * Period totals.
 *
 * - Rows marked "wrong" are excluded entirely from every total.
 * - Amount/Expense are free-text; "" (not entered) is different from "0".
 * - The app doesn't support cents: values are rounded to whole numbers the
 *   moment they're parsed.
 * - "My €" = Amount − Expense (an empty Expense counts as 0) − `salary`,
 *   the salary owed for the days of the period's clients (see salaryMonths.ts).
 * - "Unpaid" = sum of the Amount of rows whose status is "unpaid".
 */
export function computePeriodTotals(
  period: Pick<Period, "id">,
  rows: ClientRow[],
  salary = 0
): PeriodTotals {
  const periodRows = rows.filter((r) => r.periodId === period.id);

  let amount = 0;
  let expense = 0;
  let myEur = 0;
  let unpaid = 0;

  for (const row of periodRows) {
    if (row.status === "wrong") continue;
    const m = rowAmounts(row);
    if (!m.hasMoney) continue;

    amount += m.amount;
    expense += m.expense;
    myEur += m.amount - m.expense;
    if (row.status === "unpaid") unpaid += m.amount;
  }

  return { amount, expense, myEur: myEur - salary, unpaid, salary };
}

/** Period totals including the salary owed for the period's recorded days. */
export function computePeriodTotalsForGroup(
  period: Pick<Period, "id">,
  group: Group,
  periods: Period[],
  rows: ClientRow[]
): PeriodTotals {
  const sm = computeGroupSalaryMonths(group, periods, rows);
  return computePeriodTotals(period, rows, sm.periodSalary[period.id] ?? 0);
}

/**
 * Group financials: sums every period's totals, then derives the monthly
 * salary and Income from the group's salary months (see salaryMonths.ts):
 *   Income = Σ over salary months of (Unpaid − Expense − monthly Salary).
 */
export function computeGroupFinancials(
  group: Group,
  periods: Period[],
  rows: ClientRow[]
): GroupFinancials {
  const groupPeriods = getPeriodsForGroup(periods, group.id);

  const base = groupPeriods.reduce(
    (acc, p) => {
      const t = computePeriodTotals(p, rows);
      acc.amount += t.amount;
      acc.expense += t.expense;
      acc.unpaid += t.unpaid;
      return acc;
    },
    { amount: 0, expense: 0, unpaid: 0 }
  );

  const sm = computeGroupSalaryMonths(group, periods, rows);
  const salary = sm.months.reduce((sum, m) => sum + m.salary, 0);
  const income = sm.months.reduce((sum, m) => sum + m.income, 0);
  // My € = Amount − Expense − salary owed for the recorded days.
  const totals = { ...base, myEur: base.amount - base.expense - salary, salary };

  return {
    ...totals,
    income,
    salaryMonths: sm.months.length,
    undatedRows: sm.undatedRows,
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
      acc.amount += t.amount;
      acc.expense += t.expense;
      acc.myEur += t.myEur;
      acc.unpaid += t.unpaid;
      acc.salary += t.salary;
      acc.income += t.income;
      acc.salaryMonths += t.salaryMonths;
      acc.undatedRows += t.undatedRows;
      return acc;
    },
    {
      amount: 0,
      expense: 0,
      myEur: 0,
      unpaid: 0,
      salary: 0,
      income: 0,
      salaryMonths: 0,
      undatedRows: 0,
    }
  );
}

/** Faithful port of calcGroupStatusCounts()/calcStatusCountsByMode(): plain counts, not month-filtered. */
export function computeStatusCounts(rows: ClientRow[]): StatusCounts {
  const counts: StatusCounts = { done: 0, fail: 0, fixed: 0, wrong: 0, unpaid: 0 };
  for (const row of rows) {
    if (row.status === "done") counts.done++;
    else if (row.status === "fail") counts.fail++;
    else if (row.status === "fixed") counts.fixed++;
    else if (row.status === "wrong") counts.wrong++;
    else if (row.status === "unpaid") counts.unpaid++;
  }
  return counts;
}

/** Faithful port of getMarkedClientsCount(): any row with a non-"none" status. */
export function computeMarkedClientsCount(rows: ClientRow[]): number {
  const c = computeStatusCounts(rows);
  return c.done + c.fail + c.fixed + c.wrong + c.unpaid;
}

export interface MonthlyTotals {
  amount: number;
  expense: number;
  myEur: number;
  unpaid: number;
  salary: number;
  income: number;
}

/** Sorted union of the salary-month keys of the given groups. */
export function getSalaryMonthKeys(groups: Group[], periods: Period[], rows: ClientRow[]): string[] {
  const keys = new Set<string>();
  for (const g of groups) {
    for (const m of computeGroupSalaryMonths(g, periods, rows).months) keys.add(m.key);
  }
  return [...keys].sort();
}

/** Totals of one salary month (key = YYYY-MM it starts in), summed over groups. */
export function computeMonthlyTotals(
  monthKey: string | null,
  groups: Group[],
  periods: Period[],
  rows: ClientRow[]
): MonthlyTotals {
  const result: MonthlyTotals = { amount: 0, expense: 0, myEur: 0, unpaid: 0, salary: 0, income: 0 };
  if (!monthKey) return result;
  for (const g of groups) {
    for (const m of computeGroupSalaryMonths(g, periods, rows).months) {
      if (m.key !== monthKey) continue;
      result.amount += m.amount;
      result.expense += m.expense;
      result.myEur += m.myEur;
      result.unpaid += m.unpaid;
      result.salary += m.salary;
      result.income += m.income;
    }
  }
  return result;
}

/** Formats an amount with no cents — the app displays whole numbers only. */
export function formatMoney(n: number): string {
  return String(Math.round(n || 0));
}
