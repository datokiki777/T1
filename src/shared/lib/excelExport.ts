import type { ClientRow, Group, Period } from "../types/domain";
import { parseMoney } from "./money";
import { computeGroupFinancials, computeStatusCounts } from "./calc";
import { formatPeriodDate } from "./dates";
import { getPeriodsForGroup, getRowsForPeriod } from "./entityLookup";

export interface ExcelRow {
  Group: string;
  Archived: "yes" | "no";
  DefaultRatePercent: number;
  DefaultSalaryPer28Days: number;
  From: string;
  To: string;
  PaidWeeks: number;
  CarNumber: string;
  Client: string;
  City: string;
  Comment: string;
  Gross: number;
  Net: number;
  Status: string;
}

export interface ExcelSummaryRow {
  Group: string;
  Archived: "yes" | "no";
  DefaultRatePercent: number;
  DefaultSalaryPer28Days: number;
  CurrentCarNumber: string;
  Periods: number;
  Rows: number;
  Gross: number;
  Net: number;
  "My €": number;
  Unpaid: number;
  SalaryAccrued: number;
  SalaryPaid: number;
  SalaryRemaining: number;
  Income: number;
  Done: number;
  Fail: number;
  Fixed: number;
  Wrong: number;
}

/**
 * Builds the flat "Rows" sheet — one row per client, across every group and
 * period. Gross/Net are the parsed numeric value, rounded to whole numbers
 * (the app doesn't support cents anywhere), matching the old app's export
 * field set.
 */
export function buildExcelRows(groups: Group[], periods: Period[], clientRows: ClientRow[]): ExcelRow[] {
  const out: ExcelRow[] = [];

  for (const group of groups) {
    const groupPeriods = getPeriodsForGroup(periods, group.id);
    for (const period of groupPeriods) {
      const periodRows = getRowsForPeriod(clientRows, period.id);
      for (const row of periodRows) {
        out.push({
          Group: group.archived ? `📦 ${group.name}` : group.name,
          Archived: group.archived ? "yes" : "no",
          DefaultRatePercent: group.defaultRate,
          DefaultSalaryPer28Days: group.defaultSalary,
          From: formatPeriodDate(period.fromDate),
          To: formatPeriodDate(period.toDate),
          PaidWeeks: period.paidWeeks ?? 0,
          CarNumber: period.carNumber ?? "",
          Client: row.customer,
          City: row.city,
          Comment: row.comment,
          Gross: Math.round(parseMoney(row.gross) || 0),
          Net: Math.round(parseMoney(row.net) || 0),
          Status: row.status,
        });
      }
    }
  }

  return out;
}

/** Builds the per-group "Summary" sheet: totals, salary/income, status counts. */
export function buildExcelSummary(
  groups: Group[],
  periods: Period[],
  clientRows: ClientRow[]
): ExcelSummaryRow[] {
  return groups.map((group) => {
    const groupPeriods = getPeriodsForGroup(periods, group.id);
    const groupRows = clientRows.filter((r) => groupPeriods.some((p) => p.id === r.periodId));
    const financials = computeGroupFinancials(group, periods, clientRows);
    const statusCounts = computeStatusCounts(groupRows);

    return {
      Group: group.archived ? `📦 ${group.name}` : group.name,
      Archived: group.archived ? "yes" : "no",
      DefaultRatePercent: group.defaultRate,
      DefaultSalaryPer28Days: group.defaultSalary,
      CurrentCarNumber: group.currentCarNumber ?? "",
      Periods: groupPeriods.length,
      Rows: groupRows.length,
      Gross: financials.gross,
      Net: financials.net,
      "My €": financials.myEur,
      Unpaid: financials.unpaid,
      SalaryAccrued: financials.salaryAccrued,
      SalaryPaid: financials.salaryPaid,
      SalaryRemaining: financials.salary,
      Income: financials.income,
      Done: statusCounts.done,
      Fail: statusCounts.fail,
      Fixed: statusCounts.fixed,
      Wrong: statusCounts.wrong,
    };
  });
}
