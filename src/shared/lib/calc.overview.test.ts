import { describe, it, expect } from "vitest";
import {
  computeGroupFinancials,
  computeGrandTotals,
  computeStatusCounts,
  computeMarkedClientsCount,
  computeMonthlyTotals,
  computePeriodTotalsForGroup,
} from "./calc";
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
    amount: "",
    expense: "",
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

describe("computeGroupFinancials — monthly salary and Income", () => {
  it("sums amount/expense/my/unpaid across every period in the group", () => {
    const group = makeGroup();
    const p1 = makePeriod({ fromDate: "2026-01-01", toDate: "2026-01-07" });
    const p2 = makePeriod({ fromDate: "2026-02-01", toDate: "2026-02-07" });
    const rows = [
      makeRow(p1.id, { amount: "100", expense: "" }),
      makeRow(p2.id, { amount: "200", expense: "30", status: "unpaid" }),
    ];
    const t = computeGroupFinancials(group, [p1, p2], rows);
    expect(t.amount).toBe(300);
    expect(t.expense).toBe(30);
    expect(t.myEur).toBe(270); // amount − expense
    expect(t.unpaid).toBe(200);
  });

  it("salary share = monthly salary / salary-month length × days of the unpaid clients", () => {
    const group = makeGroup({ defaultSalary: 3100 });
    const p1 = makePeriod();
    const rows = [
      makeRow(p1.id, { amount: "500", status: "unpaid", visitDate: "2026-01-07", visitDays: 2 }),
    ];
    const t = computeGroupFinancials(group, [p1], rows);
    // anchor 7: Jan 7 → Feb 7 = 31 days -> 3100/31 = 100 per day × 2 days
    expect(t.salaryMonths).toBe(1);
    expect(t.salary).toBeCloseTo(200);
    expect(t.income).toBeCloseTo(500 - 200);
  });

  it("income = unpaid − expense of the UNPAID clients − salary share (other clients' expense is not subtracted)", () => {
    const group = makeGroup({ defaultSalary: 3100 });
    const p1 = makePeriod();
    const rows = [
      makeRow(p1.id, { amount: "1000", expense: "200", status: "unpaid", visitDate: "2026-01-07", visitDays: 1 }),
      makeRow(p1.id, { amount: "300", expense: "50", status: "done", visitDate: "2026-01-10", visitDays: 1 }),
    ];
    const t = computeGroupFinancials(group, [p1], rows);
    expect(t.unpaid).toBe(1000);
    expect(t.expense).toBe(250); // total expense is still shown as before
    expect(t.salary).toBeCloseTo(200); // 2 recorded days × 100 (subtracted in My €)
    expect(t.myEur).toBeCloseTo(1300 - 250 - 200);
    expect(t.income).toBeCloseTo(1000 - 200 - 100); // only the unpaid client's day (100)
  });

  it("with no salary, income = unpaid − total expense", () => {
    const group = makeGroup({ defaultSalary: 0 });
    const p1 = makePeriod();
    const rows = [makeRow(p1.id, { amount: "1000", status: "unpaid", visitDate: "2026-01-07" })];
    const t = computeGroupFinancials(group, [p1], rows);
    expect(t.income).toBe(1000);
  });

  it("a client without any date can't be placed: counted in totals, flagged, not in Income", () => {
    const group = makeGroup({ defaultSalary: 0 });
    const p1 = makePeriod({ fromDate: null, toDate: null });
    const rows = [makeRow(p1.id, { amount: "500", status: "unpaid" })];
    const t = computeGroupFinancials(group, [p1], rows);
    expect(t.unpaid).toBe(500);
    expect(t.undatedRows).toBe(1);
    expect(t.income).toBe(0);
  });

  it("ignores periods belonging to a different group", () => {
    const group = makeGroup({ id: "g1" });
    const p1 = makePeriod({ groupId: "g1", fromDate: "2026-01-01", toDate: "2026-01-07" });
    const p2 = makePeriod({ groupId: "g2", fromDate: "2026-01-01", toDate: "2026-01-07" });
    const rows = [makeRow(p1.id, { amount: "100" }), makeRow(p2.id, { amount: "999" })];
    const t = computeGroupFinancials(group, [p1, p2], rows);
    expect(t.amount).toBe(100);
  });
});

