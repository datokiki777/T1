import { describe, it, expect } from "vitest";
import {
  isLegacyBackup,
  migrateLegacyAppState,
  parseAnyBackupFormat,
} from "./legacyMigration";
import { buildBackupPayload } from "./backup";
import { computeGrandTotals, computeGroupFinancials } from "./calc";
import {
  legacyWrappedBackup,
  legacyUnwrappedBackup,
} from "./__fixtures__/legacyBackupSample";

describe("isLegacyBackup — detects both old-app export shapes", () => {
  it("detects the wrapped { __type, data } shape", () => {
    expect(isLegacyBackup(legacyWrappedBackup)).toBe(legacyWrappedBackup.data);
  });

  it("detects the raw/unwrapped appState shape", () => {
    expect(isLegacyBackup(legacyUnwrappedBackup)).toBe(legacyUnwrappedBackup);
  });

  it("does not misidentify the current app's own backup format", () => {
    const current = buildBackupPayload([], [], []);
    expect(isLegacyBackup(current)).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(isLegacyBackup(null)).toBeNull();
    expect(isLegacyBackup("a string")).toBeNull();
    expect(isLegacyBackup({ foo: "bar" })).toBeNull();
    expect(isLegacyBackup([1, 2, 3])).toBeNull();
  });
});

describe("migrateLegacyAppState — 100% data fidelity from the real old-app shape", () => {
  const result = migrateLegacyAppState(legacyWrappedBackup.data);

  it("migrates every group, preserving id/name/archived and rate/salary", () => {
    expect(result.groups).toHaveLength(2);

    const groupA = result.groups.find((g) => g.id === "grp-1")!;
    expect(groupA.name).toBe("Client Group A");
    expect(groupA.archived).toBe(false);
    expect(groupA.defaultRate).toBe(13.5);
    expect(groupA.defaultSalary).toBe(400);

    const groupB = result.groups.find((g) => g.id === "grp-2")!;
    expect(groupB.name).toBe("Archived Group B");
    expect(groupB.archived).toBe(true);
    expect(groupB.defaultRate).toBe(20);
    // Legacy alias field "defaultSalaryAmount" must still be picked up.
    expect(groupB.defaultSalary).toBe(150);
  });

  it("migrates every period, preserving id/dates/paidWeeks and group linkage", () => {
    expect(result.periods).toHaveLength(3);

    const per1 = result.periods.find((p) => p.id === "per-1")!;
    expect(per1.groupId).toBe("grp-1");
    expect(per1.fromDate).toBe("2025-01-01");
    expect(per1.toDate).toBe("2025-01-31");
    expect(per1.paidWeeks).toBe(3);

    const per2 = result.periods.find((p) => p.id === "per-2")!;
    expect(per2.toDate).toBeNull(); // empty string "to" -> null
    expect(per2.paidWeeks).toBeNull(); // empty string paidWeeks -> null

    const per3 = result.periods.find((p) => p.id === "per-3")!;
    expect(per3.groupId).toBe("grp-2");
  });

  it("migrates every client row with exact ids, values, statuses, and comments", () => {
    expect(result.clientRows).toHaveLength(7);

    const row1 = result.clientRows.find((r) => r.id === "row-1")!;
    expect(row1.periodId).toBe("per-1");
    expect(row1.customer).toBe("Acme Corp");
    expect(row1.city).toBe("Tbilisi");
    expect(row1.gross).toBe("1234.56");
    expect(row1.net).toBe("987.65");
    expect(row1.comment).toBe("Wants a follow-up call next month");
    expect(row1.status).toBe("done");

    const row3 = result.clientRows.find((r) => r.id === "row-3")!;
    expect(row3.status).toBe("wrong");

    const row4 = result.clientRows.find((r) => r.id === "row-4")!;
    expect(row4.status).toBe("fixed");
    expect(row4.city).toBe("");

    const row5 = result.clientRows.find((r) => r.id === "row-5")!;
    expect(row5.status).toBe("none");

    // European decimal-format money string is preserved verbatim (not parsed
    // or reformatted at migration time) — parsing happens later, at calc time.
    const row6 = result.clientRows.find((r) => r.id === "row-6")!;
    expect(row6.gross).toBe("1.234,56");
    expect(row6.comment).toBe("European decimal format");

    const row7 = result.clientRows.find((r) => r.id === "row-7")!;
    expect(row7.periodId).toBe("per-3");
    expect(row7.net).toBe("600");
  });

  it("the migration function itself copies gross/net verbatim — rounding happens separately, at store init", () => {
    const row1 = result.clientRows.find((r) => r.id === "row-1")!;
    expect(row1.gross).toBe("1234.56"); // raw string preserved by the migrator itself
    const row4 = result.clientRows.find((r) => r.id === "row-4")!;
    expect(row4.gross).toBe("250.25");
  });

  it("is lenient about missing fields, mirroring the old app's own normalizeGroupData", () => {
    const sparse = { groups: [{ id: "g1" }] };
    const result2 = migrateLegacyAppState(sparse);
    expect(result2.groups).toHaveLength(1);
    expect(result2.groups[0].name).toBe("Group");
    expect(result2.groups[0].defaultRate).toBe(13.5);
    expect(result2.groups[0].defaultSalary).toBe(0);
    expect(result2.periods).toHaveLength(0);
  });

  it("generates ids for groups/periods/rows that are missing them", () => {
    const noIds = {
      groups: [
        {
          name: "No Ids",
          data: { periods: [{ from: "2025-01-01", rows: [{ customer: "X" }] }] },
        },
      ],
    };
    const result2 = migrateLegacyAppState(noIds);
    expect(result2.groups[0].id).toBeTruthy();
    expect(result2.periods[0].id).toBeTruthy();
    expect(result2.periods[0].groupId).toBe(result2.groups[0].id);
    expect(result2.clientRows[0].id).toBeTruthy();
    expect(result2.clientRows[0].periodId).toBe(result2.periods[0].id);
  });
});

