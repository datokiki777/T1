import { describe, it, expect } from "vitest";
import { weeksBetweenRounded, parseDateOnly, getDurationMonthsDays, daysBetweenInclusive } from "./dates";

describe("DST-safety regression tests (crossing a European fall-back transition in late October)", () => {
  it("weeksBetweenRounded gives exactly 2 weeks for a 14-day span crossing a DST transition", () => {
    const from = parseDateOnly("2026-10-14")!;
    const to = parseDateOnly("2026-10-28")!;
    expect(weeksBetweenRounded(from, to)).toBe(2);
  });

  it("daysBetweenInclusive gives exactly 15 days (14/10 to 28/10 inclusive) across the same range", () => {
    const from = parseDateOnly("2026-10-14")!;
    const to = parseDateOnly("2026-10-28")!;
    expect(daysBetweenInclusive(from, to)).toBe(15);
  });

  it("getDurationMonthsDays gives exactly 0 months 14 days across the same range", () => {
    const from = parseDateOnly("2026-10-14")!;
    const to = parseDateOnly("2026-10-28")!;
    expect(getDurationMonthsDays(from, to)).toEqual({ months: 0, days: 14 });
  });
});
