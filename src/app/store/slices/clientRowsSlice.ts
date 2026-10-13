import type { StateCreator } from "zustand";
import { clientRowRepository } from "../../../db/repositories/clientRowRepository";
import { generateId, now } from "../../../shared/lib/id";
import type { ClientRow, DoneStatus } from "../../../shared/types/domain";
import { createPersistHelper } from "../persistHelper";
import type { AppState } from "../types";

const STATUS_CYCLE: DoneStatus[] = ["none", "done", "fail", "fixed", "wrong"];

export interface ClientRowsSlice {
  clientRows: ClientRow[];

  addClientRow: (periodId: string) => Promise<ClientRow>;
  updateClientRow: (id: string, patch: Partial<ClientRow>) => void;
  removeClientRow: (id: string) => void;
  cycleRowStatus: (id: string) => void;
  /** Manually reorders a row up/down among its period's siblings — swaps
   * createdAt with the adjacent row, since that's the field the display
   * order is already sorted by (see clientRowRepository.getAll()). Used
   * by the manual sort-mode toggle in Edit mode; a no-op at either end
   * of the list. */
  moveClientRow: (id: string, direction: "up" | "down") => void;
}

export const createClientRowsSlice: StateCreator<AppState, [], [], ClientRowsSlice> = (set, get) => {
  const persist = createPersistHelper(set);

  return {
    clientRows: [],

    addClientRow: async (periodId) => {
      const row: ClientRow = {
        id: generateId(),
        periodId,
        customer: "",
        gross: "",
        net: "",
        city: "",
        status: "none",
        comment: "",
        visitDate: null,
        visitDays: null,
        createdAt: now(),
        updatedAt: now(),
      };
      set((s) => ({ clientRows: [...s.clientRows, row] }));
      persist("client row", () => clientRowRepository.add(row));
      return row;
    },

    updateClientRow: (id, patch) => {
      const full = { ...patch, updatedAt: now() };
      set((s) => ({
        clientRows: s.clientRows.map((r) => (r.id === id ? { ...r, ...full } : r)),
      }));
      persist("client row update", () => clientRowRepository.update(id, full));
    },

    removeClientRow: (id) => {
      set((s) => ({ clientRows: s.clientRows.filter((r) => r.id !== id) }));
      persist("client row deletion", () => clientRowRepository.delete(id));
    },

    cycleRowStatus: (id) => {
      const row = get().clientRows.find((r) => r.id === id);
      if (!row) return;
      const idx = STATUS_CYCLE.indexOf(row.status);
      const nextStatus = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
      get().updateClientRow(id, { status: nextStatus });
    },

    moveClientRow: (id, direction) => {
      const row = get().clientRows.find((r) => r.id === id);
      if (!row) return;
      const siblings = get()
        .clientRows.filter((r) => r.periodId === row.periodId)
        .sort((a, b) => a.createdAt - b.createdAt);
      const index = siblings.findIndex((r) => r.id === id);
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= siblings.length) return;

      const other = siblings[swapIndex];
      const rowCreatedAt = row.createdAt;
      const otherCreatedAt = other.createdAt;

      set((s) => ({
        clientRows: s.clientRows.map((r) => {
          if (r.id === row.id) return { ...r, createdAt: otherCreatedAt };
          if (r.id === other.id) return { ...r, createdAt: rowCreatedAt };
          return r;
        }),
      }));
      persist("client row reorder", () =>
        Promise.all([
          clientRowRepository.update(row.id, { createdAt: otherCreatedAt }),
          clientRowRepository.update(other.id, { createdAt: rowCreatedAt }),
        ])
      );
    },
  };
};
