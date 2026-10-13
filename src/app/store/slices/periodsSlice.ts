import type { StateCreator } from "zustand";
import { periodRepository } from "../../../db/repositories/periodRepository";
import { generateId, now } from "../../../shared/lib/id";
import type { Period } from "../../../shared/types/domain";
import { getGroupById } from "../../../shared/lib/entityLookup";
import { createPersistHelper } from "../persistHelper";
import type { AppState } from "../types";

export interface PeriodsSlice {
  periods: Period[];

  addPeriod: (groupId: string, opts?: Partial<Period>) => Promise<Period>;
  updatePeriod: (id: string, patch: Partial<Period>) => void;
  removePeriod: (id: string) => void;
}

export const createPeriodsSlice: StateCreator<AppState, [], [], PeriodsSlice> = (set, get) => {
  const persist = createPersistHelper(set);

  return {
    periods: [],

    addPeriod: async (groupId, opts) => {
      // Inherits the group's *current* car at the moment this period is
      // created — a one-time copy, not a live link. Changing the group's
      // current car later never touches this period's own value, and
      // editing this period's own value never touches the group's.
      const group = getGroupById(get().groups, groupId);
      const period: Period = {
        id: generateId(),
        groupId,
        fromDate: opts?.fromDate ?? null,
        toDate: opts?.toDate ?? null,
        paidWeeks: opts?.paidWeeks ?? null,
        carNumber: opts?.carNumber ?? group?.currentCarNumber ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      set((s) => ({ periods: [...s.periods, period] }));
      persist("period", () => periodRepository.add(period));
      return period;
    },

    updatePeriod: (id, patch) => {
      const full = { ...patch, updatedAt: now() };
      set((s) => ({
        periods: s.periods.map((p) => (p.id === id ? { ...p, ...full } : p)),
      }));
      persist("period update", () => periodRepository.update(id, full));
    },

    removePeriod: (id) => {
      set((s) => ({
        periods: s.periods.filter((p) => p.id !== id),
        clientRows: s.clientRows.filter((r) => r.periodId !== id),
      }));
      persist("period deletion", () => periodRepository.deleteCascade(id));
    },
  };
};
