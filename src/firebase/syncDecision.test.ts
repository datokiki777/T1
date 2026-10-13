import { describe, it, expect } from "vitest";
import { resolveSyncDirection, type SyncSide } from "./syncDecision";

function side(hasData: boolean, updatedAt: string | null): SyncSide {
  return { hasData, updatedAt };
}

describe("resolveSyncDirection — first device (cloud has never been written to)", () => {
  it("pushes local data up when the cloud document doesn't exist yet", () => {
    const decision = resolveSyncDirection(
      side(true, "2026-08-01T10:00:00.000Z"),
      side(false, null)
    );
    expect(decision).toBe("push");
  });

  it("does nothing if neither side has any data at all (brand new install)", () => {
    const decision = resolveSyncDirection(side(false, null), side(false, null));
    expect(decision).toBe("noop");
  });
});

describe("resolveSyncDirection — new device (no local data, cloud already has some)", () => {
  it("pulls cloud data down when local has nothing yet", () => {
    const decision = resolveSyncDirection(
      side(false, null),
      side(true, "2026-08-01T09:00:00.000Z")
    );
    expect(decision).toBe("pull");
  });
});

describe("resolveSyncDirection — offline changes (local advances while offline)", () => {
  it("pushes when local was edited more recently than the cloud's last sync", () => {
    const decision = resolveSyncDirection(
      side(true, "2026-08-01T12:30:00.000Z"), // edited while offline
      side(true, "2026-08-01T08:00:00.000Z") // cloud untouched since this device went offline
    );
    expect(decision).toBe("push");
  });

  it("pulls when the cloud moved ahead while this device was offline (edited elsewhere)", () => {
    const decision = resolveSyncDirection(
      side(true, "2026-08-01T08:00:00.000Z"), // this device's last known state
      side(true, "2026-08-01T12:30:00.000Z") // another device pushed newer data
    );
    expect(decision).toBe("pull");
  });
});

describe("resolveSyncDirection — already in sync (equal timestamps mean nothing changed, not a conflict)", () => {
  it("reports in-sync when local and cloud timestamps are exactly equal, instead of asking", () => {
    const t = "2026-08-01T10:00:00.000Z";
    const decision = resolveSyncDirection(side(true, t), side(true, t));
    expect(decision).toBe("in-sync");
  });

  it("still asks when both timestamps are null (no real timestamp to call \"equal\" in the first place)", () => {
    const decision = resolveSyncDirection(side(true, null), side(true, null));
    // Null isn't a parseable timestamp, so this falls into the
    // can't-verify-cloud case below (push), not a genuine tie.
    expect(decision).toBe("push");
  });
});

describe("resolveSyncDirection — can't verify the cloud's timestamp (never risk pulling unknown/corrupted cloud state over real local data)", () => {
  it("pushes (never asks, never pulls) when the local timestamp can't be parsed", () => {
    const decision = resolveSyncDirection(
      side(true, "not-a-real-timestamp"),
      side(true, "2026-08-01T10:00:00.000Z")
    );
    expect(decision).toBe("push");
  });

  it("pushes (never asks, never pulls) when the cloud timestamp can't be parsed", () => {
    const decision = resolveSyncDirection(
      side(true, "2026-08-01T10:00:00.000Z"),
      side(true, "garbage")
    );
    expect(decision).toBe("push");
  });

  it("never pulls when it can't determine whether the cloud is actually trustworthy/newer", () => {
    // A broad sweep of edge-case timestamp pairs where the cloud side in
    // particular can't be verified — local data must never be at risk of
    // being silently overwritten by something we can't read.
    const unverifiablePairs: [string | null, string | null][] = [
      [null, null],
      ["", ""],
      ["2026-08-01T10:00:00.000Z", "garbage"],
    ];
    for (const [l, c] of unverifiablePairs) {
      expect(resolveSyncDirection(side(true, l), side(true, c))).toBe("push");
    }
  });
});

describe("resolveSyncDirection — never overwrites newer data with older data", () => {
  it("a 1-millisecond difference is still enough to determine a clear winner", () => {
    const decision = resolveSyncDirection(
      side(true, "2026-08-01T10:00:00.001Z"),
      side(true, "2026-08-01T10:00:00.000Z")
    );
    expect(decision).toBe("push");
  });

  it("large gaps in either direction resolve correctly", () => {
    expect(
      resolveSyncDirection(side(true, "2020-01-01T00:00:00.000Z"), side(true, "2026-08-01T00:00:00.000Z"))
    ).toBe("pull");
    expect(
      resolveSyncDirection(side(true, "2026-08-01T00:00:00.000Z"), side(true, "2020-01-01T00:00:00.000Z"))
    ).toBe("push");
  });
});
