import type { StateCreator } from "zustand";
import { settingsRepository } from "../../../db/repositories/settingsRepository";
import type { AppSettings } from "../../../shared/types/domain";
import { createPersistHelper } from "../persistHelper";
import type { AppState } from "../types";

export const DEFAULT_SETTINGS: AppSettings = {
  id: "app",
  defaultRate: 13.5,
  defaultSalary: 0,
  currencySymbol: "€",
  confirmDestructiveActions: true,
};

export interface SettingsSlice {
  settings: AppSettings;

  updateSettings: (patch: Partial<Omit<AppSettings, "id">>) => void;
}

export const createSettingsSlice: StateCreator<AppState, [], [], SettingsSlice> = (set, get) => {
  const persist = createPersistHelper(set);

  return {
    settings: DEFAULT_SETTINGS,

    updateSettings: (patch) => {
      const full = { ...get().settings, ...patch };
      set({ settings: full });
      persist("settings", () => settingsRepository.put(full));
    },
  };
};
