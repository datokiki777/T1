import type { AppSettings, ClientRow, Group, Period } from "../shared/types/domain";

/** Everything that gets synced to the cloud — same relational shape as the
 * local IndexedDB tables, plus a top-level timestamp used for conflict
 * resolution. Deliberately excludes DeviceSecurity (PIN-verified flag),
 * which must always stay per-device. */
export interface CloudSnapshot {
  dataUpdatedAt: string; // ISO — the "who's newer" timestamp
  groups: Group[];
  periods: Period[];
  clientRows: ClientRow[];
  settings: AppSettings;
}

export function buildCloudSnapshot(
  groups: Group[],
  periods: Period[],
  clientRows: ClientRow[],
  settings: AppSettings,
  dataUpdatedAt: string
): CloudSnapshot {
  return {
    dataUpdatedAt,
    groups,
    periods,
    clientRows,
    settings,
  };
}

/** Structural validation before a cloud snapshot is ever applied locally —
 * same spirit as the JSON-import validator, since a cloud document is just
 * as untrusted as a file someone picked. */
export function isValidCloudSnapshot(value: unknown): value is CloudSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.dataUpdatedAt === "string" &&
    Array.isArray(v.groups) &&
    Array.isArray(v.periods) &&
    Array.isArray(v.clientRows) &&
    typeof v.settings === "object" &&
    v.settings !== null
  );
}
