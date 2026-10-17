// Domain types — core data model, shared across features.

export type DoneStatus = "none" | "done" | "fail" | "fixed" | "wrong" | "unpaid";

export interface Group {
  id: string;
  name: string;
  archived: boolean;
  // Salary lives on the GROUP — every period in the group shares it.
  defaultSalary: number; // per 28 days
  /** The car currently assigned to this group — digits only, stored as
   * a string (not a number) so leading zeros are never silently
   * stripped. This is the group's "current" value only: changing it
   * only affects periods created from now on. Existing periods keep
   * whatever car they already recorded, so past work never silently
   * gets relabeled with a car it wasn't actually done with. */
  currentCarNumber: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Period {
  id: string;
  groupId: string;
  fromDate: string | null; // ISO date (YYYY-MM-DD)
  toDate: string | null;
  paidWeeks: number | null;
  /** This period's own car — copied from the group's currentCarNumber
   * automatically when the period is created, then fully independent
   * (editing it here never touches the group's current value, and
   * changing the group's current value later never touches this). */
  carNumber: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ClientRow {
  id: string;
  periodId: string;
  customer: string;
  amount: string; // raw text, exactly like the old app — "" means not entered
  expense: string; // raw text — "" means not entered
  city: string;
  status: DoneStatus;
  comment: string;
  /** ISO date (YYYY-MM-DD) or null — the day this client's job happened/
   * started. Purely informational: never affects any calculation, only
   * shown + editable via the calendar icon on the row/card. */
  visitDate: string | null;
  /** How many days this client's job took (1-10) — set via the 1-5
   * buttons alongside visitDate. Purely informational, same as
   * visitDate. */
  visitDays: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface PeriodTotals {
  amount: number;
  expense: number;
  /** Amount − Expense − salary owed for the recorded days. */
  myEur: number;
  unpaid: number;
  /** Salary owed for the days of the recorded clients (subtracted in My €). */
  salary: number;
}

export interface StatusCounts {
  done: number;
  fail: number;
  fixed: number;
  wrong: number;
  unpaid: number;
}

export interface GroupFinancials extends PeriodTotals {
  /** Total monthly salary owed across the group's salary months. */
  salary: number;
  /** Σ over salary months of (Unpaid − Expense − monthly Salary). */
  income: number;
  salaryMonths: number;
  /** Clients with money entered but no usable date — not part of Income. */
  undatedRows: number;
}

export interface AppSettings {
  id: "app"; // singleton row
  defaultSalary: number;
  /** Display-only currency symbol — never affects stored numeric values. */
  currencySymbol: string;
  /** Whether destructive actions (delete group/period/row) ask for confirmation. */
  confirmDestructiveActions: boolean;
}

/** Per-device "have I already unlocked this PIN once" flag. Deliberately
 * NOT part of AppSettings/the cloud snapshot — every new device must
 * verify the PIN itself, exactly like the old app's per-device
 * "pinVerified" IndexedDB flag. */
export interface DeviceSecurity {
  id: "device";
  verified: boolean;
}
