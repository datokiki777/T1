import { db } from "../database";
import type { Period } from "../../shared/types/domain";

/**
 * All direct Dexie access for the `periods` table. Every method mirrors an
 * existing store.ts call 1:1 — no new behavior, just relocated.
 */
export const periodRepository = {
  getAll(): Promise<Period[]> {
    return db.periods.toArray();
  },

  add(period: Period): Promise<string> {
    return db.periods.add(period);
  },

  update(id: string, patch: Partial<Period>): Promise<number> {
    return db.periods.update(id, patch);
  },

  /** Deletes a period and every client row under it, atomically. */
  deleteCascade(periodId: string): Promise<void> {
    return db.transaction("rw", db.periods, db.clientRows, async () => {
      await db.clientRows.where("periodId").equals(periodId).delete();
      await db.periods.delete(periodId);
    });
  },
};
