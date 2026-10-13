import { describe, it, expect } from "vitest";
import { createInMemoryCloudBackend } from "./cloudBackend";
import { determineAndPerformCloudSync, applyCloudSyncChoice } from "./cloudSyncEngine";
import { buildCloudSnapshot, type CloudSnapshot } from "./cloudSnapshot";
import type { AppSettings } from "../shared/types/domain";

const settings: AppSettings = {
  id: "app",
  defaultRate: 13.5,
  defaultSalary: 0,
  currencySymbol: "€",
  confirmDestructiveActions: true,
};

function makeSnapshot(dataUpdatedAt: string, groupCount = 1): CloudSnapshot {
  const groups = Array.from({ length: groupCount }, (_, i) => ({
    id: `g${i}`,
    name: `Group ${i}`,
    archived: false,
    defaultRate: 10,
    defaultSalary: 0,
    currentCarNumber: null,
    createdAt: 0,
    updatedAt: 0,
  }));
  return buildCloudSnapshot(groups, [], [], settings, dataUpdatedAt);
}

describe("Cloud sync — first device (this device has data, cloud never written to)", () => {
  it("pushes local data to the cloud and the cloud now reflects it", async () => {
    const backend = createInMemoryCloudBackend(null);
    const localSnapshot = makeSnapshot("2026-08-01T10:00:00.000Z");

    const outcome = await determineAndPerformCloudSync(backend, {
      hasData: true,
      updatedAt: localSnapshot.dataUpdatedAt,
      snapshot: localSnapshot,
    });

    expect(outcome.decision).toBe("push");
    const stored = await backend.readMainSnapshot();
    expect(stored).toEqual(localSnapshot);
  });
});

describe("Cloud sync — new device (empty locally, cloud already has real data)", () => {
  it("returns a pull outcome with the cloud's data, and writes nothing", async () => {
    const cloudSnapshot = makeSnapshot("2026-07-15T09:00:00.000Z", 3);
    const backend = createInMemoryCloudBackend(cloudSnapshot);

    const emptyLocal = buildCloudSnapshot([], [], [], settings, "");
    const outcome = await determineAndPerformCloudSync(backend, {
      hasData: false,
      updatedAt: null,
      snapshot: emptyLocal,
    });

    expect(outcome.decision).toBe("pull");
    if (outcome.decision === "pull") {
      expect(outcome.snapshot.groups).toHaveLength(3);
      expect(outcome.snapshot).toEqual(cloudSnapshot);
    }
    expect(await backend.readMainSnapshot()).toEqual(cloudSnapshot);
  });
});

describe("Cloud sync — offline changes (local edited while offline, then reconnects)", () => {
  it("pushes local once back online, since local moved and the cloud didn't", async () => {
    const staleCloud = makeSnapshot("2026-08-01T08:00:00.000Z");
    const backend = createInMemoryCloudBackend(staleCloud);

    const editedWhileOffline = makeSnapshot("2026-08-01T12:45:00.000Z", 2);

    const outcome = await determineAndPerformCloudSync(backend, {
      hasData: true,
      updatedAt: editedWhileOffline.dataUpdatedAt,
      snapshot: editedWhileOffline,
    });

    expect(outcome.decision).toBe("push");
    const stored = await backend.readMainSnapshot();
    expect(stored?.groups).toHaveLength(2);
  });

  it("pulls cloud data if ANOTHER device pushed newer data while this one was offline", async () => {
    const newerCloud = makeSnapshot("2026-08-01T15:00:00.000Z", 5);
    const backend = createInMemoryCloudBackend(newerCloud);

    const thisDevicesLastKnownState = makeSnapshot("2026-08-01T08:00:00.000Z");

    const outcome = await determineAndPerformCloudSync(backend, {
      hasData: true,
      updatedAt: thisDevicesLastKnownState.dataUpdatedAt,
      snapshot: thisDevicesLastKnownState,
    });

    expect(outcome.decision).toBe("pull");
    if (outcome.decision === "pull") {
      expect(outcome.snapshot.groups).toHaveLength(5);
    }
  });
});

describe("Cloud sync — already in sync (equal timestamps), plus the still-available manual conflict-resolution path", () => {
  it("returns an 'in-sync' outcome with the shared timestamp when both sides tie, and touches nothing", async () => {
    const tie = "2026-08-01T10:00:00.000Z";
    const cloudSnapshot = makeSnapshot(tie, 4);
    const backend = createInMemoryCloudBackend(cloudSnapshot);
    const localSnapshot = makeSnapshot(tie, 2);

    const outcome = await determineAndPerformCloudSync(backend, {
      hasData: true,
      updatedAt: tie,
      snapshot: localSnapshot,
    });

    expect(outcome.decision).toBe("in-sync");
    if (outcome.decision === "in-sync") {
      expect(outcome.updatedAt).toBe(tie);
    }
    // Neither side was written to — the cloud still has its own original
    // data (4 groups), not overwritten by local's 2.
    expect(await backend.readMainSnapshot()).toEqual(cloudSnapshot);
  });

  it("applyCloudSyncChoice('keep-local') pushes local and overwrites the cloud", async () => {
    const tie = "2026-08-01T10:00:00.000Z";
    const backend = createInMemoryCloudBackend(makeSnapshot(tie, 4));
    const localSnapshot = makeSnapshot(tie, 2);

    const outcome = await applyCloudSyncChoice(backend, "keep-local", localSnapshot);
    expect(outcome.decision).toBe("push");
    expect((await backend.readMainSnapshot())?.groups).toHaveLength(2);
  });

  it("applyCloudSyncChoice('use-cloud') pulls the cloud's data instead", async () => {
    const tie = "2026-08-01T10:00:00.000Z";
    const backend = createInMemoryCloudBackend(makeSnapshot(tie, 4));
    const localSnapshot = makeSnapshot(tie, 2);

    const outcome = await applyCloudSyncChoice(backend, "use-cloud", localSnapshot);
    expect(outcome.decision).toBe("pull");
    if (outcome.decision === "pull") {
      expect(outcome.snapshot.groups).toHaveLength(4);
    }
    expect((await backend.readMainSnapshot())?.groups).toHaveLength(4);
  });
});

describe("Cloud sync — data integrity", () => {
  it("a pushed snapshot preserves every group/period/row field exactly, including ids", async () => {
    const backend = createInMemoryCloudBackend(null);
    const snapshot = buildCloudSnapshot(
      [
        {
          id: "g-archived",
          name: "Archived Group",
          archived: true,
          defaultRate: 20,
          defaultSalary: 400,
          currentCarNumber: null,
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      [
        {
          id: "p1",
          groupId: "g-archived",
          fromDate: "2026-01-01",
          toDate: "2026-01-31",
          paidWeeks: 3,
          carNumber: null,
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      [
        {
          id: "r1",
          periodId: "p1",
          customer: "Preserved Client",
          gross: "1500",
          net: "1200",
          city: "Batumi",
          status: "done",
          comment: "must survive the round trip",
          visitDate: null,
          visitDays: null,
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      settings,
      "2026-08-01T10:00:00.000Z"
    );

    await determineAndPerformCloudSync(backend, {
      hasData: true,
      updatedAt: snapshot.dataUpdatedAt,
      snapshot,
    });

    const stored = await backend.readMainSnapshot();
    expect(stored).toEqual(snapshot);
    expect(stored?.groups[0].archived).toBe(true);
    expect(stored?.clientRows[0].comment).toBe("must survive the round trip");
  });
});
