import { describe, it, expect } from "vitest";
import { computePeriodTotals, formatMoney } from "./calc";
import type { ClientRow, Period } from "../types/domain";

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

function makeRow(overrides: Partial<ClientRow>): ClientRow {
  return {
    id: Math.random().toString(36),
    periodId: "p1",
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

describe("computePeriodTotals — My € = Amount − Expense", () => {
  it("My€ is Amount minus Expense", () => {
    const period = makePeriod();
    const rows = [makeRow({ amount: "1000", expense: "800" })];
    const totals = computePeriodTotals(period, rows, 10);
    expect(totals.amount).toBe(1000);
    expect(totals.expense).toBe(800);
    expect(totals.myEur).toBe(200);
  });

  it("an empty Expense counts as 0 — My€ equals Amount", () => {
    const period = makePeriod();
    const rows = [makeRow({ amount: "500", expense: "" })];
    const totals = computePeriodTotals(period, rows, 10);
    expect(totals.myEur).toBe(500);
  });

  it("an explicit Expense of '0' gives the same result as empty", () => {
    const period = makePeriod();
    const rows = [makeRow({ amount: "500", expense: "0" })];
    const totals = computePeriodTotals(period, rows, 10);
    expect(totals.myEur).toBe(500);
    expect(totals.amount).toBe(500);
  });

  it("Expense larger than Amount gives a negative My€", () => {
    const period = makePeriod();
    const rows = [makeRow({ amount: "100", expense: "130" })];
    const totals = computePeriodTotals(period, rows, 10);
    expect(totals.myEur).toBe(-30);
  });

  it("the group rate no longer affects My€", () => {
    const period = makePeriod();
    const rows = [makeRow({ amount: "1000", expense: "200" })];
    expect(computePeriodTotals(period, rows, 0).myEur).toBe(800);
    expect(computePeriodTotals(period, rows, 50).myEur).toBe(800);
  });

  it("excludes rows marked 'wrong' from every total", () => {
    const period = makePeriod();
    const rows = [
      makeRow({ amount: "1000", expense: "800", status: "wrong" }),
      makeRow({ amount: "100", expense: "80", status: "none" }),
    ];
    const totals = computePeriodTotals(period, rows, 10);
    expect(totals.amount).toBe(100);
    expect(totals.expense).toBe(80);
    expect(totals.myEur).toBe(20);
  });

  it("skips rows with neither Amount nor Expense entered", () => {
    const period = makePeriod();
    const rows = [makeRow({ amount: "", expense: "" })];
    const totals = computePeriodTotals(period, rows, 10);
    expect(totals.amount).toBe(0);
    expect(totals.expense).toBe(0);
    expect(totals.myEur).toBe(0);
  });

  it("sums multiple rows correctly", () => {
    const period = makePeriod();
    const rows = [
      makeRow({ amount: "100", expense: "" }), // +100
      makeRow({ amount: "", expense: "50" }), // -50
      makeRow({ amount: "999", expense: "999", status: "wrong" }), // excluded
    ];
    const totals = computePeriodTotals(period, rows, 20);
    expect(totals.amount).toBe(100);
    expect(totals.expense).toBe(50);
    expect(totals.myEur).toBe(50);
  });

  it("parses European-formatted money strings, rounded to whole numbers", () => {
    const period = makePeriod();
    const rows = [makeRow({ amount: "1.234,56", expense: "" })];
    const totals = computePeriodTotals(period, rows, 10);
    expect(totals.amount).toBe(1235); // 1234.56 rounded
    expect(totals.myEur).toBe(1235);
  });

  it("ignores rows belonging to a different period", () => {
    const period = makePeriod();
    const rows = [
      makeRow({ amount: "100", periodId: "other-period" }),
      makeRow({ amount: "50", periodId: "p1" }),
    ];
    const totals = computePeriodTotals(period, rows, 10);
    expect(totals.amount).toBe(50);
  });

  it("computes 'unpaid' as Amount*rate only when Amount is entered but Expense is not", () => {
    const period = makePeriod();
    const rows = [
      makeRow({ amount: "100", expense: "" }), // unpaid: 100 * 10% = 10
      makeRow({ amount: "100", expense: "50" }), // has expense -> not unpaid
      makeRow({ amount: "", expense: "50" }), // no amount -> not unpaid
    ];
    const totals = computePeriodTotals(period, rows, 10);
    expect(totals.unpaid).toBeCloseTo(10);
  });
});

describe("formatMoney — the app never shows cents", () => {
  it("rounds to the nearest whole number", () => {
    expect(formatMoney(135)).toBe("135");
    expect(formatMoney(67.5)).toBe("68");
    expect(formatMoney(67.4)).toBe("67");
  });

  it("treats NaN/undefined-ish input as 0", () => {
    expect(formatMoney(0)).toBe("0");
    expect(formatMoney(-0)).toBe("0");
  });

  it("never includes a decimal point", () => {
    expect(formatMoney(1234.999)).not.toContain(".");
  });
});
