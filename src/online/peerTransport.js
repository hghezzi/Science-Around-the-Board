// src/online/peerTransport.js
// The real network for online play: WebRTC data channels between browsers, found
// through the free PeerJS signalling service (0.peerjs.com, which only introduces
// the devices; game data then flows device to device, encrypted by WebRTC).
// PeerJS is loaded only when someone hosts or joins an online game.
import { hostPeerId } from "./protocol.js";

const CONNECT_TIMEOUT_MS = 15000;

async function loadPeer() {
  const mod = await import("peerjs");
  return mod.Peer || mod.default;
}

// Wrap a PeerJS DataConnection as { send, onData, onClose, close }.
function wrap(dc) {
  const closers = [];
  let closed = false;
  const fireClose = () => { if (!closed) { closed = true; closers.forEach((fn) => fn()); } };
  dc.on("close", fireClose);
  dc.on("error", fireClose);
  // Browsers don't always report a vanished peer; PeerJS watches the ICE state.
  dc.on("iceStateChanged", (state) => { if (state === "disconnected" || state === "failed" || state === "closed") fireClose(); });
  return {
    send: (msg) => dc.send(msg),
    onData: (fn) => dc.on("data", fn),
    onClose: (fn) => closers.push(fn),
    close: () => { try { dc.close(); } catch { /* already closed */ } fireClose(); },
  };
}

const errorOf = (code, message) => Object.assign(new Error(message), { code });

/**
 * Host a room. `onStatus(status, detail)` gets "starting", "ready", "reconnecting"
 * or "error" (detail: "taken" when the room code is in use, "network", "unsupported").
 */
export function createHostTransport(code, { onStatus } = {}) {
  let peer = null;
  let destroyed = false;
  let onConnection = () => {};
  let retries = 0;

  const open = async () => {
    const Peer = await loadPeer();
    if (destroyed) return;
    onStatus?.("starting");
    peer = new Peer(hostPeerId(code), { debug: 0 });
    peer.on("open", () => { retries = 0; onStatus?.("ready"); });
    peer.on("connection", (dc) => {
      dc.on("open", () => onConnection(wrap(dc)));
    });
    // Lost the signalling server (Wi-Fi blip): existing games keep running; reconnect for new joins.
    peer.on("disconnected", () => {
      if (destroyed || peer.destroyed) return;
      onStatus?.("reconnecting");
      setTimeout(() => { if (!destroyed && !peer.destroyed) peer.reconnect(); }, 2000);
    });
    peer.on("error", (err) => {
      if (destroyed) return;
      if (err.type === "unavailable-id") {
        // After a reload the server may still hold the old connection for a few seconds.
        if (retries++ < 6) { peer.destroy(); setTimeout(open, 3000); onStatus?.("starting"); return; }
        onStatus?.("error", "taken");
      } else if (err.type === "browser-incompatible") onStatus?.("error", "unsupported");
      else if (["network", "server-error", "socket-error", "socket-closed"].includes(err.type)) onStatus?.("reconnecting", "network");
      // "peer-unavailable" and others concern one guest; the game goes on.
    });
  };

  return {
    listen(fn) { onConnection = fn; open(); },
    close() { destroyed = true; peer?.destroy(); },
  };
}

/** Join a room. Each `connect()` resolves with a connection or rejects (.code "not-found" | "network" | "unsupported"). */
export function createGuestTransport(code, { deviceId } = {}) {
  let peer = null;
  let peerReady = null;

  const ensurePeer = async () => {
    if (peer && !peer.destroyed && !peer.disconnected) return peer;
    if (peer && peer.disconnected && !peer.destroyed) { peer.reconnect(); }
    else {
      const Peer = await loadPeer();
      // A fresh id each time: the old one may still be held by the server after a drop.
      peer = new Peer(`sab-guest-${deviceId || "x"}-${Math.random().toString(36).slice(2, 8)}`, { debug: 0 });
    }
    const p = peer;
    peerReady = new Promise((resolve, reject) => {
      if (p.open) { resolve(p); return; }
      const timer = setTimeout(() => reject(errorOf("network", "Couldn't reach the connection service.")), CONNECT_TIMEOUT_MS);
      p.once("open", () => { clearTimeout(timer); resolve(p); });
      p.once("error", (err) => {
        clearTimeout(timer);
        reject(errorOf(err.type === "browser-incompatible" ? "unsupported" : "network", err.message || String(err.type)));
      });
    });
    return peerReady;
  };

  return {
    async connect() {
      const p = await ensurePeer();
      return new Promise((resolve, reject) => {
        const dc = p.connect(hostPeerId(code), { reliable: true, serialization: "json" });
        const timer = setTimeout(() => { try { dc.close(); } catch { /* ignore */ } reject(errorOf("network", "The host didn't answer.")); }, CONNECT_TIMEOUT_MS);
        const onError = (err) => {
          if (err.type !== "peer-unavailable") return;
          p.off("error", onError);
          clearTimeout(timer);
          reject(errorOf("not-found", "No game with this code is open."));
        };
        p.on("error", onError);
        dc.on("open", () => { clearTimeout(timer); p.off("error", onError); resolve(wrap(dc)); });
      });
    },
    close() { peer?.destroy(); },
  };
}
