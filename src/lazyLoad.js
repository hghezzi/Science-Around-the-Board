// src/lazyLoad.js
// React.lazy with one automatic recovery. After a new version is deployed, an
// old open page may ask for a code file that no longer exists; reloading once
// fetches the new version (an autosaved game is then offered for resume).
import { lazy } from "react";

const FLAG = "lab-chunk-reload";

export function lazyWithReload(load) {
  return lazy(async () => {
    try {
      const mod = await load();
      try { sessionStorage.removeItem(FLAG); } catch { /* storage blocked */ }
      return mod;
    } catch (err) {
      let reloaded = false;
      try { reloaded = sessionStorage.getItem(FLAG) === "1"; sessionStorage.setItem(FLAG, "1"); } catch { reloaded = true; }
      if (!reloaded && typeof window !== "undefined") {
        window.location.reload();
        return new Promise(() => {}); // keep showing the fallback until the page reloads
      }
      throw err;
    }
  });
}
