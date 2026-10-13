import { useEffect, useRef, useState } from "react";
import { useAppStore } from "./app/store";
import { GroupSwitcher } from "./features/groups/GroupSwitcher";
import { PeriodList } from "./features/periods/PeriodList";
import { OverviewSection } from "./features/overview/OverviewSection";
import { ReviewSearch } from "./features/review/ReviewSearch";
import { ReviewList } from "./features/review/ReviewList";
import { SettingsPanel } from "./features/settings/SettingsPanel";
import { UpdatePrompt } from "./pwa/UpdatePrompt";
import { ModalHost } from "./shared/modal/ModalHost";
import { startCloudSync } from "./firebase/cloudSyncController";
import styles from "./App.module.css";

function App() {
  const loaded = useAppStore((s) => s.loaded);
  const initError = useAppStore((s) => s.initError);
  // The splash stays mounted (covering the screen) until its fade-out
  // transition actually finishes — tied to real `loaded` state, not a
  // fixed delay, so it never disappears before data is ready and never
  // lingers once it is. 300ms gives the 0.25s CSS opacity transition a
  // small buffer to genuinely finish before the overlay is removed.
  const [splashVisible, setSplashVisible] = useState(true);
  useEffect(() => {
    if (loaded && !initError) {
      const t = setTimeout(() => setSplashVisible(false), 300);
      return () => clearTimeout(t);
    }
  }, [loaded, initError]);
  const init = useAppStore((s) => s.init);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const workspace = useAppStore((s) => s.workspace);
  const setWorkspace = useAppStore((s) => s.setWorkspace);
  const activeGroupsCount = useAppStore((s) => s.groups.filter((g) => !g.archived).length);
  const archivedGroupsCount = useAppStore((s) => s.groups.filter((g) => g.archived).length);
  const amountsHidden = useAppStore((s) => s.amountsHidden);
  const toggleAmountsHidden = useAppStore((s) => s.toggleAmountsHidden);
  const hideAmounts = useAppStore((s) => s.hideAmounts);

  // Remembers which mode (Edit/Review) was active before Settings was
  // opened, so a second tap on the Settings button closes it back to
  // wherever the person actually was, instead of always landing on Edit.
  const lastNonSettingsMode = useRef<"edit" | "review">("edit");
  if (mode !== "settings") {
    lastNonSettingsMode.current = mode;
  }

  function toggleSettings() {
    setMode(mode === "settings" ? lastNonSettingsMode.current : "settings");
  }

  useEffect(() => {
    init();
  }, [init]);

  // Re-hides amounts the instant the app is backgrounded (tab switch,
  // app-switcher, phone lock, etc.) — not when it comes back into view,
  // specifically so there's zero chance of a visible-amounts flash for
  // whoever looks at the screen next. Covers both a true reload (where
  // the store already starts hidden anyway) and the more common PWA case
  // where Android just resumes the same still-running page instead of
  // actually restarting it.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        hideAmounts();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [hideAmounts]);

  // Blocks the browser's own native "Copy" context menu, EXCEPT inside
  // text fields. This isn't about preventing copying — it's that Android
  // Chrome's touch-and-hold-to-select gesture fires at roughly the same
  // ~500ms threshold our own long-press interactions use (Review's
  // client cards, the group switcher's menu), and can occasionally win
  // the race even with touch-action/user-select set on those specific
  // elements. Blocking contextmenu directly is the reliable layer on top
  // of that, since a long-press anywhere should always mean "our
  // action", never "show the browser's copy popup" — EXCEPT inside an
  // actual input/textarea (or any contentEditable element), where that
  // same long-press gesture is the only way to get the native Paste/
  // Cut/Copy/Select-all menu on a touch keyboard — blocking it there
  // breaks pasting a copied link into a field like City entirely.
  useEffect(() => {
    function handleContextMenu(e: Event) {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isEditable) return;
      e.preventDefault();
    }
    document.addEventListener("contextmenu", handleContextMenu);
    return () => document.removeEventListener("contextmenu", handleContextMenu);
  }, []);

  useEffect(() => {
    if (loaded && !initError) {
      // Cloud sync runs entirely in the background: it watches auth state,
      // and if nobody's signed in yet it just stays in local-only mode —
      // signing in (Settings > Cloud Sync) is opt-in, never a blocking
      // gate on top of the app. Firebase Auth persists a session across
      // reloads on its own, so this is a one-time sign-in per device.
      //
      // Deliberately deferred (not called immediately): Firebase's own
      // SDK is genuinely large (Auth + Firestore is several hundred KB of
      // JS), and starting to download/parse/execute it the instant the
      // app becomes visible competes with the browser for the same CPU
      // it needs to finish painting — exactly the kind of background
      // work that turns a fast cold start into a janky one, especially
      // on an already-throttled/low-battery device. Letting the browser
      // report itself idle first (or falling back to a short delay where
      // requestIdleCallback isn't available) means cloud sync starts
      // only once the actual UI is already fully rendered and settled.
      const idleCallback =
        typeof requestIdleCallback === "function"
          ? requestIdleCallback(() => startCloudSync(), { timeout: 4000 })
          : window.setTimeout(() => startCloudSync(), 1500);
      return () => {
        if (typeof cancelIdleCallback === "function" && typeof idleCallback === "number") {
          cancelIdleCallback(idleCallback);
        } else {
          window.clearTimeout(idleCallback as ReturnType<typeof setTimeout>);
        }
      };
    }
  }, [loaded, initError]);

  if (initError) {
    return (
      <div className={styles.splash}>
        <div className={styles.errorBox} role="alert">
          <div className={styles.errorTitle}>⚠️ Failed to load local data</div>
          <div className={styles.errorText}>{initError}</div>
          <div className={styles.errorHint}>
            Try refreshing the page. If that doesn't help, IndexedDB might be
            blocked by your browser (e.g. private mode).
          </div>
          <button className={styles.errorRetry} onClick={() => init()} type="button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // PIN lock was removed — it added a startup delay for no real security
  // benefit (client-side PINs are trivially bypassable anyway).

  return (
    <>
      {splashVisible && (
        <div
          className={loaded ? `${styles.splash} ${styles.splashFadeOut}` : styles.splash}
          aria-label="Loading"
          data-testid="app-splash"
        >
          <div className={styles.splashLogo} aria-hidden="true">T1</div>
          <div className={styles.splashSpinner} aria-hidden="true" />
        </div>
      )}
      {loaded && (
        <div className={`${styles.app}${amountsHidden ? " amounts-hidden" : ""}`}>
      <header className={styles.topbar}>
        <div className={styles.topRow}>
          <div className={styles.workspaceSwitch} role="tablist" aria-label="Workspace">
            <button
              className={workspace === "active" ? styles.tabActive : styles.tab}
              onClick={() => setWorkspace("active")}
              role="tab"
              aria-selected={workspace === "active"}
            >
              <span className={styles.tabCount} aria-hidden="true">
                {activeGroupsCount}
              </span>
              Active
            </button>
            <button
              className={workspace === "archive" ? styles.tabActive : styles.tab}
              onClick={() => setWorkspace("archive")}
              role="tab"
              aria-selected={workspace === "archive"}
            >
              <span className={styles.tabCount} aria-hidden="true">
                {archivedGroupsCount}
              </span>
              Archive
            </button>
          </div>
          <button
            className={mode === "settings" ? styles.settingsBtnActive : styles.settingsBtn}
            onClick={toggleSettings}
            role="tab"
            aria-selected={mode === "settings"}
            aria-label="Settings"
            type="button"
          >
            ⚙️
          </button>
        </div>
        <div className={styles.topRow}>
          <div className={styles.modeSwitchCompact} role="tablist" aria-label="Mode">
            <button
              className={mode === "edit" ? styles.tabActive : styles.tab}
              onClick={() => setMode("edit")}
              role="tab"
              aria-selected={mode === "edit"}
            >
              Edit
            </button>
            <button
              className={mode === "review" ? styles.tabActive : styles.tab}
              onClick={() => setMode("review")}
              role="tab"
              aria-selected={mode === "review"}
            >
              Review
            </button>
          </div>
          <div className={styles.groupSwitcherSlot}>
            <GroupSwitcher />
          </div>
          <button
            type="button"
            className={amountsHidden ? styles.amountsToggleActive : styles.amountsToggle}
            onClick={toggleAmountsHidden}
            aria-pressed={amountsHidden}
            aria-label={amountsHidden ? "Show amounts" : "Hide amounts"}
            title={amountsHidden ? "Show amounts" : "Hide amounts"}
          >
            {amountsHidden ? "🙈" : "👁️"}
          </button>
        </div>
      </header>

      <main className={styles.main}>
        {mode === "settings" ? (
          <SettingsPanel />
        ) : (
          <>
            <OverviewSection />
            {mode === "edit" ? (
              <PeriodList />
            ) : (
              <>
                <ReviewSearch />
                <ReviewList />
              </>
            )}
          </>
        )}
      </main>

      <footer className={styles.footer}>
        Data is stored on this device (IndexedDB). Backup/restore is under the Settings tab.
      </footer>

      <UpdatePrompt />
      <ModalHost />
        </div>
      )}
    </>
  );
}

export default App;
