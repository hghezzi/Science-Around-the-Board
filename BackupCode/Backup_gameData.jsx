// src/gameData.js
// -------------------------------------------------------------------
// CLEAN + CONSISTENT BOARD DEFINITION for BIO-TYCOON
// This file defines "static metadata" only. All gameplay logic,
// rent rules, quiz rules, and token mechanics are handled in the engine.
// -------------------------------------------------------------------

import { TOPIC_BANKS, CORE_TECH_QS } from "./questionBank";

export const getBoardByTopic = (topic) => createBoard(topic);

// -------------------------------------------------------------------
//  MAIN BOARD GENERATION
// -------------------------------------------------------------------

function createBoard(topicKey = "16S") {
  const QS = TOPIC_BANKS[topicKey] || TOPIC_BANKS["16S"];

  // Theme definitions (unchanged)
  const THEMES = [
    { name: "Sample Prep", hues: ["#F5F5F5", "#CFD8DC"] },
    { name: "Sequencing", hues: ["#E3F2FD", "#90CAF9"] },
    { name: "Bioinformatics", hues: ["#E8F5E9", "#A5D6A7"] },
    { name: "Statistics", hues: ["#FFF3E0", "#FFCC80"] },
  ];

  // Base costs (unchanged)
  const TIER_1 = 100;
  const TIER_2 = 160;
  const CORE_COST = 200;

  // -------------------------------------------------------------------
  //  Generate a theme side containing:
  //    - 3x sub1 properties
  //    - 1x sequencing core
  //    - 3x sub2 properties
  //    - 1x chance tile
  // -------------------------------------------------------------------

  const generateSide = (sideData, theme, coreName) => {
    if (!sideData) {
      return [];
    }

    const { sub1, sub2, quiz, manual } = sideData;

    const s1 = sub1 || { name: "Sub-Theme A", questions: [] };
    const s2 = sub2 || { name: "Sub-Theme B", questions: [] };

    return [
      // --- Sub-theme I (3 tiles) ---
      makeProperty(theme, s1.name, TIER_1, theme.hues[0], s1.questions, manual),
      makeProperty(theme, s1.name, TIER_1, theme.hues[0], s1.questions, manual),
      makeProperty(theme, s1.name, TIER_1, theme.hues[0], s1.questions, manual),

      // --- Sequencing Core ---
      makeSequencingCore(coreName, CORE_COST),

      // --- Sub-theme II (3 tiles) ---
      makeProperty(theme, s2.name, TIER_2, theme.hues[1], s2.questions, manual),
      makeProperty(theme, s2.name, TIER_2, theme.hues[1], s2.questions, manual),
      makeProperty(theme, s2.name, TIER_2, theme.hues[1], s2.questions, manual),

      // --- Chance Tile (Lab Mishap) ---
      {
        type: "chance",
        name: "Lab Mishap",
        color: "#ffab91",
        fixedAmount: -100,
      },
    ];
  };

  // -------------------------------------------------------------------
  //  FINAL BOARD LAYOUT (36 tiles)
  // -------------------------------------------------------------------

  const raw = [
    // ---------------- MILESTONE #1 (START CORNER) ----------------
    {
      type: "milestone",
      name: "Stat Master",
      sub: "START",
      quiz: QS.Side4.quiz,
      price: 500,
      isStart: true,
    },

    // ---------------- SIDE 1 ----------------
    ...generateSide(QS.Side1, THEMES[0], "Illumina Core"),

    // ---------------- MILESTONE #2 ----------------
    {
      type: "milestone",
      name: "Prep Guru",
      quiz: QS.Side1.quiz,
      price: 500,
    },

    // ---------------- SIDE 2 ----------------
    ...generateSide(QS.Side2, THEMES[1], "Nanopore Core"),

    // ---------------- MILESTONE #3 ----------------
    {
      type: "milestone",
      name: "Seq Wizard",
      quiz: QS.Side2.quiz,
      price: 500,
    },

    // ---------------- SIDE 3 ----------------
    ...generateSide(QS.Side3, THEMES[2], "PacBio Core"),

    // ---------------- MILESTONE #4 ----------------
    {
      type: "milestone",
      name: "Bioinfo Pro",
      quiz: QS.Side3.quiz,
      price: 500,
    },

    // ---------------- SIDE 4 ----------------
    ...generateSide(QS.Side4, THEMES[3], "Roche Core"),
  ];

  // Convert each entry to a full tile object
  return raw.map((def, id) => makeTile(def, id));
}

// -------------------------------------------------------------------
//  TILE HELPERS
// -------------------------------------------------------------------

function makeProperty(theme, subName, cost, color, questions, manual) {
  return {
    type: "property",
    name: theme.name,
    group: theme.name,
    sub: subName,
    color,
    price: cost,
    questions: questions || [],
    manual: manual || null,
  };
}

function makeSequencingCore(coreLabel, cost) {
  const tech = coreLabel.split(" ")[0]; // e.g. "Illumina"
  return {
    type: "sequencing_core",
    name: coreLabel,
    color: "#b0bec5",
    price: cost,
    questions: [
      CORE_TECH_QS[tech] || CORE_TECH_QS["Illumina"]
    ],
  };
}

// -------------------------------------------------------------------
//  FINAL TILE FORMAT USED BY ENGINE
// -------------------------------------------------------------------

function makeTile(def, id) {
  const tile = {
    id,
    type: def.type,
    name: def.name,
    color: def.color || "#fff",

    // ownership + build data (engine modifies these)
    owner: null,
    level: 0,

    // grouping
    group: def.group || null,
    sub: def.sub || null,

    // questions
    questions: def.questions || [],
    quiz: def.quiz || [],
    manual: def.manual || null,

    // economic values
    price: def.price || 0,
    fixedAmount: def.fixedAmount || 0,
    isStart: def.isStart || false,

    // rent rules (base rent only, scaling done in engine)
    baseRent: getBaseRent(def),
    houseCost: def.type === "property" ? def.price : 0,
    castleCost: def.type === "property" ? def.price * 2 : 0,
  };

  return tile;
}

function getBaseRent(def) {
  if (def.type === "property") return Math.floor(def.price * 0.2);
  if (def.type === "sequencing_core") return 120;
  if (def.type === "milestone") return 250;
  return 0;
}
