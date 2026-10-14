import { describe, it, expect } from "vitest";
import {
  assignSalaryMonthIndex,
  computeGroupSalaryMonths,
  keyFromMonthIndex,
  salaryMonthIndex,
} from "./salaryMonths";
import type { ClientRow, Group, Period } from "../types/domain";

const group: Group = {
  id: "g1",
  name: "G",
  archived: false,
  defaultSalary: 1000,
  currentCarNumber: null,
  createdAt: 0,
  updatedAt: 0,
};
const period: Period = {
  id: "p1",
  groupId: "g1",
  fromDate: null,
  toDate: null,
  paidWeeks: null,
  carNumber: null,
  createdAt: 0,
  updatedAt: 0,
};
function row(overrides: Partial<ClientRow>): ClientRow {
  return {
    id: Math.random().toString(36),
    periodId: "p1",
    customer: "C",
    amount: "100",
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
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe("salaryMonthIndex — months run anchor-day to anchor-day", () => {
  it("anchor 7: the 6th still belongs to the previous month, the 7th starts a new one", () => {
    expect(keyFromMonthIndex(salaryMonthIndex(d(2026, 10, 6), 7))).toBe("2026-09");
    expect(keyFromMonthIndex(salaryMonthIndex(d(2026, 10, 7), 7))).toBe("2026-10");
    expect(keyFromMonthIndex(salaryMonthIndex(d(2026, 11, 6), 7))).toBe("2026-10");
  });

  it("an anchor of 31 is clamped to the last day of shorter months", () => {
    // Feb 2026 has 28 days: the Feb salary month starts on the 28th.
    expect(keyFromMonthIndex(salaryMonthIndex(d(2026, 2, 28), 31))).toBe("2026-02");
    expect(keyFromMonthIndex(salaryMonthIndex(d(2026, 2, 27), 31))).toBe("2026-01");
  });

  it("works across a year boundary", () => {
    expect(keyFromMonthIndex(salaryMonthIndex(d(2027, 1, 3), 7))).toBe("2026-12");
  });
});

describe("assignSalaryMonthIndex — the month with the MORE days wins", () => {
  it("a 5-day client starting on the 4th (anchor 7) spans 3 days before + 2 after -> earlier month", () => {
    // Oct 4,5,6 (month Sep) + Oct 7,8 (month Oct) -> Sep has 3
    expect(keyFromMonthIndex(assignSalaryMonthIndex(d(2026, 10, 4), 5, 7))).toBe("2026-09");
  });

  it("a 5-day client starting on the 5th: 2 days before, 3 after -> later month", () => {
    expect(keyFromMonthIndex(assignSalaryMonthIndex(d(2026, 10, 5), 5, 7))).toBe("2026-10");
  });

  it("a tie goes to the earlier month", () => {
    // 2 days: Oct 6 (Sep) + Oct 7 (Oct)
    expect(keyFromMonthIndex(assignSalaryMonthIndex(d(2026, 10, 6), 2, 7))).toBe("2026-09");
  });
});

describe("computeGroupSalaryMonths", () => {
  it("anchors on the earliest client's day-of-month", () => {
    const r = computeGroupSalaryMonths(
      group,
      [period],
      [row({ visitDate: "2026-03-15" }), row({ visitDate: "2026-03-07" })]
    );
    expect(r.anchorDay).toBe(7);
  });

  it("'wrong' clients and clients with no money are ignored (even for the anchor)", () => {
    const r = computeGroupSalaryMonths(
      group,
      [period],
      [
        row({ visitDate: "2026-03-01", status: "wrong" }),
        row({ visitDate: "2026-03-02", amount: "", expense: "" }),
        row({ visitDate: "2026-03-20" }),
      ]
    );
    expect(r.anchorDay).toBe(20);
  });

  it("falls back to the period start date when the client has no visit date", () => {
    const p = { ...period, fromDate: "2026-04-09" };
    const r = computeGroupSalaryMonths(group, [p], [row({})]);
    expect(r.anchorDay).toBe(9);
    expect(r.months).toHaveLength(1);
    expect(r.months[0].key).toBe("2026-04");
  });

  it("no clients -> no salary months, no salary", () => {
    const r = computeGroupSalaryMonths(group, [period], []);
    expect(r.months).toEqual([]);
    expect(r.anchorDay).toBeNull();
  });

  it("anchor comes from clients' own visit dates, not from an earlier period start", () => {
    const p = { ...period, fromDate: "2026-04-01" };
    const r = computeGroupSalaryMonths(group, [p], [row({ visitDate: "2026-04-07" }), row({})]);
    expect(r.anchorDay).toBe(7);
  });

  it("a client without a date joins the month of its nearest dated neighbour in the same period", () => {
    const p = { ...period, fromDate: "2026-01-01" };
    const r = computeGroupSalaryMonths(
      group,
      [p],
      [
        row({ id: "a", createdAt: 1, visitDate: "2026-01-07", amount: "100" }),
        row({ id: "b", createdAt: 2, amount: "200" }), // no date -> neighbour a (Jan)
        row({ id: "c", createdAt: 3, visitDate: "2026-03-09", amount: "400" }),
      ]
    );
    const jan = r.months.find((m) => m.key === "2026-01")!;
    expect(jan.amount).toBe(300); // a + b
    expect(r.months.find((m) => m.key === "2026-03")!.amount).toBe(400);
    expect(r.undatedRows).toBe(0);
  });

  it("with no dated neighbour, the client is placed by its period's date", () => {
    const p1 = { ...period, id: "p1", fromDate: "2026-02-05" };
    const p2 = { ...period, id: "p2", fromDate: "2026-04-05" };
    const r = computeGroupSalaryMonths(
      group,
      [p1, p2],
      [
        row({ periodId: "p1", visitDate: "2026-02-05", amount: "100" }),
        row({ periodId: "p2", amount: "700" }), // nothing dated in p2 -> p2's own date (Apr 5, month Apr)
      ]
    );
    expect(r.anchorDay).toBe(5);
    expect(r.months.find((m) => m.key === "2026-04")!.amount).toBe(700);
  });

  it("with no date anywhere the client is reported as undated", () => {
    const r = computeGroupSalaryMonths(group, [period], [row({})]);
    expect(r.undatedRows).toBe(1);
    expect(r.months).toEqual([]);
  });
});
