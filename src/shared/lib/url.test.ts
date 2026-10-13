import { describe, it, expect } from "vitest";
import { looksLikeUrl } from "./url";

describe("looksLikeUrl", () => {
  it("true for http(s) URLs", () => {
    expect(looksLikeUrl("https://maps.google.com/?q=41.7,44.8")).toBe(true);
    expect(looksLikeUrl("http://maps.app.goo.gl/abc123")).toBe(true);
  });

  it("true case-insensitively and with surrounding whitespace", () => {
    expect(looksLikeUrl("HTTPS://maps.google.com")).toBe(true);
    expect(looksLikeUrl("  https://maps.google.com  ")).toBe(true);
  });

  it("false for plain city names and postal codes — existing City values stay untouched", () => {
    expect(looksLikeUrl("Tbilisi")).toBe(false);
    expect(looksLikeUrl("0179")).toBe(false);
    expect(looksLikeUrl("")).toBe(false);
  });

  it("false for a URL-ish string missing the http(s) scheme", () => {
    expect(looksLikeUrl("maps.google.com/?q=41.7,44.8")).toBe(false);
    expect(looksLikeUrl("www.google.com")).toBe(false);
  });
});
