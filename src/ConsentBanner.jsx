// src/ConsentBanner.jsx
import React, { useEffect, useState } from "react";
import { Paper, Typography, Button, Box, Link } from "@mui/material";
import { getConsent, setConsent, CONSENT_RESET_EVENT } from "./consent";

// Shown on the start page only, so it never covers in-game controls.
export default function ConsentBanner() {
  const [choice, setChoice] = useState(() => getConsent());

  useEffect(() => {
    const onReset = () => setChoice(null);
    window.addEventListener(CONSENT_RESET_EVENT, onReset);
    return () => window.removeEventListener(CONSENT_RESET_EVENT, onReset);
  }, []);

  if (choice) return null;

  const decide = (value) => {
    setConsent(value);
    setChoice(value);
  };

  return (
    <Paper
      elevation={6}
      role="region"
      aria-label="Analytics consent"
      sx={{ position: "fixed", bottom: 16, left: 16, right: 16, maxWidth: 720, mx: "auto", p: 2, zIndex: 2000, borderRadius: 2 }}
    >
      <Typography variant="body2" sx={{ mb: 1.5 }}>
        May we use Google Analytics (with cookies) to count visits? It helps us see how the game is used, and never sees names or answers.
        Your answers, surveys and files never leave this browser.{" "}
        <Link href="./privacy.html" target="_blank" rel="noopener">Privacy notice</Link>
      </Typography>
      <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
        <Button size="small" onClick={() => decide("denied")}>No thanks</Button>
        <Button size="small" variant="contained" onClick={() => decide("granted")}>Allow analytics</Button>
      </Box>
    </Paper>
  );
}
