import { useAppStore } from "../app/store";
import { buildCloudSnapshot } from "./cloudSnapshot";
import { getFirestoreCloudBackend, type CloudBackend, type HistoryEntry } from "./cloudBackend";
import { determineAndPerformCloudSync, applyCloudSyncChoice } from "./cloudSyncEngine";
import { subscribeToAuthState } from "./auth";
import { isFirebaseConfigured } from "./config";

const AUTO_SYNC_DEBOUNCE_MS = 8000;

let started = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// The backend is scoped to one signed-in user's own data (see
// cloudBackend.ts), so it's cached per-uid here rather than as a single
// shared promise — switching users (sign out, sign in as someone else)
// must get a fresh backend pointed at the new uid's own documents, never
// keep reusing the previous person's.
let currentUid: string | null = null;
let backendPromise: Promise<CloudBackend> | null = null;
let backendUid: string | null = null;

function getBackend(): Promise<CloudBackend> {
  if (!currentUid) {
    return Promise.reject(new Error("Not signed in."));
  }
  if (!backendPromise || backendUid !== currentUid) {
    backendUid = currentUid;
    backendPromise = getFirestoreCloudBackend(currentUid);
  }
  return backendPromise;
}

async function buildLocalSnapshotFromStore() {
  const s = useAppStore.getState();
  return buildCloudSnapshot(
    s.groups,
    s.periods,
    s.clientRows,
    s.settings,
    s.dataUpdatedAt ?? new Date().toISOString()
  );
}

async function runSyncNow(): Promise<void> {
  try {
    const backend = await getBackend();
    const s = useAppStore.getState();
    s.setCloudStatus("syncing");

    const outcome = await determineAndPerformCloudSync(backend, {
      hasData: s.groups.length > 0,
      updatedAt: s.dataUpdatedAt,
      snapshot: await buildLocalSnapshotFromStore(),
    });

    if (outcome.decision === "noop") {
      useAppStore.getState().setCloudStatus("idle");
      useAppStore.getState().setCloudSyncDetail("Nothing to sync yet.");
      return;
    }
    if (outcome.decision === "in-sync") {
      // Both sides already match — nothing to upload or download, and
      // deliberately never treated as a conflict (see syncDecision.ts).
      useAppStore.getState().setCloudStatus("synced");
      useAppStore.getState().markCloudSynced();
      const when = new Date(outcome.updatedAt).toLocaleString([], {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      useAppStore.getState().setCloudSyncDetail(`Already in sync — last changed ${when}.`);
      return;
    }
    if (outcome.decision === "push") {
      useAppStore.getState().setCloudStatus("synced");
    useAppStore.getState().markCloudSynced();
      useAppStore.getState().setCloudSyncDetail("Uploaded — this device's data was newer.");
      useAppStore.getState().markBackupMade();
      backend.writeHistorySnapshot(outcome.snapshot).catch(() => {});
      return;
    }
    if (outcome.decision === "pull") {
      await useAppStore.getState().applyCloudSnapshot(outcome.snapshot);
      useAppStore.getState().setCloudStatus("synced");
    useAppStore.getState().markCloudSynced();
      useAppStore.getState().setCloudSyncDetail("Downloaded — the cloud had newer data.");
      return;
    }
    // "ask" — never guess; surface it for the person to resolve explicitly.
    useAppStore.getState().setCloudConflict({
      local: outcome.localSnapshot,
      cloud: outcome.cloudSnapshot,
    });
    useAppStore.getState().setCloudStatus("local");
    useAppStore
      .getState()
      .setCloudSyncDetail("Both this device and the cloud changed — pick which one to keep below.");
  } catch (error) {
    console.error("Cloud sync failed:", error);
    useAppStore
      .getState()
      .setCloudStatus("error", error instanceof Error ? error.message : "Cloud sync failed");
  }
}

function scheduleAutoSync() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    if (navigator.onLine) runSyncNow();
  }, AUTO_SYNC_DEBOUNCE_MS);
}

/**
 * Wires the cloud sync system into the running app: watches auth state,
 * runs a one-time startup sync once signed in, and auto-syncs (debounced)
 * whenever local data changes afterward. Safe to call multiple times —
 * only sets up its subscriptions once per app session.
 */
