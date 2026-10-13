import { create } from "zustand";
import { createGroupsSlice } from "./store/slices/groupsSlice";
import { createPeriodsSlice } from "./store/slices/periodsSlice";
import { createClientRowsSlice } from "./store/slices/clientRowsSlice";
import { createUiSlice } from "./store/slices/uiSlice";
import { createSettingsSlice } from "./store/slices/settingsSlice";
import { createCloudSyncSlice } from "./store/slices/cloudSyncSlice";
import { createLifecycleSlice } from "./store/slices/lifecycleSlice";
import type { AppState } from "./store/types";

// Re-exported for backward compatibility — these used to live directly in
// this file before the slice split (Stage 2 of the store refactor); any
// code importing them from "../app/store" keeps working unchanged.
export type { ViewMode, WorkspaceTab, TotalsScope, CloudSyncStatus } from "./store/types";

/**
 * The single store every component uses, composed from independent
 * slices (groups/periods/clientRows/ui/settings/cloudSync/lifecycle —
 * see src/app/store/slices/). This is a pure structural refactor: the
 * exported `useAppStore` API, every action's name/signature/behavior,
 * and the optimistic-update-then-persist flow are all unchanged from
 * before the split. Firebase orchestration (src/firebase/) stays
 * entirely outside this file, calling these slices' actions/state the
 * same way it always did.
 */
export const useAppStore = create<AppState>()((...a) => ({
  ...createGroupsSlice(...a),
  ...createPeriodsSlice(...a),
  ...createClientRowsSlice(...a),
  ...createUiSlice(...a),
  ...createSettingsSlice(...a),
  ...createCloudSyncSlice(...a),
  ...createLifecycleSlice(...a),
}));
