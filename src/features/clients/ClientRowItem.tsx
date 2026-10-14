import { Fragment, useState } from "react";
import { useAppStore } from "../../app/store";
import type { DoneStatus } from "../../shared/types/domain";
import { confirmDialog } from "../../shared/modal/modalStore";
import { daysBetweenInclusive, formatDateForRange, parseDateOnly } from "../../shared/lib/dates";
import styles from "./ClientRowItem.module.css";

const STATUS_LABEL: Record<DoneStatus, string> = {
  none: "—",
  done: "✓ Done",
  fail: "✕ Fail",
  fixed: "⟳ Fixed",
  wrong: "! Wrong",
  unpaid: "● Unpaid",
};

export function ClientRowItem({
  rowId,
  sortMode = false,
  isFirst = false,
  isLast = false,
}: {
  rowId: string;
  sortMode?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const row = useAppStore((s) => s.clientRows.find((r) => r.id === rowId));
  const updateRow = useAppStore((s) => s.updateClientRow);
  const removeRow = useAppStore((s) => s.removeClientRow);
  const cycleStatus = useAppStore((s) => s.cycleRowStatus);
  const moveRow = useAppStore((s) => s.moveClientRow);
  const isHighlighted = useAppStore((s) => s.highlightedRowId === rowId);
  const confirmDestructive = useAppStore((s) => s.settings.confirmDestructiveActions);
  const [commentOpen, setCommentOpen] = useState(false);
  const [visitPanelOpen, setVisitPanelOpen] = useState(false);
  const highlightPeriodDates = useAppStore((s) => s.highlightPeriodDates);

  if (!row) return null;

  async function handleRemove() {
    if (!row) return;
    if (
      confirmDestructive &&
      !(await confirmDialog(`Delete client "${row.customer || "Unnamed"}"?`, { danger: true }))
    ) {
      return;
    }
    removeRow(row.id);
  }

  // Saves the visit date/days, then — if the client's days run outside its
  // period — warns and offers to jump to the period's dates to correct them.
  async function updateVisit(patch: { visitDate?: string | null; visitDays?: number | null }) {
    if (!row) return;
    updateRow(row.id, patch);

    const period = useAppStore.getState().periods.find((p) => p.id === row.periodId);
    const from = parseDateOnly(period?.fromDate);
    const to = parseDateOnly(period?.toDate);
    if (!period || !from || !to || to < from) return;

    const date = parseDateOnly(patch.visitDate !== undefined ? patch.visitDate : row.visitDate);
    const days = patch.visitDays !== undefined ? patch.visitDays : row.visitDays;
    const periodText = `${formatDateForRange(from)} → ${formatDateForRange(to)}`;

    let problem: string | null = null;
    if (date) {
      const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + Math.max(1, days ?? 1) - 1);
      if (date < from || end > to) {
        problem = `This client's days (${formatDateForRange(date)} → ${formatDateForRange(end)}) go outside the period (${periodText}).`;
      }
    } else if (days && days > daysBetweenInclusive(from, to)) {
      problem = `This client has ${days} days, but the period (${periodText}) is only ${daysBetweenInclusive(from, to)} days long.`;
    }
    if (!problem) return;

    const goEdit = await confirmDialog(`${problem}\n\nCorrect the period dates?`, {
      confirmLabel: "Edit period",
      cancelLabel: "Keep as is",
    });
    if (!goEdit) return;

    setVisitPanelOpen(false);
    setTimeout(() => {
      document
        .querySelector(`[data-period-dates="${period.id}"]`)
        ?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      highlightPeriodDates(period.id);
    }, 80);
  }

  return (
    <Fragment>
    <tr
      data-row-id={row.id}
      className={
        [row.status === "wrong" && styles.wrongRow, isHighlighted && styles.highlighted]
          .filter(Boolean)
          .join(" ") || undefined
      }
    >
      <td className={styles.customerCell}>
        <input
          className={styles.input}
          value={row.customer}
          placeholder="Client name"
          autoComplete="chrome-off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          onChange={(e) => updateRow(row.id, { customer: e.target.value })}
        />
        <button
          type="button"
          className={styles.commentRow}
          onClick={() => setCommentOpen((v) => !v)}
          aria-expanded={commentOpen}
        >
          <span className={styles.commentIcon} aria-hidden="true">
            ✎
          </span>
          <span className={styles.commentLabel}>Comment</span>
          <span className={row.comment ? styles.commentStateSaved : styles.commentStateEmpty}>
            {row.comment ? "Saved" : "Add note"}
          </span>
          <span className={styles.commentChevron} aria-hidden="true">
            {commentOpen ? "⌄" : "›"}
          </span>
        </button>
        {commentOpen && (
          <textarea
            className={styles.commentInput}
            rows={2}
            maxLength={1000}
            placeholder="Private note for this client..."
            value={row.comment}
            onChange={(e) => updateRow(row.id, { comment: e.target.value })}
          />
        )}
      </td>
      <td>
        <input
          className={styles.input}
          type="text"
          inputMode="numeric"
          value={row.amount}
          placeholder="0"
          autoComplete="chrome-off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => updateRow(row.id, { amount: e.target.value.replace(/\D/g, "") })}
        />
      </td>
      <td>
        <input
          className={styles.input}
          type="text"
          inputMode="numeric"
          value={row.expense}
          placeholder="0"
          autoComplete="chrome-off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => updateRow(row.id, { expense: e.target.value.replace(/\D/g, "") })}
        />
      </td>
      <td>
        <input
          className={styles.input}
          value={row.city}
          placeholder="City"
          autoComplete="chrome-off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          onChange={(e) => updateRow(row.id, { city: e.target.value })}
        />
      </td>
      <td>
        <button
          className={styles[`status_${row.status}`]}
          type="button"
          onClick={() => cycleStatus(row.id)}
        >
          {STATUS_LABEL[row.status]}
        </button>
      </td>
      <td>
        <div className={styles.actionsCell}>
          <button
            type="button"
            className={row.visitDate || row.visitDays ? styles.visitBtnSet : styles.visitBtn}
            aria-expanded={visitPanelOpen}
            aria-label="Set visit date and days"
            title="Set visit date and days"
            onClick={() => setVisitPanelOpen((v) => !v)}
          >
            📅
          </button>
          {sortMode && (
            <span className={styles.moveButtons}>
              <button
                className={styles.moveBtn}
                type="button"
                disabled={isFirst}
                aria-label="Move client up"
                onClick={() => moveRow(row.id, "up")}
              >
                ▲
              </button>
              <button
                className={styles.moveBtn}
                type="button"
                disabled={isLast}
                aria-label="Move client down"
                onClick={() => moveRow(row.id, "down")}
              >
                ▼
              </button>
            </span>
          )}
          <button className={styles.removeBtn} type="button" onClick={handleRemove}>
            Remove
          </button>
        </div>
      </td>
    </tr>
    {visitPanelOpen && (
      <tr className={styles.visitPanelRow}>
        <td colSpan={6}>
          <div className={styles.visitPanel}>
            <label className={styles.visitPanelField}>
              <span>Date</span>
              <input
                type="date"
                value={row.visitDate ?? ""}
                onChange={(e) => updateVisit({ visitDate: e.target.value || null })}
              />
            </label>
            <div className={styles.visitPanelField}>
              <span>Days</span>
              <div className={styles.visitDayButtons}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={row.visitDays === n ? styles.visitDayBtnActive : styles.visitDayBtn}
                    onClick={() => updateVisit({ visitDays: row.visitDays === n ? null : n })}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              className={styles.visitPanelClose}
              onClick={() => setVisitPanelOpen(false)}
            >
              Done
            </button>
          </div>
        </td>
      </tr>
    )}
    </Fragment>
  );
}
