import { useRegisterSW } from "virtual:pwa-register/react";
import styles from "./UpdatePrompt.module.css";

const PERIODIC_CHECK_MS = 60 * 60 * 1000; // 1 hour

/**
 * Visible "new version available" banner (instead of silently swapping the
 * service worker under the user), plus friendly offline-ready and
 * registration-error messages. Uses vite-plugin-pwa's official React hook.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error("Service worker registration failed:", error);
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // The browser only checks for a new service worker on a fresh
      // navigation by default — someone who just switches back to an
      // already-open tab/PWA (foregrounding, not reloading) wouldn't see
      // this banner for a long time otherwise. Actively re-check:
      // whenever the app becomes visible again, and periodically while
      // it stays open.
      const check = () => registration.update().catch(() => {});
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
      window.setInterval(check, PERIODIC_CHECK_MS);
    },
  });

  if (needRefresh) {
    return (
      <div className={styles.banner} role="status">
        <span>🔄 A new version is available.</span>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            onClick={() => updateServiceWorker(true)}
          >
            Update
          </button>
          <button type="button" className={styles.dismiss} onClick={() => setNeedRefresh(false)}>
            Later
          </button>
        </div>
      </div>
    );
  }

  if (offlineReady) {
    return (
      <div className={styles.banner} role="status">
        <span>✅ App is ready for offline use.</span>
        <button type="button" className={styles.dismiss} onClick={() => setOfflineReady(false)}>
          Got it
        </button>
      </div>
    );
  }

  return null;
}
