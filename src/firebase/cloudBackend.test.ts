import { describe, it, expect } from "vitest";
import { createInMemoryCloudBackend } from "./cloudBackend";
import { buildCloudSnapshot } from "./cloudSnapshot";
import type { AppSettings } from "../shared/types/domain";

const settings: AppSettings = {
  id: "app",
  defaultRate: 13.5,
  defaultSalary: 0,
  currencySymbol: "€",
  confirmDestructiveActions: true,
};

describe("CloudBackend history (restore-source picker support)", () => {
  it("starts with no history entries", async () => {
    const backend = createInMemoryCloudBackend(null);
    expect(await backend.listHistory()).toEqual([]);
  });

  it("writeHistorySnapshot records an entry that can be read back", async () => {
    const backend = createInMemoryCloudBackend(null);
    const snapshot = buildCloudSnapshot(
      [{ id: "g1", name: "G", archived: false, defaultRate: 10, defaultSalary: 0, currentCarNumber: null, createdAt: 0, updatedAt: 0 }],
      [],
      [],
      settings,
      "2026-08-01T10:00:00.000Z"
    );

    await backend.writeHistorySnapshot(snapshot);
    const history = await backend.listHistory();

    expect(history).toHaveLength(1);
    const readBack = await backend.readHistorySnapshot(history[0].id);
    expect(readBack).toEqual(snapshot);
  });

  it("a second write on the same day overwrites that day's entry (one entry per day)", async () => {
    const backend = createInMemoryCloudBackend(null);
    const first = buildCloudSnapshot([], [], [], settings, "2026-08-01T09:00:00.000Z");
    const second = buildCloudSnapshot(
      [{ id: "g1", name: "G", archived: false, defaultRate: 10, defaultSalary: 0, currentCarNumber: null, createdAt: 0, updatedAt: 0 }],
      [],
      [],
      settings,
      "2026-08-01T11:00:00.000Z"
    );

    await backend.writeHistorySnapshot(first);
    await backend.writeHistorySnapshot(second);

    const history = await backend.listHistory();
    expect(history).toHaveLength(1);
    const readBack = await backend.readHistorySnapshot(history[0].id);
    expect(readBack?.groups).toHaveLength(1); // the second (latest) write won
  });

  it("readHistorySnapshot returns null for an id that was never written", async () => {
    const backend = createInMemoryCloudBackend(null);
    expect(await backend.readHistorySnapshot("2020-01-01")).toBeNull();
  });
});
