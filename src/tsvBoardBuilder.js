// src/tsvBoardBuilder.js

// ------------------------------------------------------------
// Turn TSV rows into a compact "question set" (QS) structure
// that gameData.js can use to build the fixed Monopoly-style
// board.
//
// For a given (bigTopic, module) we build:
//
// {
//   CoreTech: { name, questions: [] },
//   Side1: { name, sub1: { name, questions: [] },
//            sub2: { name, questions: [] },
//            quiz: [] },
//   Side2: { ... },
//   Side3: { ... },
//   Side4: { ... },
// }
//
// - Themes are ordered by FIRST APPEARANCE in the TSV for that
//   topic/module.
// - Each theme/side uses at most TWO subthemes (first two seen).
// - "property" rows -> subtheme questions
// - "milestone" rows -> milestone quiz questions
// - "core" rows -> CoreTech.questions
// ------------------------------------------------------------

// ✨ NEW: Helper to parse comma-separated lists (matches App.jsx logic)
function parseList(str) {
  if (!str) return [];
  return str.split(",").map((item) => {
    return item.trim().replace(/^"|"$/g, "");
  });
}

/**
 * Convert a TSV question row into the internal question format
 * used by the game engine.
 */
export function rowToQuestion(row) {
  const options = [
    row.option1 || "",
    row.option2 || "",
    row.option3 || "",
    row.option4 || "",
  ].filter((o) => o && o.length > 0);

  let idx = null;
  if (
    row.correctIndex !== undefined &&
    row.correctIndex !== null &&
    String(row.correctIndex).trim() !== ""
  ) {
    const parsed = parseInt(row.correctIndex, 10);
    if (!Number.isNaN(parsed)) idx = parsed;
  }

  return {
    prompt: row.question || "",
    options,
    answer: idx !== null ? idx - 1 : null,
    explanation: row.explanation || "",
    theme: row.theme || "",
    subtheme: row.subtheme || "",
    // FIX: Pass the image file through!
    image: row.imageFile || null, 
  };
}

/**
 * 🔧 FIXED: Helper to check if row matches topic + module
 * Now uses comma-separated list logic (matches App.jsx)
 */
function matchesTopicAndModule(row, bigTopic, module) {
  // 1. Check Topic Match
  const rowTopicStr = (row.bigTopic || "").trim();
  
  if (bigTopic) {
    // If rowTopicStr is EMPTY, it matches all topics (global question)
    if (rowTopicStr) {
      const topics = parseList(rowTopicStr);
      if (!topics.includes(bigTopic)) {
        return false; // Topic doesn't match
      }
    }
  }

  // 2. Check Module Match
  const rowModuleStr = (row.module || "").trim();
  
  if (module) {
    // If rowModuleStr is EMPTY, it matches all modules
    if (rowModuleStr) {
      const modules = parseList(rowModuleStr);
      if (!modules.includes(module)) {
        return false; // Module doesn't match
      }
    }
  }

  return true;
}

/**
 * Build the QS object used by createBoard() in gameData.js
 */
export function buildBoardQuestionSet(
  tsvRows,
  { bigTopic, module } = {}
) {
  const rows = (tsvRows || []).filter((r) =>
    matchesTopicAndModule(r, bigTopic, module)
  );

  console.log(`[tsvBoardBuilder] Filtering for topic="${bigTopic}", module="${module}"`);
  console.log(`[tsvBoardBuilder] Total TSV rows:`, tsvRows?.length || 0);
  console.log(`[tsvBoardBuilder] Matched rows:`, rows.length);

  if (!rows.length) {
    console.warn("[tsvBoardBuilder] No matching rows found! Returning empty board.");
    // gameData.js will fall back to a very boring board
    return {
      CoreTech: { name: "Core Facility", questions: [] },
      Side1: null,
      Side2: null,
      Side3: null,
      Side4: null,
    };
  }

  // ----------------------------------------------------------------
  // 1) Determine theme order by first appearance
  // (using only property/milestone rows)
  // ----------------------------------------------------------------
  const themeOrder = [];
  rows.forEach((r) => {
    const type = (r.type || "").trim().toLowerCase();
    if (type !== "property" && type !== "milestone") return;
    const theme = (r.theme || "").trim();
    if (!theme) return;
    if (!themeOrder.includes(theme)) themeOrder.push(theme);
  });

  console.log(`[tsvBoardBuilder] Themes found:`, themeOrder);

  // Only the first 4 themes can become sides on the board
  const chosenThemes = themeOrder.slice(0, 4);

  // ----------------------------------------------------------------
  // 2) Build side structures (Side1..Side4)
  // ----------------------------------------------------------------
  const sides = {};
  chosenThemes.forEach((themeName, idx) => {
    const themeRows = rows.filter(
      (r) => (r.theme || "").trim() === themeName
    );

    const propRows = themeRows.filter(
      (r) => (r.type || "").trim().toLowerCase() === "property"
    );

    const milestoneRows = themeRows.filter(
      (r) => (r.type || "").trim().toLowerCase() === "milestone"
    );

    console.log(`[tsvBoardBuilder] Theme "${themeName}": ${propRows.length} properties, ${milestoneRows.length} milestones`);

    // --- find up to TWO subthemes in the order they appear ---
    const subOrder = [];
    propRows.forEach((r) => {
      const st = (r.subtheme || "").trim();
      if (!st) return;
      if (!subOrder.includes(st)) subOrder.push(st);
    });

    const sub1Name =
      subOrder[0] || `${themeName} A`;
    const sub2Name =
      subOrder[1] || subOrder[0] || `${themeName} B`;

    const sub1Questions = propRows
      .filter((r) => {
        const st = (r.subtheme || "").trim() || sub1Name;
        return st === sub1Name;
      })
      .map(rowToQuestion);

    const sub2Questions = propRows
      .filter((r) => {
        const st = (r.subtheme || "").trim() || sub2Name;
        return st === sub2Name;
      })
      .map(rowToQuestion);

    const quizQuestions = milestoneRows.map(rowToQuestion);

    console.log(`[tsvBoardBuilder] - Sub1 "${sub1Name}": ${sub1Questions.length} questions`);
    console.log(`[tsvBoardBuilder] - Sub2 "${sub2Name}": ${sub2Questions.length} questions`);

    sides[`Side${idx + 1}`] = {
      name: themeName,
      sub1: { name: sub1Name, questions: sub1Questions },
      sub2: { name: sub2Name, questions: sub2Questions },
      quiz: quizQuestions,
    };
  });

  // ----------------------------------------------------------------
  // 3) CoreTech: collect all "core" rows (any theme) for this
  //    topic/module. Shared across all sides in gameData.js
  // ----------------------------------------------------------------
  const coreRows = rows.filter(
    (r) => (r.type || "").trim().toLowerCase() === "core"
  );

  const coreQuestions = coreRows.map(rowToQuestion);
  console.log(`[tsvBoardBuilder] Core questions: ${coreQuestions.length}`);

  const coreName =
    (coreRows[0]?.subtheme || "").trim() ||
    (coreRows[0]?.theme || "").trim() ||
    "Core Facility";

  const CoreTech = { name: coreName, questions: coreQuestions };

  // Ensure all sides exist (gameData.js expects Side1..Side4 keys)
  const result = {
    CoreTech,
    Side1: sides.Side1 || null,
    Side2: sides.Side2 || null,
    Side3: sides.Side3 || null,
    Side4: sides.Side4 || null,
  };

  console.log("[tsvBoardBuilder] Final QS structure:", result);

  return result;
}
