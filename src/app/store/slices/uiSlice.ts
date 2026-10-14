import type { StateCreator } from "zustand";
import { getGroupById } from "../../../shared/lib/entityLookup";
import type { AppState } from "../types";

export type ViewMode = "edit" | "review" | "settings";
export type WorkspaceTab = "active" | "archive";
export type TotalsScope = "current" | "all";

const LAST_MODE_STORAGE_KEY = "t1:last-mode";
const LAST_ACTIVE_GROUP_STORAGE_KEY = "t1:last-active-group";
const LAST_ARCHIVE_GROUP_STORAGE_KEY = "t1:last-archive-group";

export function getRememberedGroupId(archived: boolean): string | null {
  try {
    return localStorage.getItem(
      archived ? LAST_ARCHIVE_GROUP_STORAGE_KEY : LAST_ACTIVE_GROUP_STORAGE_KEY
    );
  } catch {
    return null;
  }
}

function rememberGroupId(id: string, archived: boolean) {
  try {
    localStorage.setItem(
      archived ? LAST_ARCHIVE_GROUP_STORAGE_KEY : LAST_ACTIVE_GROUP_STORAGE_KEY,
      id
    );
  } catch {
    // Ignore storage failures.
  }
}

function getInitialMode(): ViewMode {
  try {
    const stored = localStorage.getItem(LAST_MODE_STORAGE_KEY);
    if (stored === "edit" || stored === "review") return stored;
  } catch {
    // Storage can fail (private browsing, quota, etc.) — fall through to
    // the default below.
  }
  return "edit";
}

export interface UiSlice {
  activeGroupId: string | null;
  /** Remembers which group was last selected on each workspace tab, so
   * switching Active <-> Archive restores the right group instead of
   * leaving a stale/invisible one selected. */
  lastActiveGroupIdActive: string | null;
  lastActiveGroupIdArchive: string | null;
  mode: ViewMode;
  workspace: WorkspaceTab;
  highlightedRowId: string | null;
  /** Period whose From/To fields should flash yellow for a few seconds. */
  highlightedPeriodId: string | null;
  /** Set by Review/Search when it navigates to a row, so the target
   * period force-opens even though periods now start collapsed. */
  expandPeriodId: string | null;
  totalsScope: TotalsScope;
  /** Blurs every money amount in the app when true — a privacy toggle
   * for when someone's phone might be glanced at. Deliberately NOT
   * persisted across sessions — every fresh app open starts hidden
   * again regardless of how a previous session was left, since the
   * whole point is that leaving the app with amounts visible (then
   * someone else picking the phone up) shouldn't stay "unlocked". */
  amountsHidden: boolean;

  setActiveGroup: (id: string | null) => void;
  setMode: (mode: ViewMode) => void;
  setWorkspace: (ws: WorkspaceTab) => void;
  setTotalsScope: (scope: TotalsScope) => void;
  highlightRow: (id: string) => void;
  highlightPeriodDates: (id: string) => void;
  requestExpandPeriod: (id: string) => void;
  clearExpandPeriodRequest: () => void;
  toggleAmountsHidden: () => void;
  /** Forces amounts back to hidden — used when the app is backgrounded,
   * so returning to it (foreground/reopen) never shows a brief flash of
   * whatever was visible before, regardless of whether the JS process
   * actually restarted or just resumed. */
  hideAmounts: () => void;
}

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set, get) => ({
  activeGroupId: null,
  lastActiveGroupIdActive: null,
  lastActiveGroupIdArchive: null,
  mode: getInitialMode(),
  workspace: "active",
  highlightedRowId: null,
  highlightedPeriodId: null,
  expandPeriodId: null,
  totalsScope: "current",
  amountsHidden: true,

  setActiveGroup: (id) =>
    set((s) => {
      const group = getGroupById(s.groups, id);
      if (!group) return { activeGroupId: id };
      if (id) rememberGroupId(id, group.archived);
      return group.archived
        ? { activeGroupId: id, lastActiveGroupIdArchive: id }
        : { activeGroupId: id, lastActiveGroupIdActive: id };
    }),

  setMode: (mode) => {
    set({ mode });
    // Remembered per-device (not synced) — only edit/review are real
    // content tabs; settings is a temporary overlay, not something to
    // reopen into next time.
    if (mode === "edit" || mode === "review") {
      try {
        localStorage.setItem(LAST_MODE_STORAGE_KEY, mode);
      } catch {
        // Storage can fail (private browsing, quota, etc.) — not worth
        // surfacing to the person, the app just won't remember this time.
      }
    }
  },

  setWorkspace: (workspace) =>
    set((s) => {
      const remembered =
        workspace === "archive" ? s.lastActiveGroupIdArchive : s.lastActiveGroupIdActive;
      const candidates = s.groups.filter((g) =>
        workspace === "archive" ? g.archived : !g.archived
      );
      const rememberedIsValid = remembered && candidates.some((g) => g.id === remembered);
      const nextActiveGroupId = rememberedIsValid ? remembered : (candidates[0]?.id ?? null);
      return { workspace, activeGroupId: nextActiveGroupId };
    }),

  setTotalsScope: (totalsScope) => set({ totalsScope }),

  highlightRow: (id) => {
    set({ highlightedRowId: id });
    setTimeout(() => {
      // Only clear if nothing else re-triggered a highlight in the meantime.
      if (get().highlightedRowId === id) set({ highlightedRowId: null });
    }, 3500);
  },

  highlightPeriodDates: (id) => {
    set({ highlightedPeriodId: id });
    setTimeout(() => {
      if (get().highlightedPeriodId === id) set({ highlightedPeriodId: null });
    }, 3500);
  },

  requestExpandPeriod: (id) => set({ expandPeriodId: id }),
  clearExpandPeriodRequest: () => set({ expandPeriodId: null }),

  toggleAmountsHidden: () => set((s) => ({ amountsHidden: !s.amountsHidden })),
  hideAmounts: () => set({ amountsHidden: true }),
});
