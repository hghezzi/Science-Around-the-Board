// src/theme.js
// One MUI theme with light and dark colour schemes. The scheme follows the
// device setting (prefers-color-scheme) through CSS variables, so every
// component reads colours from the theme instead of hard-coding white.
//
// Custom palette keys:
//   board.*   board surface colours
// Team and side colours are mid-tones that work on both schemes (see TEAM_COLORS
// here and THEMES in gameData.js); team symbols mean colour is never the only cue.

import { createTheme } from "@mui/material/styles";
import "@fontsource/nunito/400.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@fontsource/fredoka/500.css";
import "@fontsource/fredoka/600.css";

export const TEAM_SYMBOLS = ["●", "▲", "■", "◆"];
export const TEAM_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f97316"];
export { TEAM_NAMES } from "./labels";

const display = '"Fredoka", "Nunito", system-ui, sans-serif';

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "media" },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: "#2563eb" },
        secondary: { main: "#7c3aed" },
        success: { main: "#166534", light: "#dcfce7" },
        error: { main: "#b91c1c", light: "#fee2e2" },
        warning: { main: "#c2410c", light: "#ffedd5" },
        info: { main: "#0369a1", light: "#e0f2fe" },
        background: { default: "#eef2f6", paper: "#ffffff" },
        text: { primary: "#1e293b", secondary: "#55627a" },
        divider: "#dbe2ea",
        action: { selected: "rgba(37, 99, 235, 0.08)", hover: "rgba(15, 23, 42, 0.04)" },
        board: { felt: "#cfe8da", center: "#e6f4ec", tile: "#ffffff", tileBorder: "#b8c7d6", ink: "#1e293b", muted: "#64748b", shadow: "rgba(15, 23, 42, 0.18)" },
      },
    },
    dark: {
      palette: {
        primary: { main: "#7cb8fb" },
        secondary: { main: "#a78bfa" },
        success: { main: "#4ade80", light: "#14532d" },
        error: { main: "#f87171", light: "#4c1d1d" },
        warning: { main: "#fb923c", light: "#4a2512" },
        info: { main: "#38bdf8", light: "#0c3550" },
        background: { default: "#0f172a", paper: "#1e293b" },
        text: { primary: "#e8edf4", secondary: "#b8c4d4" },
        divider: "#334155",
        action: { selected: "rgba(124, 184, 251, 0.14)", hover: "rgba(255, 255, 255, 0.06)" },
        board: { felt: "#163226", center: "#1b3b2d", tile: "#1f2a3a", tileBorder: "#3a4a60", ink: "#e8edf4", muted: "#9fb0c4", shadow: "rgba(0, 0, 0, 0.5)" },
      },
    },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Nunito", system-ui, -apple-system, "Segoe UI", sans-serif',
    h1: { fontFamily: display, fontWeight: 600 },
    h2: { fontFamily: display, fontWeight: 600 },
    h3: { fontFamily: display, fontWeight: 600 },
    h4: { fontFamily: display, fontWeight: 600 },
    h5: { fontFamily: display, fontWeight: 600 },
    h6: { fontFamily: display, fontWeight: 500 },
    button: { fontWeight: 800, letterSpacing: "0.02em" },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 10, textTransform: "none", fontSize: "0.95rem" } },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: ({ theme }) => ({
          border: `1px solid ${theme.vars.palette.divider}`,
          boxShadow: "0 6px 24px rgba(15, 23, 42, 0.08)",
        }),
      },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 700 } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: 10 } } },
  },
});

/** CSS variable for a palette path, usable in plain `style` props. */
export const v = (path) => `var(--mui-palette-${path.replace(/\./g, "-")})`;
