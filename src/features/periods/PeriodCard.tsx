import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../app/store";
import { computePeriodTotals, formatMoney } from "../../shared/lib/calc";
import { formatPeriodDate, dateRangesOverlap, isPeriodCurrentToday } from "../../shared/lib/dates";
import { confirmDialog } from "../../shared/modal/modalStore";
import { getPeriodById, getGroupById, getRowsForPeriod } from "../../shared/lib/entityLookup";
import { ClientRowItem } from "../clients/ClientRowItem";
import styles from "./PeriodCard.module.css";

export function PeriodCard({ periodId }: { periodId: string }) {
  const period = useAppStore((s) => getPeriodById(s.periods, periodId));
  const group = useAppStore((s) => (period ? getGroupById(s.groups, period.groupId) : undefined));
  const allPeriods = useAppStore((s) => s.periods);
  const allClientRows = useAppStore((s) => s.clientRows);
  const updatePeriod = useAppStore((s) => s.updatePeriod);
  const removePeriod = useAppStore((s) => s.removePeriod);
  const addPeriod = useAppStore((s) => s.addPeriod);
  const addClientRow = useAppStore((s) => s.addClientRow);
  const confirmDestructive = useAppStore((s) => s.settings.confirmDestructiveActions);
  const expandPeriodId = useAppStore((s) => s.expandPeriodId);
  const clearExpandPeriodRequest = useAppStore((s) => s.clearExpandPeriodRequest);

  // Periods start collapsed by default (matching the old app), but if
  // Review/Search just navigated here for a specific row, force this
  // period open instead — otherwise the row it's trying to reveal would
  // stay hidden.
  const [collapsed, setCollapsed] = useState(() => expandPeriodId !== periodId);
  // Manual reorder mode, toggled by the checkbox next to the group pill —
  // shows up/down move buttons on each client row while checked. Local
  // UI state only (not persisted) — turning it off just hides the
  // buttons again; whatever order the rows ended up in stays as-is,
  // since moveClientRow already persists each swap immediately.
  const [sortMode, setSortMode] = useState(false);

  useEffect(() => {
    if (expandPeriodId === periodId) {
      setCollapsed(false);
      clearExpandPeriodRequest();
    }
  }, [expandPeriodId, periodId, clearExpandPeriodRequest]);

  const rows = useMemo(
    () => getRowsForPeriod(allClientRows, periodId),
    [allClientRows, periodId]
  );

  if (!period || !group) return null;

  const totals = computePeriodTotals(period, rows, group.defaultRate);

  async function handleRemovePeriod() {
    if (
      confirmDestructive &&
      !(await confirmDialog("Delete this period and all its clients?", { danger: true }))
    ) {
      return;
    }
    removePeriod(periodId);
  }

  async function handleDateChange(field: "fromDate" | "toDate", value: string) {
    if (!period) return;
    const nextValue = value || null;
    const nextFrom = field === "fromDate" ? nextValue : period.fromDate;
    const nextTo = field === "toDate" ? nextValue : period.toDate;

    const overlapsWith = allPeriods.find(
      (p) =>
        p.id !== period.id &&
        p.groupId === period.groupId &&
        dateRangesOverlap(nextFrom, nextTo, p.fromDate, p.toDate)
    );

    if (overlapsWith) {
      const label = `${formatPeriodDate(overlapsWith.fromDate)} → ${formatPeriodDate(overlapsWith.toDate)}`;
      const proceed = await confirmDialog(
        `This date range overlaps with another period in this group (${label}). Continue anyway?`
      );
      if (!proceed) return;
    }

    updatePeriod(period.id, { [field]: nextValue });
  }

  return (
    <section className={styles.card}>
      <button
        className={isPeriodCurrentToday(period) ? styles.collapseBtnCurrent : styles.collapseBtn}
        type="button"
        data-testid="period-collapse-btn"
        onClick={() => setCollapsed((v) => !v)}
      >
        <span className={styles.collapseBtnLead}>
          <span className={styles.collapseBtnTitle}>Period</span>
          <span className={styles.groupTag}>{group.name}</span>
          {period.carNumber && <span className={styles.carTag}>🚗 {period.carNumber}</span>}
        </span>
        <span className={styles.meta}>
          {formatPeriodDate(period.fromDate)} → {formatPeriodDate(period.toDate)}
        </span>
        <span className={styles.chevron}>{collapsed ? "▸" : "▾"}</span>
      </button>

      {!collapsed && (
        <>
          <div className={styles.body}>
            <h3 className={styles.sectionTitle}>Period</h3>

            <div className={styles.topFields}>
              <span className={styles.groupPill}>Group: {group.name}</span>
              <label className={styles.sortToggle}>
                <input
                  type="checkbox"
                  checked={sortMode}
                  onChange={(e) => setSortMode(e.target.checked)}
                />
                <span>Sort clients</span>
              </label>
              <div className={styles.numberFieldsRow}>
                <label className={styles.narrowField}>
                  <span>Paid Weeks</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={period.paidWeeks ?? ""}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      updatePeriod(period.id, { paidWeeks: digits === "" ? null : Number(digits) });
                    }}
                  />
                </label>
                <label className={styles.narrowField}>
                  <span>Car Number</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="chrome-off"
                    placeholder="—"
                    value={period.carNumber ?? ""}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      updatePeriod(period.id, { carNumber: digits || null });
                    }}
                  />
                </label>
              </div>
            </div>

            <div className={styles.dateFields}>
              <label className={styles.field}>
                <span>From</span>
                <input
                  type="date"
                  value={period.fromDate ?? ""}
                  onChange={(e) => handleDateChange("fromDate", e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>To</span>
                <input
                  type="date"
                  value={period.toDate ?? ""}
                  onChange={(e) => handleDateChange("toDate", e.target.value)}
                />
              </label>
            </div>

            <div className={styles.actions}>
              <button className={styles.btnPrimary} type="button" onClick={() => addClientRow(period.id)}>
                + Add client
              </button>
              <button className={styles.btnDanger} type="button" onClick={handleRemovePeriod}>
                Remove period
              </button>
              <button
                className={styles.btnSecondary}
                type="button"
                onClick={() => addPeriod(period.groupId)}
              >
                + Add period
              </button>
            </div>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Gross</th>
                  <th>Net</th>
                  <th>City</th>
                  <th>Done</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <ClientRowItem
                    key={row.id}
                    rowId={row.id}
                    sortMode={sortMode}
                    isFirst={index === 0}
                    isLast={index === rows.length - 1}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className={styles.totalLabel}>Total</td>
                  <td data-testid="period-total-gross">
                    <span className="js-money">{formatMoney(totals.gross)}</span>
                  </td>
                  <td data-testid="period-total-net">
                    <span className="js-money">{formatMoney(totals.net)}</span>
                  </td>
                  <td colSpan={3}>
                    My €:{" "}
                    <b data-testid="period-total-my-eur">
                      <span className="js-money">{formatMoney(totals.myEur)}</span>
                    </b>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
