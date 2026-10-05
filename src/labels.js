// src/labels.js
// Every player-facing game term in one place. Keep these subject-neutral:
// SAB is used for any field, so no lab/science wording here. Question-file
// content (themes, questions, chance-card text) comes from the instructor.
// A future "instructor-configurable labels" feature can override this object.

export const LABELS = {
  chanceTile: "Chance",
  chanceCard: "Chance card",
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
  passStart: "Passed START (+$200).",
  ownTile: "This is your tile, so nothing to pay.",
  cannotAffordMilestone: (price) => `You need $${price} to attempt this milestone.`,
  rivalMilestone: "Rival's milestone",
  soloTeam: "Solo Team",
  rivalTeam: "Rival team",
  tileTypes: {
    property: "Property",
    milestone: "Milestone (6-question exam)",
    sequencing_core: "Core tile",
    chance: "Chance (random event)",
  },
};
