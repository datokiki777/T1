import { db } from "../database";
import type { AppSettings } from "../../shared/types/domain";

/**
 * All direct Dexie access for the `settings` table (a singleton row,
 * id "app"). Mirrors the existing store.ts calls 1:1.
 */
export const settingsRepository = {
  get(): Promise<AppSettings | undefined> {
    return db.settings.get("app");
  },

  put(settings: AppSettings): Promise<string> {
    return db.settings.put(settings);
  },
};
