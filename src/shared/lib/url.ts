/**
 * Whether a free-text value (e.g. the City field, which someone might
 * paste a Google Maps link into instead of a plain city/postal code)
 * looks like a web URL rather than ordinary text. Deliberately simple —
 * just an http(s):// prefix check, trimmed and case-insensitive — since
 * the only thing this needs to decide is "show a location icon/link
 * instead of plain text", not validate the URL is well-formed.
 */
export function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}
