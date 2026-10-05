// src/components/TeamPanel.jsx
import React from "react";
import { Box, Card, Typography, LinearProgress } from "@mui/material";
import { motion, AnimatePresence } from "framer-motion";
import { TEAM_SYMBOLS } from "../theme";
import { netWorth } from "../gameRules";

export default function TeamPanel({ players, board, turn, moneyFloats }) {
  const best = Math.max(1, ...players.map((p) => netWorth(p, board)));
  return (
    <Card sx={{ p: 2 }}>
      <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>Teams</Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 0.5 }}>
        {players.map((p, i) => {
          const active = turn === i && !p.eliminated;
          const worth = netWorth(p, board);
          const tiles = board.filter((t) => t.owner === p.id).length;
          return (
            <Box
              key={p.id}
              aria-current={active ? "true" : undefined}
              sx={{
                position: "relative",
                p: 1.25,
                borderRadius: 2,
                border: "2px solid",
                borderColor: active ? p.color : "divider",
                bgcolor: active ? "action.selected" : "transparent",
                opacity: p.eliminated ? 0.55 : 1,
                transition: "all 0.2s",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box
                  aria-hidden
                  sx={{ width: 26, height: 26, borderRadius: "50%", bgcolor: p.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, textShadow: "0 0 2px rgba(0,0,0,0.7)", flexShrink: 0 }}
                >
                  {TEAM_SYMBOLS[p.id]}
                </Box>
                <Typography sx={{ fontWeight: 800, flex: 1, textDecoration: p.eliminated ? "line-through" : "none" }}>
                  {p.name} {p.rescueUsed && !p.eliminated && <span title="Rescue used">🛟</span>}
                </Typography>
                <Typography sx={{ fontWeight: 800, color: p.money < 0 ? "error.main" : "text.primary" }}>
                  {p.eliminated ? "OUT" : `$${p.money}`}
                </Typography>
              </Box>
              {!p.eliminated && (
                <>
                  <LinearProgress
                    variant="determinate"
                    value={Math.max(0, (worth / best) * 100)}
                    aria-label={`${p.name} net worth`}
                    sx={{ mt: 1, height: 6, borderRadius: 3, bgcolor: "action.hover", "& .MuiLinearProgress-bar": { bgcolor: p.color } }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
                    <span>Net worth ${worth}</span>
                    <span>{tiles} tile{tiles === 1 ? "" : "s"} · ⚡ {p.chaosTokens}</span>
                  </Typography>
                </>
              )}
              <AnimatePresence>
                {moneyFloats[p.id]?.visible && (
                  <motion.span
                    key={moneyFloats[p.id].id}
                    initial={{ opacity: 0, y: 10, scale: 0.6 }}
                    animate={{ opacity: 1, y: -18, scale: 1.15 }}
                    exit={{ opacity: 0 }}
                    style={{
                      position: "absolute", right: 12, top: 0, fontWeight: 800, fontSize: "1.15rem",
                      color: moneyFloats[p.id].amount > 0 ? "var(--mui-palette-success-main)" : "var(--mui-palette-error-main)",
                    }}
                  >
                    {moneyFloats[p.id].amount > 0 ? "+" : ""}{moneyFloats[p.id].amount}
                  </motion.span>
                )}
              </AnimatePresence>
            </Box>
          );
        })}
      </Box>
    </Card>
  );
}
