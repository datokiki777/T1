import * as XLSX from "xlsx";
import { db } from "../../db/database";
import { buildExcelRows, buildExcelSummary } from "../../shared/lib/excelExport";

export async function exportToExcel() {
  const [groups, periods, clientRows] = await Promise.all([
    db.groups.toArray(),
    db.periods.toArray(),
    db.clientRows.toArray(),
  ]);

  const rows = buildExcelRows(groups, periods, clientRows);
  const summary = buildExcelSummary(groups, periods, clientRows);

  const workbook = XLSX.utils.book_new();

  const wsRows = XLSX.utils.json_to_sheet(rows);
  wsRows["!cols"] = [
    { wch: 20 }, // Group
    { wch: 10 }, // Archived
    { wch: 18 }, // DefaultRatePercent
    { wch: 22 }, // DefaultSalaryPer28Days
    { wch: 12 }, // From
    { wch: 12 }, // To
    { wch: 12 }, // PaidWeeks
    { wch: 22 }, // Client
    { wch: 16 }, // City
    { wch: 28 }, // Comment
    { wch: 12 }, // Gross
    { wch: 12 }, // Net
    { wch: 10 }, // Status
  ];

  const wsSummary = XLSX.utils.json_to_sheet(summary);
  wsSummary["!cols"] = [
    { wch: 20 }, // Group
    { wch: 10 }, // Archived
    { wch: 18 }, // DefaultRatePercent
    { wch: 22 }, // DefaultSalaryPer28Days
    { wch: 10 }, // Periods
    { wch: 10 }, // Rows
    { wch: 12 }, // Gross
    { wch: 12 }, // Net
    { wch: 12 }, // My €
    { wch: 12 }, // Unpaid
    { wch: 14 }, // SalaryAccrued
    { wch: 12 }, // SalaryPaid
    { wch: 16 }, // SalaryRemaining
    { wch: 12 }, // Income
    { wch: 8 }, // Done
    { wch: 8 }, // Fail
    { wch: 8 }, // Fixed
    { wch: 8 }, // Wrong
  ];

  XLSX.utils.book_append_sheet(workbook, wsRows, "Rows");
  XLSX.utils.book_append_sheet(workbook, wsSummary, "Summary");

  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `t1-${dateStr}.xlsx`);
}
