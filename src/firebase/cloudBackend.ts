import type { CloudSnapshot } from "./cloudSnapshot";

export interface HistoryEntry {
  /** "latest" for the live main doc, or a YYYY-MM-DD date string for a
   * daily history snapshot. */
  id: string;
  label: string;
  savedAt: string;
}

/**
 * Thin abstraction over the cloud backup store: one live "main" document
 * plus a rolling daily history. Kept as an interface (rather than
 * importing Firebase everywhere) so the sync orchestration logic can be
 * tested against an in-memory fake instead of a real Firestore project.
 */
export interface CloudBackend {
  readMainSnapshot(): Promise<CloudSnapshot | null>;
  writeMainSnapshot(snapshot: CloudSnapshot): Promise<void>;
  /** Also records a same-day history snapshot (one per calendar day —
   * repeated saves the same day overwrite that day's entry, matching the
   * old app's daily-history design). */
  writeHistorySnapshot(snapshot: CloudSnapshot): Promise<void>;
  listHistory(): Promise<HistoryEntry[]>;
  readHistorySnapshot(id: string): Promise<CloudSnapshot | null>;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/**
 * In-memory fake used by tests (and available for local-only development
 * without touching a real project). Mirrors the real backend's async
 * shape exactly.
 */
export function createInMemoryCloudBackend(initial: CloudSnapshot | null = null): CloudBackend {
  let stored: CloudSnapshot | null = initial;
  const history = new Map<string, { snapshot: CloudSnapshot; savedAt: string }>();
  return {
    async readMainSnapshot() {
      return stored;
    },
    async writeMainSnapshot(snapshot) {
      stored = snapshot;
    },
    async writeHistorySnapshot(snapshot) {
      history.set(todayKey(), { snapshot, savedAt: new Date().toISOString() });
    },
    async listHistory() {
      return Array.from(history.entries())
        .map(([id, v]) => ({ id, label: `History - ${id}`, savedAt: v.savedAt }))
        .sort((a, b) => b.id.localeCompare(a.id));
    },
    async readHistorySnapshot(id) {
      return history.get(id)?.snapshot ?? null;
    },
  };
}

let firestoreBackendPromise: Promise<CloudBackend> | null = null;

/**
 * Lazily creates the real Firestore-backed CloudBackend. Firebase itself
 * is only imported here (dynamic import), so nothing about the sync
 * engine's logic depends on the SDK being present — useful for tests and
 * for keeping it out of the main bundle until it's actually needed.
 */
export function getFirestoreCloudBackend(): Promise<CloudBackend> {
  if (!firestoreBackendPromise) {
    firestoreBackendPromise = (async () => {
      const { getFirebaseApp } = await import("./config");
      const { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, orderBy, limit } =
        await import("firebase/firestore");

      const app = getFirebaseApp();
      const firestore = getFirestore(app);
      const mainDocRef = doc(firestore, "backups", "main");
      const historyCollection = collection(firestore, "backups_history");

      return {
        async readMainSnapshot() {
          const snap = await getDoc(mainDocRef);
          if (!snap.exists()) return null;
          const data = snap.data();
          return (data?.data ?? null) as CloudSnapshot | null;
        },
        async writeMainSnapshot(snapshot) {
          await setDoc(mainDocRef, {
            data: snapshot,
            updatedAt: new Date().toISOString(),
          });
        },
        async writeHistorySnapshot(snapshot) {
          const id = todayKey();
          const savedAt = new Date().toISOString();
          // 30-day rolling window, matching the old app — Firestore TTL
          // (if configured on this field in the console) will expire it
          // automatically; harmless if TTL isn't configured, it just
          // means old entries stay listed.
          const expireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          await setDoc(doc(historyCollection, id), { data: snapshot, savedAt, expireAt });
        },
        async listHistory() {
          const q = query(historyCollection, orderBy("savedAt", "desc"), limit(30));
          const snaps = await getDocs(q);
          return snaps.docs.map((d) => ({
            id: d.id,
            label: `History - ${d.id}`,
            savedAt: (d.data().savedAt as string) ?? d.id,
          }));
        },
        async readHistorySnapshot(id) {
          const snap = await getDoc(doc(historyCollection, id));
          if (!snap.exists()) return null;
          const data = snap.data();
          return (data?.data ?? null) as CloudSnapshot | null;
        },
      } satisfies CloudBackend;
    })();
  }
  return firestoreBackendPromise;
}
