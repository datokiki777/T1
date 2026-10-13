import { describe, it, expect } from "vitest";
import { getPeriodsForGroup, getRowsForPeriod, getGroupById, getPeriodById } from "./entityLookup";
import type { Group, Period, ClientRow } from "../types/domain";

const groups: Group[] = [
  { id: "g1", name: "A", archived: false, defaultRate: 10, defaultSalary: 0, currentCarNumber: null, createdAt: 0, updatedAt: 0 },
  { id: "g2", name: "B", archived: true, defaultRate: 10, defaultSalary: 0, currentCarNumber: null, createdAt: 0, updatedAt: 0 },
];

const periods: Period[] = [
  { id: "p1", groupId: "g1", fromDate: null, toDate: null, paidWeeks: null, carNumber: null, createdAt: 0, updatedAt: 0 },
  { id: "p2", groupId: "g1", fromDate: null, toDate: null, paidWeeks: null, carNumber: null, createdAt: 0, updatedAt: 0 },
  { id: "p3", groupId: "g2", fromDate: null, toDate: null, paidWeeks: null, carNumber: null, createdAt: 0, updatedAt: 0 },
];

const rows: ClientRow[] = [
  { id: "r1", periodId: "p1", customer: "X", gross: "", net: "", city: "", status: "none", comment: "", visitDate: null, visitDays: null, createdAt: 0, updatedAt: 0 },
  { id: "r2", periodId: "p1", customer: "Y", gross: "", net: "", city: "", status: "none", comment: "", visitDate: null, visitDays: null, createdAt: 0, updatedAt: 0 },
  { id: "r3", periodId: "p2", customer: "Z", gross: "", net: "", city: "", status: "none", comment: "", visitDate: null, visitDays: null, createdAt: 0, updatedAt: 0 },
];

describe("entityLookup", () => {
  it("getPeriodsForGroup returns only periods belonging to that group", () => {
    expect(getPeriodsForGroup(periods, "g1").map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(getPeriodsForGroup(periods, "g2").map((p) => p.id)).toEqual(["p3"]);
    expect(getPeriodsForGroup(periods, "nonexistent")).toEqual([]);
  });

  it("getRowsForPeriod returns only rows belonging to that period", () => {
    expect(getRowsForPeriod(rows, "p1").map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(getRowsForPeriod(rows, "p2").map((r) => r.id)).toEqual(["r3"]);
    expect(getRowsForPeriod(rows, "p3")).toEqual([]);
  });

  it("getRowsForPeriod always sorts by createdAt, regardless of the input array's own order — this is what keeps Review mode in sync with a manual reorder in Edit mode", () => {
    const outOfOrder: ClientRow[] = [
      { id: "late", periodId: "p1", customer: "Late", gross: "", net: "", city: "", status: "none", comment: "", visitDate: null, visitDays: null, createdAt: 300, updatedAt: 0 },
      { id: "early", periodId: "p1", customer: "Early", gross: "", net: "", city: "", status: "none", comment: "", visitDate: null, visitDays: null, createdAt: 100, updatedAt: 0 },
      { id: "mid", periodId: "p1", customer: "Mid", gross: "", net: "", city: "", status: "none", comment: "", visitDate: null, visitDays: null, createdAt: 200, updatedAt: 0 },
    ];
    expect(getRowsForPeriod(outOfOrder, "p1").map((r) => r.id)).toEqual(["early", "mid", "late"]);
  });

  it("getGroupById finds the matching group, or undefined for a miss/null/undefined id", () => {
    expect(getGroupById(groups, "g2")?.name).toBe("B");
    expect(getGroupById(groups, "nonexistent")).toBeUndefined();
    expect(getGroupById(groups, null)).toBeUndefined();
    expect(getGroupById(groups, undefined)).toBeUndefined();
  });

  it("getPeriodById finds the matching period, or undefined for a miss/null/undefined id", () => {
    expect(getPeriodById(periods, "p3")?.groupId).toBe("g2");
    expect(getPeriodById(periods, "nonexistent")).toBeUndefined();
    expect(getPeriodById(periods, null)).toBeUndefined();
    expect(getPeriodById(periods, undefined)).toBeUndefined();
  });
});
