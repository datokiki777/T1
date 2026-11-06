import { computeStatusCounts } from "./calc";
import type { ClientRow, Group, Period, StatusCounts } from "../types/domain";

/** Typed text shorter than this never counts as a worker search, so a
 * single letter doesn't pop a worker card up for half the groups. */
export const WORKER_SEARCH_MIN_CHARS = 2;

export interface WorkerGroupStats {
  group: Group;
  counts: StatusCounts;
  /** Every client in the group, marked or not. */
  clients: number;
}

export interface WorkerSearchResult {
  groups: WorkerGroupStats[];
  totals: StatusCounts;
  clients: number;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Treats the typed text as a worker name: finds every group — active AND
 * archived — whose name contains it (case-insensitive, partial), and adds
 * up the Done/Fail/Fixed/Wrong counts of those groups' clients.
 *
 * Read-only and purely derived: clients belong to groups, not to
 * individual workers, so when a group's name holds two workers the counts
 * are the group's as a whole. Returns null when the text is too short or
 * no group name matches.
 */
export function findWorkerGroups(
  query: string,
  groups: Group[],
  periods: Period[],
  clientRows: ClientRow[]
): WorkerSearchResult | null {
  const q = normalize(query);
  if (q.length < WORKER_SEARCH_MIN_CHARS) return null;

  const matched = groups.filter((g) => normalize(g.name).includes(q));
  if (matched.length === 0) return null;

  const periodToGroup = new Map<string, string>();
  for (const p of periods) periodToGroup.set(p.id, p.groupId);

  const rowsByGroup = new Map<string, ClientRow[]>(matched.map((g) => [g.id, []]));
  for (const row of clientRows) {
    const groupId = periodToGroup.get(row.periodId);
    if (groupId) rowsByGroup.get(groupId)?.push(row);
  }

  const stats: WorkerGroupStats[] = matched.map((group) => {
    const rows = rowsByGroup.get(group.id) ?? [];
    return { group, counts: computeStatusCounts(rows), clients: rows.length };
  });

  // Active groups first, then archived; alphabetical within each.
  stats.sort(
    (a, b) =>
      Number(a.group.archived) - Number(b.group.archived) ||
      a.group.name.localeCompare(b.group.name)
  );

  const totals: StatusCounts = { done: 0, fail: 0, fixed: 0, wrong: 0, unpaid: 0 };
  let clients = 0;
  for (const s of stats) {
    totals.done += s.counts.done;
    totals.fail += s.counts.fail;
    totals.fixed += s.counts.fixed;
    totals.wrong += s.counts.wrong;
    totals.unpaid += s.counts.unpaid;
    clients += s.clients;
  }
  return { groups: stats, totals, clients };
}
