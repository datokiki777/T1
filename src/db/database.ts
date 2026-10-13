import Dexie, { type Table } from "dexie";
import type {
  Group,
  Period,
  ClientRow,
  AppSettings,
  DeviceSecurity,
} from "../shared/types/domain";

export interface SyncMeta {
  id: "app";
  /** ISO timestamp of the last local mutation — the "who's newer" value
   * used by cloud-sync conflict resolution. */
  dataUpdatedAt: string;
  /** ISO timestamp of the last successful backup of any kind. */
  lastBackupAt?: string;
}

// Single source of truth for local persistence.
// Kept intentionally thin: Dexie tables map 1:1 to domain types.
// Any migration in the future = bump version() and add an upgrade().
class ClientTotalsDB extends Dexie {
  groups!: Table<Group, string>;
  periods!: Table<Period, string>;
  clientRows!: Table<ClientRow, string>;
  settings!: Table<AppSettings, string>;
  deviceSecurity!: Table<DeviceSecurity, string>;
  syncMeta!: Table<SyncMeta, string>;

  constructor() {
    super("t1-db");

    this.version(1).stores({
      groups: "id, archived, createdAt",
      periods: "id, groupId, archived, fromDate, createdAt",
      clientRows: "id, periodId, status, createdAt",
      settings: "id",
    });

    // v2: added deviceSecurity (per-device PIN-verified flag) and syncMeta
    // (last-local-change timestamp for cloud sync conflict resolution).
    // Both are new tables — no migration needed for the existing ones.
    this.version(2).stores({
      groups: "id, archived, createdAt",
      periods: "id, groupId, archived, fromDate, createdAt",
      clientRows: "id, periodId, status, createdAt",
      settings: "id",
      deviceSecurity: "id",
      syncMeta: "id",
    });
  }
}

export const db = new ClientTotalsDB();
