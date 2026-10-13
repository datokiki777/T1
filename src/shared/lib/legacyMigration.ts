import type { ClientRow, DoneStatus, Group, Period } from "../types/domain";
import { generateId, now } from "./id";
import { clampRate } from "./money";
import { buildBackupPayload, validateBackupPayload, type ValidationResult } from "./backup";

const VALID_STATUSES: DoneStatus[] = ["none", "done", "fail", "fixed", "wrong"];

/**
 * Shape of a single row/period/group in the OLD vanilla-JS app's state
 * (js/03-state.js). Kept loose/partial on purpose — the old app itself is
 * extremely lenient about missing fields (see normalizeGroupData), and the
 * migration needs to be at least as forgiving so a real old backup never
 * gets rejected.
 */
interface LegacyRow {
  id?: string;
  customer?: string;
  city?: string;
  gross?: string | number;
  net?: string | number;
  comment?: string;
  done?: string;
}

interface LegacyPeriod {
  id?: string;
  from?: string;
  to?: string;
  paidWeeks?: string | number | null;
  rows?: LegacyRow[];
}

interface LegacyGroupData {
  defaultRatePercent?: number;
  defaultSalaryPer28Days?: number;
  /** Even-older alias used by some historical exports. */
  defaultSalaryAmount?: number;
  periods?: LegacyPeriod[];
}

interface LegacyGroup {
  id?: string;
  name?: string;
  archived?: boolean;
  data?: LegacyGroupData;
}

interface LegacyAppState {
  activeGroupId?: string;
  groups?: LegacyGroup[];
}

/**
 * Detects whether `json` is the old vanilla-JS app's export format, in
 * either shape it ever used:
 *  - wrapped:   { __type: "client_totals_all_groups", data: {...} }
 *  - unwrapped: the raw appState itself: { groups: [...], activeGroupId }
 * Matches the exact acceptance check from the old app's own
 * handleImportJsonChange() in js/16-import-export.js.
 */
export function isLegacyBackup(json: unknown): LegacyAppState | null {
  if (typeof json !== "object" || json === null) return null;
  const obj = json as Record<string, unknown>;

  if (obj.__type === "client_totals_all_groups" && typeof obj.data === "object" && obj.data !== null) {
    return obj.data as LegacyAppState;
  }

  if (Array.isArray(obj.groups) && typeof obj.activeGroupId === "string") {
    return obj as LegacyAppState;
  }

  return null;
}

function toStatus(done: string | undefined): DoneStatus {
  return VALID_STATUSES.includes(done as DoneStatus) ? (done as DoneStatus) : "none";
}

function toPaidWeeks(value: string | number | null | undefined): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

/**
 * Converts a parsed old-app appState into this app's relational schema.
 * Every group/period/row is preserved — nothing is dropped or skipped,
 * including empty default rows, so this is a 100%-fidelity migration.
 * Money values (gross/net) are copied as-is (no rounding), unlike the old
 * app's own import which rounds them to whole numbers — decimals are an
 * explicit requirement here.
 */
export function migrateLegacyAppState(legacy: LegacyAppState): {
  groups: Group[];
  periods: Period[];
  clientRows: ClientRow[];
} {
  const groups: Group[] = [];
  const periods: Period[] = [];
  const clientRows: ClientRow[] = [];

  const legacyGroups = Array.isArray(legacy.groups) ? legacy.groups : [];

  for (const g of legacyGroups) {
    const groupId = g.id || generateId();
    const groupData = g.data ?? {};

    groups.push({
      id: groupId,
      name: (g.name ?? "Group").toString().trim() || "Group",
      archived: g.archived === true,
      defaultRate: clampRate(groupData.defaultRatePercent ?? 13.5),
      defaultSalary: Math.max(
        0,
        Number(groupData.defaultSalaryPer28Days ?? groupData.defaultSalaryAmount ?? 0) || 0
      ),
      currentCarNumber: null,
      createdAt: now(),
      updatedAt: now(),
    });

    const legacyPeriods = Array.isArray(groupData.periods) ? groupData.periods : [];

    for (const p of legacyPeriods) {
      const periodId = p.id || generateId();

      periods.push({
        id: periodId,
        groupId,
        fromDate: p.from || null,
        toDate: p.to || null,
        paidWeeks: toPaidWeeks(p.paidWeeks),
        carNumber: null,
        createdAt: now(),
        updatedAt: now(),
      });

      const legacyRows = Array.isArray(p.rows) ? p.rows : [];

      for (const r of legacyRows) {
        clientRows.push({
          id: r.id || generateId(),
          periodId,
          customer: r.customer ?? "",
          city: r.city ?? "",
          gross: r.gross === undefined || r.gross === null ? "" : String(r.gross),
          net: r.net === undefined || r.net === null ? "" : String(r.net),
          comment: r.comment ?? "",
          status: toStatus(r.done),
          visitDate: null,
          visitDays: null,
          createdAt: now(),
          updatedAt: now(),
        });
      }
    }
  }

  return { groups, periods, clientRows };
}

export type ParsedBackupResult =
  | { ok: true; data: ReturnType<typeof buildBackupPayload>; migratedFromLegacy: boolean }
  | { ok: false; error: string };

/**
 * Single entry point for reading ANY backup file this app should accept:
 * auto-detects the current React format vs either shape of the old
 * vanilla-JS format, migrates legacy data transparently, and always
 * returns data in the current internal structure ready to import.
 */
export function parseAnyBackupFormat(json: unknown): ParsedBackupResult {
  const currentFormat: ValidationResult = validateBackupPayload(json);
  if (currentFormat.ok) {
    return { ok: true, data: currentFormat.data, migratedFromLegacy: false };
  }

  const legacy = isLegacyBackup(json);
  if (legacy) {
    const { groups, periods, clientRows } = migrateLegacyAppState(legacy);
    const migrated = buildBackupPayload(groups, periods, clientRows);

    // Defensive re-validation of our own migration output — should always
    // pass since we control construction, but this guarantees the result
    // can never violate referential integrity even from unusual legacy data.
    const revalidated = validateBackupPayload(migrated);
    if (!revalidated.ok) {
      return {
        ok: false,
        error: `Legacy file conversion failed: ${revalidated.error}`,
      };
    }

    return { ok: true, data: revalidated.data, migratedFromLegacy: true };
  }

  return currentFormat;
}
