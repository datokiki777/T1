import type { CloudBackend } from "./cloudBackend";
import type { CloudSnapshot } from "./cloudSnapshot";
import { resolveSyncDirection, type SyncSide } from "./syncDecision";

export interface LocalSyncState {
  hasData: boolean;
  updatedAt: string | null;
  snapshot: CloudSnapshot;
}

export type CloudSyncOutcome =
  | { decision: "noop" }
  | { decision: "push"; snapshot: CloudSnapshot }
  | { decision: "pull"; snapshot: CloudSnapshot }
  | { decision: "in-sync"; updatedAt: string }
  | { decision: "ask"; localSnapshot: CloudSnapshot; cloudSnapshot: CloudSnapshot };

/**
 * Reads the cloud's current state, compares it against the given local
 * state via resolveSyncDirection(), and either performs the write (for a
 * clear "push") or returns what the caller should do next. Never applies
 * a "pull" or shows/hides anything itself — that's the caller's job, kept
 * separate so this function stays a small, fully-testable orchestrator.
 */
export async function determineAndPerformCloudSync(
  backend: CloudBackend,
  local: LocalSyncState
): Promise<CloudSyncOutcome> {
  const cloudSnapshot = await backend.readMainSnapshot();

  const localSide: SyncSide = { hasData: local.hasData, updatedAt: local.updatedAt };
  const cloudSide: SyncSide = {
    hasData: cloudSnapshot !== null,
    updatedAt: cloudSnapshot?.dataUpdatedAt ?? null,
  };

  const decision = resolveSyncDirection(localSide, cloudSide);

  if (decision === "noop") return { decision: "noop" };

  if (decision === "push") {
    await backend.writeMainSnapshot(local.snapshot);
    return { decision: "push", snapshot: local.snapshot };
  }

  if (decision === "pull") {
    // cloudSnapshot is guaranteed non-null here: resolveSyncDirection only
    // returns "pull" when cloudSide.hasData is true.
    return { decision: "pull", snapshot: cloudSnapshot as CloudSnapshot };
  }

  if (decision === "in-sync") {
    // Timestamps matched exactly — local.updatedAt and cloudSide.updatedAt
    // are the same value, so either works as "when this last changed".
    return { decision: "in-sync", updatedAt: local.updatedAt as string };
  }

  // decision === "ask"
  return {
    decision: "ask",
    localSnapshot: local.snapshot,
    cloudSnapshot: cloudSnapshot as CloudSnapshot,
  };
}

/** Used after the person resolves an "ask" prompt, to actually carry out
 * their choice. */
export async function applyCloudSyncChoice(
  backend: CloudBackend,
  choice: "keep-local" | "use-cloud",
  localSnapshot: CloudSnapshot
): Promise<CloudSyncOutcome> {
  if (choice === "keep-local") {
    await backend.writeMainSnapshot(localSnapshot);
    return { decision: "push", snapshot: localSnapshot };
  }
  const cloudSnapshot = await backend.readMainSnapshot();
  if (!cloudSnapshot) return { decision: "noop" };
  return { decision: "pull", snapshot: cloudSnapshot };
}
