import { db } from "../database";
import type { SyncMeta } from "../database";

/**
 * All direct Dexie access for the `syncMeta` table (a singleton row,
 * id "app" — last-local-change timestamp + last-backup timestamp used by
 * cloud sync and the Data & Backup panel). Mirrors the existing store.ts
 * calls 1:1.
 */
export const syncMetaRepository = {
  get(): Promise<SyncMeta | undefined> {
    return db.syncMeta.get("app");
  },

  put(meta: SyncMeta): Promise<string> {
    return db.syncMeta.put(meta);
  },
};
