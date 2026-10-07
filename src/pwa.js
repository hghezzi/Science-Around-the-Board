// src/pwa.js
// Service worker registration and the "new version" flow.
//
// The service worker (vite-plugin-pwa, autoUpdate) installs a new deploy in the
// background and takes over at once (skipWaiting + clientsClaim). The page that
// is already open still runs the old code, so:
//   - on an empty start page we reload straight away (nothing to lose);
//   - anywhere else we show a notice with a Reload button (UpdateNotice.jsx),
//     so a game in progress is never interrupted.
// Open tabs also check for a new deploy every 30 minutes and whenever the page
// becomes visible again, so a tab left open all week still picks up fixes.
import { registerSW } from "virtual:pwa-register";

const CHECK_EVERY_MS = 30 * 60 * 1000;
const MIN_GAP_MS = 5 * 60 * 1000;

let reloadSafe = false;
let updateReady = false;
const listeners = new Set();

/** App tells us whether reloading now would lose anything. */
export function setUpdateReloadSafe(safe) {
  reloadSafe = Boolean(safe);
  if (updateReady && reloadSafe) window.location.reload();
}

/** Subscribe to "a new version is installed"; returns an unsubscribe function. */
export function onUpdateReady(fn) {
  listeners.add(fn);
  if (updateReady) fn();
  return () => listeners.delete(fn);
}

export function startServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  registerSW({
    immediate: true,
    onNeedReload() {
      updateReady = true;
      if (reloadSafe) window.location.reload();
      else listeners.forEach((fn) => fn());
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      let last = Date.now();
      const check = () => {
        if (!navigator.onLine || Date.now() - last < MIN_GAP_MS) return;
        last = Date.now();
        registration.update().catch(() => { /* offline or server hiccup: try again later */ });
      };
      setInterval(check, CHECK_EVERY_MS);
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
    },
  });
}
