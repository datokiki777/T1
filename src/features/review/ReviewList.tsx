import { useMemo, useRef, useState } from "react";
import { useAppStore } from "../../app/store";
import {
  computeGroupFinancials,
  computePeriodTotals,
  computeStatusCounts,
  formatMoney,
} from "../../shared/lib/calc";
import { parseMoney } from "../../shared/lib/money";
import { formatPeriodDate, getPeriodPaidStatus, sortPeriodsByDate, isPeriodCurrentToday } from "../../shared/lib/dates";
import { getRowsForPeriod } from "../../shared/lib/entityLookup";
import { useOpenClientInEdit } from "../navigation/useOpenClientInEdit";
import { looksLikeUrl } from "../../shared/lib/url";
import type { ClientRow, Group, Period } from "../../shared/types/domain";
import styles from "./ReviewList.module.css";

/** How long a press must be held before jumping to that client in Edit
 * mode counts as intentional (ms) — same threshold as the group
 * switcher's own long-press menu. A plain tap here only ever expands/
 * collapses the period card (native <details>), never navigates. */
const CLIENT_LONG_PRESS_MS = 500;

const STATUS_LABEL: Record<string, string> = {
  done: "Done",
  fail: "Fail",
  fixed: "Fixed",
  wrong: "Wrong",
};

