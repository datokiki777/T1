import { useState } from "react";
import { useAppStore } from "../app/store";
import { manualCloudSave, resolveCloudConflict } from "./cloudSyncController";
import { RestoreSourcePicker } from "./RestoreSourcePicker";
import { DataBackupPanel } from "../features/backup/DataBackupPanel";
import { signInWithEmail, signOutOfCloud } from "./auth";
import { isFirebaseConfigured } from "./config";
import styles from "../features/settings/SettingsPanel.module.css";

const STATUS_LABEL: Record<string, string> = {
  idle: "Not synced yet",
  syncing: "Syncing…",
  synced: "Synced",
  local: "Saved locally (will sync when possible)",
  error: "Cloud error",
};

function formatSyncTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `Synced - ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

function describeAuthError(err: unknown): string {
  const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
  switch (code) {
    case "auth/user-not-found":
      return "No account exists with this email yet — it must be created first in the Firebase Console (Authentication > Users > Add user).";
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Wrong email or password.";
    case "auth/invalid-email":
      return "That doesn't look like a valid email address.";
    case "auth/user-disabled":
      return "This account has been disabled in the Firebase Console.";
    case "auth/too-many-requests":
      return "Too many failed attempts — wait a bit before trying again.";
    case "auth/network-request-failed":
      return "Network error — check your connection and try again.";
    case "auth/operation-not-allowed":
      return "Email/Password sign-in isn't enabled for this project (Firebase Console > Authentication > Sign-in method).";
    default:
      return code ? `Sign in failed (${code}).` : "Sign in failed — check your email and password.";
  }
}

function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Enter both email and password.");
      return;
    }
    setSigningIn(true);
    setError(null);
    try {
      await signInWithEmail(email, password);
      // onAuthStateChanged (subscribed in startCloudSync) picks this up
      // and triggers the first sync automatically.
    } catch (err) {
      console.error("Sign in failed:", err);
      setError(describeAuthError(err));
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p className={styles.hint}>
        Sign in once on this device to sync your data to the cloud and pull it
        down on any other device. Entirely optional — the app works fully
        offline without this.
      </p>
      <div className={styles.fieldRow}>
        <label className={styles.field}>
          <span>Email</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <div role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>
          {error}
        </div>
      )}
      <button
        type="submit"
        className={styles.clearBtn}
        style={{ background: "var(--accent)", alignSelf: "flex-start" }}
        disabled={signingIn}
      >
        {signingIn ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export function CloudSyncSettings() {
  const cloudUserEmail = useAppStore((s) => s.cloudUserEmail);
  const cloudStatus = useAppStore((s) => s.cloudStatus);
  const cloudError = useAppStore((s) => s.cloudError);
  const cloudConflict = useAppStore((s) => s.cloudConflict);
  const cloudLastSyncedAt = useAppStore((s) => s.cloudLastSyncedAt);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dataPanelOpen, setDataPanelOpen] = useState(false);

  async function handleSave() {
    setBusy(true);
    setMessage(null);
    try {
      await manualCloudSave();
      setMessage("Saved to cloud.");
    } catch {
      setMessage("Cloud save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    setMessage(null);
    try {
      await signOutOfCloud();
      // No success message needed — signing out immediately swaps this
      // view back to the sign-in form (cloudUserEmail becomes null via
      // the auth-state listener), which is its own clear confirmation.
    } catch {
      setMessage("Sign out failed — check your connection and try again.");
      setBusy(false);
    }
  }

  const syncTimeLabel = formatSyncTime(cloudLastSyncedAt);

  if (!isFirebaseConfigured) {
    return (
      <div>
        <p className={styles.hint}>
          ☁️ Cloud sync isn't set up for this app yet. Your data is still safe
          and fully usable — everything is stored on this device. Backup/
          restore via Export/Import JSON below still works as normal.
        </p>
      </div>
    );
  }

  if (cloudConflict) {
    return (
      <div>
        <p className={styles.hint}>
          <b>This device and the cloud both have changes and we can't tell which is
          newer.</b> Choose which version to keep — the other will be replaced.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className={styles.pillBlue}
            style={{ flex: 1 }}
            onClick={() => resolveCloudConflict("keep-local")}
          >
            ☁️ Save Cloud
          </button>
          <button
            type="button"
            className={styles.pillBlue}
            style={{ flex: 1 }}
            onClick={() => resolveCloudConflict("use-cloud")}
          >
            ☁️ Restore Cloud
          </button>
        </div>
        <button
          type="button"
          className={styles.pillPurple}
          style={{ marginTop: 10, alignSelf: "center" }}
          onClick={() => setDataPanelOpen(true)}
        >
          💾 Data & Backup details
        </button>
        {dataPanelOpen && <DataBackupPanel onClose={() => setDataPanelOpen(false)} />}
      </div>
    );
  }

  if (!cloudUserEmail) {
    return <SignInForm />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className={styles.infoGrid}>
        <span>Account</span>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          {cloudUserEmail}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={busy}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              textDecoration: "underline",
              cursor: "pointer",
              fontSize: 13,
              padding: 0,
            }}
          >
            Sign out
          </button>
        </span>
        <span>Status</span>
        <span>{STATUS_LABEL[cloudStatus] ?? cloudStatus}</span>
        {cloudStatus === "error" && cloudError && (
          <>
            <span>Details</span>
            <span>{cloudError}</span>
          </>
        )}
      </div>
      {syncTimeLabel && (
        <div style={{ fontSize: 13, color: "var(--success)" }}>{syncTimeLabel}</div>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          className={styles.pillBlue}
          style={{ flex: 1 }}
          onClick={handleSave}
          disabled={busy}
        >
          ☁️ Save to cloud now
        </button>
        <button
          type="button"
          className={styles.pillBlue}
          style={{ flex: 1 }}
          onClick={() => setPickerOpen(true)}
          disabled={busy}
        >
          ☁️ Load from cloud
        </button>
      </div>
      {message && <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{message}</div>}
      {pickerOpen && <RestoreSourcePicker onClose={() => setPickerOpen(false)} />}

      <button
        type="button"
        className={styles.pillPurple}
        style={{ marginTop: 6, alignSelf: "center" }}
        onClick={() => setDataPanelOpen(true)}
      >
        💾 Data & Backup details
      </button>
      {dataPanelOpen && <DataBackupPanel onClose={() => setDataPanelOpen(false)} />}
    </div>
  );
}
