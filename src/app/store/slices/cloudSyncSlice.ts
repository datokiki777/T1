import type { StateCreator } from "zustand";
import { syncMetaRepository } from "../../../db/repositories/syncMetaRepository";
import type { CloudSnapshot } from "../../../firebase/cloudSnapshot";
import type { AppState } from "../types";

export type CloudSyncStatus = "idle" | "syncing" | "synced" | "local" | "error";

export interface CloudSyncSlice {
  cloudStatus: CloudSyncStatus;
  cloudError: string | null;
  cloudUserEmail: string | null;
  cloudConflict: { local: CloudSnapshot; cloud: CloudSnapshot } | null;
  /** Human-readable explanation of what the last sync actually did — e.g.
   * "Uploaded — this device was newer" — so the person never has to
   * wonder which side won. */
  cloudLastSyncDetail: string | null;
  /** ISO timestamp of the last time a sync/save/load actually completed
   * successfully — shown instead of the detail text, once available. */
  cloudLastSyncedAt: string | null;
  /** ISO timestamp of the last successful backup of any kind (cloud save,
   * JSON/Excel/PDF export). */
  lastBackupAt: string | null;

  // Cloud sync actions (state setters — the actual Firebase orchestration
  // lives in src/firebase/, which calls these; keeps this store
  // Firebase-agnostic)
  setCloudStatus: (status: CloudSyncStatus, error?: string | null) => void;
  setCloudUserEmail: (email: string | null) => void;
  setCloudConflict: (conflict: { local: CloudSnapshot; cloud: CloudSnapshot } | null) => void;
  setCloudSyncDetail: (detail: string | null) => void;
  /** Marks "right now" as the last successful sync time. */
  markCloudSynced: () => void;
  markBackupMade: () => void;
}

export const createCloudSyncSlice: StateCreator<AppState, [], [], CloudSyncSlice> = (set) => ({
  cloudStatus: "idle",
  cloudError: null,
  cloudUserEmail: null,
  cloudConflict: null,
  cloudLastSyncDetail: null,
  cloudLastSyncedAt: null,
  lastBackupAt: null,

  setCloudStatus: (cloudStatus, error = null) => set({ cloudStatus, cloudError: error }),
  setCloudUserEmail: (cloudUserEmail) => set({ cloudUserEmail }),
  setCloudConflict: (cloudConflict) => set({ cloudConflict }),
  setCloudSyncDetail: (cloudLastSyncDetail) => set({ cloudLastSyncDetail }),
  markCloudSynced: () => set({ cloudLastSyncedAt: new Date().toISOString() }),

  markBackupMade: () => {
    const ts = new Date().toISOString();
    set({ lastBackupAt: ts });
    syncMetaRepository
      .get()
      .then((meta) =>
        syncMetaRepository.put({ id: "app", dataUpdatedAt: meta?.dataUpdatedAt ?? ts, lastBackupAt: ts })
      )
      .catch(() => {});
  },
});
