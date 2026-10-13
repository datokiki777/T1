import { useEffect, useState } from "react";
import { listRestoreSources, restoreFromSource } from "./cloudSyncController";
import type { HistoryEntry } from "./cloudBackend";
import { confirmDialog } from "../shared/modal/modalStore";
import modalStyles from "../shared/modal/ModalHost.module.css";

function formatEntryLabel(entry: HistoryEntry, index: number): string {
  if (entry.id === "latest") {
    const d = new Date(entry.savedAt);
    return `1. Latest Cloud - ${Number.isNaN(d.getTime()) ? entry.savedAt : d.toLocaleDateString()}`;
  }
  return `${index + 1}. History - ${entry.id.split("-").reverse().join("/")}`;
}

export function RestoreSourcePicker({ onClose }: { onClose: () => void }) {
  const [sources, setSources] = useState<HistoryEntry[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    listRestoreSources()
      .then(setSources)
      .catch((err) => {
        console.error("Failed to list restore sources:", err);
        setError("Could not load cloud backups.");
        setSources([]);
      });
  }, []);

  async function handleRestore() {
    if (!selected) return;
    if (
      !(await confirmDialog(
        "Restore this backup? Everything currently on this device will be replaced.",
        { danger: true, confirmLabel: "Restore" }
      ))
    ) {
      return;
    }
    setRestoring(true);
    setError(null);
    try {
      await restoreFromSource(selected);
      onClose();
    } catch (err) {
      console.error("Restore failed:", err);
      setError(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className={modalStyles.overlay}>
      <div className={modalStyles.card} role="dialog" aria-modal="true" style={{ maxWidth: 380 }}>
        <p className={modalStyles.message} style={{ fontWeight: 700, fontSize: 16 }}>
          Restore source
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
          {sources === null && <p className={modalStyles.message}>Loading…</p>}
          {sources?.length === 0 && <p className={modalStyles.message}>No cloud backups found yet.</p>}
          {sources?.map((entry, i) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSelected(entry.id)}
              style={{
                textAlign: "left",
                padding: "10px 14px",
                borderRadius: 999,
                border: selected === entry.id ? "1px solid var(--accent)" : "1px solid var(--border-soft)",
                background: selected === entry.id ? "rgba(255,196,64,0.12)" : "rgba(0,0,0,0.2)",
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              {formatEntryLabel(entry, i)}
            </button>
          ))}
        </div>

        {error && (
          <div className={modalStyles.message} style={{ color: "var(--danger)" }}>
            {error}
          </div>
        )}

        <div className={modalStyles.actions}>
          <button type="button" className={modalStyles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={modalStyles.confirmBtn}
            onClick={handleRestore}
            disabled={!selected || restoring}
          >
            {restoring ? "Restoring…" : "Restore"}
          </button>
        </div>
      </div>
    </div>
  );
}
