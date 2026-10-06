// src/components/UpdateNotice.jsx
// "A new version is ready" notice (see pwa.js). Never reloads by itself during a session.
import React, { useEffect, useState } from "react";
import { Snackbar, Alert, Button } from "@mui/material";
import { onUpdateReady } from "../pwa";

export default function UpdateNotice() {
  const [open, setOpen] = useState(false);
  useEffect(() => onUpdateReady(() => setOpen(true)), []);
  return (
    <Snackbar open={open} anchorOrigin={{ vertical: "bottom", horizontal: "left" }}>
      <Alert
        severity="info"
        variant="filled"
        action={
          <>
            <Button color="inherit" size="small" onClick={() => window.location.reload()}>Reload</Button>
            <Button color="inherit" size="small" onClick={() => setOpen(false)}>Later</Button>
          </>
        }
        sx={{ alignItems: "center" }}
      >
        A new version of the game is ready. Reload when it suits you, for example between turns: your session is saved and can be resumed.
      </Alert>
    </Snackbar>
  );
}
