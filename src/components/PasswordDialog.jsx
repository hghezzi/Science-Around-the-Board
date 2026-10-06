// src/components/PasswordDialog.jsx
// Asks for the class password of an encrypted (.lock) question file.
import React, { useState } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Typography } from "@mui/material";

export default function PasswordDialog({ error, onSubmit, onCancel }) {
  const [password, setPassword] = useState("");
  return (
    <Dialog open onClose={onCancel} aria-labelledby="password-title">
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(password); }}>
        <DialogTitle id="password-title"><span aria-hidden>🔒 </span>This question file is protected</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>Enter the class password from your instructor.</Typography>
          <TextField
            autoFocus
            fullWidth
            type="password"
            label="Class password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={Boolean(error)}
            helperText={error || " "}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!password}>Unlock</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
