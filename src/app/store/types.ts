import type { GroupsSlice } from "./slices/groupsSlice";
import type { PeriodsSlice } from "./slices/periodsSlice";
import type { ClientRowsSlice } from "./slices/clientRowsSlice";
import type { UiSlice } from "./slices/uiSlice";
import type { SettingsSlice } from "./slices/settingsSlice";
import type { CloudSyncSlice } from "./slices/cloudSyncSlice";
import type { LifecycleSlice } from "./slices/lifecycleSlice";

/**
 * The combined store shape — every slice's state + actions in one flat
 * type, exactly matching the single AppState interface store.ts had
 * before the slice split. Kept in its own file (rather than inline in
 * store.ts) specifically so each slice can import *only this type* to
 * type its own StateCreator<AppState, [], [], OwnSlice> — every slice
 * needs the full AppState (not just its own slice) because several
 * actions legitimately read/write across slices (e.g. deleteGroup also
 * touches periods/clientRows/activeGroupId). This file only exports
 * types, so the "types.ts imports from slices/*, slices/* import back
 * from types.ts" cycle is type-only and erased at compile time — safe,
 * unlike a circular *value* import would be.
 */
export type AppState = GroupsSlice &
  PeriodsSlice &
  ClientRowsSlice &
  UiSlice &
  SettingsSlice &
  CloudSyncSlice &
  LifecycleSlice;

export type { ViewMode, WorkspaceTab, TotalsScope } from "./slices/uiSlice";
export type { CloudSyncStatus } from "./slices/cloudSyncSlice";