describe("computeGrandTotals", () => {
  it("sums financials across multiple groups", () => {
    const g1 = makeGroup({ id: "g1" });
    const g2 = makeGroup({ id: "g2" });
    const p1 = makePeriod({ groupId: "g1" });
    const p2 = makePeriod({ groupId: "g2" });
    const rows = [makeRow(p1.id, { amount: "100" }), makeRow(p2.id, { amount: "100" })];
    const grand = computeGrandTotals([g1, g2], [p1, p2], rows);
    expect(grand.amount).toBe(200);
    expect(grand.myEur).toBe(200); // 100 + 100, rate no longer applies
  });

  it("returns all zeros for an empty group list", () => {
    const grand = computeGrandTotals([], [], []);
    expect(grand.amount).toBe(0);
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
      makeRow("p1", { status: "unpaid" }),
      makeRow("p1", { status: "none" }),
    ];
    const counts = computeStatusCounts(rows);
    expect(counts).toEqual({ done: 2, fail: 1, fixed: 1, wrong: 1, unpaid: 1 });
    expect(computeMarkedClientsCount(rows)).toBe(6); // everything except "none"
  });
});

describe("computeMonthlyTotals — salary months", () => {
  const group = makeGroup({ defaultSalary: 500 });
  const period = makePeriod();

  it("sums the clients assigned to that salary month; Income uses only the unpaid ones", () => {
    const g = makeGroup({ defaultSalary: 3100 });
    const rows = [
      makeRow(period.id, { amount: "1000", expense: "100", status: "unpaid", visitDate: "2026-01-07", visitDays: 1 }),
      makeRow(period.id, { amount: "400", expense: "50", status: "done", visitDate: "2026-02-01", visitDays: 1 }),
      makeRow(period.id, { amount: "200", status: "unpaid", visitDate: "2026-02-07", visitDays: 1 }),
    ];
    // anchor day 7: Jan7-Feb6 holds rows 1 & 2; Feb7-Mar6 holds row 3.
    const jan = computeMonthlyTotals("2026-01", [g], [period], rows);
    expect(jan.amount).toBe(1400);
    expect(jan.expense).toBe(150);
    expect(jan.unpaid).toBe(1000);
    expect(jan.salary).toBeCloseTo(200); // 3100/31 × 2 recorded days (Jan 7, Feb 1)
    expect(jan.myEur).toBeCloseTo(1400 - 150 - 200);
    expect(jan.income).toBeCloseTo(1000 - 100 - 100); // unpaid day = 1 -> 100
    const feb = computeMonthlyTotals("2026-02", [g], [period], rows);
    expect(feb.amount).toBe(200);
    expect(feb.salary).toBeCloseTo(3100 / 28); // Feb 7 → Mar 7 = 28 days
    expect(feb.myEur).toBeCloseTo(200 - 3100 / 28);
    expect(feb.income).toBeCloseTo(200 - 3100 / 28);
  });

  it("returns all zeros when monthKey is null", () => {
    expect(computeMonthlyTotals(null, [], [], [])).toEqual({
      amount: 0, expense: 0, myEur: 0, unpaid: 0, salary: 0, income: 0,
    });
  });

  it("returns zeros for a month with no data", () => {
    const rows = [makeRow(period.id, { amount: "1000", visitDate: "2026-01-07" })];
    expect(computeMonthlyTotals("2026-05", [group], [period], rows).amount).toBe(0);
  });
});

describe("My € subtracts the salary owed for the recorded days", () => {
  it("period My€ = Amount − Expense − salary of that period's days; group My€ matches", () => {
    const group = makeGroup({ defaultSalary: 3100 });
    const p1 = makePeriod({ fromDate: "2026-01-07", toDate: "2026-01-13" });
    const rows = [
      makeRow(p1.id, { amount: "1000", expense: "100", visitDate: "2026-01-07", visitDays: 2 }),
      makeRow(p1.id, { amount: "500", expense: "50", visitDate: "2026-01-08", visitDays: 1 }),
    ];
    // days 7, 8 (day 8 shared) -> 2 distinct days × (3100/31 = 100) = 200
    const period = computePeriodTotalsForGroup(p1, group, [p1], rows);
    expect(period.salary).toBeCloseTo(200);
    expect(period.myEur).toBeCloseTo(1500 - 150 - 200);
    const g = computeGroupFinancials(group, [p1], rows);
    expect(g.myEur).toBeCloseTo(period.myEur);
    expect(g.salary).toBeCloseTo(200);
  });

  it("with no salary configured, My€ is just Amount − Expense", () => {
    const group = makeGroup({ defaultSalary: 0 });
    const p1 = makePeriod();
    const rows = [makeRow(p1.id, { amount: "1000", expense: "300", visitDate: "2026-01-07" })];
    expect(computeGroupFinancials(group, [p1], rows).myEur).toBe(700);
  });
});
