// src/online/useHostRoom.js
// React side of hosting an online game: opens a room (the network code loads only
// now), keeps the HostSession, and re-renders when the lobby changes.
import { useCallback, useEffect, useRef, useState } from "react";
import { HostSession } from "./sessions.js";
import { makeRoomCode } from "./protocol.js";

/**
 * `handlers` is read at call time (keep it in a ref): onAction, onSurvey, onMembers, syncFor.
 * Returns { room, status, lobby, session, open, close }: room is { code } once opened;
 * `session` is a ref to the HostSession, for event handlers.
 */
export function useHostRoom(handlersRef) {
  const sessionRef = useRef(null);
  const [room, setRoom] = useState(null);
  const [status, setStatus] = useState({ state: "idle" });
  // What the lobby screen shows: who plays which player, and which devices are connected.
  const [lobby, setLobby] = useState({ claims: [], devices: [] });

  const close = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    setRoom(null);
    setStatus({ state: "idle" });
    setLobby({ claims: [], devices: [] });
  }, []);

  const open = useCallback(async ({ code = makeRoomCode(), playerCount, claims, meta }) => {
    sessionRef.current?.close();
    setStatus({ state: "starting" });
    let createHostTransport;
    try {
      ({ createHostTransport } = await import("./peerTransport.js"));
    } catch {
      setStatus({ state: "error", detail: "load" });
      return null;
    }
    const transport = createHostTransport(code, { onStatus: (state, detail) => setStatus({ state, detail }) });
    const session = new HostSession({
      transport, playerCount, claims, meta,
      handlers: {
        onChange: (sess) => setLobby({ claims: [...sess.claims], devices: sess.deviceList() }),
        onAction: (...a) => handlersRef.current?.onAction?.(...a),
        onSurvey: (...a) => handlersRef.current?.onSurvey?.(...a),
        onMembers: (...a) => handlersRef.current?.onMembers?.(...a),
        syncFor: (...a) => handlersRef.current?.syncFor?.(...a) || [],
      },
    });
    session.start();
    sessionRef.current = session;
    setLobby({ claims: [...session.claims], devices: [] });
    setRoom({ code });
    return session;
  }, [handlersRef]);

  // Close the room when the page goes away (guests are told).
  useEffect(() => () => sessionRef.current?.close(), []);

  return { room, status, lobby, session: sessionRef, open, close };
}
