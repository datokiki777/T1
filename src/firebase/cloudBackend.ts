import type { CloudSnapshot } from "./cloudSnapshot";

export interface HistoryEntry {
  /** "latest" for the live main doc, or a YYYY-MM-DD date string for a
   * daily history snapshot. */
  id: string;
  label: string;
  savedAt: string;
}

/** Daily history copies kept in the cloud — once a 31st would be
 * written, the oldest is deleted. */
export const HISTORY_MAX_ENTRIES = 30;

/** How long cloud data survives without the app being used: every write
 * (and every successful sync) pushes the document's expireAt this many
 * months into the future; Firestore's TTL policy deletes it once that
 * date passes. */
export const CLOUD_RETENTION_MONTHS = 6;

/** `from` + CLOUD_RETENTION_MONTHS calendar months, clamping the day so
 * e.g. Aug 31 + 6 months lands on Feb 28, not Mar 3. */
export function computeExpireAt(from: Date = new Date()): Date {
  const d = new Date(from);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + CLOUD_RETENTION_MONTHS);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
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
  /** Marks the live main document as "used just now" (pushes its expiry
   * out again) without rewriting its data — called when the app syncs
   * but has nothing to upload, so an actively-used app's cloud copy
   * never ages out just because nothing changed for a while. */
  refreshExpiry(): Promise<void>;
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
export function createInMemoryCloudBackend(
  initial: CloudSnapshot | null = null
): CloudBackend & {
  /** Test-only peeks at the expiry the real backend stores as expireAt. */
  getMainExpireAt(): Date | null;
  getHistoryExpireAt(id: string): Date | null;
} {
  let stored: CloudSnapshot | null = initial;
  let mainExpireAt: Date | null = initial ? computeExpireAt() : null;
  const history = new Map<string, { snapshot: CloudSnapshot; savedAt: string; expireAt: Date }>();
  return {
    async readMainSnapshot() {
      return stored;
    },
    async writeMainSnapshot(snapshot) {
      stored = snapshot;
      mainExpireAt = computeExpireAt();
    },
    async refreshExpiry() {
      if (stored) mainExpireAt = computeExpireAt();
    },
    async writeHistorySnapshot(snapshot) {
      history.set(todayKey(), {
        snapshot,
        savedAt: new Date().toISOString(),
        expireAt: computeExpireAt(),
      });
      // Keep only the newest HISTORY_MAX_ENTRIES days — the oldest go first.
      const idsNewestFirst = Array.from(history.keys()).sort((a, b) => b.localeCompare(a));
      for (const id of idsNewestFirst.slice(HISTORY_MAX_ENTRIES)) history.delete(id);
    },
    async listHistory() {
      return Array.from(history.entries())
        .map(([id, v]) => ({ id, label: `History - ${id}`, savedAt: v.savedAt }))
        .sort((a, b) => b.id.localeCompare(a.id));
    },
    async readHistorySnapshot(id) {
      return history.get(id)?.snapshot ?? null;
    },
    getMainExpireAt: () => mainExpireAt,
    getHistoryExpireAt: (id) => history.get(id)?.expireAt ?? null,
  };
}

/**
 * Creates the real Firestore-backed CloudBackend, scoped to one signed-in
 * user's own data (users/{uid}/backups/main, users/{uid}/backups_history)
 * — every person who signs in gets their own, completely separate cloud
 * storage; Firestore Security Rules enforce that a user can only ever
 * read/write their own uid's documents, so this isn't just a convention,
 * it's actually unreachable otherwise. Firebase itself is only imported
 * here (dynamic import), so nothing about the sync engine's logic depends
 * on the SDK being present — useful for tests and for keeping it out of
 * the main bundle until it's actually needed. Not cached here (the
 * caller is responsible for that) since the right backend instance
 * depends on *which* uid is currently signed in, which can change across
 * a session (sign out, sign in as someone else).
 */
export async function getFirestoreCloudBackend(uid: string): Promise<CloudBackend> {
  const { getFirebaseApp } = await import("./config");
  const {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    collection,
    getDocs,
    getCountFromServer,
    query,
    orderBy,
    limit,
  } = await import("firebase/firestore");

  const app = getFirebaseApp();
  const firestore = getFirestore(app);
  const mainDocRef = doc(firestore, "users", uid, "backups", "main");
  const historyCollection = collection(firestore, "users", uid, "backups_history");

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
            // Firestore TTL (configured on this field in the console)
            // deletes the document once this passes — see computeExpireAt.
            expireAt: computeExpireAt(),
          });
        },
        async refreshExpiry() {
          try {
            await updateDoc(mainDocRef, { expireAt: computeExpireAt() });
          } catch {
            // No main document yet (nothing to keep alive) — nothing to do.
          }
        },
        async writeHistorySnapshot(snapshot) {
          // One entry per calendar day (the doc id is the date), so
          // repeated saves the same day just overwrite that day's copy.
          const id = todayKey();
          const savedAt = new Date().toISOString();
          await setDoc(doc(historyCollection, id), {
            data: snapshot,
            savedAt,
            expireAt: computeExpireAt(),
          });

          // Cap at HISTORY_MAX_ENTRIES: count first (a cheap aggregate
          // query, no document bodies), and only when over the cap fetch
          // and delete exactly the surplus oldest entries. Best-effort —
          // a failed cleanup must never fail the save itself.
          try {
            const total = (await getCountFromServer(historyCollection)).data().count;
            const surplus = total - HISTORY_MAX_ENTRIES;
            if (surplus > 0) {
              const oldest = await getDocs(
                query(historyCollection, orderBy("savedAt", "asc"), limit(surplus))
              );
              await Promise.all(oldest.docs.map((d) => deleteDoc(d.ref)));
            }
          } catch (error) {
            console.warn("Cloud history cleanup skipped:", error);
          }
        },
        async listHistory() {
          const q = query(historyCollection, orderBy("savedAt", "desc"), limit(HISTORY_MAX_ENTRIES));
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
}
