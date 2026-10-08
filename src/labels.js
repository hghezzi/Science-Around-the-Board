// src/labels.js
// Every player-facing game term in one place. Keep these subject-neutral:
// SAB is used for any field, so no lab/science wording here. Question-file
// content (themes, questions, wildcard text) comes from the instructor.
// A future "instructor-configurable labels" feature can override this object.
import { SOLO } from "./gameRules.js";

export const LABELS = {
  chanceTile: "Wildcard",
  chanceCard: "Wildcard",
  coreTileFallback: "Core Skills",
  questionTitle: "Question",
  buyPrompt: (price) => `Buy this tile for $${price}?`,
  buy: "Buy",
  skip: "Skip",
  upgrades: "Upgrades",
  upgradeTitle: "Upgrade property group",
  upgrade: "Upgrade",
  outOfMoney: "Out of money!",
  bankrupt: "Bankrupt!",
  rescueQuiz: "Rescue Quiz",
  rescued: "Rescued!",
  rescueUsed: "Rescue used",
  keepPlaying: "Keep playing",
  eliminated: "Player eliminated",
  passStart: "Lap bonus: +$200 for passing START.",
  ownTile: "This is your tile, so nothing to pay.",
  cannotAffordMilestone: (price) => `You need $${price} to attempt this milestone.`,
  rivalMilestone: "Rival's milestone",
  soloTeam: "Solo Player",
  rivalTeam: "Rival player",
  howToPlay: "How to play",
  chaosToken: "Chaos token",
  lapBonus: "Lap bonus",
  tileTypes: {
    property: "Property",
    milestone: "Milestone (6-question exam)",
    sequencing_core: "Core tile",
    chance: "Wildcard (random event)",
  },
};

// Quick rules shown in the in-game "How to play" dialog. Numbers mirror the
// engine (GameScreen.jsx, gameData.js, gameRules.js); update both together.
export const RULES = [
  { icon: "🎲", title: "Take turns", text: "Starting cash: $2,500 solo, $2,000 each for 2 players, $1,500 for 3, $1,250 for 4. Roll, move clockwise and answer what you land on. Passing START pays a $200 lap bonus." },
  { icon: "🏠", title: "Property tiles", text: "Answer correctly to unlock buying the tile. A wrong answer costs $20 and shows the right answer." },
  { icon: "💸", title: "Paying rent", text: "Land on a rival's tile and you owe rent. Answer its question correctly to pay only half." },
  { icon: "⭐", title: "Sets and upgrades", text: "Own all 3 tiles of a colour to collect full rent, then use Upgrades to multiply it (up to 20×)." },
  { icon: "🏆", title: "Milestones (corners)", text: "A 6-question exam: get 5 right to capture it for $500 and earn a chaos token (not in solo play). Your second mistake ends the exam." },
  { icon: "⚡", title: "Chaos tokens", text: "Before rolling, spend one to challenge for a rival's tile: answer its question right to take it for half price. The token is used up and your turn ends either way. Complete sets can't be challenged." },
  { icon: "🃏", title: "Wildcards", text: "A surprise event that adds or takes money, with a fact to remember." },
  { icon: "🛟", title: "Out of money?", text: "Sell tiles or upgrades first (you get back half of what you paid). If that isn't enough, you get one Rescue Quiz: 2 of 3 right keeps you in." },
  { icon: "🏁", title: "Winning", text: "Be the last player standing, or have the highest net worth when the game ends: cash plus what you paid for the tiles and upgrades you still own." },
];

// Solo play replaces rent and chaos tokens (there are no rivals) with these.
export const SOLO_RULES = [
  { icon: "🏠", title: "Your own tiles pay (solo)", text: "Land on a tile you own and answer one of its questions: right, and the bank pays you its rent (more with a full set and upgrades); wrong costs $20." },
  { icon: "🎯", title: "Solo goal", text: `Reach the net-worth goal shown on the board before time runs out: ${money(SOLO.goals[30])} in 30 minutes, ${money(SOLO.goals[45])} in 45, ${money(SOLO.goals[60])} in 60 (or with no timer) and ${money(SOLO.goals[90])} in 90. Capturing all 4 milestones is a bonus. Your best result is kept on this computer.` },
];

/** Quick rules for a game with `playerCount` players (no count: everything, for the start page). */
export function rulesFor(playerCount) {
  const shared = RULES.filter((r) => r.title !== "Paying rent" && r.title !== "Chaos tokens");
  if (playerCount === 1) return [...shared.slice(0, 2), SOLO_RULES[0], ...shared.slice(2).filter((r) => r.title !== "Winning"), SOLO_RULES[1]];
  if (playerCount > 1) return RULES;
  return [...RULES, ...SOLO_RULES];
}

/** "$1,250" or "−$370" (true minus sign). */
export function money(n) {
  const v = Math.round(Number(n) || 0);
  return `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US")}`;
}

/** "+$150" or "−$100". */
export function signedMoney(n) {
  const v = Math.round(Number(n) || 0);
  return `${v < 0 ? "−" : "+"}$${Math.abs(v).toLocaleString("en-US")}`;
}

export const TEAM_NAMES = ["Red Player", "Blue Player", "Green Player", "Orange Player"];

/** Display name for player `index` when `count` players play (a single one is "Solo Player"). */
export function teamDisplayName(index, count) {
  return count === 1 ? LABELS.soloTeam : TEAM_NAMES[index];
}
