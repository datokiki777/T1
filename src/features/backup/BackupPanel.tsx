import { useRef, useState } from "react";
import { db } from "../../db/database";
import { useAppStore } from "../../app/store";
import { buildBackupPayload } from "../../shared/lib/backup";
import { parseAnyBackupFormat } from "../../shared/lib/legacyMigration";
import { confirmDialog } from "../../shared/modal/modalStore";
import styles from "./BackupPanel.module.css";

type Message = { type: "success" | "error"; text: string } | null;

export function BackupPanel() {
  const init = useAppStore((s) => s.init);
  const markBackupMade = useAppStore((s) => s.markBackupMade);
  const groupsCount = useAppStore((s) => s.groups.length);
  const periodsCount = useAppStore((s) => s.periods.length);
  const rowsCount = useAppStore((s) => s.clientRows.length);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);

  async function handleExportJson() {
    const [groups, periods, clientRows] = await Promise.all([
      db.groups.toArray(),
      db.periods.toArray(),
      db.clientRows.toArray(),
    ]);
    const payload = buildBackupPayload(groups, periods, clientRows);

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `t1-backup-${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);

    markBackupMade();
    setMessage({ type: "success", text: "JSON backup created successfully." });
  }

  function handleImportClick() {
    setMessage(null);
    fileInputRef.current?.click();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setMessage(null);

    let parsed: unknown;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch {
      setMessage({ type: "error", text: "Invalid file — could not parse JSON." });
      return;
    }

    const result = parseAnyBackupFormat(parsed);
    if (!result.ok) {
      setMessage({ type: "error", text: `Invalid backup format: ${result.error}` });
      return;
    }

    const { groups, periods, clientRows } = result.data;
    const migratedFromLegacy = result.migratedFromLegacy;

    if (
      !(await confirmDialog(
        (migratedFromLegacy
          ? `This is an old (Vanilla JS) app file — it will be automatically migrated to the new format.\n\n`
          : "") +
          `Import will replace all current data with the file "${file.name}" ` +
          `(${groups.length} groups, ${periods.length} periods, ${clientRows.length} clients).\n\n` +
          "This action is irreversible. Continue?",
        { danger: true, confirmLabel: "Import" }
      ))
    ) {
      return;
    }

    setBusy(true);
    try {
      await db.transaction("rw", db.groups, db.periods, db.clientRows, async () => {
        await Promise.all([db.groups.clear(), db.periods.clear(), db.clientRows.clear()]);
        if (groups.length) await db.groups.bulkAdd(groups);
        if (periods.length) await db.periods.bulkAdd(periods);
        if (clientRows.length) await db.clientRows.bulkAdd(clientRows);
      });

      // Refresh all Zustand state from IndexedDB — no page reload needed.
      await init();

      setMessage({
        type: "success",
        text: migratedFromLegacy
          ? "Legacy file detected and migrated successfully."
          : "Import completed successfully.",
      });
    } catch (error) {
      console.error("Import failed:", error);
      setMessage({
        type: "error",
        text: "Import failed — could not write to the database.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleExportExcel() {
    setBusy(true);
    try {
      const { exportToExcel } = await import("./exportExcel");
      await exportToExcel();
      markBackupMade();
      setMessage({ type: "success", text: "Excel file created successfully." });
    } catch (error) {
      console.error("Excel export failed:", error);
      setMessage({ type: "error", text: "Excel export failed." });
    } finally {
      setBusy(false);
    }
  }

  async function handleExportPdf() {
    setBusy(true);
    try {
      const { exportToPdf } = await import("./exportPdf");
      await exportToPdf();
      markBackupMade();
      setMessage({ type: "success", text: "PDF file created successfully." });
    } catch (error) {
      console.error("PDF export failed:", error);
      setMessage({ type: "error", text: "PDF export failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.stats}>
        <span>Groups: {groupsCount}</span>
        <span>Periods: {periodsCount}</span>
        <span>Clients: {rowsCount}</span>
      </div>

      {message && (
        <div
          role="status"
          className={message.type === "error" ? styles.messageError : styles.messageSuccess}
        >
          {message.text}
        </div>
      )}

      <div className={styles.actions}>
        <button className={styles.pillGreen} type="button" onClick={handleExportJson} disabled={busy}>
          💾 Export JSON
        </button>
        <button className={styles.pillGreen} type="button" onClick={handleImportClick} disabled={busy}>
          ♻️ Import JSON
        </button>
        <button className={styles.pillAmber} type="button" onClick={handleExportExcel} disabled={busy}>
          📊 Export Excel
        </button>
        <button className={styles.pillAmber} type="button" onClick={handleExportPdf} disabled={busy}>
          📄 Export PDF
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          hidden
          onChange={handleImportFile}
        />
      </div>
    </div>
  );
}
