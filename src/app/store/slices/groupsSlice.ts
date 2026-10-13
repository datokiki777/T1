import type { StateCreator } from "zustand";
import { groupRepository } from "../../../db/repositories/groupRepository";
import { generateId, now } from "../../../shared/lib/id";
import type { Group } from "../../../shared/types/domain";
import { createPersistHelper } from "../persistHelper";
import { getPeriodsForGroup, getGroupById } from "../../../shared/lib/entityLookup";
import type { AppState } from "../types";

export interface GroupsSlice {
  groups: Group[];

  addGroup: (name: string) => Promise<Group>;
  renameGroup: (id: string, name: string) => void;
  updateGroupSettings: (
    id: string,
    patch: { defaultRate?: number; defaultSalary?: number; currentCarNumber?: string | null }
  ) => void;
  deleteGroup: (id: string) => void;
  toggleArchiveGroup: (id: string) => void;
}

export const createGroupsSlice: StateCreator<AppState, [], [], GroupsSlice> = (set, get) => {
  const persist = createPersistHelper(set);

  return {
    groups: [],

    addGroup: async (name) => {
      const { defaultRate, defaultSalary } = get().settings;
      const group: Group = {
        id: generateId(),
        name: name.trim() || "New group",
        archived: false,
        defaultRate,
        defaultSalary,
        currentCarNumber: null,
        createdAt: now(),
        updatedAt: now(),
      };
      set((s) => ({ groups: [...s.groups, group], activeGroupId: group.id }));
      persist("group", () => groupRepository.add(group));
      return group;
    },

    renameGroup: (id, name) => {
      const patch = { name: name.trim(), updatedAt: now() };
      set((s) => ({
        groups: s.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
      }));
      persist("group rename", () => groupRepository.update(id, patch));
    },

    updateGroupSettings: (id, patch) => {
      const full = { ...patch, updatedAt: now() };
      set((s) => ({
        groups: s.groups.map((g) => (g.id === id ? { ...g, ...full } : g)),
      }));
      persist("group settings", () => groupRepository.update(id, full));
    },

    deleteGroup: (id) => {
      const periodIds = getPeriodsForGroup(get().periods, id).map((p) => p.id);
      set((s) => ({
        groups: s.groups.filter((g) => g.id !== id),
        periods: s.periods.filter((p) => p.groupId !== id),
        clientRows: s.clientRows.filter((r) => !periodIds.includes(r.periodId)),
        activeGroupId: s.activeGroupId === id ? null : s.activeGroupId,
        lastActiveGroupIdActive: s.lastActiveGroupIdActive === id ? null : s.lastActiveGroupIdActive,
        lastActiveGroupIdArchive:
          s.lastActiveGroupIdArchive === id ? null : s.lastActiveGroupIdArchive,
      }));
      persist("group deletion", () => groupRepository.deleteCascade(id, periodIds));
    },

    toggleArchiveGroup: (id) => {
      const group = getGroupById(get().groups, id);
      if (!group) return;
      const nowArchived = !group.archived;
      const patch = { archived: nowArchived, updatedAt: now() };
      set((s) => ({
        groups: s.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
        ...(s.activeGroupId === id
          ? nowArchived
            ? { lastActiveGroupIdArchive: id }
            : { lastActiveGroupIdActive: id }
          : {}),
      }));
      persist("group archive toggle", () => groupRepository.update(id, patch));
    },
  };
};
