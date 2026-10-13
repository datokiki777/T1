import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../app/store";
import {
  computeGrandTotals,
  computeMarkedClientsCount,
  computeMonthlyTotals,
  computeStatusCounts,
  formatMoney,
} from "../../shared/lib/calc";
import { formatCurrency } from "../../shared/lib/money";
import {
  formatDateForRange,
  formatMonthKey,
  formatPeriodDate,
  getAllMonthKeys,
  getDurationMonthsDays,
  getPeriodsDateRange,
} from "../../shared/lib/dates";
import { useOpenClientInEdit } from "../navigation/useOpenClientInEdit";
import type { DoneStatus, Group } from "../../shared/types/domain";
import styles from "./OverviewSection.module.css";

const STATUS_LABEL: Record<DoneStatus, string> = {
  none: "—",
  done: "Done",
  fail: "Fail",
  fixed: "Fixed",
  wrong: "Wrong",
};

export function OverviewSection() {
  const workspace = useAppStore((s) => s.workspace);
  const activeGroupId = useAppStore((s) => s.activeGroupId);
  const allGroups = useAppStore((s) => s.groups);
  const allPeriods = useAppStore((s) => s.periods);
  const clientRows = useAppStore((s) => s.clientRows);
  const scope = useAppStore((s) => s.totalsScope);
  const setScope = useAppStore((s) => s.setTotalsScope);
  const currencySymbol = useAppStore((s) => s.settings.currencySymbol);

  const money = (n: number) => (
    <span className="js-money">{formatCurrency(formatMoney(n), currencySymbol)}</span>
  );

  const [monthIndex, setMonthIndex] = useState<number | null>(null);

  // Groups visible in the current workspace tab (Active / Archive).
  const workspaceGroups = useMemo(
    () => allGroups.filter((g) => (workspace === "archive" ? g.archived : !g.archived)),
    [allGroups, workspace]
  );

  // Groups this Overview actually reports on: just the active one ("Current"),
  // or every group in this workspace tab ("All") — matches getGroupsByMode().
  const scopedGroups: Group[] = useMemo(() => {
    if (scope === "all") return workspaceGroups;
    const current = workspaceGroups.find((g) => g.id === activeGroupId);
    return current ? [current] : [];
  }, [scope, workspaceGroups, activeGroupId]);

  const scopedGroupIds = useMemo(() => new Set(scopedGroups.map((g) => g.id)), [scopedGroups]);

  const scopedPeriods = useMemo(
    () => allPeriods.filter((p) => scopedGroupIds.has(p.groupId)),
    [allPeriods, scopedGroupIds]
  );

  const scopedPeriodIds = useMemo(
    () => new Set(scopedPeriods.map((p) => p.id)),
    [scopedPeriods]
  );

  const scopedRows = useMemo(
    () => clientRows.filter((r) => scopedPeriodIds.has(r.periodId)),
    [clientRows, scopedPeriodIds]
  );

  // --- Grand totals (Gross / Net / My€ / Unpaid / Income) ---
  const grand = useMemo(
    () => computeGrandTotals(scopedGroups, scopedPeriods, clientRows),
    [scopedGroups, scopedPeriods, clientRows]
  );

  // --- Status badges: plain counts over the scope, NOT month-filtered
  // (this matches the old app's actual render behavior exactly). ---
  const statusCounts = useMemo(() => computeStatusCounts(scopedRows), [scopedRows]);

  // --- Date range / duration / marked-clients widget ---
  const { min, max } = useMemo(() => getPeriodsDateRange(scopedPeriods), [scopedPeriods]);
  const clientsCount = useMemo(() => computeMarkedClientsCount(scopedRows), [scopedRows]);
  const duration = min && max ? getDurationMonthsDays(min, max) : null;

  // --- Monthly stats: month navigation over the months that actually have
  // period data in this scope, defaulting to the most recent one. ---
  const monthKeys = useMemo(() => getAllMonthKeys(scopedPeriods), [scopedPeriods]);

  useEffect(() => {
    // Keep the cursor valid whenever the available months change (scope
    // switch, workspace switch, or a period's dates changing) — snap to the
    // last month, exactly like the old app's getCurrentMonthKey() default.
    setMonthIndex(monthKeys.length ? monthKeys.length - 1 : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKeys.join(",")]);

  const currentMonthKey = monthIndex !== null ? monthKeys[monthIndex] ?? null : null;

  const monthTotals = useMemo(
    () => computeMonthlyTotals(currentMonthKey, scopedGroups, scopedPeriods, clientRows),
    [currentMonthKey, scopedGroups, scopedPeriods, clientRows]
  );

  const canGoPrev = monthIndex !== null && monthIndex > 0;
  const canGoNext = monthIndex !== null && monthIndex < monthKeys.length - 1;

  const [collapsed, setCollapsed] = useState(true);

  // --- Clicking a Done/Fail/Fixed/Wrong badge drills down into the
  // matching clients, scrollable, click-through to Edit mode. ---
  const [statusFilter, setStatusFilter] = useState<DoneStatus | null>(null);
  const periodById = useMemo(() => new Map(scopedPeriods.map((p) => [p.id, p])), [scopedPeriods]);
  const groupById = useMemo(() => new Map(scopedGroups.map((g) => [g.id, g])), [scopedGroups]);
  const openClientInEdit = useOpenClientInEdit();

  const filteredRows = useMemo(() => {
    if (!statusFilter) return [];
    return scopedRows.filter((r) => r.status === statusFilter);
  }, [scopedRows, statusFilter]);

  function toggleStatusFilter(status: DoneStatus) {
    setStatusFilter((prev) => (prev === status ? null : status));
    setCommentsFilter(null);
  }

  // --- Comments widget: same "4 status-colored badges, click to filter"
  // shape as the Done/Fail/Fixed/Wrong row above, but scoped to clients
  // that also have a non-empty comment. ---
  const [commentsFilter, setCommentsFilter] = useState<DoneStatus | null>(null);
  const commentedRows = useMemo(
    () => scopedRows.filter((r) => r.comment.trim() !== ""),
    [scopedRows]
  );
  const commentedStatusCounts = useMemo(() => computeStatusCounts(commentedRows), [commentedRows]);
  const filteredCommentedRows = useMemo(() => {
    if (!commentsFilter) return [];
    return commentedRows.filter((r) => r.status === commentsFilter);
  }, [commentedRows, commentsFilter]);

  function toggleCommentsFilter(status: DoneStatus) {
    setCommentsFilter((prev) => (prev === status ? null : status));
    setStatusFilter(null);
  }

  useEffect(() => {
    setStatusFilter(null);
    setCommentsFilter(null);
  }, [scope, workspace, activeGroupId]);

  function handleClientClick(rowId: string) {
    const row = scopedRows.find((r) => r.id === rowId);
    if (!row) return;
    const period = periodById.get(row.periodId);
    if (!period) return;
    const group = groupById.get(period.groupId);
    if (!group) return;
    openClientInEdit({
      rowId: row.id,
      periodId: period.id,
      groupId: group.id,
      groupArchived: group.archived,
    });
  }

  return (
    <section className={styles.card}>
      <div className={styles.head}>
        <button
          type="button"
          className={styles.titleBtn}
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
        >
          <span className={styles.chevron}>{collapsed ? "▸" : "▾"}</span>
          <span className={styles.title}>📊 Overview</span>
        </button>
        <div className={styles.toggle}>
          <button
            className={scope === "current" ? styles.toggleBtnActive : styles.toggleBtn}
            onClick={() => setScope("current")}
          >
            Current
          </button>
          <button
            className={scope === "all" ? styles.toggleBtnActive : styles.toggleBtn}
            onClick={() => setScope("all")}
          >
            All
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
      <div className={styles.grid}>
        <div className={`${styles.kpi} ${styles.kpiGross}`}>
          <div className={styles.label}>Gross</div>
          <div className={styles.value}>{money(grand.gross)}</div>
        </div>
        <div className={`${styles.kpi} ${styles.kpiNet}`}>
          <div className={styles.label}>Net</div>
          <div className={styles.value}>{money(grand.net)}</div>
        </div>
        <div className={`${styles.kpi} ${styles.kpiMy}`}>
          <div className={styles.label}>My €</div>
          <div className={styles.value}>{money(grand.myEur)}</div>
        </div>
      </div>

      <div className={styles.pillRow}>
        <span className={styles.pill}>
          <span>Unpaid</span>
          <b>{money(grand.unpaid)}</b>
        </span>
        <span className={styles.pill}>
          <span>Income</span>
          <b>{money(grand.income)}</b>
        </span>
      </div>

      <div className={styles.statusRow}>
        <span>Done / Fail / Fixed / Wrong</span>
        <div className={styles.badges}>
          <button
            type="button"
            className={statusFilter === "done" ? styles.badgeDoneActive : styles.badgeDone}
            onClick={() => toggleStatusFilter("done")}
            aria-pressed={statusFilter === "done"}
          >
            {statusCounts.done}
          </button>
          <button
            type="button"
            className={statusFilter === "fail" ? styles.badgeFailActive : styles.badgeFail}
            onClick={() => toggleStatusFilter("fail")}
            aria-pressed={statusFilter === "fail"}
          >
            {statusCounts.fail}
          </button>
          <button
            type="button"
            className={statusFilter === "fixed" ? styles.badgeFixedActive : styles.badgeFixed}
            onClick={() => toggleStatusFilter("fixed")}
            aria-pressed={statusFilter === "fixed"}
          >
            {statusCounts.fixed}
          </button>
          <button
            type="button"
            className={statusFilter === "wrong" ? styles.badgeWrongActive : styles.badgeWrong}
            onClick={() => toggleStatusFilter("wrong")}
            aria-pressed={statusFilter === "wrong"}
          >
            {statusCounts.wrong}
          </button>
        </div>
      </div>

      {statusFilter && (
        <div className={styles.filteredList} role="list" aria-label={`${STATUS_LABEL[statusFilter]} clients`}>
          {filteredRows.length === 0 && (
            <div className={styles.filteredEmpty}>No {STATUS_LABEL[statusFilter]} clients.</div>
          )}
          {filteredRows.map((row) => {
            const period = periodById.get(row.periodId);
            const group = period ? groupById.get(period.groupId) : undefined;
            return (
              <button
                key={row.id}
                type="button"
                role="listitem"
                className={styles.filteredItem}
                onClick={() => handleClientClick(row.id)}
              >
                <span className={styles.filteredName}>{row.customer.trim() || "Client"}</span>
                <span className={styles.filteredMeta}>
                  {group?.name ?? "—"} · {period ? `${formatPeriodDate(period.fromDate)} → ${formatPeriodDate(period.toDate)}` : "—"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className={styles.statusRow}>
        <span>📝 Comments</span>
        <div className={styles.badges}>
          <button
            type="button"
            className={commentsFilter === "done" ? styles.badgeDoneActive : styles.badgeDone}
            onClick={() => toggleCommentsFilter("done")}
            aria-pressed={commentsFilter === "done"}
          >
            {commentedStatusCounts.done}
          </button>
          <button
            type="button"
            className={commentsFilter === "fail" ? styles.badgeFailActive : styles.badgeFail}
            onClick={() => toggleCommentsFilter("fail")}
            aria-pressed={commentsFilter === "fail"}
          >
            {commentedStatusCounts.fail}
          </button>
          <button
            type="button"
            className={commentsFilter === "fixed" ? styles.badgeFixedActive : styles.badgeFixed}
            onClick={() => toggleCommentsFilter("fixed")}
            aria-pressed={commentsFilter === "fixed"}
          >
            {commentedStatusCounts.fixed}
          </button>
          <button
            type="button"
            className={commentsFilter === "wrong" ? styles.badgeWrongActive : styles.badgeWrong}
            onClick={() => toggleCommentsFilter("wrong")}
            aria-pressed={commentsFilter === "wrong"}
          >
            {commentedStatusCounts.wrong}
          </button>
        </div>
      </div>

      {commentsFilter && (
        <div
          className={styles.filteredList}
          role="list"
          aria-label={`${STATUS_LABEL[commentsFilter]} clients with comments`}
        >
          {filteredCommentedRows.length === 0 && (
            <div className={styles.filteredEmpty}>No {STATUS_LABEL[commentsFilter]} clients with comments.</div>
          )}
          {filteredCommentedRows.map((row) => {
            const period = periodById.get(row.periodId);
            const group = period ? groupById.get(period.groupId) : undefined;
            return (
              <button
                key={row.id}
                type="button"
                role="listitem"
                className={styles.filteredItem}
                onClick={() => handleClientClick(row.id)}
              >
                <span className={styles.filteredName}>{row.customer.trim() || "Client"}</span>
                <span className={styles.filteredComment}>{row.comment}</span>
                <span className={styles.filteredMeta}>
                  {group?.name ?? "—"} · {period ? `${formatPeriodDate(period.fromDate)} → ${formatPeriodDate(period.toDate)}` : "—"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className={styles.dateBox}>
        <div className={styles.dateRow}>
          <span className={styles.dateLabel}>Working period</span>
          <span className={styles.dateBadges}>
            <span className={styles.durationBadge}>
              {duration ? `${duration.months} Mo ${duration.days} D` : "—"}
            </span>
            <span className={styles.durationBadge}>{clientsCount} Clients</span>
          </span>
        </div>
        <div className={styles.dateValue}>
          {min && max ? `${formatDateForRange(min)} → ${formatDateForRange(max)}` : "—"}
        </div>
      </div>

      <div className={styles.monthly}>
        <div className={styles.monthlyHead}>
          <span>Monthly · Statistics</span>
          <div className={styles.monthNav}>
            <button
              disabled={!canGoPrev}
              onClick={() => setMonthIndex((i) => (i !== null ? i - 1 : i))}
              aria-label="Previous month"
            >
              ‹
            </button>
            <span>{formatMonthKey(currentMonthKey)}</span>
            <button
              disabled={!canGoNext}
              onClick={() => setMonthIndex((i) => (i !== null ? i + 1 : i))}
              aria-label="Next month"
            >
              ›
            </button>
          </div>
        </div>
        <div className={styles.monthlyGrid}>
          <div className={styles.monthRow}>
            <span>Month Gross</span>
            <b>{money(monthTotals.gross)}</b>
          </div>
          <div className={styles.monthRow}>
            <span>Month Net</span>
            <b>{money(monthTotals.net)}</b>
          </div>
          <div className={styles.monthRow}>
            <span>Month My €</span>
            <b>{money(monthTotals.myEur)}</b>
          </div>
        </div>
      </div>
        </>
      )}
    </section>
  );
}
