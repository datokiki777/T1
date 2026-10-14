import { upgradeLegacyRowFields } from "./legacyRowFields";
import type { ClientRow, DoneStatus, Group, Period } from "../types/domain";

export const BACKUP_VERSION = 1 as const;

export interface BackupPayload {
  __type: "t1-backup";
  version: 1;
  exportedAt: string;
  groups: Group[];
  periods: Period[];
  clientRows: ClientRow[];
}

export function buildBackupPayload(
  groups: Group[],
  periods: Period[],
  clientRows: ClientRow[]
): BackupPayload {
  return {
    __type: "t1-backup",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    groups,
    periods,
    clientRows,
  };
}

export type ValidationResult =
  | { ok: true; data: BackupPayload }
  | { ok: false; error: string };

const DONE_STATUSES: DoneStatus[] = ["none", "done", "fail", "fixed", "wrong", "unpaid"];

function isString(v: unknown): v is string {
  return typeof v === "string";
}
function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function isBoolean(v: unknown): v is boolean {
  return typeof v === "boolean";
}

function validateGroup(raw: unknown, index: number): string | null {
  if (typeof raw !== "object" || raw === null) return `groups[${index}] is not an object`;
  const g = raw as Record<string, unknown>;
  if (!isString(g.id)) return `groups[${index}].id must be a string`;
  if (!isString(g.name)) return `groups[${index}].name must be a string`;
  if (!isBoolean(g.archived)) return `groups[${index}].archived must be a boolean`;
  if (!isNumber(g.defaultSalary)) return `groups[${index}].defaultSalary must be a number`;
  return null;
}

function validatePeriod(raw: unknown, index: number, groupIds: Set<string>): string | null {
  if (typeof raw !== "object" || raw === null) return `periods[${index}] is not an object`;
  const p = raw as Record<string, unknown>;
  if (!isString(p.id)) return `periods[${index}].id must be a string`;
  if (!isString(p.groupId)) return `periods[${index}].groupId must be a string`;
  if (p.fromDate !== null && !isString(p.fromDate)) return `periods[${index}].fromDate must be a string or null`;
  if (p.toDate !== null && !isString(p.toDate)) return `periods[${index}].toDate must be a string or null`;
  if (p.paidWeeks !== null && !isNumber(p.paidWeeks)) return `periods[${index}].paidWeeks must be a number or null`;
  if (!groupIds.has(p.groupId as string)) {
    return `periods[${index}] references a group ("${p.groupId}") that does not exist in this file`;
  }
  return null;
}

function validateRow(raw: unknown, index: number, periodIds: Set<string>): string | null {
  if (typeof raw !== "object" || raw === null) return `clientRows[${index}] is not an object`;
  const r = raw as Record<string, unknown>;
  if (!isString(r.id)) return `clientRows[${index}].id must be a string`;
  if (!isString(r.periodId)) return `clientRows[${index}].periodId must be a string`;
  if (!isString(r.customer)) return `clientRows[${index}].customer must be a string`;
  if (!isString(r.amount)) return `clientRows[${index}].amount must be a string`;
  if (!isString(r.expense)) return `clientRows[${index}].expense must be a string`;
  if (!isString(r.city)) return `clientRows[${index}].city must be a string`;
  if (!isString(r.comment)) return `clientRows[${index}].comment must be a string`;
  if (!DONE_STATUSES.includes(r.status as DoneStatus)) {
    return `clientRows[${index}].status must be one of ${DONE_STATUSES.join(", ")}`;
  }
  if (!periodIds.has(r.periodId as string)) {
    return `clientRows[${index}] references a period ("${r.periodId}") that does not exist in this file`;
  }
  return null;
}

/**
 * Thoroughly validates an unknown parsed-JSON value as a backup file before
 * it's ever allowed to touch IndexedDB: top-level shape, every group/period/
 * row's required fields and types, and referential integrity (periods must
 * point at a group in the same file, rows at a period in the same file).
 */
export function validateBackupPayload(json: unknown): ValidationResult {
  if (typeof json !== "object" || json === null) {
    return { ok: false, error: "File is not a valid JSON object." };
  }

  const obj = json as Record<string, unknown>;

  if (!Array.isArray(obj.groups) || !Array.isArray(obj.periods) || !Array.isArray(obj.clientRows)) {
    return {
      ok: false,
      error: "Invalid backup format — 'groups', 'periods', and 'clientRows' arrays are required.",
    };
  }

  const groups = obj.groups as unknown[];
  const periods = obj.periods as unknown[];
  const clientRows = (obj.clientRows as unknown[]).map(upgradeLegacyRowFields);

  for (let i = 0; i < groups.length; i++) {
    const err = validateGroup(groups[i], i);
    if (err) return { ok: false, error: err };
  }

  const groupIds = new Set((groups as Group[]).map((g) => g.id));

  for (let i = 0; i < periods.length; i++) {
    const err = validatePeriod(periods[i], i, groupIds);
    if (err) return { ok: false, error: err };
  }

  const periodIds = new Set((periods as Period[]).map((p) => p.id));

  for (let i = 0; i < clientRows.length; i++) {
    const err = validateRow(clientRows[i], i, periodIds);
    if (err) return { ok: false, error: err };
  }

  // Older exports (from before currentCarNumber/carNumber existed) won't
  // have these keys at all — normalize them to null rather than leaving
  // them `undefined`, so every Group/Period in the app is consistently
  // typed regardless of which export version it came from.
  const normalizedGroups = (groups as Group[]).map((g) => ({
    ...g,
    currentCarNumber: g.currentCarNumber ?? null,
  }));
  const normalizedPeriods = (periods as Period[]).map((p) => ({
    ...p,
    carNumber: p.carNumber ?? null,
  }));
  const normalizedRows = (clientRows as ClientRow[]).map((r) => ({
    ...r,
    visitDate: r.visitDate ?? null,
    visitDays: r.visitDays ?? null,
  }));

  return {
    ok: true,
    data: {
      __type: "t1-backup",
      version: BACKUP_VERSION,
      exportedAt: isString(obj.exportedAt) ? obj.exportedAt : new Date().toISOString(),
      groups: normalizedGroups,
      periods: normalizedPeriods,
      clientRows: normalizedRows,
    },
  };
}
