// src/gameData.js
// -------------------------------------------------------------------
//  FULLY TSV-DRIVEN BOARD BUILDER FOR “Science Around the Board”
//  - Geometry: 36-tile square loop
//  - 4 corners = 4 milestones (from TSV Side1..Side4)
//  - Each side interior (between two corners):
//       3 × Subtheme1 → Core → 3 × Subtheme2 → Wildcard
//  - All names & questions come from tsvBoardBuilder (QS object).
// -------------------------------------------------------------------

import { buildBoardQuestionSet } from "./tsvBoardBuilder.js";
import { LABELS } from "./labels.js";
import { ECONOMY } from "./gameRules.js";

/**
 * Build a full board for a given topic + module using TSV rows.
 * Called from App.jsx
 */
export function buildBoardFromTsv(topicKey, tsvRows, module) {
  const QS = buildBoardQuestionSet(tsvRows, {
    bigTopic: topicKey,
    module,
  });
  return createBoard(QS);
}

/** Tiles on the loop. Movement wraps around this many tiles. */
export const BOARD_SIZE = 36;

// -------------------------------------------------------------------
//  MAIN BOARD GENERATION (36-tile layout)
// -------------------------------------------------------------------

function createBoard(QS) {
  // Safe defaults if QS missing
  const data = QS || {
    CoreTech: { name: "Core Skills", questions: [] },
    Side1: null,
    Side2: null,
    Side3: null,
    Side4: null,
  };

  // ---------------------------------------------------------
  // CONFIGURATION
  // ---------------------------------------------------------

  // 1. Define the sides in order: Bottom -> Left -> Top -> Right.
  // A file with fewer than 4 themes (the validator reports it) still gets a
  // full 36-tile loop: missing sides become placeholder tiles with no questions.
  const sides = [data.Side1, data.Side2, data.Side3, data.Side4].map(
    (side, i) => side || { name: `Side ${i + 1}`, sub1: null, sub2: null, quiz: [] }
  );

  // 2. Define themes corresponding to those sides
  // Band colours for [subtheme 1, subtheme 2] on each side (readable in light and dark).
  const THEMES = [
    { hues: ["#a78bfa", "#7c3aed"] }, // Side 1 (Bottom) - Violet
    { hues: ["#38bdf8", "#0284c7"] }, // Side 2 (Left)   - Sky
    { hues: ["#4ade80", "#16a34a"] }, // Side 3 (Top)    - Green
    { hues: ["#fbbf24", "#d97706"] }, // Side 4 (Right)  - Amber
  ];

  const TIER_1 = 100;
  const TIER_2 = 160;
  const CORE_COST = 200;
  const MILESTONE_COST = 500;

  // -----------------------------------------------------------------
  //  TILE HELPERS
  // -----------------------------------------------------------------

  function makeMilestone(sideData, opts = {}) {
    // If it's the start tile, we label it START, otherwise use the side name
    const sideName = sideData?.name || "Milestone";
    return {
      type: "milestone",
      name: sideName,
      sub: opts.isStart ? "START" : "",
      quiz: sideData?.quiz || [],
      price: MILESTONE_COST,
      isStart: Boolean(opts.isStart),
    };
  }

  function makeProperty(themeName, subName, price, color, questions = []) {
    return {
      type: "property",
      name: themeName,
      group: themeName,
      sub: subName,
      color,
      price,
      questions,
    };
  }

  function makeSequencingCore(coreLabel, cost, questions = []) {
    return {
      type: "sequencing_core",
      name: coreLabel,
      color: "#94a3b8",
      price: cost,
      questions,
    };
  }

  function makeChance() {
    return {
      type: "chance",
      name: LABELS.chanceTile,
      color: "#fb7185",
    };
  }

  /**
   * Build the 8 interior tiles of a side (between two corner milestones).
   * Pattern: 3 × Subtheme1 → Core → 3 × Subtheme2 → Wildcard
   */
  function generateSideInterior(sideData, themeVisual, coreData) {
    const themeName = sideData.name || "Theme";
    const sub1 = sideData.sub1 || { name: "Subtheme A", questions: [] };
    const sub2 = sideData.sub2 || { name: "Subtheme B", questions: [] };

    const coreLabel =
      coreData?.name || sideData.coreLabel || `${themeName} Core`;

    const coreQuestions = coreData?.questions || [];

    return [
      // 3 × Subtheme 1
      makeProperty(
        themeName,
        sub1.name,
        TIER_1,
        themeVisual.hues[0],
        sub1.questions || []
      ),
      makeProperty(
        themeName,
        sub1.name,
        TIER_1,
        themeVisual.hues[0],
        sub1.questions || []
      ),
      makeProperty(
        themeName,
        sub1.name,
        TIER_1,
        themeVisual.hues[0],
        sub1.questions || []
      ),

      // Core facility
      makeSequencingCore(coreLabel, CORE_COST, coreQuestions),

      // 3 × Subtheme 2
      makeProperty(
        themeName,
        sub2.name,
        TIER_2,
        themeVisual.hues[1],
        sub2.questions || []
      ),
      makeProperty(
        themeName,
        sub2.name,
        TIER_2,
        themeVisual.hues[1],
        sub2.questions || []
      ),
      makeProperty(
        themeName,
        sub2.name,
        TIER_2,
        themeVisual.hues[1],
        sub2.questions || []
      ),

      // Wildcard (random event)
      makeChance(),
    ];
  }

  // -----------------------------------------------------------------
  //  ASSEMBLE BOARD (Offset Logic)
  //  To ensure Corner 2 is the milestone for Side 1, we must offset
  //  the corners by one position.
  // -----------------------------------------------------------------

  const raw = [];

  // 1. TILE 0 (Bottom-Right): START
  // This is technically the Milestone for Side 4 (the end of the loop).
  raw.push(makeMilestone(sides[3], { isStart: true }));

  // 2. BOTTOM ROW: Side 1 Interior
  raw.push(...generateSideInterior(sides[0], THEMES[0], data.CoreTech));

  // 3. TILE 9 (Bottom-Left): Side 1 Milestone
  raw.push(makeMilestone(sides[0]));

  // 4. LEFT ROW: Side 2 Interior
  raw.push(...generateSideInterior(sides[1], THEMES[1], data.CoreTech));

  // 5. TILE 18 (Top-Left): Side 2 Milestone
  raw.push(makeMilestone(sides[1]));

  // 6. TOP ROW: Side 3 Interior
  raw.push(...generateSideInterior(sides[2], THEMES[2], data.CoreTech));

  // 7. TILE 27 (Top-Right): Side 3 Milestone
  raw.push(makeMilestone(sides[2]));

  // 8. RIGHT ROW: Side 4 Interior
  raw.push(...generateSideInterior(sides[3], THEMES[3], data.CoreTech));

  // (The next tile would be Tile 0/Start again)

  if (raw.length !== BOARD_SIZE) throw new Error(`Board has ${raw.length} tiles, expected ${BOARD_SIZE}`);
  return raw.map((def, id) => makeTile(def, id));
}

// -------------------------------------------------------------------
//  FINAL TILE FORMAT FOR ENGINE
// -------------------------------------------------------------------

function makeTile(def, id) {
  const tile = {
    id,
    type: def.type,
    name: def.name,
    color: def.color || "#ffffff",

    owner: null,
    level: 0,

    group: def.group || null,
    sub: def.sub || null,

    questions: def.questions || [],
    quiz: def.quiz || [],

    price: def.price || 0,
    isStart: Boolean(def.isStart),

    baseRent: getBaseRent(def),
    houseCost: def.type === "property" ? def.price : 0,
    castleCost: def.type === "property" ? def.price * 2 : 0,
  };

  return tile;
}

// Property rent is 50% of the price (20% × ECONOMY.rentScale). A core tile's base is $50,
// multiplied by how many core tiles its owner holds (gameRules.js); a rival milestone costs $250.
function getBaseRent(def) {
  if (def.type === "property") return Math.floor((def.price || 0) * 0.2 * ECONOMY.rentScale);
  if (def.type === "sequencing_core") return ECONOMY.coreRentStep;
  if (def.type === "milestone") return ECONOMY.milestoneFee;
  return 0;
}