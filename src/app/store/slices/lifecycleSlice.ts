import type { StateCreator } from "zustand";
import { groupRepository } from "../../../db/repositories/groupRepository";
import { periodRepository } from "../../../db/repositories/periodRepository";
import { clientRowRepository } from "../../../db/repositories/clientRowRepository";
import { settingsRepository } from "../../../db/repositories/settingsRepository";
import { syncMetaRepository } from "../../../db/repositories/syncMetaRepository";
import { now } from "../../../shared/lib/id";
import { roundMoneyString } from "../../../shared/lib/money";
import type { ClientRow } from "../../../shared/types/domain";
import type { CloudSnapshot } from "../../../firebase/cloudSnapshot";
import { createPersistHelper } from "../persistHelper";
import { DEFAULT_SETTINGS } from "./settingsSlice";
import { getRememberedGroupId } from "./uiSlice";
import type { AppState } from "../types";

export interface LifecycleSlice {
  loaded: boolean;
  initError: string | null;
  /** ISO timestamp of the last local mutation — used by cloud sync to
   * decide which side (local vs cloud) is newer. */
  dataUpdatedAt: string | null;

  init: () => Promise<void>;
  clearAllData: () => Promise<void>;
  /** Replaces ALL local data with a pulled cloud snapshot (used for both
   * "new device" pulls and resolved conflicts) — preserves every group
   * (including archived), period, row, and id exactly as they came from
   * the cloud. */
  applyCloudSnapshot: (snapshot: CloudSnapshot) => Promise<void>;
}

export const createLifecycleSlice: StateCreator<AppState, [], [], LifecycleSlice> = (set) => {
  const persist = createPersistHelper(set);

  return {
    loaded: false,
    initError: null,
    dataUpdatedAt: null,

    init: async () => {
      try {
        const [rawGroups, rawPeriods, rawClientRows, storedSettings, syncMeta] = await Promise.all([
          groupRepository.getAll(),
          periodRepository.getAll(),
          clientRowRepository.getAll(),
          settingsRepository.get(),
          syncMetaRepository.get(),
        ]);

        // Groups/periods saved before currentCarNumber/carNumber existed
        // won't have those keys at all — default them in memory so every
        // record is consistently typed. Not written back to IndexedDB:
        // there's no actual value to correct, just a missing-key vs.
        // explicit-null distinction that only matters for the in-memory
        // shape (same treatment as the cents-rounding fix below, minus
        // the DB write since nothing here is actually wrong).
        const groups = rawGroups.map((g) =>
          g.currentCarNumber === undefined ? { ...g, currentCarNumber: null } : g
        );
        const periods = rawPeriods.map((p) =>
          p.carNumber === undefined ? { ...p, carNumber: null } : p
        );

        // The app no longer supports cents anywhere. Round any legacy
        // gross/net values that still have decimals (e.g. from an older
        // export or a pre-rounding version of this app) and rewrite them,
        // so stored data matches what's displayed everywhere from now on.
        const rowsToFix: ClientRow[] = [];
        const clientRows = rawClientRows.map((row) => {
          // Rows stored before visitDate/visitDays existed won't have
          // these keys at all — default them in memory so every row is
          // consistently typed. Not written back to IndexedDB: there's
          // no actual stored value to correct, just a missing-key vs.
          // explicit-null distinction.
          const normalized: ClientRow = {
            ...row,
            visitDate: row.visitDate ?? null,
            visitDays: row.visitDays ?? null,
          };
          const gross = roundMoneyString(normalized.gross);
          const net = roundMoneyString(normalized.net);
          if (gross === normalized.gross && net === normalized.net) return normalized;
          const fixed = { ...normalized, gross, net, updatedAt: now() };
          rowsToFix.push(fixed);
          return fixed;
        });
        if (rowsToFix.length) {
          persist("rounding legacy cents", () => clientRowRepository.bulkPut(rowsToFix), false);
        }

        const firstActive = groups.find((g) => !g.archived)?.id ?? null;
        const firstArchived = groups.find((g) => g.archived)?.id ?? null;

        const rememberedActive = getRememberedGroupId(false);
        const rememberedArchive = getRememberedGroupId(true);

        const activeGroupId =
          groups.some((g) => !g.archived && g.id === rememberedActive)
            ? rememberedActive
            : firstActive;

        const archivedGroupId =
          groups.some((g) => g.archived && g.id === rememberedArchive)
            ? rememberedArchive
            : firstArchived;
        set({
          groups,
          periods,
          clientRows,
          activeGroupId,
          lastActiveGroupIdActive: activeGroupId,
          lastActiveGroupIdArchive: archivedGroupId,
          settings: storedSettings ? { ...DEFAULT_SETTINGS, ...storedSettings } : DEFAULT_SETTINGS,
          dataUpdatedAt: syncMeta?.dataUpdatedAt ?? null,
          lastBackupAt: syncMeta?.lastBackupAt ?? null,
          initError: null,
        });
      } catch (error) {
        console.error("Failed to initialize local database:", error);
        set({
          initError:
            error instanceof Error
              ? error.message
              : "Unknown error while loading local data.",
        });
      } finally {
        set({ loaded: true });
      }
    },

    clearAllData: async () => {
      await groupRepository.clearAllTables();
      set({
        groups: [],
        periods: [],
        clientRows: [],
        activeGroupId: null,
        highlightedRowId: null,
      });
      persist("clear all data", () => Promise.resolve());
    },

    applyCloudSnapshot: async (snapshot) => {
      await groupRepository.replaceAllData(snapshot);

      const firstActive = snapshot.groups.find((g) => !g.archived)?.id ?? null;
      const firstArchived = snapshot.groups.find((g) => g.archived)?.id ?? null;
      set({
        groups: snapshot.groups,
        periods: snapshot.periods,
        clientRows: snapshot.clientRows,
        settings: snapshot.settings,
        dataUpdatedAt: snapshot.dataUpdatedAt,
        activeGroupId: firstActive,
        lastActiveGroupIdActive: firstActive,
        lastActiveGroupIdArchive: firstArchived,
      });
    },
  };
};
