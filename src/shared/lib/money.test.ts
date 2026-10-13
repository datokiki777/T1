import { describe, it, expect } from "vitest";
import { parseMoney, clampRate, formatCurrency, roundMoneyString } from "./money";

describe("parseMoney", () => {
  it("parses plain integers", () => {
    expect(parseMoney("100")).toBe(100);
  });

  it("parses US format (comma thousands, dot decimal)", () => {
    expect(parseMoney("1,234.56")).toBeCloseTo(1234.56);
  });

  it("parses European format (dot thousands, comma decimal)", () => {
    expect(parseMoney("1.234,56")).toBeCloseTo(1234.56);
  });

  it("parses lone comma as decimal when 1-2 fraction digits", () => {
    expect(parseMoney("123,45")).toBeCloseTo(123.45);
  });

  it("parses lone comma as thousands separator otherwise", () => {
    expect(parseMoney("1,234")).toBe(1234);
  });

  it("parses lone dot as thousands separator for exactly 3 fraction digits", () => {
    expect(parseMoney("1.234")).toBe(1234);
  });

  it("parses lone dot as decimal otherwise", () => {
    expect(parseMoney("12.5")).toBeCloseTo(12.5);
  });

  it("strips repeated dots (1.234.567)", () => {
    expect(parseMoney("1.234.567")).toBe(1234567);
  });

  it("returns NaN for empty/whitespace/invalid input", () => {
    expect(parseMoney("")).toBeNaN();
    expect(parseMoney("   ")).toBeNaN();
    expect(parseMoney(null)).toBeNaN();
    expect(parseMoney(undefined)).toBeNaN();
    expect(parseMoney("abc")).toBeNaN();
  });
});

describe("clampRate", () => {
  it("clamps below 0 to 0", () => {
    expect(clampRate(-5)).toBe(0);
  });
  it("clamps above 100 to 100", () => {
    expect(clampRate(150)).toBe(100);
  });
  it("passes through valid values", () => {
    expect(clampRate(13.5)).toBe(13.5);
  });
  it("treats NaN as 0", () => {
    expect(clampRate(Number.NaN)).toBe(0);
  });
});

describe("formatCurrency", () => {
  it("prefixes the already-formatted amount with the given symbol", () => {
    expect(formatCurrency("135.00", "€")).toBe("€135.00");
    expect(formatCurrency("135.00", "$")).toBe("$135.00");
  });

  it("never touches the numeric formatting itself", () => {
    expect(formatCurrency("0.00", "₾")).toBe("₾0.00");
  });
});

describe("roundMoneyString — the app doesn't support cents anywhere", () => {
  it("rounds a plain decimal string to a whole-number string", () => {
    expect(roundMoneyString("1234.56")).toBe("1235");
    expect(roundMoneyString("250.25")).toBe("250");
    expect(roundMoneyString("67.5")).toBe("68");
  });

  it("leaves an already-whole-number string unchanged", () => {
    expect(roundMoneyString("500")).toBe("500");
    expect(roundMoneyString("0")).toBe("0");
  });

  it("rounds European-formatted decimal strings too", () => {
    expect(roundMoneyString("1.234,56")).toBe("1235");
  });

  it("leaves '' as '' — not entered is still not entered", () => {
    expect(roundMoneyString("")).toBe("");
    expect(roundMoneyString("   ")).toBe("");
  });

  it("leaves malformed input untouched rather than discarding it", () => {
    expect(roundMoneyString("abc")).toBe("abc");
  });
});
