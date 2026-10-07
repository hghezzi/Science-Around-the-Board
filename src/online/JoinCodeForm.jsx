// src/online/JoinCodeForm.jsx
import React, { useState } from "react";
import { Box, Button, TextField } from "@mui/material";
import { normalizeRoomCode } from "./protocol";

/** Ask for a room code (the start page's "Join an online game"). */
export default function JoinCodeForm({ onJoin, onCancel, initial = "" }) {
  const [text, setText] = useState(initial);
  const code = normalizeRoomCode(text);
  return (
    <Box component="form" onSubmit={(e) => { e.preventDefault(); if (code) onJoin(code); }} sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "flex-start" }}>
      <TextField
        autoFocus
        label="Room code"
        placeholder="ABC-D2F"
        value={text}
        onChange={(e) => setText(e.target.value)}
        helperText={text && !code ? "A room code has 6 letters and numbers, like ABC-D2F." : "From your host's screen."}
        error={Boolean(text) && !code}
        slotProps={{ htmlInput: { autoCapitalize: "characters", autoComplete: "off", spellCheck: false, maxLength: 9 } }}
        sx={{ flex: "1 1 200px" }}
      />
      <Button type="submit" variant="contained" size="large" disabled={!code} sx={{ mt: 0.5 }}>Join</Button>
      {onCancel && <Button size="large" color="inherit" onClick={onCancel} sx={{ mt: 0.5 }}>Cancel</Button>}
    </Box>
  );
}

