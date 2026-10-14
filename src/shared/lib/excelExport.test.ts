import { describe, it, expect } from "vitest";
import { buildExcelRows, buildExcelSummary } from "./excelExport";
import type { ClientRow, Group, Period } from "../types/domain";

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: "g1",
    name: "Group 1",
    archived: false,
    defaultSalary: 0,
    currentCarNumber: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makePeriod(overrides: Partial<Period> = {}): Period {
  return {
    id: "p1",
    groupId: "g1",
    fromDate: "2026-01-01",
    toDate: "2026-01-31",
    paidWeeks: null,
    carNumber: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeRow(overrides: Partial<ClientRow> = {}): ClientRow {
  return {
    id: "r1",
    periodId: "p1",
    customer: "Acme",
    amount: "1234.56",
    expense: "",
    city: "Tbilisi",
    status: "none",
    comment: "call back",
    visitDate: null,
    visitDays: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("buildExcelRows", () => {
  it("produces one row per client with the exact field set", () => {
    const rows = buildExcelRows([makeGroup()], [makePeriod()], [makeRow()]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      Group: "Group 1",
      Archived: "no",
      MonthlySalary: 0,
      From: "01/01/2026",
      To: "31/01/2026",
      PaidWeeks: 0,
      Client: "Acme",
      City: "Tbilisi",
      Comment: "call back",
      Status: "none",
    });
  });

  it("rounds fractional amounts to whole numbers — the app doesn't support cents", () => {
    const rows = buildExcelRows([makeGroup()], [makePeriod()], [makeRow({ amount: "1234.56" })]);
    expect(rows[0].Amount).toBe(1235);
  });

  it("marks an archived group's name with the archive icon", () => {
    const rows = buildExcelRows(
      [makeGroup({ archived: true })],
      [makePeriod()],
      [makeRow()]
    );
    expect(rows[0].Group).toBe("📦 Group 1");
    expect(rows[0].Archived).toBe("yes");
  });

  it("includes rows from every period across every group", () => {
    const g2 = makeGroup({ id: "g2", name: "Group 2" });
    const p2 = makePeriod({ id: "p2", groupId: "g2" });
    const rows = buildExcelRows(
      [makeGroup(), g2],
      [makePeriod(), p2],
      [makeRow({ id: "r1", periodId: "p1" }), makeRow({ id: "r2", periodId: "p2" })]
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.Group)).toEqual(["Group 1", "Group 2"]);
  });

  it("carries each row's own period-level CarNumber, blank when unset", () => {
    const rows = buildExcelRows(
      [makeGroup()],
      [makePeriod({ carNumber: "108" })],
      [makeRow()]
    );
    expect(rows[0].CarNumber).toBe("108");

    const unset = buildExcelRows([makeGroup()], [makePeriod()], [makeRow()]);
    expect(unset[0].CarNumber).toBe("");
  });
});

describe("buildExcelSummary", () => {
  it("aggregates totals and status counts per group", () => {
    const rows = [
      makeRow({ id: "r1", amount: "1000", status: "done" }),
      makeRow({ id: "r2", amount: "500", status: "fail" }),
    ];
    const summary = buildExcelSummary([makeGroup()], [makePeriod()], rows);
    expect(summary).toHaveLength(1);
    expect(summary[0].Amount).toBe(1500);
    expect(summary[0].Done).toBe(1);
    expect(summary[0].Fail).toBe(1);
    expect(summary[0].Periods).toBe(1);
    expect(summary[0].Rows).toBe(2);
  });

  it("computes salary/income the same way as computeGroupFinancials", () => {
    const group = makeGroup({ defaultSalary: 3100 }); // monthly
    const period = makePeriod({ fromDate: "2026-01-01", toDate: "2026-01-07", paidWeeks: 0 });
    const rows = [makeRow({ amount: "1000", expense: "100", status: "unpaid" })];
    const summary = buildExcelSummary([group], [period], rows);
    // no visit date -> period start (Jan 1) anchors the month: Jan 1 → Feb 1 = 31 days
    expect(summary[0].SalaryMonths).toBe(1);
    expect(summary[0].SalaryTotal).toBeCloseTo(100); // 3100/31 × 1 day
    expect(summary[0].Income).toBeCloseTo(1000 - 100 - 100);
  });

  it("returns one summary row per group even with zero periods", () => {
    const summary = buildExcelSummary([makeGroup()], [], []);
    expect(summary).toHaveLength(1);
    expect(summary[0].Periods).toBe(0);
    expect(summary[0].Amount).toBe(0);
  });

  it("carries the group's own CurrentCarNumber, blank when unset", () => {
    const summary = buildExcelSummary([makeGroup({ currentCarNumber: "205" })], [], []);
    expect(summary[0].CurrentCarNumber).toBe("205");

    const unset = buildExcelSummary([makeGroup()], [], []);
    expect(unset[0].CurrentCarNumber).toBe("");
  });
});
