// src/components/InstallButton.jsx
// "Install as an app" on the start page, shown only when the browser offers it
// (Chrome/Edge). main.jsx keeps the browser's install prompt for this button.
import React, { useEffect, useState } from "react";
import { Button } from "@mui/material";

export default function InstallButton() {
  const [promptEvent, setPromptEvent] = useState(() => window.__labInstallPrompt || null);
  useEffect(() => {
    const onAvailable = () => setPromptEvent(window.__labInstallPrompt || null);
    const onInstalled = () => { window.__labInstallPrompt = null; setPromptEvent(null); };
    window.addEventListener("lab-install-available", onAvailable);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("lab-install-available", onAvailable);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  if (!promptEvent) return null;
  const install = async () => {
    promptEvent.prompt();
    await promptEvent.userChoice;
    window.__labInstallPrompt = null;
    setPromptEvent(null);
  };
  return <Button size="small" variant="outlined" onClick={install} sx={{ mt: 2 }}>⬇ Install as an app</Button>;
}
