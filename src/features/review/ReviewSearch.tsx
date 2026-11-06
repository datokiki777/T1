import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../app/store";
import { buildSearchIndex, searchIndex, highlightParts, type SearchIndexItem } from "../../shared/lib/search";
import { useOpenClientInEdit } from "../navigation/useOpenClientInEdit";
import { confirmDialog } from "../../shared/modal/modalStore";
import { looksLikeUrl } from "../../shared/lib/url";
import { findWorkerGroups } from "../../shared/lib/workerSearch";
import type { StatusCounts } from "../../shared/types/domain";
import styles from "./ReviewSearch.module.css";

const STATUS_LABEL: Record<string, string> = {
  done: "Done",
  fail: "Fail",
  fixed: "Fixed",
  wrong: "Wrong",
  unpaid: "Unpaid",
};

function Highlighted({ text, query }: { text: string; query: string }) {
  const parts = highlightParts(text, query);
  return (
    <>
      {parts.map((p, i) =>
        p.match ? <mark key={i} className={styles.mark}>{p.text}</mark> : <span key={i}>{p.text}</span>
      )}
    </>
  );
}

const COUNT_PILLS: { key: keyof StatusCounts; label: string; className: string }[] = [
  { key: "done", label: "Done", className: styles.countDone },
  { key: "fail", label: "Fail", className: styles.countFail },
  { key: "fixed", label: "Fixed", className: styles.countFixed },
  { key: "wrong", label: "Wrong", className: styles.countWrong },
  { key: "unpaid", label: "Unpaid", className: styles.countUnpaid },
];

function CountPills({ counts, large }: { counts: StatusCounts; large?: boolean }) {
  return (
    <div className={large ? styles.countPillsLarge : styles.countPills}>
      {COUNT_PILLS.map(({ key, label, className }) => (
        <span
          key={key}
          className={`${styles.countPill} ${className}${counts[key] === 0 ? ` ${styles.countZero}` : ""}`}
        >
          {label} {counts[key]}
        </span>
      ))}
    </div>
  );
}

export function ReviewSearch() {
  const [query, setQuery] = useState("");
  const [workerModalOpen, setWorkerModalOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const groups = useAppStore((s) => s.groups);
  const periods = useAppStore((s) => s.periods);
  const clientRows = useAppStore((s) => s.clientRows);
  const openClientInEdit = useOpenClientInEdit();

  const index = useMemo(() => buildSearchIndex(groups, periods, clientRows), [groups, periods, clientRows]);
  const results = useMemo(() => searchIndex(index, query), [index, query]);
  // The typed text is also tried as a worker name against group names
  // (active and archived) — informational only, see workerSearch.ts.
  const workerResult = useMemo(
    () => findWorkerGroups(query, groups, periods, clientRows),
    [query, groups, periods, clientRows]
  );

  // Never leave the worker summary open (or ready to pop back open) once
  // the typed text changes or is cleared.
  useEffect(() => {
    setWorkerModalOpen(false);
  }, [query]);

  // Click outside the search box clears it, matching the old app's pointerdown handler.
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setQuery("");
      }
    }
    document.addEventListener("pointerdown", handlePointerDown, { passive: true });
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") setQuery("");
  }

  async function handleOpenInEdit(item: SearchIndexItem) {
    if (!(await confirmDialog("Open this client in Edit mode?"))) return;
    setQuery("");
    openClientInEdit({
      rowId: item.rowId,
      periodId: item.periodId,
      groupId: item.groupId,
      groupArchived: item.groupArchived,
    });
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <input
        className={styles.searchInput}
        type="text"
        placeholder="Search client, address, note or worker…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />

      {query.trim() && (
        <div className={styles.results}>
          {workerResult && (
            <button
              type="button"
              className={styles.workerCard}
              onClick={() => setWorkerModalOpen(true)}
            >
              <span className={styles.workerIcon} aria-hidden="true">👷</span>
              <span className={styles.workerText}>
                <b>Worker: {query.trim()}</b>
                <span className={styles.workerHint}>
                  {workerResult.groups.length} group{workerResult.groups.length === 1 ? "" : "s"} · tap for details
                </span>
              </span>
            </button>
          )}
          {results.length === 0 && !workerResult && <div className={styles.empty}>No results</div>}
          {results.map((item) => (
            <button
              key={item.rowId}
              type="button"
              className={styles.resultCard}
              onClick={() => handleOpenInEdit(item)}
            >
              <div className={styles.resultHead}>
                <span className={styles.customer}>
                  {item.groupArchived && "📦 "}
                  <Highlighted text={item.customer || "Client"} query={query} />
                </span>
                {item.status !== "none" && (
                  <span className={styles[`status_${item.status}`]}>{STATUS_LABEL[item.status]}</span>
                )}
              </div>
              <div className={styles.resultMeta}>
                <span>
                  <b>Group:</b> {item.groupArchived && "📦 "}
                  {item.groupName}
                </span>
                <span>
                  <b>Period:</b> {item.from} → {item.to}
                </span>
                <span>
                  <b>City:</b>{" "}
                  {looksLikeUrl(item.city) ? (
                    // A real <a> here would be invalid HTML — resultCard
                    // (the ancestor) is itself a <button>, and interactive
                    // content can't nest inside a button. A span + explicit
                    // window.open gets the same "open in a new tab" result
                    // without that problem.
                    <span
                      role="link"
                      tabIndex={0}
                      className={styles.cityLink}
                      aria-label="Open location in Maps"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(item.city.trim(), "_blank", "noopener,noreferrer");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          e.preventDefault();
                          window.open(item.city.trim(), "_blank", "noopener,noreferrer");
                        }
                      }}
                    >
                      📍 Open in Maps
                    </span>
                  ) : (
                    <Highlighted text={item.city || "—"} query={query} />
                  )}
                </span>
                <span>
                  <b>Amount:</b> <span className="js-money">{item.amount}</span>
                </span>
                <span>
                  <b>Expense:</b> <span className="js-money">{item.expense}</span>
                </span>
              </div>
              {item.comment && (
                <div className={styles.comment}>
                  <Highlighted text={item.comment} query={query} />
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {workerModalOpen && workerResult && (
        <div className={styles.workerOverlay} onClick={() => setWorkerModalOpen(false)}>
          <div
            className={styles.workerModalCard}
            role="dialog"
            aria-label="Worker summary"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.workerModalTitle}>👷 {query.trim()}</div>
            <div className={styles.workerGroups}>
              {workerResult.groups.map(({ group, counts }) => (
                <div key={group.id} className={styles.workerGroupRow}>
                  <div className={styles.workerGroupName}>
                    {group.archived && "📦 "}
                    {group.name}
                  </div>
                  <CountPills counts={counts} />
                </div>
              ))}
            </div>
            <div className={styles.workerTotal}>
              <div className={styles.workerTotalLabel}>Total · {workerResult.clients} clients</div>
              <CountPills counts={workerResult.totals} large />
            </div>
            <div className={styles.workerNote}>
              Numbers are per group — a group with two workers counts both.
            </div>
            <button type="button" className={styles.workerClose} onClick={() => setWorkerModalOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
