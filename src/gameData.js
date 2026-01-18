// src/gameData.js
// -------------------------------------------------------------------
//  FULLY TSV-DRIVEN BOARD BUILDER FOR “Science Around the Board”
//  - Geometry: classic 36-tile Monopoly loop
//  - 4 corners = 4 milestones (from TSV Side1..Side4)
//  - Each side interior (between two corners):
//       3 × Subtheme1 → Core → 3 × Subtheme2 → Lab Mishap
//  - All names & questions come from tsvBoardBuilder (QS object).
// -------------------------------------------------------------------

import { buildBoardQuestionSet } from "./tsvBoardBuilder";

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

// Legacy hook if something still calls this.
export const getBoardByTopic = (topic) => createBoard(null);

// -------------------------------------------------------------------
//  MAIN BOARD GENERATION (36-tile layout)
// -------------------------------------------------------------------

function createBoard(QS) {
  // Safe defaults if QS missing
  const data = QS || {
    CoreTech: { name: "Core Facility", questions: [] },
    Side1: null,
    Side2: null,
    Side3: null,
    Side4: null,
  };

  // ---------------------------------------------------------
  // CONFIGURATION
  // ---------------------------------------------------------

  // 1. Define the sides in order: Bottom -> Left -> Top -> Right
  const sides = [data.Side1, data.Side2, data.Side3, data.Side4];

  // 2. Define themes corresponding to those sides
  const THEMES = [
    { hues: ["#F5F5F5", "#CFD8DC"] }, // Side 1 (Bottom) - Greys
    { hues: ["#E3F2FD", "#90CAF9"] }, // Side 2 (Left)   - Blues
    { hues: ["#E8F5E9", "#A5D6A7"] }, // Side 3 (Top)    - Greens
    { hues: ["#FFF3E0", "#FFCC80"] }, // Side 4 (Right)  - Oranges
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
      manual: null,
    };
  }

  function makeSequencingCore(coreLabel, cost, questions = []) {
    return {
      type: "sequencing_core",
      name: coreLabel,
      color: "#b0bec5",
      price: cost,
      questions,
    };
  }

  function makeLabMishap() {
    return {
      type: "chance",
      name: "Lab Mishap",
      color: "#ffab91",
      fixedAmount: -100,
    };
  }

  /**
   * Build the 8 interior tiles of a side (between two corner milestones).
   * Pattern: 3 × Subtheme1 → Core → 3 × Subtheme2 → Lab Mishap
   */
  function generateSideInterior(sideData, themeVisual, coreData) {
    if (!sideData) return [];

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

      // Lab Mishap
      makeLabMishap(),
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
    fixedAmount: def.fixedAmount || 0,
    isStart: Boolean(def.isStart),

    baseRent: getBaseRent(def),
    houseCost: def.type === "property" ? def.price : 0,
    castleCost: def.type === "property" ? def.price * 2 : 0,
  };

  return tile;
}

function getBaseRent(def) {
  if (def.type === "property") return Math.floor((def.price || 0) * 0.2);
  if (def.type === "sequencing_core") return 120;
  if (def.type === "milestone") return 250;
  return 0;
}