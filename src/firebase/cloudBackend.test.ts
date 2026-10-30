import { afterEach, describe, it, expect, vi } from "vitest";
import {
  CLOUD_RETENTION_MONTHS,
  HISTORY_MAX_ENTRIES,
  computeExpireAt,
  createInMemoryCloudBackend,
} from "./cloudBackend";
import { buildCloudSnapshot } from "./cloudSnapshot";
import type { AppSettings } from "../shared/types/domain";

const settings: AppSettings = {
  id: "app",
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
      [{ id: "g1", name: "G", archived: false, defaultSalary: 0, currentCarNumber: null, createdAt: 0, updatedAt: 0 }],
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
      [{ id: "g1", name: "G", archived: false, defaultSalary: 0, currentCarNumber: null, createdAt: 0, updatedAt: 0 }],
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

describe("CloudBackend history retention — max 30 daily copies", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps at most 30 daily copies; writing more drops the oldest first", async () => {
    vi.useFakeTimers();
    const backend = createInMemoryCloudBackend(null);

    // 35 consecutive days, one write per day.
    for (let day = 1; day <= 35; day++) {
      vi.setSystemTime(new Date(Date.UTC(2026, 0, day, 12)));
      await backend.writeHistorySnapshot(
        buildCloudSnapshot([], [], [], settings, `2026-01-${String(day).padStart(2, "0")}T12:00:00.000Z`)
      );
    }

    const ids = (await backend.listHistory()).map((h) => h.id);
    expect(ids).toHaveLength(HISTORY_MAX_ENTRIES);
    expect(ids[0]).toBe("2026-02-04"); // newest (day 35 of the run) first
    expect(ids[ids.length - 1]).toBe("2026-01-06"); // 30th-newest is the oldest left
    expect(await backend.readHistorySnapshot("2026-01-01")).toBeNull(); // trimmed
    expect(await backend.readHistorySnapshot("2026-01-05")).toBeNull(); // trimmed
    expect(await backend.readHistorySnapshot("2026-01-06")).not.toBeNull(); // kept
  });

  it("many saves on the same day still count as ONE copy toward the cap", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 5, 1, 9)));
    const backend = createInMemoryCloudBackend(null);

    for (let i = 0; i < 50; i++) {
      await backend.writeHistorySnapshot(buildCloudSnapshot([], [], [], settings, `2026-06-01T09:${String(i).padStart(2, "0")}:00.000Z`));
    }

    expect(await backend.listHistory()).toHaveLength(1);
  });
});

describe("CloudBackend expiry — cloud data expires after 6 months without use", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("computeExpireAt is exactly 6 calendar months out, clamping month-end days", () => {
    expect(CLOUD_RETENTION_MONTHS).toBe(6);
    expect(computeExpireAt(new Date(2026, 0, 15)).toDateString()).toBe(new Date(2026, 6, 15).toDateString());
    // Aug 31 + 6 months has no Feb 31 -> clamps to Feb 28 (2027 isn't a leap year).
    expect(computeExpireAt(new Date(2026, 7, 31)).toDateString()).toBe(new Date(2027, 1, 28).toDateString());
    // Year rollover.
    expect(computeExpireAt(new Date(2026, 10, 30)).toDateString()).toBe(new Date(2027, 4, 30).toDateString());
  });

  it("writing the main snapshot and a history copy both stamp a fresh 6-month expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 10, 12));
    const backend = createInMemoryCloudBackend(null);
    const snap = buildCloudSnapshot([], [], [], settings, "2026-03-10T12:00:00.000Z");

    await backend.writeMainSnapshot(snap);
    await backend.writeHistorySnapshot(snap);

    const expected = new Date(2026, 8, 10, 12).toISOString();
    expect(backend.getMainExpireAt()?.toISOString()).toBe(expected);
    const [entry] = await backend.listHistory();
    expect(backend.getHistoryExpireAt(entry.id)?.toISOString()).toBe(expected);
  });

  it("refreshExpiry pushes an existing main copy's expiry forward (app was used, nothing changed) — and does nothing when there's no copy", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 12));
    const snap = buildCloudSnapshot([], [], [], settings, "2026-01-01T12:00:00.000Z");
    const backend = createInMemoryCloudBackend(snap);
    const before = backend.getMainExpireAt()!.getTime();

    vi.setSystemTime(new Date(2026, 2, 1, 12)); // two months later, app just opened
    await backend.refreshExpiry();
    expect(backend.getMainExpireAt()!.getTime()).toBeGreaterThan(before);

    const empty = createInMemoryCloudBackend(null);
    await empty.refreshExpiry();
    expect(empty.getMainExpireAt()).toBeNull();
  });
});
