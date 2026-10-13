import { db } from "../database";
import type { ClientRow } from "../../shared/types/domain";

/**
 * All direct Dexie access for the `clientRows` table. Every method
 * mirrors an existing store.ts call 1:1 — no new behavior, just
 * relocated.
 */
export const clientRowRepository = {
  /** Ordered by createdAt (ascending) — client rows have a random UUID
   * as their primary key, not a sequential one, so without an explicit
   * order Dexie's default toArray() would return them sorted by that
   * random id (effectively shuffled) instead of the order they were
   * actually typed in. */
  getAll(): Promise<ClientRow[]> {
    return db.clientRows.orderBy("createdAt").toArray();
  },

  add(row: ClientRow): Promise<string> {
    return db.clientRows.add(row);
  },

  update(id: string, patch: Partial<ClientRow>): Promise<number> {
    return db.clientRows.update(id, patch);
  },

  delete(id: string): Promise<void> {
    return db.clientRows.delete(id);
  },

  /** Used by init()'s one-time legacy-cents rounding fix. */
  bulkPut(rows: ClientRow[]): Promise<string> {
    return db.clientRows.bulkPut(rows);
  },
};
