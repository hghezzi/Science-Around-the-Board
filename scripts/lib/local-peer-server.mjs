// A local PeerJS signalling server for tests, and a Playwright route that sends the
// game's connections to it instead of the public service (wss://0.peerjs.com).
// Used by smoke-test.mjs (online scenario); the cloud environment can't reach the real one.
import { PeerServer } from "peer";
import WebSocket from "ws";

export async function startPeerServer(port = 0) {
  return new Promise((resolve, reject) => {
    const server = PeerServer({ port, host: "127.0.0.1", path: "/", allow_discovery: false }, (http) => {
      resolve({ port: http.address().port, close: () => { http.closeAllConnections?.(); http.close(); } });
    });
    server.on("error", reject);
  });
}

/** Route every PeerJS WebSocket of `context` to the local server on `port`. */
export async function routePeerJs(context, port) {
  await context.routeWebSocket(/0\.peerjs\.com/, (ws) => {
    const url = new URL(ws.url());
    const upstream = new WebSocket(`ws://127.0.0.1:${port}${url.pathname}${url.search}`);
    const queue = [];
    upstream.on("open", () => { while (queue.length) upstream.send(queue.shift()); });
    upstream.on("message", (data, isBinary) => { try { ws.send(isBinary ? data : data.toString()); } catch { /* page gone */ } });
    upstream.on("close", () => { try { ws.close(); } catch { /* already closed */ } });
    upstream.on("error", () => { try { ws.close(); } catch { /* already closed */ } });
    ws.onMessage((msg) => { if (upstream.readyState === WebSocket.OPEN) upstream.send(msg); else queue.push(msg); });
    ws.onClose(() => upstream.close());
  });
}

/** Chromium flags so two pages on one machine can connect (no mDNS hiding of local addresses). */
export const WEBRTC_ARGS = ["--disable-features=WebRtcHideLocalIpsWithMdns", "--allow-loopback-in-peer-connection"];
