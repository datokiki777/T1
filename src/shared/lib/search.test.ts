import { describe, it, expect } from "vitest";
import { buildSearchIndex, searchIndex, highlightParts } from "./search";
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
    customer: "Acme Corp",
    gross: "100",
    net: "",
    city: "Tbilisi",
    status: "none",
    comment: "",
    visitDate: null,
    visitDays: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("buildSearchIndex", () => {
  it("includes rows that have a customer or city", () => {
    const groups = [makeGroup()];
    const periods = [makePeriod()];
    const rows = [makeRow()];
    const index = buildSearchIndex(groups, periods, rows);
    expect(index).toHaveLength(1);
    expect(index[0].customer).toBe("Acme Corp");
    expect(index[0].city).toBe("Tbilisi");
    expect(index[0].groupName).toBe("Group 1");
  });

  it("includes a row that only has a comment (extended vs the old app)", () => {
    const groups = [makeGroup()];
    const periods = [makePeriod()];
    const rows = [makeRow({ customer: "", city: "", comment: "call back next week" })];
    const index = buildSearchIndex(groups, periods, rows);
    expect(index).toHaveLength(1);
  });

  it("excludes rows with no customer, city, or comment", () => {
    const groups = [makeGroup()];
    const periods = [makePeriod()];
    const rows = [makeRow({ customer: "", city: "", comment: "" })];
    expect(buildSearchIndex(groups, periods, rows)).toHaveLength(0);
  });

  it("skips rows whose period or group no longer exists", () => {
    const rows = [makeRow({ periodId: "missing" })];
    expect(buildSearchIndex([makeGroup()], [makePeriod()], rows)).toHaveLength(0);
  });

  it("formats gross/net for display with no cents", () => {
    const index = buildSearchIndex([makeGroup()], [makePeriod()], [makeRow({ gross: "1500" })]);
    expect(index[0].gross).toBe("1500");
    expect(index[0].net).toBe("0");
  });
});

describe("searchIndex", () => {
  const index = buildSearchIndex(
    [makeGroup()],
    [makePeriod()],
    [
      makeRow({ id: "r1", customer: "Acme Corp", city: "Tbilisi", comment: "" }),
      makeRow({ id: "r2", customer: "Beta LLC", city: "Batumi", comment: "wants a discount" }),
      makeRow({ id: "r3", customer: "Gamma Inc", city: "Kutaisi", comment: "" }),
    ]
  );

  it("matches by client name (partial, case-insensitive)", () => {
    const results = searchIndex(index, "acme");
    expect(results.map((r) => r.rowId)).toEqual(["r1"]);
  });

  it("matches by city/address", () => {
    const results = searchIndex(index, "batu");
    expect(results.map((r) => r.rowId)).toEqual(["r2"]);
  });

  it("matches by comment/notes", () => {
    const results = searchIndex(index, "discount");
    expect(results.map((r) => r.rowId)).toEqual(["r2"]);
  });

  it("returns an empty array for a blank query", () => {
    expect(searchIndex(index, "   ")).toEqual([]);
  });

  it("returns no more than 40 results", () => {
    const bigIndex = Array.from({ length: 100 }, (_, i) => ({
      ...index[0],
      rowId: `r${i}`,
      customer: "Acme " + i,
    }));
    expect(searchIndex(bigIndex, "acme")).toHaveLength(40);
  });
});

describe("highlightParts", () => {
  it("splits the matched substring out for highlighting", () => {
    const parts = highlightParts("Acme Corp", "cme");
    expect(parts).toEqual([
      { text: "A", match: false },
      { text: "cme", match: true },
      { text: " Corp", match: false },
    ]);
  });

  it("is case-insensitive", () => {
    const parts = highlightParts("Acme Corp", "ACME");
    expect(parts.some((p) => p.match && p.text === "Acme")).toBe(true);
  });

  it("returns the whole text unmatched when the query is empty", () => {
    expect(highlightParts("Acme Corp", "")).toEqual([{ text: "Acme Corp", match: false }]);
  });

  it("escapes regex special characters in the query", () => {
    expect(() => highlightParts("a.b (c)", "(c)")).not.toThrow();
    const parts = highlightParts("a.b (c)", "(c)");
    expect(parts.some((p) => p.match && p.text === "(c)")).toBe(true);
  });
});
