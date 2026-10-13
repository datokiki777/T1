import type { ClientRow, DoneStatus, Group, Period } from "../types/domain";
import { parseMoney } from "./money";
import { formatMoney } from "./calc";
import { formatPeriodDate } from "./dates";
import { getPeriodById } from "./entityLookup";

export interface SearchIndexItem {
  groupId: string;
  periodId: string;
  rowId: string;
  groupName: string;
  groupArchived: boolean;
  from: string; // formatted for display, "—" if unset
  to: string;
  customer: string;
  city: string;
  comment: string;
  gross: string; // formatted for display
  net: string;
  status: DoneStatus;
}

/**
 * Builds the flat searchable index across every group/period/row.
 * Matches buildReviewSearchIndex() (js/14-search.js), extended to also carry
 * the comment so notes can be searched too.
 */
export function buildSearchIndex(
  groups: Group[],
  periods: Period[],
  rows: ClientRow[]
): SearchIndexItem[] {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const items: SearchIndexItem[] = [];

  for (const row of rows) {
    const customer = row.customer.trim();
    const city = row.city.trim();
    const comment = row.comment.trim();
    if (!customer && !city && !comment) continue;

    const period = getPeriodById(periods, row.periodId);
    if (!period) continue;
    const group = groupById.get(period.groupId);
    if (!group) continue;

    items.push({
      groupId: group.id,
      periodId: period.id,
      rowId: row.id,
      groupName: group.name,
      groupArchived: group.archived,
      from: formatPeriodDate(period.fromDate),
      to: formatPeriodDate(period.toDate),
      customer,
      city,
      comment,
      gross: formatMoney(parseMoney(row.gross) || 0),
      net: formatMoney(parseMoney(row.net) || 0),
      status: row.status,
    });
  }

  return items;
}

/**
 * Filters the index by a query against customer name, city/address, and
 * comment/notes — partial, case-insensitive substring match. Results are
 * capped at 40, matching the old app's renderSearchResults limit.
 */
export function searchIndex(index: SearchIndexItem[], query: string): SearchIndexItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const matches = index.filter(
    (item) =>
      item.customer.toLowerCase().includes(q) ||
      item.city.toLowerCase().includes(q) ||
      item.comment.toLowerCase().includes(q)
  );

  return matches.slice(0, 40);
}

export interface HighlightPart {
  text: string;
  match: boolean;
}

/**
 * Splits `text` into parts so the UI can safely render the matched
 * substring highlighted (React-safe equivalent of the old app's
 * highlightMatch(), without dangerouslySetInnerHTML).
 */
export function highlightParts(text: string, query: string): HighlightPart[] {
  if (!query.trim()) return [{ text, match: false }];

  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "ig");
  const pieces = text.split(regex);

  if (pieces.length === 1) return [{ text, match: false }];

  return pieces
    .filter((p) => p !== "")
    .map((piece) => ({
      text: piece,
      match: piece.toLowerCase() === query.trim().toLowerCase(),
    }));
}
