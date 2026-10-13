import { db } from "../database";
import type { Group } from "../../shared/types/domain";
import type { CloudSnapshot } from "../../firebase/cloudSnapshot";

/**
 * All direct Dexie access for the `groups` table, plus the handful of
 * whole-database transactions (cascade-delete, clear-all, apply a cloud
 * snapshot) that legitimately need to touch groups/periods/clientRows/
 * settings/syncMeta together for atomicity. Every method here mirrors an
 * existing store.ts call 1:1 — no new behavior, just relocated.
 */
export const groupRepository = {
  getAll(): Promise<Group[]> {
    return db.groups.toArray();
  },

  add(group: Group): Promise<string> {
    return db.groups.add(group);
  },

  update(id: string, patch: Partial<Group>): Promise<number> {
    return db.groups.update(id, patch);
  },

  /** Deletes a group and everything under it (its periods, and every
   * client row belonging to those periods) as one atomic transaction. */
  deleteCascade(groupId: string, periodIds: string[]): Promise<void> {
    return db.transaction("rw", db.groups, db.periods, db.clientRows, async () => {
      await db.clientRows.where("periodId").anyOf(periodIds).delete();
      await db.periods.where("groupId").equals(groupId).delete();
      await db.groups.delete(groupId);
    });
  },

  /** Wipes every group/period/client row (used by "Delete all data" in
   * Settings). Settings and syncMeta are left untouched — matches the
   * existing clearAllData behavior exactly. */
  clearAllTables(): Promise<void> {
    return db.transaction("rw", db.groups, db.periods, db.clientRows, async () => {
      await Promise.all([db.groups.clear(), db.periods.clear(), db.clientRows.clear()]);
    });
  },

  /** Replaces the entire local dataset (groups/periods/clientRows/
   * settings/syncMeta) with a cloud snapshot, atomically. Used for both
   * first-pull-on-a-new-device and resolved sync conflicts. */
  replaceAllData(snapshot: CloudSnapshot): Promise<void> {
    return db.transaction(
      "rw",
      db.groups,
      db.periods,
      db.clientRows,
      db.settings,
      db.syncMeta,
      async () => {
        await Promise.all([db.groups.clear(), db.periods.clear(), db.clientRows.clear()]);
        if (snapshot.groups.length) await db.groups.bulkAdd(snapshot.groups);
        if (snapshot.periods.length) await db.periods.bulkAdd(snapshot.periods);
        if (snapshot.clientRows.length) await db.clientRows.bulkAdd(snapshot.clientRows);
        await db.settings.put(snapshot.settings);
        await db.syncMeta.put({ id: "app", dataUpdatedAt: snapshot.dataUpdatedAt });
      }
    );
  },
};
