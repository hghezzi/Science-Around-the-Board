// src/components/TeamPanel.jsx
import React from "react";
import { Box, Card, Typography, LinearProgress } from "@mui/material";
import { motion, AnimatePresence } from "framer-motion";
import { TEAM_SYMBOLS, TEAM_INK, SR_ONLY } from "../theme";
import { netWorth } from "../gameRules";
import { LABELS, money, signedMoney } from "../labels";

export default function TeamPanel({ players, board, turn, moneyFloats }) {
  const best = Math.max(1, ...players.map((p) => netWorth(p, board)));
  return (
    <Card sx={{ p: 2 }}>
      <Typography variant="overline" component="h2" color="text.secondary" sx={{ fontWeight: 800 }}>Teams</Typography>
      <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, mt: 0.5, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 1 }}>
        {players.map((p, i) => {
          const active = turn === i && !p.eliminated;
          const worth = netWorth(p, board);
          const tiles = board.filter((t) => t.owner === p.id).length;
          const float = moneyFloats[p.id];
          return (
            <Box
              component="li"
              key={p.id}
              aria-current={active ? "true" : undefined}
              sx={{
                position: "relative",
                p: 1.25,
                borderRadius: 2,
                border: "2px solid",
                borderColor: active ? p.color : "divider",
                bgcolor: active ? "action.selected" : "transparent",
                boxShadow: active ? 3 : 0,
                borderStyle: p.eliminated ? "dashed" : "solid",
                transition: "border-color 0.2s, background-color 0.2s, box-shadow 0.2s",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box
                  aria-hidden
                  sx={{ width: 28, height: 28, borderRadius: "50%", bgcolor: TEAM_INK[p.id] || p.color, color: "common.white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, boxShadow: `0 0 0 2px ${p.color}`, opacity: p.eliminated ? 0.45 : 1 }}
                >
                  {TEAM_SYMBOLS[p.id]}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 800, lineHeight: 1.2, textDecoration: p.eliminated ? "line-through" : "none", color: p.eliminated ? "text.secondary" : "text.primary" }}>
                    {p.name} {p.rescueUsed && !p.eliminated && <span title={LABELS.rescueUsed} role="img" aria-label={LABELS.rescueUsed}>🛟</span>}
                  </Typography>
                  {active && <Typography variant="caption" sx={{ fontWeight: 800, color: "primary.main", lineHeight: 1 }}>Playing now</Typography>}
                </Box>
                <Typography sx={{ fontWeight: 800, fontSize: "1.15rem", color: p.eliminated ? "text.secondary" : p.money < 0 ? "error.main" : "text.primary" }}>
                  {p.eliminated ? "Out" : money(p.money)}
                </Typography>
              </Box>
              {!p.eliminated && (
                <>
                  <LinearProgress
                    variant="determinate"
                    value={Math.max(0, (worth / best) * 100)}
                    aria-label={`${p.name} net worth compared with the leader`}
                    sx={{ mt: 1, height: 6, borderRadius: 3, bgcolor: "action.hover", "& .MuiLinearProgress-bar": { bgcolor: p.color } }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
                    <span>Net worth {money(worth)}</span>
                    <span>
                      {tiles} tile{tiles === 1 ? "" : "s"} · <span aria-hidden>⚡</span> {p.chaosTokens}
                      <Box component="span" sx={SR_ONLY}> chaos token{p.chaosTokens === 1 ? "" : "s"}</Box>
                    </span>
                  </Typography>
                </>
              )}
              <AnimatePresence>
                {float?.visible && (
                  <motion.span
                    key={float.id}
                    aria-hidden
                    initial={{ opacity: 0, y: 6, scale: 0.6 }}
                    animate={{ opacity: 1, y: -6, scale: 1 }}
                    exit={{ opacity: 0, y: -14 }}
                    style={{
                      position: "absolute", right: 10, top: -12, fontWeight: 900, fontSize: "0.95rem", lineHeight: 1,
                      padding: "4px 8px", borderRadius: 999, boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                      background: float.amount > 0 ? "var(--mui-palette-success-main)" : "var(--mui-palette-error-main)",
                      color: float.amount > 0 ? "var(--mui-palette-success-contrastText)" : "var(--mui-palette-error-contrastText)",
                    }}
                  >
                    {signedMoney(float.amount)}
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
