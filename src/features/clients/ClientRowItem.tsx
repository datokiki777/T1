import { Fragment, useState } from "react";
import { useAppStore } from "../../app/store";
import type { DoneStatus } from "../../shared/types/domain";
import { confirmDialog, promptDialog } from "../../shared/modal/modalStore";
import { parseMoney } from "../../shared/lib/money";
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
  const [daysPickerOpen, setDaysPickerOpen] = useState(false);
  const highlightPeriodDates = useAppStore((s) => s.highlightPeriodDates);
  // Expense value from before the last "+" add, so it can be undone.
  const [expenseUndo, setExpenseUndo] = useState<string | null>(null);

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

  // "+" next to Expense: add another cost on top of what is already there
  // (100 + 36 + 45 ...) without retyping the total.
  async function handleAddExpense() {
    if (!row) return;
    const answer = await promptDialog(
      `Add to expense${row.expense ? ` (now ${row.expense})` : ""}`,
      "",
      { confirmLabel: "Add", inputMode: "numeric" }
    );
    if (answer === null) return;
    const added = Math.round(parseMoney(answer));
    if (!Number.isFinite(added) || added <= 0) return;

    // Read the current value fresh — it may have changed while the dialog was open.
    const fresh = useAppStore.getState().clientRows.find((r) => r.id === row.id);
    if (!fresh) return;
    const current = Math.round(parseMoney(fresh.expense));
    setExpenseUndo(fresh.expense);
    updateRow(row.id, { expense: String((Number.isFinite(current) ? current : 0) + added) });
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

    // Whatever was chosen in the dialog, the client's own date/days must stay
    // exactly as the person entered them — put them back if anything (e.g. a
    // native date picker closing) reset them while the dialog was open.
    const after = useAppStore.getState().clientRows.find((r) => r.id === row.id);
    if (
      after &&
      ((patch.visitDate !== undefined && after.visitDate !== patch.visitDate) ||
        (patch.visitDays !== undefined && after.visitDays !== patch.visitDays))
    ) {
      updateRow(row.id, patch);
    }

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
        <div className={styles.moneyField}>
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
            onChange={(e) => {
              setExpenseUndo(null);
              updateRow(row.id, { expense: e.target.value.replace(/\D/g, "") });
            }}
          />
          <button
            type="button"
            className={styles.addExpenseBtn}
            aria-label="Add to expense"
            title="Add to expense"
            onClick={handleAddExpense}
          >
            +
          </button>
          {expenseUndo !== null && (
            <button
              type="button"
              className={styles.undoExpenseBtn}
              aria-label="Undo last expense add"
              title="Undo last expense add"
              onClick={() => {
                updateRow(row.id, { expense: expenseUndo });
                setExpenseUndo(null);
              }}
            >
              ↶
            </button>
          )}
        </div>
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
              <button
                type="button"
                className={styles.daysPickerBtn}
                aria-label="Set number of days"
                onClick={() => setDaysPickerOpen(true)}
              >
                {row.visitDays ?? "—"}
              </button>
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
    {daysPickerOpen && (
      <tr>
        <td colSpan={6} style={{ padding: 0, border: "none" }}>
          <div className={styles.daysModalOverlay} onClick={() => setDaysPickerOpen(false)}>
            <div className={styles.daysModalCard} onClick={(e) => e.stopPropagation()}>
              <div className={styles.daysModalTitle}>How many days?</div>
              <div className={styles.daysGrid}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={row.visitDays === n ? styles.visitDayBtnActive : styles.visitDayBtn}
                    onClick={() => {
                      updateVisit({ visitDays: row.visitDays === n ? null : n });
                      setDaysPickerOpen(false);
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={styles.daysModalClose}
                onClick={() => setDaysPickerOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </td>
      </tr>
    )}
    </Fragment>
  );
}