export function startCloudSync(): void {
  if (started) return;
  if (!isFirebaseConfigured) {
    // No Firebase project configured for this app yet (see config.ts) —
    // stays fully local-only, exactly like before cloud sync existed.
    // Never attempts any Firebase/network call in this state.
    useAppStore.getState().setCloudStatus("idle");
    return;
  }
  started = true;

  subscribeToAuthState(async (user) => {
    currentUid = user?.uid ?? null;
    useAppStore.getState().setCloudUserEmail(user?.email ?? null);
    if (user) {
      await runSyncNow();
    }
  }).catch((error) => {
    // Firebase unavailable (offline install, blocked script, etc.) — the
    // app stays fully usable in local-only mode, matching the old app.
    console.warn("Cloud sync unavailable, continuing in local-only mode.", error);
  });

  let lastSeenTimestamp = useAppStore.getState().dataUpdatedAt;
  useAppStore.subscribe((state) => {
    if (state.dataUpdatedAt !== lastSeenTimestamp) {
      lastSeenTimestamp = state.dataUpdatedAt;
      if (state.cloudUserEmail) scheduleAutoSync();
    }
  });

  window.addEventListener("online", () => {
    if (useAppStore.getState().cloudUserEmail) runSyncNow();
  });
}

export async function manualCloudSave(): Promise<void> {
  const backend = await getBackend();
  const snapshot = await buildLocalSnapshotFromStore();
  useAppStore.getState().setCloudStatus("syncing");
  try {
    await backend.writeMainSnapshot(snapshot);
    await backend.writeHistorySnapshot(snapshot);
    useAppStore.getState().setCloudStatus("synced");
    useAppStore.getState().markCloudSynced();
    useAppStore.getState().setCloudSyncDetail("Saved to cloud manually.");
    useAppStore.getState().markBackupMade();
  } catch (error) {
    useAppStore
      .getState()
      .setCloudStatus("error", error instanceof Error ? error.message : "Save failed");
    throw error;
  }
}

export async function manualCloudLoad(): Promise<void> {
  const backend = await getBackend();
  useAppStore.getState().setCloudStatus("syncing");
  try {
    const cloudSnapshot = await backend.readMainSnapshot();
    if (!cloudSnapshot) {
      useAppStore.getState().setCloudStatus("idle");
      throw new Error("No cloud backup found yet.");
    }
    await useAppStore.getState().applyCloudSnapshot(cloudSnapshot);
    useAppStore.getState().setCloudStatus("synced");
    useAppStore.getState().markCloudSynced();
    useAppStore.getState().setCloudSyncDetail("Loaded the latest cloud backup.");
  } catch (error) {
    useAppStore
      .getState()
      .setCloudStatus("error", error instanceof Error ? error.message : "Load failed");
    throw error;
  }
}

/** Lists "Latest Cloud" plus every daily history snapshot, newest first —
 * for the restore-source picker. */
export async function listRestoreSources(): Promise<HistoryEntry[]> {
  const backend = await getBackend();
  const [main, history] = await Promise.all([backend.readMainSnapshot(), backend.listHistory()]);
  const entries: HistoryEntry[] = [];
  if (main) {
    entries.push({ id: "latest", label: "Latest Cloud", savedAt: main.dataUpdatedAt });
  }
  entries.push(...history);
  return entries;
}

/** Restores local data from a specific restore source (either "latest" or
 * a history entry's date-based id). */
export async function restoreFromSource(id: string): Promise<void> {
  const backend = await getBackend();
  useAppStore.getState().setCloudStatus("syncing");
  try {
    const snapshot = id === "latest" ? await backend.readMainSnapshot() : await backend.readHistorySnapshot(id);
    if (!snapshot) {
      useAppStore.getState().setCloudStatus("idle");
      throw new Error("That backup could not be found.");
    }
    await useAppStore.getState().applyCloudSnapshot(snapshot);
    useAppStore.getState().setCloudStatus("synced");
    useAppStore.getState().markCloudSynced();
    useAppStore.getState().setCloudSyncDetail(`Restored from ${id === "latest" ? "the latest cloud backup" : id}.`);
  } catch (error) {
    useAppStore
      .getState()
      .setCloudStatus("error", error instanceof Error ? error.message : "Restore failed");
    throw error;
  }
}

export async function resolveCloudConflict(choice: "keep-local" | "use-cloud"): Promise<void> {
  const conflict = useAppStore.getState().cloudConflict;
  if (!conflict) return;
  const backend = await getBackend();

  const outcome = await applyCloudSyncChoice(backend, choice, conflict.local);
  if (outcome.decision === "pull") {
    await useAppStore.getState().applyCloudSnapshot(outcome.snapshot);
  }
  useAppStore.getState().setCloudConflict(null);
  useAppStore.getState().setCloudStatus("synced");
    useAppStore.getState().markCloudSynced();
  useAppStore
    .getState()
    .setCloudSyncDetail(
      choice === "keep-local" ? "Kept this device's data (uploaded)." : "Used the cloud's data (downloaded)."
    );
}
