import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { db } from "../../db/database";
import { parseMoney } from "../../shared/lib/money";
import { formatPeriodDate } from "../../shared/lib/dates";
import { getRowsForPeriod } from "../../shared/lib/entityLookup";
import {
  computeGrandTotals,
  computeGroupFinancials,
  computePeriodTotals,
  computeStatusCounts,
  formatMoney,
} from "../../shared/lib/calc";
import type { ClientRow, Period } from "../../shared/types/domain";

const STATUS_LABEL: Record<string, string> = {
  none: "",
  done: "Done",
  fail: "Fail",
  fixed: "Fixed",
  wrong: "Wrong",
  unpaid: "Unpaid",
};

export async function exportToPdf() {
  const [groups, periods, clientRows] = await Promise.all([
    db.groups.toArray(),
    db.periods.toArray(),
    db.clientRows.toArray(),
  ]);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 12;
  const pageW = doc.internal.pageSize.getWidth();
  let y = margin;

  function heading(text: string, size: number, bold = true) {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.text(text, margin, y);
    y += size / 2.2;
  }

  function afterTable() {
    // jspdf-autotable tracks the last table's final Y on the document instance.
    const withAutoTable = doc as unknown as { lastAutoTable?: { finalY: number } };
    y = (withAutoTable.lastAutoTable?.finalY ?? y) + 8;
  }

  // --- Title + export date ---
  heading("T1 — PDF Report (All Groups)", 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Exported: ${new Date().toLocaleString()}`, margin, y);
  y += 8;

  // --- Overall summary ---
  const grand = computeGrandTotals(groups, periods, clientRows);
  const overallStatus = computeStatusCounts(clientRows);

  heading("Overall Summary", 12);
  autoTable(doc, {
    startY: y,
    theme: "plain",
    styles: { fontSize: 10 },
    body: [
      ["Groups", String(groups.length)],
      ["Amount", formatMoney(grand.amount)],
      ["Expense", formatMoney(grand.expense)],
      ["My €", formatMoney(grand.myEur)],
      ["Unpaid", formatMoney(grand.unpaid)],
      ["Income", formatMoney(grand.income)],
      [
        "Status",
        `Done ${overallStatus.done} · Fail ${overallStatus.fail} · Fixed ${overallStatus.fixed} · Wrong ${overallStatus.wrong} · Unpaid ${overallStatus.unpaid}`,
      ],
    ],
    margin: { left: margin, right: margin },
  });
  afterTable();

  // --- Per group ---
  for (const group of groups) {
    if (y > 260) {
      doc.addPage();
      y = margin;
    }

    const groupPeriods = periods.filter((p: Period) => p.groupId === group.id);
    const groupRows = clientRows.filter((r: ClientRow) => groupPeriods.some((p) => p.id === r.periodId));
    const financials = computeGroupFinancials(group, periods, clientRows);
    const statusCounts = computeStatusCounts(groupRows);

    heading(`Group: ${group.name}${group.archived ? " [ARCHIVED]" : ""}`, 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(
      `Periods: ${groupPeriods.length}   Rows: ${groupRows.length}`,
      margin,
      y
    );
    y += 6;

    autoTable(doc, {
      startY: y,
      theme: "plain",
      styles: { fontSize: 9 },
      body: [
        [
          `Amount: ${formatMoney(financials.amount)}`,
          `Expense: ${formatMoney(financials.expense)}`,
          `My €: ${formatMoney(financials.myEur)}`,
          `Done ${statusCounts.done} · Fail ${statusCounts.fail} · Fixed ${statusCounts.fixed} · Wrong ${statusCounts.wrong} · Unpaid ${statusCounts.unpaid}`,
        ],
      ],
      margin: { left: margin, right: margin },
    });
    afterTable();

    for (const period of groupPeriods) {
      if (y > 250) {
        doc.addPage();
        y = margin;
      }

      const periodRows = getRowsForPeriod(clientRows, period.id);
      const totals = computePeriodTotals(period, clientRows);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(
        `Period: ${formatPeriodDate(period.fromDate)} → ${formatPeriodDate(period.toDate)}` +
          (period.carNumber ? `   Car: ${period.carNumber}` : ""),
        margin,
        y
      );
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(
        `Amount: ${formatMoney(totals.amount)}   Expense: ${formatMoney(totals.expense)}   My €: ${formatMoney(totals.myEur)}   Clients: ${periodRows.length}`,
        margin,
        y
      );
      y += 6;

      autoTable(doc, {
        startY: y,
        head: [["Client", "City", "Amount", "Expense", "Status", "Comment"]],
        body: periodRows.map((row) => [
          row.customer.trim() || "Client",
          row.city.trim() || "—",
          formatMoney(parseMoney(row.amount) || 0),
          formatMoney(parseMoney(row.expense) || 0),
          STATUS_LABEL[row.status] ?? "",
          row.comment.trim(),
        ]),
        styles: { fontSize: 8, cellWidth: "wrap" },
        headStyles: { fillColor: [11, 29, 63] },
        columnStyles: { 5: { cellWidth: pageW - margin * 2 - 110 } },
        margin: { left: margin, right: margin },
      });
      afterTable();
    }
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  doc.save(`t1-${dateStr}.pdf`);
}
