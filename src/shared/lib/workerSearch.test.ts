import { describe, it, expect } from "vitest";
import { findWorkerGroups, WORKER_SEARCH_MIN_CHARS } from "./workerSearch";
import type { ClientRow, DoneStatus, Group, Period } from "../types/domain";

function group(id: string, name: string, archived = false): Group {
  return {
    id,
    name,
    archived,
    defaultRate: 13,
    defaultSalary: 0,
    currentCarNumber: null,
    createdAt: 1,
    updatedAt: 1,
  } as Group;
}
function period(id: string, groupId: string): Period {
  return { id, groupId, fromDate: null, toDate: null, paidWeeks: null, carNumber: null, createdAt: 1, updatedAt: 1 } as Period;
}
function row(id: string, periodId: string, status: DoneStatus): ClientRow {
  return {
    id, periodId, customer: id, amount: "", expense: "", city: "", status, comment: "",
    visitDate: null, visitDays: null, createdAt: 1, updatedAt: 1,
  } as ClientRow;
}

const groups = [
  group("g1", "Giorgi Elibo"),
  group("g2", "Giorgi Ekima", true), // archived
  group("g3", "Dato Rati"),
];
const periods = [period("p1", "g1"), period("p2", "g1"), period("p3", "g2"), period("p4", "g3")];
const rows = [
  row("a", "p1", "done"), row("b", "p1", "done"), row("c", "p2", "fail"), row("d", "p2", "none"),
  row("e", "p3", "fixed"), row("f", "p3", "wrong"), row("g", "p3", "done"),
  row("h", "p4", "done"), row("u", "p3", "unpaid"),
];

describe("findWorkerGroups", () => {
  it("returns null for text shorter than the minimum, or when no group name matches", () => {
    expect(WORKER_SEARCH_MIN_CHARS).toBe(2);
    expect(findWorkerGroups("g", groups, periods, rows)).toBeNull();
    expect(findWorkerGroups("  ", groups, periods, rows)).toBeNull();
    expect(findWorkerGroups("zzz", groups, periods, rows)).toBeNull();
  });

  it("matches case-insensitively and partially, across active AND archived groups", () => {
    const r = findWorkerGroups("GIORGI", groups, periods, rows)!;
    expect(r.groups.map((s) => s.group.id).sort()).toEqual(["g1", "g2"]);
  });

  it("narrows to a single group when the text is specific to one", () => {
    const r = findWorkerGroups("elibo", groups, periods, rows)!;
    expect(r.groups.map((s) => s.group.id)).toEqual(["g1"]);
    expect(r.groups[0].counts).toEqual({ done: 2, fail: 1, fixed: 0, wrong: 0, unpaid: 0 });
    expect(r.groups[0].clients).toBe(4); // includes the unmarked one
  });

  it("adds the matched groups' counts up into totals, with every client counted", () => {
    const r = findWorkerGroups("giorgi", groups, periods, rows)!;
    expect(r.totals).toEqual({ done: 3, fail: 1, fixed: 1, wrong: 1, unpaid: 1 }); // this app also tracks Unpaid
    expect(r.clients).toBe(8);
  });

  it("only counts clients of the matched groups — other groups' clients stay out", () => {
    const r = findWorkerGroups("giorgi", groups, periods, rows)!;
    // Dato Rati's 'done' (row h) must not leak into the totals above.
    expect(r.totals.done).toBe(3);
  });

  it("lists active groups first, archived after, and ignores extra/odd whitespace in the typed text", () => {
    const r = findWorkerGroups("  giorgi   ", groups, periods, rows)!;
    expect(r.groups.map((s) => s.group.id)).toEqual(["g1", "g2"]);
    expect(findWorkerGroups("giorgi  elibo", groups, periods, rows)!.groups).toHaveLength(1);
  });

  it("a matching group with no clients still shows up, with zeros", () => {
    const r = findWorkerGroups("dato", [...groups, group("g4", "Dato Empty")], [...periods, period("p9", "g4")], rows)!;
    const empty = r.groups.find((s) => s.group.id === "g4")!;
    expect(empty.counts).toEqual({ done: 0, fail: 0, fixed: 0, wrong: 0, unpaid: 0 });
    expect(empty.clients).toBe(0);
  });
});