export function ReviewList() {
  const workspace = useAppStore((s) => s.workspace);
  const scope = useAppStore((s) => s.totalsScope);
  const activeGroupId = useAppStore((s) => s.activeGroupId);
  const allGroups = useAppStore((s) => s.groups);
  const allPeriods = useAppStore((s) => s.periods);
  const clientRows = useAppStore((s) => s.clientRows);

  const workspaceGroups = useMemo(
    () => allGroups.filter((g) => (workspace === "archive" ? g.archived : !g.archived)),
    [allGroups, workspace]
  );

  const groupsToShow: Group[] = useMemo(() => {
    if (scope === "all") return workspaceGroups;
    const current = workspaceGroups.find((g) => g.id === activeGroupId);
    return current ? [current] : [];
  }, [scope, workspaceGroups, activeGroupId]);

  if (groupsToShow.length === 0) {
    const emptyMessage =
      workspace === "archive"
        ? scope === "current"
          ? "📦 No archived group selected"
          : "📦 No groups in archive"
        : scope === "current"
          ? "👤 No active group selected"
          : "👥 No active groups";

    return (
      <div className={styles.emptyCard}>
        <div className={styles.emptyIcon}>📭</div>
        <div className={styles.emptyTitle}>{emptyMessage}</div>
        <div className={styles.emptyHint}>Create a group or add a period to get started</div>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {groupsToShow.map((group) => (
        <ReviewGroupCard
          key={group.id}
          group={group}
          periods={sortPeriodsByDate(allPeriods.filter((p) => p.groupId === group.id))}
          clientRows={clientRows}
        />
      ))}
    </div>
  );
}

function ReviewGroupCard({
  group,
  periods,
  clientRows,
}: {
  group: Group;
  periods: Period[];
  clientRows: ClientRow[];
}) {
  const groupRows = useMemo(
    () => clientRows.filter((r) => periods.some((p) => p.id === r.periodId)),
    [clientRows, periods]
  );

  const financials = useMemo(
    () => computeGroupFinancials(group, periods, clientRows),
    [group, periods, clientRows]
  );
  const statusCounts = useMemo(() => computeStatusCounts(groupRows), [groupRows]);

  return (
    <section className={styles.groupCard}>
      <div className={styles.groupToggle}>
        <div className={styles.groupHeadMain}>
          <h3 className={styles.groupTitle}>
            {group.name}
            {group.archived && " 📦"}
          </h3>
          <div className={styles.groupMeta}>
            {periods.length} periods • {groupRows.length} rows • Default {formatMoney(group.defaultRate)}%
          </div>
        </div>
        <div className={styles.groupBadges}>
          {statusCounts.done > 0 && <span className={styles.badgeDone}>{statusCounts.done}</span>}
          {statusCounts.fail > 0 && <span className={styles.badgeFail}>{statusCounts.fail}</span>}
          {statusCounts.fixed > 0 && <span className={styles.badgeFixed}>{statusCounts.fixed}</span>}
          {statusCounts.wrong > 0 && <span className={styles.badgeWrong}>{statusCounts.wrong}</span>}
        </div>
      </div>

      <div className={styles.groupBody}>
        <div className={styles.groupKpis}>
          <div className={`${styles.kpi} ${styles.kpiGross}`}>
            <div className={styles.kpiLabel}>Gross</div>
              <div className={styles.kpiValue}><span className="js-money">{formatMoney(financials.gross)}</span></div>
            </div>
            <div className={`${styles.kpi} ${styles.kpiNet}`}>
              <div className={styles.kpiLabel}>Net</div>
              <div className={styles.kpiValue}><span className="js-money">{formatMoney(financials.net)}</span></div>
            </div>
            <div className={`${styles.kpi} ${styles.kpiMy}`}>
              <div className={styles.kpiLabel}>My €</div>
              <div className={styles.kpiValue}><span className="js-money">{formatMoney(financials.myEur)}</span></div>
            </div>
          </div>

          {periods.length === 0 && <div className={styles.hint}>No periods.</div>}

          {periods.map((period) => (
            <ReviewPeriodCard
              key={period.id}
              period={period}
              rate={group.defaultRate}
              rows={getRowsForPeriod(clientRows, period.id)}
              group={group}
            />
          ))}
        </div>
    </section>
  );
}

function ReviewPeriodCard({
  period,
  rate,
  rows,
  group,
}: {
  period: Period;
  rate: number;
  rows: ClientRow[];
  group: Group;
}) {
  const totals = useMemo(() => computePeriodTotals(period, rows, rate), [period, rows, rate]);
  const openClientInEdit = useOpenClientInEdit();
  const pressTimer = useRef<number | null>(null);
  const [visitModalRowId, setVisitModalRowId] = useState<string | null>(null);
  const visitModalRow = rows.find((r) => r.id === visitModalRowId) ?? null;

  function clearPressTimer() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function startLongPress(rowId: string) {
    clearPressTimer();
    pressTimer.current = window.setTimeout(() => {
      openClientInEdit({
        rowId,
        periodId: period.id,
        groupId: group.id,
        groupArchived: group.archived,
      });
    }, CLIENT_LONG_PRESS_MS);
  }

  return (
    <details className={styles.periodCard}>
      <summary
        className={isPeriodCurrentToday(period) ? styles.periodSummaryCurrent : styles.periodSummary}
      >
        <div className={styles.periodMeta}>
          <div className={styles.periodRange}>
            {formatPeriodDate(period.fromDate)} → {formatPeriodDate(period.toDate)}
          </div>
          <div className={styles.periodMini}>
            {rows.length} clients{period.carNumber ? ` · 🚗 ${period.carNumber}` : ""}
          </div>
        </div>
        <div className={styles.periodSums}>
          <span className={styles.badge}>
            Gross: <b className="js-money">{formatMoney(totals.gross)}</b>
          </span>
          <span className={styles.badge}>
            Net: <b className="js-money">{formatMoney(totals.net)}</b>
          </span>
          <span className={styles.badge}>
            My €: <b className="js-money">{formatMoney(totals.myEur)}</b>
          </span>
          {(() => {
            const { spanWeeks, fullyPaid } = getPeriodPaidStatus(period);
            if (spanWeeks === null) return null;
            return (
              <span className={fullyPaid ? styles.badgePaid : styles.badgeUnpaid}>
                💰 {period.paidWeeks ?? 0}w / {spanWeeks}w
              </span>
            );
          })()}
        </div>
      </summary>

      <div className={styles.clientList}>
        {rows.length === 0 && <div className={styles.hint}>No clients.</div>}
        {rows.map((row) => (
          <div
            key={row.id}
            className={styles.clientItem}
            onPointerDown={() => startLongPress(row.id)}
            onPointerUp={clearPressTimer}
            onPointerLeave={clearPressTimer}
            onPointerCancel={clearPressTimer}
          >
            <div className={styles.clientMain}>
              <div className={styles.clientNameRow}>
                <span className={styles.clientName}>{row.customer.trim() || "Client"}</span>
                {row.status !== "none" && (
                  <span className={styles[`status_${row.status}`]}>{STATUS_LABEL[row.status]}</span>
                )}
                <button
                  type="button"
                  className={row.visitDate || row.visitDays ? styles.visitIconSet : styles.visitIcon}
                  aria-label="View visit date and days"
                  title="View visit date and days"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setVisitModalRowId((cur) => (cur === row.id ? null : row.id));
                  }}
                >
                  📅
                </button>
              </div>
              <div className={styles.clientCity}>
                City:{" "}
                {looksLikeUrl(row.city) ? (
                  <a
                    href={row.city.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.clientCityLink}
                    aria-label="Open location in Maps"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    📍 Open in Maps
                  </a>
                ) : (
                  <b>{row.city.trim() || "—"}</b>
                )}
              </div>
              {row.comment.trim() && (
                <div className={styles.clientComment}>
                  <span aria-hidden="true">✎</span> {row.comment.trim()}
                </div>
              )}
            </div>
            <div className={styles.clientValues}>
              <span>Gross: <b className="js-money">{formatMoney(parseMoney(row.gross) || 0)}</b></span>
              <span>Net: <b className="js-money">{formatMoney(parseMoney(row.net) || 0)}</b></span>
            </div>
          </div>
        ))}
      </div>

      {visitModalRow && (
        <div
          className={styles.visitModalOverlay}
          onClick={() => setVisitModalRowId(null)}
        >
          <div className={styles.visitModalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.visitModalTitle}>
              📅 {visitModalRow.customer.trim() || "Client"}
            </div>
            {visitModalRow.visitDate || visitModalRow.visitDays ? (
              <div className={styles.visitModalBody}>
                {visitModalRow.visitDate
                  ? formatPeriodDate(visitModalRow.visitDate)
                  : "No date set"}
                {visitModalRow.visitDays ? ` · ${visitModalRow.visitDays} day${visitModalRow.visitDays > 1 ? "s" : ""}` : ""}
              </div>
            ) : (
              <div className={styles.visitModalEmpty}>No visit date set for this client.</div>
            )}
            <button
              type="button"
              className={styles.visitModalClose}
              onClick={() => setVisitModalRowId(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </details>
  );
}
