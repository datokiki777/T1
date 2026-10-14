import { useState } from "react";
import { useAppStore } from "../../app/store";
import { BackupPanel } from "../backup/BackupPanel";
import { CloudSyncSettings } from "../../firebase/CloudSyncSettings";
import { NumericTextField } from "../../shared/ui/NumericTextField";
import packageJson from "../../../package.json";
import styles from "./SettingsPanel.module.css";

const CURRENCY_OPTIONS = [
  { symbol: "€", label: "€ Euro" },
  { symbol: "$", label: "$ US Dollar" },
  { symbol: "£", label: "£ British Pound" },
  { symbol: "₾", label: "₾ Georgian Lari" },
  { symbol: "₽", label: "₽ Russian Ruble" },
];

const CLEAR_CONFIRM_PHRASE = "DELETE";

export function SettingsPanel() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const clearAllData = useAppStore((s) => s.clearAllData);
  const groupsCount = useAppStore((s) => s.groups.length);
  const periodsCount = useAppStore((s) => s.periods.length);
  const rowsCount = useAppStore((s) => s.clientRows.length);

  const [clearConfirmText, setClearConfirmText] = useState("");
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const currentCurrency =
    CURRENCY_OPTIONS.find((opt) => opt.symbol === settings.currencySymbol) ?? CURRENCY_OPTIONS[0];

  const canClear = clearConfirmText.trim() === CLEAR_CONFIRM_PHRASE;

  async function handleClearAllData() {
    if (!canClear) return;
    setClearing(true);
    try {
      await clearAllData();
      setClearConfirmText("");
      setCleared(true);
      setTimeout(() => setCleared(false), 3000);
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>New group defaults</h2>
        <div className={styles.fieldRow}>
          <label className={styles.field}>
            <span>Default salary / month</span>
            <NumericTextField
              syncKey="app-settings"
              value={settings.defaultSalary}
              onChange={(n) => updateSettings({ defaultSalary: n })}
            />
          </label>
        </div>
        <p className={styles.hint}>
          This value is only used when creating a new group — existing groups
          are not affected.
        </p>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Currency display</h2>
        <div className={styles.field}>
          <span>Currency symbol</span>
          <button
            type="button"
            className={styles.currencyPickerBtn}
            onClick={() => setCurrencyPickerOpen(true)}
          >
            {currentCurrency.label}
          </button>
        </div>
        {currencyPickerOpen && (
          <div
            className={styles.currencyModalOverlay}
            onClick={() => setCurrencyPickerOpen(false)}
          >
            <div className={styles.currencyModalCard} onClick={(e) => e.stopPropagation()}>
              <div className={styles.currencyModalTitle}>Choose currency</div>
              <div className={styles.currencyModalList}>
                {CURRENCY_OPTIONS.map((opt) => (
                  <button
                    key={opt.symbol}
                    type="button"
                    className={
                      opt.symbol === settings.currencySymbol
                        ? styles.currencyOptionActive
                        : styles.currencyOption
                    }
                    onClick={() => {
                      updateSettings({ currencySymbol: opt.symbol });
                      setCurrencyPickerOpen(false);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={styles.currencyModalClose}
                onClick={() => setCurrencyPickerOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <p className={styles.hint}>
          This only changes how amounts are displayed — the stored numeric values stay unchanged.
        </p>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Confirmation</h2>
        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            checked={settings.confirmDestructiveActions}
            onChange={(e) => updateSettings({ confirmDestructiveActions: e.target.checked })}
          />
          <span>Confirm destructive actions (group, period, client)</span>
        </label>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Cloud Sync</h2>
        <CloudSyncSettings />
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Backup & Restore</h2>
        <BackupPanel />
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>App info</h2>
        <div className={styles.infoGrid}>
          <span>Name</span>
          <span>{packageJson.name}</span>
          <span>Version</span>
          <span>
            {packageJson.version} <span style={{ color: "var(--text-muted)" }}>({__BUILD_ID__})</span>
          </span>
          <span>Built</span>
          <span>{new Date(__BUILD_TIME__).toLocaleString()}</span>
          <span>Data</span>
          <span>
            {groupsCount} groups · {periodsCount} periods · {rowsCount} clients
          </span>
        </div>
      </section>

      <section className={`${styles.card} ${styles.dangerCard}`}>
        <h2 className={styles.cardTitle}>Delete all data</h2>
        <p className={styles.hint}>
          This permanently deletes every group, period, and client on this device.
          This action is <b>irreversible</b>. Type <code>{CLEAR_CONFIRM_PHRASE}</code> exactly
          to enable the button.
        </p>
        <div className={styles.clearRow}>
          <input
            type="text"
            className={styles.clearInput}
            value={clearConfirmText}
            onChange={(e) => setClearConfirmText(e.target.value)}
            placeholder={CLEAR_CONFIRM_PHRASE}
            aria-label={`Type "${CLEAR_CONFIRM_PHRASE}" to confirm deletion`}
          />
          <button
            type="button"
            className={styles.clearBtn}
            disabled={!canClear || clearing}
            onClick={handleClearAllData}
          >
            {clearing ? "Deleting…" : "Delete all data"}
          </button>
        </div>
        {cleared && <div className={styles.clearedMessage}>All data deleted.</div>}
      </section>
    </div>
  );
}
