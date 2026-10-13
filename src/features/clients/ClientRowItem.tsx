import { Fragment, useState } from "react";
import { useAppStore } from "../../app/store";
import type { DoneStatus } from "../../shared/types/domain";
import { confirmDialog } from "../../shared/modal/modalStore";
import { parseMoney } from "../../shared/lib/money";
import styles from "./ClientRowItem.module.css";

const STATUS_LABEL: Record<DoneStatus, string> = {
  none: "—",
  done: "✓ Done",
  fail: "✕ Fail",
  fixed: "⟳ Fixed",
  wrong: "! Wrong",
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

  // Net is never more than ~500 off from Gross in real invoices — a bigger
  // gap almost always means a missed digit while typing. Checked on blur
  // (not every keystroke) so it doesn't interrupt while entering the value.
  async function handleNetBlur() {
    if (!row || !row.gross || !row.net) return;
    const gross = parseMoney(row.gross);
    const net = parseMoney(row.net);
    if (!Number.isFinite(gross) || !Number.isFinite(net)) return;
    if (Math.abs(gross - net) <= 500) return;
    await confirmDialog(
      `Net (${row.net}) looks far off from Gross (${row.gross}) — Net is usually within 500 of Gross. Are you sure this is correct?`,
      { confirmLabel: "Yes, it's correct" }
    );
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
          value={row.gross}
          placeholder="0"
          autoComplete="chrome-off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => updateRow(row.id, { gross: e.target.value.replace(/\D/g, "") })}
        />
      </td>
      <td>
        <input
          className={styles.input}
          type="text"
          inputMode="numeric"
          value={row.net}
          placeholder="0"
          autoComplete="chrome-off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => updateRow(row.id, { net: e.target.value.replace(/\D/g, "") })}
          onBlur={handleNetBlur}
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
                onChange={(e) => updateRow(row.id, { visitDate: e.target.value || null })}
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
                    onClick={() => updateRow(row.id, { visitDays: row.visitDays === n ? null : n })}
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
