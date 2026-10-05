// src/components/Dice.jsx
import React from "react";
import { motion, useReducedMotion } from "framer-motion";

const PIPS = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
};

function Die({ value, rollId, delay }) {
  const reduce = useReducedMotion();
  return (
    <motion.svg
      key={rollId}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Die showing ${value}`}
      initial={reduce || !rollId ? false : { rotate: -200, scale: 0.6, y: -12 }}
      animate={{ rotate: 0, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 14, delay }}
      style={{ width: "6.5cqw", height: "6.5cqw", minWidth: 40, minHeight: 40, filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.25))" }}
    >
      <rect x="4" y="4" width="92" height="92" rx="20" fill="#fffdf8" stroke="#cbd5e1" strokeWidth="3" />
      {PIPS[value]?.map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="9" fill={value === 1 ? "#dc2626" : "#1e293b"} />)}
    </motion.svg>
  );
}

/** Two dice; changing rollId replays the tumble animation. */
export default function Dice({ values, rollId }) {
  return (
    <div style={{ display: "flex", gap: "1.5cqw" }} aria-live="polite">
      <Die value={values[0]} rollId={rollId} delay={0} />
      <Die value={values[1]} rollId={rollId} delay={0.06} />
    </div>
  );
}
