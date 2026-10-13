import { syncMetaRepository } from "../../db/repositories/syncMetaRepository";
import type { AppState } from "./types";

type SetState = (partial: Partial<AppState>) => void;

/**
 * Every slice's mutating actions look like: optimistic `set()` first, then
 * `persist("label", () => repository.method(...))` fire-and-forget. This
 * factory hands each slice its own bound `persist` function (closed over
 * that slice's `set`) so every slice can call it the exact same way the
 * single pre-split store.ts did — `set` is passed in explicitly rather
 * than importing `useAppStore` here, which would create a circular import
 * (store.ts -> slice -> persistHelper -> store.ts).
 */
export function createPersistHelper(set: SetState) {
  return function persist(label: string, task: () => Promise<unknown>, touchTimestamp = true) {
    if (touchTimestamp) {
      const ts = new Date().toISOString();
      set({ dataUpdatedAt: ts });
      syncMetaRepository
        .get()
        .then((meta) =>
          syncMetaRepository.put({ id: "app", lastBackupAt: meta?.lastBackupAt, dataUpdatedAt: ts })
        )
        .catch(() => {});
    }
    // Fire-and-forget persistence: the UI already reflects the change
    // (optimistic update happened synchronously in `set()` before this
    // runs). We still await the write internally so real failures are
    // logged instead of silently disappearing, but we never block/delay
    // the next keystroke.
    task().catch((error) => {
      console.error(`Failed to persist ${label} to IndexedDB:`, error);
    });
  };
}
