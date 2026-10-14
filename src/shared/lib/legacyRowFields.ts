import type { ClientRow } from "../types/domain";

/**
 * Rows saved before the gross/net -> amount/expense rename still carry the
 * old keys (IndexedDB, old backup files, old cloud snapshots). This maps
 * them to the new keys and drops the old ones. Rows already in the new
 * format are returned unchanged (same reference).
 */
export function upgradeLegacyRowFields<T>(row: T): T {
  if (typeof row !== "object" || row === null) return row;
  const r = row as Record<string, unknown>;
  if (!("gross" in r) && !("net" in r)) return row;
  const { gross, net, ...rest } = r;
  const out: Record<string, unknown> = { ...rest };
  if (out.amount === undefined) out.amount = typeof gross === "string" ? gross : gross == null ? "" : String(gross);
  if (out.expense === undefined) out.expense = typeof net === "string" ? net : net == null ? "" : String(net);
  return out as T;
}

export type { ClientRow };
