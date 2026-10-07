// src/online/HostScreens.jsx
// The host's screens around an online game: the lobby (room code, who plays which
// player) and the wait while players answer their surveys on their own devices.
import React, { useState } from "react";
import { Box, Button, Card, Container, Typography, Alert, TextField, LinearProgress, Chip } from "@mui/material";
import TeamToken from "../components/TeamToken";
import { teamDisplayName } from "../labels";
import { formatRoomCode, joinLink, lobbyReady } from "./protocol";

const STATUS_TEXT = {
  idle: "Opening the room…",
  starting: "Opening the room…",
  ready: "The room is open. Players can join now.",
  reconnecting: "Reconnecting to the connection service… Games already running carry on.",
};

function errorText(detail) {
  if (detail === "taken") return "This room code is already in use. Go back and open the room again to get a new code.";
  if (detail === "unsupported") return "This browser can't host online games. Use an up-to-date Chrome, Edge, Firefox or Safari.";
  if (detail === "load") return "Couldn't load online play. Check the internet connection and try again.";
  return "Couldn't open the room. Check the internet connection, or play on this computer instead.";
}

export function HostLobby({ code, status, lobby, playerCount, onHostSlot, onFreeSlot, onRemoveDevice, onStart, onBack }) {
  const [copied, setCopied] = useState(false);
  const link = joinLink(`${window.location.origin}${window.location.pathname}`, code);
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); } };
  const claims = lobby.claims.length ? lobby.claims : Array(playerCount).fill(null);
  const labelOf = (token) => lobby.devices.find((d) => d.token === token)?.label || "A device";
  const online = (token) => lobby.devices.find((d) => d.token === token)?.online;
  const ready = lobbyReady(claims);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", color: "text.primary", py: 5 }}>
      <Container maxWidth="md">
        <Typography variant="h3" component="h1" sx={{ textAlign: "center", mb: 1 }}>Online game</Typography>
        <Typography color="text.secondary" sx={{ textAlign: "center", mb: 3 }}>
          Players join on their own computer, tablet or phone. Keep this page open: the game runs here.
        </Typography>

        <Card sx={{ p: 3, mb: 3, textAlign: "center" }}>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>Room code</Typography>
          <Typography component="p" aria-label={`Room code ${code.split("").join(" ")}`} sx={{ fontFamily: '"Fredoka", sans-serif', fontWeight: 600, fontSize: { xs: "2.6rem", sm: "3.6rem" }, letterSpacing: "0.12em", lineHeight: 1.1 }}>
            {formatRoomCode(code)}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Players open <strong>{window.location.host}{window.location.pathname}</strong>, choose <strong>Join an online game</strong> and type the code, or open this link:
          </Typography>
          <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap", justifyContent: "center" }}>
            <TextField size="small" label="Join link" value={link} slotProps={{ htmlInput: { readOnly: true } }} sx={{ flex: "1 1 320px", maxWidth: 520 }} />
            <Button variant="contained" onClick={copy}>{copied ? "Copied ✓" : "Copy link"}</Button>
          </Box>
          <Box sx={{ mt: 2 }} role="status" aria-live="polite">
            {status.state === "error"
              ? <Alert severity="error" sx={{ textAlign: "left" }}>{errorText(status.detail)}</Alert>
              : <>
                  {status.state !== "ready" && <LinearProgress sx={{ mb: 1 }} />}
                  <Typography variant="body2" color={status.state === "ready" ? "success.main" : "text.secondary"} sx={{ fontWeight: 700 }}>{STATUS_TEXT[status.state] || STATUS_TEXT.starting}</Typography>
                </>}
          </Box>
        </Card>

        <Card sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" component="h2" gutterBottom>Players</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Each device picks the player it plays. A player can also play on this computer, for example a group in the room.
          </Typography>
          <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, display: "flex", flexDirection: "column", gap: 1 }}>
            {claims.map((holder, i) => (
              <Box component="li" key={i} sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 1.25, border: "1px solid", borderColor: "divider", borderRadius: 2, flexWrap: "wrap" }}>
                <TeamToken index={i} />
                <Typography sx={{ fontWeight: 800, flex: "1 1 140px" }}>{teamDisplayName(i, playerCount)}</Typography>
                <Box sx={{ flex: "1 1 180px" }}>
                  {holder === "host" && <Chip label="On this computer" color="primary" variant="outlined" />}
                  {holder && holder !== "host" && <Chip label={`${labelOf(holder)}${online(holder) ? "" : " · offline"}`} color={online(holder) ? "success" : "warning"} variant="outlined" />}
                  {!holder && <Typography variant="body2" color="text.secondary">Waiting for a device…</Typography>}
                </Box>
                {holder === "host" && <Button size="small" onClick={() => onHostSlot(i, false)}>Free</Button>}
                {holder && holder !== "host" && <Button size="small" onClick={() => onFreeSlot(i)}>Free</Button>}
                {!holder && <Button size="small" variant="outlined" onClick={() => onHostSlot(i, true)}>Play on this computer</Button>}
              </Box>
            ))}
          </Box>
          {lobby.devices.length > 0 && (
            <>
              <Typography variant="subtitle2" component="h3" sx={{ mt: 3, mb: 1, fontWeight: 800 }}>Connected devices</Typography>
              <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, display: "flex", flexWrap: "wrap", gap: 1 }}>
                {lobby.devices.map((d) => (
                  <Box component="li" key={d.token} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Chip
                      label={`${d.label}${d.slots.length ? ` · ${d.slots.map((s) => teamDisplayName(s, playerCount)).join(", ")}` : " · choosing"}${d.online ? "" : " · offline"}`}
                      onDelete={() => onRemoveDevice(d.token)}
                      deleteIcon={<Box component="span" aria-label={`Remove ${d.label}`} sx={{ fontSize: 14, px: 0.5 }}>✕</Box>}
                      variant="outlined"
                    />
                  </Box>
                ))}
              </Box>
            </>
          )}
        </Card>

        <Box sx={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap" }}>
          <Button size="large" color="inherit" onClick={onBack}>Back to setup</Button>
          <Button size="large" variant="contained" color="success" disabled={!ready || status.state === "error"} onClick={onStart} sx={{ px: 5 }}>
            Start the game <span aria-hidden>&nbsp;→</span>
          </Button>
        </Box>
        {!ready && <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: 1.5 }}>Every player needs a device, or "Play on this computer", before the game can start.</Typography>}
      </Container>
    </Box>
  );
}

