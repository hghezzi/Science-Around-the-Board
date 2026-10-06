import { TEAM_COLORS } from "../theme";

// canvas-confetti is only needed at the end of a game, so it loads on first use.
let confettiPromise = null;
const loadConfetti = () => (confettiPromise ||= import("canvas-confetti").then((m) => m.default));

/** Celebrate a win; skipped when the user prefers reduced motion. */
export function celebrate(color) {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const colors = color ? [color, "#ffffff", "#facc15"] : [...TEAM_COLORS, "#facc15"];
  const opts = { particleCount: 90, spread: 75, startVelocity: 45, colors, zIndex: 2000 };
  loadConfetti()
    .then((confetti) => {
      confetti({ ...opts, origin: { x: 0.2, y: 0.7 }, angle: 60 });
      confetti({ ...opts, origin: { x: 0.8, y: 0.7 }, angle: 120 });
    })
    .catch(() => { confettiPromise = null; /* purely decorative */ });
}
