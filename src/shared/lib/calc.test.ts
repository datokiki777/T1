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

describe("computePeriodTotals — must match the old vanilla app exactly", () => {
  it("uses Net as the My€ base when Net is entered", () => {
    const period = makePeriod();
    const rows = [makeRow({ gross: "1000", net: "800" })];
    const totals = computePeriodTotals(period, rows, 10); // 10%
    expect(totals.gross).toBe(1000);
    expect(totals.net).toBe(800);
    expect(totals.myEur).toBeCloseTo(80); // base = net (800)
  });

  it("falls back to Gross as the My€ base when Net is not entered", () => {
    const period = makePeriod();
    const rows = [makeRow({ gross: "500", net: "" })];
    const totals = computePeriodTotals(period, rows, 10);
    expect(totals.myEur).toBeCloseTo(50); // base = gross (500)
  });

  it("treats an explicit Net of '0' as entered — does NOT fall back to Gross", () => {
    const period = makePeriod();
    const rows = [makeRow({ gross: "500", net: "0" })];
    const totals = computePeriodTotals(period, rows, 10);
    expect(totals.myEur).toBe(0); // base = net (0), gross ignored for My€
    expect(totals.gross).toBe(500); // gross sum still includes it
  });

  it("excludes rows marked 'wrong' from every total", () => {
    const period = makePeriod();
    const rows = [
      makeRow({ gross: "1000", net: "800", status: "wrong" }),
      makeRow({ gross: "100", net: "80", status: "none" }),
    ];
    const totals = computePeriodTotals(period, rows, 10);
    expect(totals.gross).toBe(100);
    expect(totals.net).toBe(80);
    expect(totals.myEur).toBeCloseTo(8);
  });

  it("skips rows with neither Gross nor Net entered", () => {
    const period = makePeriod();
    const rows = [makeRow({ gross: "", net: "" })];
    const totals = computePeriodTotals(period, rows, 10);
    expect(totals.gross).toBe(0);
    expect(totals.net).toBe(0);
    expect(totals.myEur).toBe(0);
  });

  it("sums multiple rows correctly", () => {
    const period = makePeriod();
    const rows = [
      makeRow({ gross: "100", net: "" }), // base 100
      makeRow({ gross: "", net: "50" }), // base 50
      makeRow({ gross: "999", net: "999", status: "wrong" }), // excluded
    ];
    const totals = computePeriodTotals(period, rows, 20);
    expect(totals.gross).toBe(100);
    expect(totals.net).toBe(50);
    expect(totals.myEur).toBeCloseTo((100 + 50) * 0.2);
  });

  it("clamps an out-of-range rate before applying it", () => {
    const period = makePeriod();
    const rows = [makeRow({ gross: "10", net: "" })];
    const totals = computePeriodTotals(period, rows, 500); // invalid, clamps to 100
    expect(totals.myEur).toBe(10); // 100% of 10
  });

  it("parses European-formatted money strings, rounded to whole numbers", () => {
    const period = makePeriod();
    const rows = [makeRow({ gross: "1.234,56", net: "" })];
    const totals = computePeriodTotals(period, rows, 10);
    expect(totals.gross).toBe(1235); // 1234.56 rounded
    expect(totals.myEur).toBeCloseTo(123.5); // 1235 * 10%
  });

  it("ignores rows belonging to a different period", () => {
    const period = makePeriod();
    const rows = [
      makeRow({ gross: "100", periodId: "other-period" }),
      makeRow({ gross: "50", periodId: "p1" }),
    ];
    const totals = computePeriodTotals(period, rows, 10);
    expect(totals.gross).toBe(50);
  });

  it("computes 'unpaid' as Gross*rate only when Gross is entered but Net is not", () => {
    const period = makePeriod();
    const rows = [
      makeRow({ gross: "100", net: "" }), // unpaid: 100 * 10% = 10
      makeRow({ gross: "100", net: "50" }), // has net -> not unpaid
      makeRow({ gross: "", net: "50" }), // no gross -> not unpaid
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
