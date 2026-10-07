// src/components/TeamToken.jsx
import React from "react";
import { Box } from "@mui/material";
import { TEAM_COLORS, TEAM_SYMBOLS, TEAM_INK } from "../theme";

/** Team symbol on its deep team colour. */
export default function TeamToken({ index, size = 22 }) {
  return (
    <Box aria-hidden sx={{ width: size, height: size, borderRadius: "50%", bgcolor: TEAM_INK[index], color: "common.white", fontSize: Math.round(size * 0.5), display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `0 0 0 2px ${TEAM_COLORS[index]}`, verticalAlign: "middle" }}>
      {TEAM_SYMBOLS[index]}
    </Box>
  );
}