describe("Legacy migration MUST import archived groups too, not just the active workspace", () => {
  // Everything below is computed independently, by hand, from the raw
  // legacyWrappedBackup fixture above — not derived from the migration
  // code — so this test genuinely confirms the migrated data against the
  // source JSON rather than just re-checking the migrator against itself.
  const result = parseAnyBackupFormat(legacyWrappedBackup);
  if (!result.ok) throw new Error("fixture must migrate successfully");
  const { groups, periods, clientRows } = result.data;

  it("imports every group from the file — active AND archived — never just the active workspace", () => {
    // Source JSON has exactly 2 groups: grp-1 (active), grp-2 (archived).
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.id).sort()).toEqual(["grp-1", "grp-2"]);
  });

  it("preserves each group's archived flag exactly as in the source JSON", () => {
    const active = groups.find((g) => g.id === "grp-1")!;
    const archived = groups.find((g) => g.id === "grp-2")!;
    expect(active.archived).toBe(false);
    expect(archived.archived).toBe(true);
  });

  it("Active/Archive counts after import match the source JSON exactly", () => {
    const activeCount = groups.filter((g) => !g.archived).length;
    const archivedCount = groups.filter((g) => g.archived).length;
    // Source JSON: 1 group with archived:false, 1 group with archived:true.
    expect(activeCount).toBe(1);
    expect(archivedCount).toBe(1);
  });

  it("imports every period and every client row belonging to the archived group", () => {
    const archivedGroupPeriods = periods.filter((p) => p.groupId === "grp-2");
    expect(archivedGroupPeriods).toHaveLength(1); // per-3

    const archivedPeriodIds = new Set(archivedGroupPeriods.map((p) => p.id));
    const archivedGroupRows = clientRows.filter((r) => archivedPeriodIds.has(r.periodId));
    expect(archivedGroupRows).toHaveLength(1); // row-7
  });

  it("preserves comment, status, amounts and dates inside the archived group untouched", () => {
    const per3 = periods.find((p) => p.id === "per-3")!;
    expect(per3.fromDate).toBe("2024-06-01");
    expect(per3.toDate).toBe("2024-06-14");
    expect(per3.paidWeeks).toBe(2);

    const row7 = clientRows.find((r) => r.id === "row-7")!;
    expect(row7.customer).toBe("Old Client");
    expect(row7.city).toBe("Zugdidi");
    expect(row7.gross).toBe("800");
    expect(row7.net).toBe("600");
    expect(row7.status).toBe("done");
    expect(row7.comment).toBe("Long-time repeat customer");
  });

  it("total group/period/client counts across BOTH workspaces match the source JSON", () => {
    // Source JSON: 2 groups, 3 periods total (2 in grp-1 + 1 in grp-2),
    // 7 client rows total (5 + 1 in grp-1's two periods, 1 in grp-2).
    expect(groups).toHaveLength(2);
    expect(periods).toHaveLength(3);
    expect(clientRows).toHaveLength(7);
  });

  it("financial totals computed from the migrated data match hand-computed totals from the source JSON", () => {
    // The app rounds Gross/Net to whole numbers (no cents anywhere), so
    // every amount below is first rounded before any math happens on it.
    //
    // grp-1 (active, rate 13.5%): per-1 excludes row-3 ("wrong"), sums the
    // rest; per-2 has one row with a European-decimal gross ("1.234,56").
    //   per-1: row-1 gross 1234.56->1235, net 987.65->988 (base=net)
    //          row-2 gross 500 (base=gross)
    //          row-4 gross 250.25->250 (base=gross)
    //          row-5 gross 10 (base=gross)
    //   per-1 gross = 1235 + 500 + 250 + 10 = 1995
    //   per-1 net   = 988
    //   per-1 my€   = 988*.135 + 500*.135 + 250*.135 + 10*.135
    //               = 133.38 + 67.5 + 33.75 + 1.35 = 235.98
    //   per-2: row-6 gross 1.234,56 -> 1234.56 -> 1235 (base=gross)
    //   per-2 gross = 1235, net = 0, my€ = 1235*.135 = 166.725
    //   grp-1 total: gross 3230, net 988, my€ 402.705
    //
    // grp-2 (archived, rate 20%): per-3 row-7 gross 800, net 600 (both
    // already whole), base=net -> my€ = 600*0.2 = 120
    //
    // Grand total: gross 4030, net 1588, my€ 522.705
    const grand = computeGrandTotals(groups, periods, clientRows);
    expect(grand.gross).toBe(4030);
    expect(grand.net).toBe(1588);
    expect(grand.myEur).toBeCloseTo(522.705, 2);

    // The archived group's own financials, in isolation, must also match —
    // proving archived-group money isn't silently dropped from totals.
    const archivedGroup = groups.find((g) => g.id === "grp-2")!;
    const archivedFinancials = computeGroupFinancials(archivedGroup, periods, clientRows);
    expect(archivedFinancials.gross).toBe(800);
    expect(archivedFinancials.net).toBe(600);
    expect(archivedFinancials.myEur).toBeCloseTo(120, 2);
  });
});

