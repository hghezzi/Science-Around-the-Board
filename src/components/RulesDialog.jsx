// src/components/RulesDialog.jsx
// Quick-play rules (labels.js RULES). Opens by itself on a new game's first turn
// and from the "How to play" buttons in the game and on the start page.
import React from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography } from "@mui/material";
import { LABELS, rulesFor } from "../labels";
import { SR_ONLY } from "../theme";

export default function RulesDialog({ open, onClose, intro = "", playerCount, bot = false }) {
  return (
    <Dialog open={open} onClose={onClose} aria-labelledby="rules-title" maxWidth="sm" fullWidth>
      <DialogTitle id="rules-title"><span aria-hidden>📖 </span>{LABELS.howToPlay}</DialogTitle>
      {/* Focusable so keyboard users can scroll the list on short screens. */}
      <DialogContent dividers tabIndex={0} role="region" aria-label="Quick rules">
        {intro && <Typography sx={{ mb: 2 }}>{intro}</Typography>}
        <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, display: "flex", flexDirection: "column", gap: 1.75 }}>
          {rulesFor(playerCount, bot).map((r) => (
            <Box component="li" key={r.title} sx={{ display: "flex", gap: 1.5 }}>
              <Box aria-hidden sx={{ fontSize: 24, lineHeight: 1.2, width: 32, textAlign: "center", flexShrink: 0 }}>{r.icon}</Box>
              <Box>
                <Typography sx={{ fontWeight: 800 }}>{r.title}</Typography>
                <Typography variant="body2" color="text.secondary">{r.text}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between", px: 3, flexWrap: "wrap", gap: 1 }}>
        <Button href="./guide/students.html" target="_blank" rel="noopener">Full student guide<span aria-hidden>&nbsp;↗</span><Box component="span" sx={SR_ONLY}> (opens in a new tab)</Box></Button>
        <Button variant="contained" autoFocus onClick={onClose}>Got it</Button>
      </DialogActions>
    </Dialog>
  );
}
