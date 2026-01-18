// App.jsx
// Features: File Upload, Default Loading, Dynamic Topics, Robust TSV Parsing
// ---------------------------------------------------------------------------

import React, { useState } from "react";
import { buildBoardFromTsv } from "./gameData";
import MicrobiopolyGame from "./MicrobiopolyGame";

import {
  Card,
  Typography,
  Container,
  ToggleButton,
  ToggleButtonGroup,
  Button,
  Box,
  Slider,
  RadioGroup,
  Radio,
  FormControlLabel,
  Divider,
  Modal,
  Alert,
} from "@mui/material";

/* -------------------------------------------------------------------------- */
/* TSV PARSING HELPERS (Robust Quote Handling)                                */
/* -------------------------------------------------------------------------- */

// 1. FETCH DEFAULT (If user clicks "Load Default")
async function fetchTsvQuestions(url = "./questions.tsv") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} - Status: ${res.status}`);
  const text = await res.text();
  return parseTsv(text);
}

// 2. PARSER
function parseTsv(text) {
  const cleanText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = cleanText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  if (lines.length < 2) return [];

  const headers = lines[0].split("\t").map((h) => h.trim());
  const rows = lines.slice(1);

  return rows.map((ln) => {
    const cols = ln.split("\t");
    const obj = {};
    headers.forEach((h, i) => {
      const key = h.trim();
      let value = (cols[i] || "").trim();

      // Remove wrapping quotes (Excel style)
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1).replace(/""/g, '"');
      }

      obj[key] = value;
    });
    return obj;
  });
}

// HELPER: Cleanly split "A, B" into ["A", "B"] removing any residual quotes
function parseList(str) {
  if (!str) return [];
  return str.split(",").map((item) => {
    return item.trim().replace(/^"|"$/g, "");
  });
}

function rowToSurveyQuestion(row) {
  const opts = [row.option1, row.option2, row.option3, row.option4].filter(
    (o) => o && o.length > 0
  );

  let idx = null;
  if (
    row.correctIndex !== undefined &&
    row.correctIndex !== null &&
    row.correctIndex !== ""
  ) {
    const parsed = parseInt(row.correctIndex, 10);
    if (!Number.isNaN(parsed)) idx = parsed;
  }

  return {
    id: row.id || null,
    prompt: row.question || "",
    options: opts,
    answer: idx !== null ? idx - 1 : null,
    explanation: row.explanation || "",
  };
}

// Filter Logic
function filterSurveyRows(all, { bigTopic, module, type }) {
  return all.filter((r) => {
    // 1. Check Type match (exact)
    if (!r.type || r.type.trim() !== type) return false;

    // 2. Check Topic
    const rowTopicStr = (r.bigTopic || "").trim();
    if (bigTopic && rowTopicStr) {
      const topics = parseList(rowTopicStr);
      if (!topics.includes(bigTopic)) {
        return false;
      }
    }

    // 3. Check Module
    const rowModuleStr = (r.module || "").trim();
    if (module && rowModuleStr) {
      const modules = parseList(rowModuleStr);
      if (!modules.includes(module)) {
        return false;
      }
    }

    return true;
  });
}

function getSurveyQuestions(all, { bigTopic, module }) {
  // 1. Get Quiz Questions
  const pre1 = filterSurveyRows(all, { bigTopic, module, type: "pre" });
  const pre =
    pre1.length > 0
      ? pre1
      : filterSurveyRows(all, { bigTopic, module: null, type: "pre" });

  const post1 = filterSurveyRows(all, { bigTopic, module, type: "post" });
  const post =
    post1.length > 0
      ? post1
      : filterSurveyRows(all, { bigTopic, module: null, type: "post" });

  // 2. Get Confidence Questions
  const conf1 = filterSurveyRows(all, { bigTopic, module, type: "confidence" });
  const conf =
    conf1.length > 0
      ? conf1
      : filterSurveyRows(all, { bigTopic, module: null, type: "confidence" });

  return {
    preSurveyQuestions: pre.map(rowToSurveyQuestion),
    postSurveyQuestions: post.map(rowToSurveyQuestion),
    confidenceQuestions: conf.map((r, i) => ({
      key: r.id || `conf_${i}`,
      label: r.question,
    })),
  };
}

function getModulesForTopic(all, bigTopic) {
  const set = new Set();
  all.forEach((r) => {
    const rowTopicStr = (r.bigTopic || "").trim();
    if (!rowTopicStr) return; 

    const topics = parseList(rowTopicStr);
    if (topics.includes(bigTopic)) {
      const mStr = (r.module || "").trim();
      if (mStr) {
        parseList(mStr).forEach((m) => set.add(m));
      }
    }
  });
  return Array.from(set);
}

function getAllTopics(all) {
  const set = new Set();
  all.forEach((r) => {
    const tStr = (r.bigTopic || "").trim();
    if (!tStr) return;

    parseList(tStr).forEach((t) => {
      if (t) set.add(t);
    });
  });
  return Array.from(set);
}

/* -------------------------------------------------------------------------- */
/* SURVEY VIEWS (UNCHANGED)                                                   */
/* -------------------------------------------------------------------------- */

function PreSurveyView({ playerCount, quizQuestions, confidenceQuestions, onComplete }) {
  const Q = quizQuestions || [];
  const C = confidenceQuestions || [];
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [sliderValues, setSliderValues] = useState(
    Array.from({ length: playerCount }, () => {
      const obj = {};
      C.forEach((c) => (obj[c.key] = 5));
      return obj;
    })
  );
  const [answers, setAnswers] = useState(Array.from({ length: playerCount }, () => Q.map(() => null)));
  const [lock, setLock] = useState(Array(playerCount).fill(false));

  function handleSliderChange(key, val) {
    if (lock[currentPlayer]) return;
    setSliderValues((prev) => prev.map((p, i) => (i === currentPlayer ? { ...p, [key]: val } : p)));
  }

  function submitConfidence() {
    setLock((prev) => prev.map((x, i) => (i === currentPlayer ? true : x)));
  }

  function setAns(qi, opt) {
    setAnswers((prev) => prev.map((P, i) => i === currentPlayer ? P.map((x, j) => (j === qi ? opt : x)) : P));
  }

  function submitPlayer() {
    if (currentPlayer < playerCount - 1) {
      setCurrentPlayer((p) => p + 1);
      return;
    }
    const rows = [];
    for (let p = 0; p < playerCount; p++) {
      const sVals = sliderValues[p];
      C.forEach((cfg) => {
        rows.push({
          phase: "pre",
          section: "confidence",
          playerIndex: p,
          playerLabel: `Player ${p + 1}`,
          questionPrompt: cfg.label,
          response: sVals[cfg.key],
        });
      });
      Q.forEach((q, qi) => {
        const sel = answers[p][qi];
        rows.push({
          phase: "pre",
          section: "quiz",
          playerIndex: p,
          playerLabel: `Player ${p + 1}`,
          questionPrompt: q.prompt,
          selectedIndex: sel,
          selectedOption: sel != null ? q.options[sel] : "",
          correct: sel === q.answer,
        });
      });
    }
    onComplete({ tidyRows: rows });
  }

  const currentSliders = sliderValues[currentPlayer];
  const currentAns = answers[currentPlayer];
  const locked = lock[currentPlayer];

  return (
    <Container maxWidth={false} sx={{ mt: 6, width: "95%", maxWidth: "1200px" }}>
      <Card sx={{ p: 6 }}>
        <Typography variant="h4" gutterBottom>Pre-Game Survey</Typography>
        <Typography variant="subtitle1">Player {currentPlayer + 1} of {playerCount}</Typography>
        <Divider sx={{ my: 3 }} />
        <Typography variant="h5" sx={{ color: "primary.main" }}>Section 1 – Confidence</Typography>
        {C.length === 0 && <Typography variant="body2" color="textSecondary">No confidence questions found.</Typography>}
        {C.map((cfg) => (
          <Box key={cfg.key} sx={{ my: 4 }}>
            <Typography variant="h6" gutterBottom>{cfg.label}</Typography>
            <Slider min={0} max={10} marks value={currentSliders[cfg.key] || 5} disabled={locked} onChange={(_, v) => handleSliderChange(cfg.key, v)} valueLabelDisplay="auto" />
          </Box>
        ))}
        {!locked && <Button variant="contained" size="large" sx={{ mt: 2 }} onClick={submitConfidence}>Continue to Questions</Button>}
        {locked && (
          <>
            <Divider sx={{ my: 4 }} />
            <Typography variant="h5" sx={{ color: "primary.main", mb: 2 }}>Section 2 – Questions</Typography>
            {Q.map((q, qi) => (
              <Box key={qi} sx={{ mb: 4 }}>
                <Typography variant="h6" gutterBottom>{q.prompt}</Typography>
                <RadioGroup value={currentAns[qi] ?? -1} onChange={(e) => setAns(qi, Number(e.target.value))}>
                  {q.options.map((o, oi) => (
                    <FormControlLabel key={oi} value={oi} control={<Radio />} label={<Typography variant="body1">{o}</Typography>} />
                  ))}
                </RadioGroup>
              </Box>
            ))}
            <Button variant="contained" size="large" sx={{ mt: 2 }} onClick={submitPlayer}>{currentPlayer < playerCount - 1 ? "Next Player" : "Start Game"}</Button>
          </>
        )}
      </Card>
    </Container>
  );
}

function PostSurveyView({ playerCount, quizQuestions, confidenceQuestions, onComplete }) {
  const Q = quizQuestions || [];
  const C = confidenceQuestions || [];
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [sliderValues, setSliderValues] = useState(Array.from({ length: playerCount }, () => { const obj = {}; C.forEach((c) => (obj[c.key] = 5)); return obj; }));
  const [answers, setAnswers] = useState(Array.from({ length: playerCount }, () => Q.map(() => null)));
  const [lock, setLock] = useState(Array(playerCount).fill(false));

  function handleSliderChange(key, val) {
    if (lock[currentPlayer]) return;
    setSliderValues((prev) => prev.map((p, i) => (i === currentPlayer ? { ...p, [key]: val } : p)));
  }
  function submitConfidence() { setLock((prev) => prev.map((x, i) => (i === currentPlayer ? true : x))); }
  function setAns(qi, opt) { setAnswers((prev) => prev.map((P, i) => i === currentPlayer ? P.map((x, j) => (j === qi ? opt : x)) : P)); }
  function submitPlayer() {
    if (currentPlayer < playerCount - 1) { setCurrentPlayer((p) => p + 1); return; }
    const rows = [];
    for (let p = 0; p < playerCount; p++) {
      const sVals = sliderValues[p];
      C.forEach((cfg) => rows.push({ phase: "post", section: "confidence", playerIndex: p, playerLabel: `Player ${p + 1}`, questionPrompt: cfg.label, response: sVals[cfg.key] }));
      Q.forEach((q, qi) => {
        const sel = answers[p][qi];
        rows.push({ phase: "post", section: "quiz", playerIndex: p, playerLabel: `Player ${p + 1}`, questionPrompt: q.prompt, selectedIndex: sel, selectedOption: sel != null ? q.options[sel] : "" });
      });
    }
    onComplete({ tidyRows: rows });
  }

  const currentSliders = sliderValues[currentPlayer];
  const currentAns = answers[currentPlayer];
  const locked = lock[currentPlayer];

  return (
    <Container maxWidth={false} sx={{ mt: 6, width: "95%", maxWidth: "1200px" }}>
      <Card sx={{ p: 6 }}>
        <Typography variant="h4" gutterBottom>Post-Game Survey</Typography>
        <Typography variant="subtitle1">Player {currentPlayer + 1} of {playerCount}</Typography>
        <Divider sx={{ my: 3 }} />
        <Typography variant="h5" sx={{ color: "primary.main" }}>Section 1 – Confidence</Typography>
        {C.length === 0 && <Typography variant="body2" color="textSecondary">No confidence questions found.</Typography>}
        {C.map((cfg) => (
          <Box key={cfg.key} sx={{ my: 4 }}>
            <Typography variant="h6" gutterBottom>{cfg.label}</Typography>
            <Slider min={0} max={10} marks value={currentSliders[cfg.key] || 5} disabled={locked} onChange={(_, v) => handleSliderChange(cfg.key, v)} valueLabelDisplay="auto" />
          </Box>
        ))}
        {!locked && <Button variant="contained" size="large" sx={{ mt: 2 }} onClick={submitConfidence}>Continue to Questions</Button>}
        {locked && (
          <>
            <Divider sx={{ my: 4 }} />
            <Typography variant="h5" sx={{ color: "primary.main", mb: 2 }}>Section 2 – Questions</Typography>
            {Q.map((q, qi) => (
              <Box key={qi} sx={{ mb: 4 }}>
                <Typography variant="h6" gutterBottom>{q.prompt}</Typography>
                <RadioGroup value={currentAns[qi] ?? -1} onChange={(e) => setAns(qi, Number(e.target.value))}>
                  {q.options.map((o, oi) => (
                    <FormControlLabel key={oi} value={oi} control={<Radio />} label={<Typography variant="body1">{o}</Typography>} />
                  ))}
                </RadioGroup>
              </Box>
            ))}
            <Button variant="contained" size="large" sx={{ mt: 2 }} onClick={submitPlayer}>{currentPlayer < playerCount - 1 ? "Next Player" : "Finish Surveys"}</Button>
          </>
        )}
      </Card>
    </Container>
  );
}

function SummaryView({ onExport, onReturn }) {
  const downloadCombinedCSV = (rows) => {
    if (!rows || rows.length === 0) return;
    const headerSet = new Set();
    rows.forEach((r) => Object.keys(r).forEach((k) => headerSet.add(k)));
    const headers = Array.from(headerSet);
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "microbiopoly_logs.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Card sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="h4">Session Complete</Typography>
        <Typography sx={{ mb: 3 }}>Export all logs as CSV or return to the main menu.</Typography>
        <Button variant="contained" fullWidth sx={{ mb: 2 }} onClick={() => downloadCombinedCSV()}>Export All Logs (CSV)</Button>
        <Button variant="outlined" fullWidth onClick={onReturn}>Return to Main Menu</Button>
      </Card>
    </Container>
  );
}

/* -------------------------------------------------------------------------- */
/* MAIN APP                                    */
/* -------------------------------------------------------------------------- */

export default function App() {
  const [phase, setPhase] = useState("SETUP");
  const [gameMode, setGameMode] = useState(null);
  const [playerCount, setPlayerCount] = useState(2);

  const [allTsvRows, setAllTsvRows] = useState([]);
  const [loadingError, setLoadingError] = useState(null);

  const [selectedModule, setSelectedModule] = useState(null);
  const [moduleModalOpen, setModuleModalOpen] = useState(false);
  const [modules, setModules] = useState([]);

  const [preRows, setPreRows] = useState([]);
  const [postRows, setPostRows] = useState([]);
  const [gameRows, setGameRows] = useState([]);

  const [preSurveyQuestions, setPreSurveyQuestions] = useState([]);
  const [postSurveyQuestions, setPostSurveyQuestions] = useState([]);
  const [confidenceQuestions, setConfidenceQuestions] = useState([]);

  // REMOVED useEffect auto-load. Now relies on user action.

  // --- Handlers for Loading Data ---

  // A. Load Default
  async function handleLoadDefault() {
    setLoadingError(null);
    try {
      const rows = await fetchTsvQuestions("./questions.tsv");
      console.log("Loaded Default Rows:", rows);
      if (rows.length === 0) {
        setLoadingError("Default file is empty or could not be parsed.");
      } else {
        setAllTsvRows(rows);
      }
    } catch (e) {
      console.error("Error loading TSV:", e);
      setLoadingError(e.message);
    }
  }

  // B. Load Custom File
  function handleFileUpload(event) {
    setLoadingError(null);
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target.result;
      try {
        const rows = parseTsv(text);
        if (rows.length > 0) {
          setAllTsvRows(rows);
          // Reset just in case they re-uploaded in the middle
          setGameMode(null);
          setSelectedModule(null);
        } else {
          setLoadingError("File parsed but contained 0 valid rows.");
        }
      } catch (err) {
        setLoadingError("Failed to parse file. Ensure it is a valid TSV.");
      }
    };
    reader.readAsText(file);
  }

  // --- Topic/Module Selection ---

  function selectTopic(topic) {
    setGameMode(topic);
    const found = getModulesForTopic(allTsvRows, topic);
    setModules(found);
    setSelectedModule(found[0] || null);
    setModuleModalOpen(true);
  }

  function confirmModule() {
    const {
      preSurveyQuestions: pre,
      postSurveyQuestions: post,
      confidenceQuestions: conf,
    } = getSurveyQuestions(allTsvRows, {
      bigTopic: gameMode,
      module: selectedModule,
    });
    setPreSurveyQuestions(pre);
    setPostSurveyQuestions(post);
    setConfidenceQuestions(conf);
    setModuleModalOpen(false);
  }

  /* --------------------------- Phase Handlers --------------------------- */

  function handlePreComplete({ tidyRows }) {
    setPreRows(tidyRows);
    setPhase("GAME");
  }

  function handleGameEnd(rows) {
    setGameRows(rows || []);
    setPhase("POST_SURVEY");
  }

  function handlePostComplete({ tidyRows }) {
    setPostRows(tidyRows);
    setPhase("SUMMARY");
  }

  function handleExportAll() {
    const full = [...preRows, ...gameRows, ...postRows];
    // Helper used inside SummaryView normally, but we can pass data.
    // For simplicity, reusing logic if needed, or SummaryView handles it.
  }

  function resetAll() {
    setPhase("SETUP");
    setGameMode(null);
    setSelectedModule(null);
    setModules([]);
    setPreRows([]);
    setPostRows([]);
    setGameRows([]);
    setPreSurveyQuestions([]);
    setPostSurveyQuestions([]);
    setConfidenceQuestions([]);
    // OPTIONAL: Keep questions loaded or clear them?
    // If you want to force reload every time, uncomment line below:
    // setAllTsvRows([]);
  }

  /* ---------------------------- Phase Rendering ---------------------------- */

  if (phase === "PRE_SURVEY" && gameMode) {
    return <PreSurveyView playerCount={playerCount} quizQuestions={preSurveyQuestions} confidenceQuestions={confidenceQuestions} onComplete={handlePreComplete} />;
  }
  if (phase === "GAME" && gameMode) {
    const boardData = buildBoardFromTsv(gameMode, allTsvRows, selectedModule);
    return <MicrobiopolyGame boardData={boardData} bigTopic={gameMode} module={selectedModule} playerCount={playerCount} tsvRows={allTsvRows} onEndGame={handleGameEnd} onExit={resetAll} />;
  }
  if (phase === "POST_SURVEY" && gameMode) {
    return <PostSurveyView playerCount={playerCount} quizQuestions={postSurveyQuestions} confidenceQuestions={confidenceQuestions} onComplete={handlePostComplete} />;
  }
  if (phase === "SUMMARY") {
    return <SummaryView onExport={handleExportAll} onReturn={resetAll} />;
  }

  /* ------------------------------- SETUP VIEW ------------------------------ */

  // 1. Initial Load State (No rows yet)
  if (allTsvRows.length === 0) {
    return (
      <Container maxWidth="sm" sx={{ textAlign: "center", mt: 10, fontFamily: "sans-serif" }}>
        <Typography variant="h2" gutterBottom sx={{ fontWeight: "bold" }}>
          Science Around the World
        </Typography>
        
        <Card sx={{ p: 4, mb: 4 }}>
          <Typography variant="h6" gutterBottom>Load Question Data</Typography>
          <Typography color="textSecondary" sx={{ mb: 3 }}>
            Please select a question source to begin.
          </Typography>

          <Button variant="contained" size="large" fullWidth onClick={handleLoadDefault} sx={{ mb: 2 }}>
            Load Default Game
          </Button>

          <Divider sx={{ my: 2 }}>OR</Divider>

          <Button variant="outlined" component="label" fullWidth>
            Upload Custom Questions (.tsv)
            <input type="file" hidden accept=".tsv,.txt" onChange={handleFileUpload} />
          </Button>

          {loadingError && (
            <Alert severity="error" sx={{ mt: 2 }}>{loadingError}</Alert>
          )}
        </Card>
      </Container>
    );
  }

  // 2. Main Menu (Rows loaded)
  const topics = getAllTopics(allTsvRows);

  return (
    <Container maxWidth="md" sx={{ textAlign: "center", mt: 6, fontFamily: "sans-serif" }}>
      <Typography variant="h2" gutterBottom sx={{ fontWeight: "bold" }}>
        Science Around the World
      </Typography>

      <Card sx={{ p: 3, mb: 4, mx: "auto", maxWidth: 800 }}>
        <Typography variant="h6">Game Setup</Typography>
        <Typography color="textSecondary" sx={{ mt: 2 }}>Research Players</Typography>
        <ToggleButtonGroup
          value={playerCount}
          exclusive
          fullWidth
          onChange={(_, v) => v && setPlayerCount(v)}
          color="primary"
        >
          <ToggleButton value={1}>1 Player</ToggleButton>
          <ToggleButton value={2}>2 Players</ToggleButton>
          <ToggleButton value={3}>3 Players</ToggleButton>
          <ToggleButton value={4}>4 Players</ToggleButton>
        </ToggleButtonGroup>
      </Card>

      <div style={{ display: "flex", gap: "30px", justifyContent: "center", flexWrap: "wrap", marginBottom: "24px" }}>
        {topics.map((topic) => (
          <Card
            key={topic}
            style={{
              padding: "30px",
              width: "250px",
              border: gameMode === topic ? "3px solid #2980b9" : "2px solid #54a0ff",
              cursor: "pointer",
            }}
            onClick={() => selectTopic(topic)}
          >
            <Typography variant="h5" style={{ color: "#2980b9" }}>{topic}</Typography>
          </Card>
        ))}
        {topics.length === 0 && (
          <Typography variant="body2" color="textSecondary">
            Loaded file contains no valid Topics (check "bigTopic" column).
          </Typography>
        )}
      </div>

      <Box sx={{ display: "flex", justifyContent: "center", gap: 2 }}>
        <Button variant="contained" disabled={!gameMode} onClick={() => setPhase("PRE_SURVEY")}>
          Start Pre-Survey
        </Button>
      </Box>

      {/* Helper to reload/change file */}
      <Box sx={{ mt: 8 }}>
        <Button size="small" onClick={() => setAllTsvRows([])}>
          Change Question File
        </Button>
      </Box>

      <Modal open={moduleModalOpen} onClose={() => setModuleModalOpen(false)}>
        <Box sx={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "90%", maxWidth: 400, p: 4, bgcolor: "white", borderRadius: 2 }}>
          <Typography variant="h6" gutterBottom>Select Module</Typography>
          {modules.length > 0 ? (
            <>
              <ToggleButtonGroup fullWidth exclusive value={selectedModule} onChange={(_, v) => v && setSelectedModule(v)} sx={{ mb: 3 }}>
                {modules.map((m) => <ToggleButton key={m} value={m}>{m}</ToggleButton>)}
              </ToggleButtonGroup>
              <Button variant="contained" fullWidth onClick={confirmModule} disabled={!selectedModule}>Use This Module</Button>
            </>
          ) : (
            <>
              <Typography sx={{ mb: 2 }}>No module-specific questions for this topic.</Typography>
              <Button variant="contained" fullWidth onClick={confirmModule}>Continue</Button>
            </>
          )}
        </Box>
      </Modal>
    </Container>
  );
}