// src/labels.js
// Every player-facing game term in one place. Keep these subject-neutral:
// SAB is used for any field, so no lab/science wording here. Question-file
// content (themes, questions, wildcard text) comes from the instructor.
// A future "instructor-configurable labels" feature can override this object.

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
  eliminated: "Team eliminated",
  passStart: "Lap bonus: +$200 for passing START.",
  ownTile: "This is your tile, so nothing to pay.",
  cannotAffordMilestone: (price) => `You need $${price} to attempt this milestone.`,
  rivalMilestone: "Rival's milestone",
  soloTeam: "Solo Team",
  rivalTeam: "Rival team",
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
  { icon: "🎲", title: "Take turns", text: "Roll, move clockwise and answer what you land on. Passing START pays a $200 lap bonus." },
  { icon: "🏠", title: "Property tiles", text: "Answer correctly to unlock buying the tile. A wrong answer costs $20 and shows the right answer." },
  { icon: "💸", title: "Paying rent", text: "Land on a rival's tile and you owe rent. Answer its question correctly to pay only half." },
  { icon: "⭐", title: "Sets and upgrades", text: "Own all 3 tiles of a colour to collect full rent, then use Upgrades to multiply it (up to 20×)." },
  { icon: "🏆", title: "Milestones (corners)", text: "A 6-question exam: get 5 right to capture it for $500 and earn a chaos token. Your second mistake ends the exam." },
  { icon: "⚡", title: "Chaos tokens", text: "Spend one to challenge for a rival's tile: answer its question right to take it for half price." },
  { icon: "🃏", title: "Wildcards", text: "A surprise event that adds or takes money, with a fact to remember." },
  { icon: "🛟", title: "Out of money?", text: "Sell tiles or upgrades first. If that isn't enough, your team gets one Rescue Quiz: 2 of 3 right keeps you in." },
  { icon: "🏁", title: "Winning", text: "Be the last team standing, or have the highest net worth (cash + tiles) when the game ends." },
];

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

export const TEAM_NAMES = ["Red Team", "Blue Team", "Green Team", "Orange Team"];

/** Display name for team `index` when `count` teams play (a single team is "Solo Team"). */
export function teamDisplayName(index, count) {
  return count === 1 ? LABELS.soloTeam : TEAM_NAMES[index];
}
