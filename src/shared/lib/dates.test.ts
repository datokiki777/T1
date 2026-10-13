import { describe, it, expect } from "vitest";
import {
  parseDateOnly,
  daysBetweenInclusive,
  getDurationMonthsDays,
  getOverlapDaysInclusive,
  getMonthStart,
  getMonthEnd,
  getAllMonthKeys,
  calcCoveredWeeks,
  formatMonthKey,
  formatDateForRange,
  formatPeriodDate,
  dateRangesOverlap,
  getPeriodPaidStatus,
  isPeriodCurrentToday,
  weeksBetweenRounded,
} from "./dates";
import type { Period } from "../types/domain";

function makePeriod(fromDate: string | null, toDate: string | null, paidWeeks: number | null = null): Period {
  return {
    id: Math.random().toString(36),
    groupId: "g1",
    fromDate,
    toDate,
    paidWeeks,
    carNumber: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("parseDateOnly", () => {
  it("parses ISO YYYY-MM-DD", () => {
    const d = parseDateOnly("2026-03-15");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(2);
    expect(d?.getDate()).toBe(15);
  });

  it("returns null for invalid dates", () => {
    expect(parseDateOnly("2026-13-40")).toBeNull();
    expect(parseDateOnly("")).toBeNull();
    expect(parseDateOnly(null)).toBeNull();
  });
});

describe("daysBetweenInclusive", () => {
  it("counts both endpoints", () => {
    const a = new Date(2026, 0, 1);
    const b = new Date(2026, 0, 10);
    expect(daysBetweenInclusive(a, b)).toBe(10);
  });

  it("returns 1 for the same day", () => {
    const a = new Date(2026, 0, 1);
    expect(daysBetweenInclusive(a, a)).toBe(1);
  });
});

describe("getDurationMonthsDays", () => {
  it("computes whole months plus remaining days", () => {
    const from = new Date(2026, 0, 1);
    const to = new Date(2026, 2, 15); // Jan 1 -> Mar 15 = 2 months + 14 days
    const { months, days } = getDurationMonthsDays(from, to);
    expect(months).toBe(2);
    expect(days).toBe(14);
  });

  it("returns zero when from > to", () => {
    const from = new Date(2026, 2, 1);
    const to = new Date(2026, 0, 1);
    expect(getDurationMonthsDays(from, to)).toEqual({ months: 0, days: 0 });
  });
});

describe("getOverlapDaysInclusive", () => {
  it("computes overlap between a period and a month", () => {
    const periodFrom = new Date(2026, 0, 25); // Jan 25
    const periodTo = new Date(2026, 1, 10); // Feb 10
    const monthStart = getMonthStart("2026-02");
    const monthEnd = getMonthEnd("2026-02");
    // overlap: Feb 1 -> Feb 10 = 10 days
    expect(getOverlapDaysInclusive(periodFrom, periodTo, monthStart, monthEnd)).toBe(10);
  });

  it("returns 0 when there is no overlap", () => {
    const periodFrom = new Date(2026, 0, 1);
    const periodTo = new Date(2026, 0, 5);
    const monthStart = getMonthStart("2026-03");
    const monthEnd = getMonthEnd("2026-03");
    expect(getOverlapDaysInclusive(periodFrom, periodTo, monthStart, monthEnd)).toBe(0);
  });
});

describe("getAllMonthKeys", () => {
  it("lists every month a period spans", () => {
    const periods = [makePeriod("2026-01-20", "2026-03-05")];
    expect(getAllMonthKeys(periods)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("dedupes and sorts across multiple periods", () => {
    const periods = [makePeriod("2026-03-01", "2026-03-31"), makePeriod("2026-01-01", "2026-02-01")];
    expect(getAllMonthKeys(periods)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("ignores periods without valid dates", () => {
    const periods = [makePeriod(null, null)];
    expect(getAllMonthKeys(periods)).toEqual([]);
  });
});

describe("weeksBetweenRounded", () => {
  it("rounds up partial weeks", () => {
    const from = new Date(2026, 0, 1);
    const to = new Date(2026, 0, 8); // 7 elapsed days -> exactly 1 week
    expect(weeksBetweenRounded(from, to)).toBe(1);
  });

  it("rounds up 8 days to 2 weeks", () => {
    const from = new Date(2026, 0, 1);
    const to = new Date(2026, 0, 9); // 8 elapsed days -> 2 weeks
    expect(weeksBetweenRounded(from, to)).toBe(2);
  });
});

describe("calcCoveredWeeks", () => {
  it("merges overlapping periods before counting weeks", () => {
    const periods = [
      makePeriod("2026-01-01", "2026-01-14"), // 2 weeks
      makePeriod("2026-01-10", "2026-01-20"), // overlaps -> extends range
    ];
    // merged range: Jan 1 -> Jan 20 = 19 elapsed days -> ceil(19/7) = 3 weeks
    expect(calcCoveredWeeks(periods, () => true)).toBe(3);
  });

  it("sums separate non-overlapping ranges independently", () => {
    const periods = [
      makePeriod("2026-01-01", "2026-01-08"), // 1 week
      makePeriod("2026-02-01", "2026-02-08"), // 1 week
    ];
    expect(calcCoveredWeeks(periods, () => true)).toBe(2);
  });

  it("respects the predicate filter", () => {
    const periods = [makePeriod("2026-01-01", "2026-01-08")];
    expect(calcCoveredWeeks(periods, () => false)).toBe(0);
  });
});

describe("dateRangesOverlap", () => {
  it("detects a clear overlap", () => {
    expect(dateRangesOverlap("2026-01-01", "2026-01-31", "2026-01-15", "2026-02-15")).toBe(true);
  });

  it("detects two non-overlapping ranges", () => {
    expect(dateRangesOverlap("2026-01-01", "2026-01-31", "2026-02-01", "2026-02-28")).toBe(false);
  });

  it("does NOT treat touching-edge ranges as overlapping — ending one period and starting the next the same day is normal", () => {
    expect(dateRangesOverlap("2026-01-01", "2026-01-15", "2026-01-15", "2026-01-31")).toBe(false);
  });

  it("still catches a genuine one-day overlap beyond just touching at the boundary", () => {
    expect(dateRangesOverlap("2026-01-01", "2026-01-16", "2026-01-15", "2026-01-31")).toBe(true);
  });

  it("detects one range fully containing the other", () => {
    expect(dateRangesOverlap("2026-01-01", "2026-03-01", "2026-01-15", "2026-01-20")).toBe(true);
  });

  it("returns false if either range is missing a from or to date", () => {
    expect(dateRangesOverlap(null, "2026-01-31", "2026-01-15", "2026-02-15")).toBe(false);
    expect(dateRangesOverlap("2026-01-01", null, "2026-01-15", "2026-02-15")).toBe(false);
    expect(dateRangesOverlap("2026-01-01", "2026-01-31", null, "2026-02-15")).toBe(false);
    expect(dateRangesOverlap("2026-01-01", "2026-01-31", "2026-01-15", null)).toBe(false);
  });
});

describe("isPeriodCurrentToday", () => {
  const today = new Date(2026, 6, 15); // 15 July 2026

  it("true when today falls strictly inside the range", () => {
    expect(isPeriodCurrentToday({ fromDate: "2026-07-01", toDate: "2026-07-31" }, today)).toBe(
      true
    );
  });

  it("true when today is exactly the from or to date (inclusive)", () => {
    expect(isPeriodCurrentToday({ fromDate: "2026-07-15", toDate: "2026-07-20" }, today)).toBe(
      true
    );
    expect(isPeriodCurrentToday({ fromDate: "2026-07-10", toDate: "2026-07-15" }, today)).toBe(
      true
    );
  });

  it("false when today is outside the range, before or after", () => {
    expect(isPeriodCurrentToday({ fromDate: "2026-08-01", toDate: "2026-08-31" }, today)).toBe(
      false
    );
    expect(isPeriodCurrentToday({ fromDate: "2026-06-01", toDate: "2026-06-30" }, today)).toBe(
      false
    );
  });

  it("false when either date is missing", () => {
    expect(isPeriodCurrentToday({ fromDate: null, toDate: "2026-07-31" }, today)).toBe(false);
    expect(isPeriodCurrentToday({ fromDate: "2026-07-01", toDate: null }, today)).toBe(false);
    expect(isPeriodCurrentToday({ fromDate: null, toDate: null }, today)).toBe(false);
  });
});

describe("getPeriodPaidStatus", () => {
  it("a 2-week period (14 days) with 1 paid week is NOT fully paid", () => {
    const status = getPeriodPaidStatus({
      fromDate: "2026-07-22",
      toDate: "2026-08-05",
      paidWeeks: 1,
    });
    expect(status.spanWeeks).toBe(2);
    expect(status.fullyPaid).toBe(false);
  });

  it("a 2-week period with 2 paid weeks IS fully paid", () => {
    const status = getPeriodPaidStatus({
      fromDate: "2026-07-22",
      toDate: "2026-08-05",
      paidWeeks: 2,
    });
    expect(status.fullyPaid).toBe(true);
  });

  it("more paid weeks than the period actually spans still counts as fully paid", () => {
    const status = getPeriodPaidStatus({
      fromDate: "2026-07-22",
      toDate: "2026-08-05",
      paidWeeks: 5,
    });
    expect(status.fullyPaid).toBe(true);
  });

  it("zero/null paidWeeks on a real period is not fully paid", () => {
    expect(
      getPeriodPaidStatus({ fromDate: "2026-01-01", toDate: "2026-01-08", paidWeeks: 0 }).fullyPaid
    ).toBe(false);
    expect(
      getPeriodPaidStatus({ fromDate: "2026-01-01", toDate: "2026-01-08", paidWeeks: null }).fullyPaid
    ).toBe(false);
  });

  it("returns nulls when the period is missing a from/to date", () => {
    expect(getPeriodPaidStatus({ fromDate: null, toDate: "2026-01-08", paidWeeks: 1 })).toEqual({
      spanWeeks: null,
      fullyPaid: null,
    });
    expect(getPeriodPaidStatus({ fromDate: "2026-01-01", toDate: null, paidWeeks: 1 })).toEqual({
      spanWeeks: null,
      fullyPaid: null,
    });
  });
});

describe("formatMonthKey / formatDateForRange", () => {
  it("formats a month key as 'Month YYYY'", () => {
    expect(formatMonthKey("2026-03")).toBe("March 2026");
  });

  it("returns 'No data' for a missing key", () => {
    expect(formatMonthKey(null)).toBe("No data");
  });

  it("formats a date as DD/MM/YYYY", () => {
    expect(formatDateForRange(new Date(2026, 2, 5))).toBe("05/03/2026");
  });
});

describe("formatPeriodDate", () => {
  it("formats a stored ISO date string as DD/MM/YYYY", () => {
    expect(formatPeriodDate("2026-01-31")).toBe("31/01/2026");
    expect(formatPeriodDate("2026-03-05")).toBe("05/03/2026");
  });

  it("returns '—' for null, undefined, or an empty/unparsable string", () => {
    expect(formatPeriodDate(null)).toBe("—");
    expect(formatPeriodDate(undefined)).toBe("—");
    expect(formatPeriodDate("")).toBe("—");
    expect(formatPeriodDate("not-a-date")).toBe("—");
  });
});