/** Players answer their surveys on their own devices; this shows who is done. */
export function SurveyWait({ phase, playerCount, done, holders, devices, onAnswerHere }) {
  const online = (token) => devices.find((d) => d.token === token)?.online;
  const finished = done.filter(Boolean).length;
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", color: "text.primary", py: 6 }}>
      <Container maxWidth="sm">
        <Card sx={{ p: { xs: 3, md: 4 } }}>
          <Typography variant="h4" component="h1" gutterBottom>{phase === "pre" ? "Pre-game survey" : "Post-game survey"}</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Players are answering on their own devices. The {phase === "pre" ? "game starts" : "results screen opens"} when everyone is done.
          </Typography>
          <LinearProgress variant="determinate" value={(100 * finished) / playerCount} aria-label={`${finished} of ${playerCount} players done`} sx={{ mb: 2, height: 8, borderRadius: 4 }} />
          <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, display: "flex", flexDirection: "column", gap: 1 }} aria-live="polite">
            {Array.from({ length: playerCount }, (_, i) => (
              <Box component="li" key={i} sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                <TeamToken index={i} />
                <Typography sx={{ fontWeight: 800, flex: 1 }}>{teamDisplayName(i, playerCount)}</Typography>
                {done[i]
                  ? <Typography sx={{ fontWeight: 700, color: "success.main" }}>Done ✓</Typography>
                  : <>
                      <Typography variant="body2" color="text.secondary">{holders[i] && holders[i] !== "host" && !online(holders[i]) ? "Device offline" : "Answering…"}</Typography>
                      <Button size="small" onClick={() => onAnswerHere(i)}>Answer on this computer</Button>
                    </>}
              </Box>
            ))}
          </Box>
        </Card>
      </Container>
    </Box>
  );
}
