import { useEffect, useState } from "react";
import { useAppStore } from "../../app/store";
import { listRestoreSources } from "../../firebase/cloudSyncController";
import modalStyles from "../../shared/modal/ModalHost.module.css";
import styles from "./DataBackupPanel.module.css";

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `${date}, ${time}`;
}

export function DataBackupPanel({ onClose }: { onClose: () => void }) {
  const groups = useAppStore((s) => s.groups);
  const periods = useAppStore((s) => s.periods);
  const clientRows = useAppStore((s) => s.clientRows);
  const lastBackupAt = useAppStore((s) => s.lastBackupAt);
  const cloudUserEmail = useAppStore((s) => s.cloudUserEmail);
  const cloudLastSyncedAt = useAppStore((s) => s.cloudLastSyncedAt);
  const cloudStatus = useAppStore((s) => s.cloudStatus);

  const [usedStorage, setUsedStorage] = useState<string | null>(null);
  const [backupsCount, setBackupsCount] = useState<number | null>(null);

  useEffect(() => {
    if (navigator.storage?.estimate) {
      navigator.storage
        .estimate()
        .then((est) => setUsedStorage(est.usage != null ? formatBytes(est.usage) : "—"))
        .catch(() => setUsedStorage("—"));
    } else {
      setUsedStorage("—");
    }
  }, []);

  useEffect(() => {
    if (!cloudUserEmail) {
      setBackupsCount(null);
      return;
    }
    listRestoreSources()
      .then((sources) => setBackupsCount(sources.length))
      .catch(() => setBackupsCount(null));
  }, [cloudUserEmail]);

  const activeGroupIds = new Set(groups.filter((g) => !g.archived).map((g) => g.id));
  const archivedGroupIds = new Set(groups.filter((g) => g.archived).map((g) => g.id));
  const activePeriods = periods.filter((p) => activeGroupIds.has(p.groupId));
  const archivedPeriods = periods.filter((p) => archivedGroupIds.has(p.groupId));
  const activePeriodIds = new Set(activePeriods.map((p) => p.id));
  const archivedPeriodIds = new Set(archivedPeriods.map((p) => p.id));
  const activeRows = clientRows.filter((r) => activePeriodIds.has(r.periodId)).length;
  const archivedRows = clientRows.filter((r) => archivedPeriodIds.has(r.periodId)).length;

  return (
    <div className={modalStyles.overlay}>
      <div className={modalStyles.card} style={{ maxWidth: 400 }}>
        <p className={modalStyles.message} style={{ fontWeight: 700, fontSize: 16 }}>
          💾 Data & Backup
        </p>

        <div className={styles.statBox}>
          <div className={styles.row}>
            <span>💾 Used Storage</span>
            <b>{usedStorage ?? "…"}</b>
          </div>
          <div className={styles.row}>
            <span>🟢 Active</span>
            <b>
              {activeGroupIds.size} g · {activePeriods.length} periods · {activeRows} rows
            </b>
          </div>
          <div className={styles.row}>
            <span>📦 Archive</span>
            <b>
              {archivedGroupIds.size} g · {archivedPeriods.length} periods · {archivedRows} rows
            </b>
          </div>
          <div className={styles.row}>
            <span>🕐 Last Backup</span>
            <b>{formatTimestamp(lastBackupAt)}</b>
          </div>
          <div className={styles.row}>
            <span>📁 Backups</span>
            <b>{cloudUserEmail ? (backupsCount ?? "…") : "—"}</b>
          </div>
          <div className={styles.row}>
            <span>🛡️ Status</span>
            <b className={lastBackupAt ? styles.safe : undefined}>
              {lastBackupAt ? "Safe" : "No backups yet"}
            </b>
          </div>
          <div className={styles.row}>
            <span>☁️ Cloud Sync</span>
            <b
              className={
                cloudUserEmail
                  ? cloudStatus === "local"
                    ? styles.warning
                    : styles.safe
                  : undefined
              }
            >
              {cloudUserEmail
                ? cloudStatus === "local"
                  ? "Conflict — action needed"
                  : cloudLastSyncedAt
                    ? `Synced - ${new Date(cloudLastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                    : cloudStatus
                : "Not signed in"}
            </b>
          </div>
        </div>

        <div className={modalStyles.actions} style={{ justifyContent: "center" }}>
          <button type="button" className={modalStyles.confirmBtn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
