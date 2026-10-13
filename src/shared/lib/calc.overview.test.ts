import { describe, it, expect } from "vitest";
import {
  computeGroupFinancials,
  computeGrandTotals,
  computeStatusCounts,
  computeMarkedClientsCount,
  computeMonthlyTotals,
} from "./calc";
import type { ClientRow, Group, Period } from "../types/domain";

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: "g1",
    name: "Group 1",
    archived: false,
    defaultRate: 10,
    defaultSalary: 0,
    currentCarNumber: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makePeriod(overrides: Partial<Period> = {}): Period {
  return {
    id: Math.random().toString(36),
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

function makeRow(periodId: string, overrides: Partial<ClientRow> = {}): ClientRow {
  return {
    id: Math.random().toString(36),
    periodId,
    customer: "Test",
    gross: "",
    net: "",
    city: "",
    status: "none",
    comment: "",
    visitDate: null,
    visitDays: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("computeGroupFinancials — salary/income vs the old app's calcGroupFinancials", () => {
  it("sums gross/net/my/unpaid across every period in the group", () => {
    const group = makeGroup({ defaultRate: 10 });
    const p1 = makePeriod({ fromDate: "2026-01-01", toDate: "2026-01-07" });
    const p2 = makePeriod({ fromDate: "2026-02-01", toDate: "2026-02-07" });
    const rows = [
      makeRow(p1.id, { gross: "100", net: "" }),
      makeRow(p2.id, { gross: "200", net: "" }),
    ];
    const t = computeGroupFinancials(group, [p1, p2], rows);
    expect(t.gross).toBe(300);
    expect(t.myEur).toBeCloseTo(30);
  });

  it("accrues salary from weekly rate * covered gross-weeks", () => {
    // 28-day default salary of 400 -> weekly salary = 100
    const group = makeGroup({ defaultRate: 10, defaultSalary: 400 });
    // 1 week period with a gross value -> 1 gross-week covered
    const p1 = makePeriod({ fromDate: "2026-01-01", toDate: "2026-01-07", paidWeeks: 0 });
    const rows = [makeRow(p1.id, { gross: "100", net: "" })];
    const t = computeGroupFinancials(group, [p1], rows);
    expect(t.grossWeeks).toBe(1);
    expect(t.salaryAccrued).toBeCloseTo(100); // 100/week * 1 week
    expect(t.salaryPaid).toBe(0); // paidWeeks = 0
    expect(t.salary).toBeCloseTo(100); // accrued - paid, floored at 0
  });

  it("reduces owed salary by paid weeks, never going negative", () => {
    const group = makeGroup({ defaultRate: 10, defaultSalary: 400 }); // 100/week
    const p1 = makePeriod({ fromDate: "2026-01-01", toDate: "2026-01-07", paidWeeks: 5 }); // over-paid
    const rows = [makeRow(p1.id, { gross: "100", net: "" })];
    const t = computeGroupFinancials(group, [p1], rows);
    expect(t.salary).toBe(0); // paid weeks capped at grossWeeks, salary can't go negative
  });

  it("computes income as unpaid minus salary owed", () => {
    const group = makeGroup({ defaultRate: 10, defaultSalary: 0 }); // no salary at all
    const p1 = makePeriod({ fromDate: "2026-01-01", toDate: "2026-01-07" });
    const rows = [makeRow(p1.id, { gross: "1000", net: "" })]; // unpaid = 1000*10% = 100
    const t = computeGroupFinancials(group, [p1], rows);
    expect(t.unpaid).toBeCloseTo(100);
    expect(t.salary).toBe(0);
    expect(t.income).toBeCloseTo(100); // unpaid - 0
  });

  it("ignores periods belonging to a different group", () => {
    const group = makeGroup({ id: "g1" });
    const p1 = makePeriod({ groupId: "g1", fromDate: "2026-01-01", toDate: "2026-01-07" });
    const p2 = makePeriod({ groupId: "g2", fromDate: "2026-01-01", toDate: "2026-01-07" });
    const rows = [makeRow(p1.id, { gross: "100" }), makeRow(p2.id, { gross: "999" })];
    const t = computeGroupFinancials(group, [p1, p2], rows);
    expect(t.gross).toBe(100);
  });
});

describe("computeGrandTotals", () => {
  it("sums financials across multiple groups", () => {
    const g1 = makeGroup({ id: "g1", defaultRate: 10 });
    const g2 = makeGroup({ id: "g2", defaultRate: 20 });
    const p1 = makePeriod({ groupId: "g1" });
    const p2 = makePeriod({ groupId: "g2" });
    const rows = [makeRow(p1.id, { gross: "100" }), makeRow(p2.id, { gross: "100" })];
    const grand = computeGrandTotals([g1, g2], [p1, p2], rows);
    expect(grand.gross).toBe(200);
    expect(grand.myEur).toBeCloseTo(10 + 20); // 100*10% + 100*20%
  });

  it("returns all zeros for an empty group list", () => {
    const grand = computeGrandTotals([], [], []);
    expect(grand.gross).toBe(0);
    expect(grand.income).toBe(0);
  });
});

describe("computeStatusCounts / computeMarkedClientsCount", () => {
  it("counts each status independently", () => {
    const rows = [
      makeRow("p1", { status: "done" }),
      makeRow("p1", { status: "done" }),
      makeRow("p1", { status: "fail" }),
      makeRow("p1", { status: "fixed" }),
      makeRow("p1", { status: "wrong" }),
      makeRow("p1", { status: "none" }),
    ];
    const counts = computeStatusCounts(rows);
    expect(counts).toEqual({ done: 2, fail: 1, fixed: 1, wrong: 1 });
    expect(computeMarkedClientsCount(rows)).toBe(5); // everything except "none"
  });
});

describe("computeMonthlyTotals — prorated by day-overlap, matching calcMonthlyTotals", () => {
  it("prorates a period's totals by the fraction of days inside the month", () => {
    const group = makeGroup({ defaultRate: 10 });
    // period spans 10 days, only 5 of them are in February
    const period = makePeriod({ fromDate: "2026-01-28", toDate: "2026-02-06", groupId: "g1" });
    const rows = [makeRow(period.id, { gross: "1000", net: "" })]; // full period my€ = 100
    const totals = computeMonthlyTotals("2026-02", [group], [period], rows);
    // total days = 10 (Jan28..Feb6 inclusive), overlap with Feb = Feb1..Feb6 = 6 days
    const expectedRatio = 6 / 10;
    expect(totals.gross).toBeCloseTo(1000 * expectedRatio);
    expect(totals.myEur).toBeCloseTo(100 * expectedRatio);
  });

  it("returns all zeros when monthKey is null", () => {
    expect(computeMonthlyTotals(null, [], [], [])).toEqual({ gross: 0, net: 0, myEur: 0 });
  });

  it("excludes periods with no overlap with the given month", () => {
    const group = makeGroup({ defaultRate: 10 });
    const period = makePeriod({ fromDate: "2026-01-01", toDate: "2026-01-10", groupId: "g1" });
    const rows = [makeRow(period.id, { gross: "1000" })];
    const totals = computeMonthlyTotals("2026-05", [group], [period], rows);
    expect(totals.gross).toBe(0);
  });
});