describe("parseAnyBackupFormat — single entry point, auto-detects & migrates", () => {
  it("accepts the wrapped legacy format and migrates it, never reporting 'invalid backup'", () => {
    const result = parseAnyBackupFormat(legacyWrappedBackup);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.migratedFromLegacy).toBe(true);
      expect(result.data.groups).toHaveLength(2);
      expect(result.data.clientRows).toHaveLength(7);
    }
  });

  it("accepts the unwrapped/raw legacy appState format too", () => {
    const result = parseAnyBackupFormat(legacyUnwrappedBackup);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.migratedFromLegacy).toBe(true);
      expect(result.data.groups).toHaveLength(2);
    }
  });

  it("accepts the current app's own backup format without migrating", () => {
    const current = buildBackupPayload(
      [
        {
          id: "g1",
          name: "G",
          archived: false,
          defaultRate: 10,
          defaultSalary: 0,
          currentCarNumber: null,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      [],
      []
    );
    const result = parseAnyBackupFormat(current);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.migratedFromLegacy).toBe(false);
      expect(result.data.groups).toHaveLength(1);
    }
  });

  it("still rejects genuinely invalid/unrelated JSON with a clear error", () => {
    const result = parseAnyBackupFormat({ hello: "world" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });

  it("produces a payload that itself validates successfully end-to-end", () => {
    const migrated = parseAnyBackupFormat(legacyWrappedBackup);
    expect(migrated.ok).toBe(true);
    if (migrated.ok) {
      // Round-trip through JSON like a real file read would.
      const roundTripped = JSON.parse(JSON.stringify(migrated.data));
      const reparsed = parseAnyBackupFormat(roundTripped);
      expect(reparsed.ok).toBe(true);
    }
  });
});
