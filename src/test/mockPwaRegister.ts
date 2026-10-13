import { useState } from "react";

/**
 * Test-only stand-in for vite-plugin-pwa's virtual "virtual:pwa-register/react"
 * module, which only exists inside an actual Vite build/dev server. Vitest
 * doesn't run the VitePWA plugin, so this keeps the same shape (needRefresh/
 * offlineReady tuples + updateServiceWorker) without touching real service
 * workers, which jsdom doesn't meaningfully support anyway.
 */
export function useRegisterSW(_options?: {
  onRegisterError?: (error: unknown) => void;
}): {
  needRefresh: [boolean, (v: boolean) => void];
  offlineReady: [boolean, (v: boolean) => void];
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
} {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);

  return {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker: async () => {},
  };
}
