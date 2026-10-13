import { describe, it, expect } from "vitest";
import { buildBackupPayload, validateBackupPayload } from "./backup";
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
    customer: "Acme",
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

describe("buildBackupPayload / validateBackupPayload round-trip", () => {
  it("a payload built by buildBackupPayload always validates successfully", () => {
    const payload = buildBackupPayload([makeGroup()], [makePeriod()], [makeRow()]);
    const result = validateBackupPayload(payload);
    expect(result.ok).toBe(true);
  });

  it("round-trips through JSON.stringify/parse without losing validity", () => {
    const payload = buildBackupPayload([makeGroup()], [makePeriod()], [makeRow()]);
    const roundTripped = JSON.parse(JSON.stringify(payload));
    const result = validateBackupPayload(roundTripped);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.groups).toHaveLength(1);
      expect(result.data.clientRows[0].gross).toBe("100");
    }
  });
});

describe("validateBackupPayload — rejects invalid input", () => {
  it("rejects non-object input", () => {
    expect(validateBackupPayload(null).ok).toBe(false);
    expect(validateBackupPayload("a string").ok).toBe(false);
    expect(validateBackupPayload(42).ok).toBe(false);
    expect(validateBackupPayload([1, 2, 3]).ok).toBe(false);
  });

  it("rejects an object missing the groups/periods/clientRows arrays", () => {
    const result = validateBackupPayload({ foo: "bar" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/groups.*periods.*clientRows/i);
  });

  it("rejects a group with the wrong field types", () => {
    const result = validateBackupPayload({
      groups: [{ id: "g1", name: "G", archived: "yes", defaultRate: 10, defaultSalary: 0 }],
      periods: [],
      clientRows: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("archived");
  });

  it("rejects a period referencing a group that doesn't exist in the file", () => {
    const result = validateBackupPayload({
      groups: [makeGroup({ id: "g1" })],
      periods: [makePeriod({ groupId: "does-not-exist" })],
      clientRows: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/does not exist/);
  });

  it("rejects a row referencing a period that doesn't exist in the file", () => {
    const result = validateBackupPayload({
      groups: [makeGroup()],
      periods: [makePeriod()],
      clientRows: [makeRow({ periodId: "missing-period" })],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/does not exist/);
  });

  it("rejects a row with an invalid status value", () => {
    const result = validateBackupPayload({
      groups: [makeGroup()],
      periods: [makePeriod()],
      clientRows: [{ ...makeRow(), status: "maybe" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("status");
  });

  it("accepts an empty backup (no groups at all)", () => {
    const result = validateBackupPayload({ groups: [], periods: [], clientRows: [] });
    expect(result.ok).toBe(true);
  });
});
