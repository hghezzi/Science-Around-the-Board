// src/App.jsx
import React, { useState, useEffect, useMemo } from "react";
import CryptoJS from "crypto-js"; 
import { buildBoardFromTsv } from "./gameData"; 
import MicrobiopolyGame from "./MicrobiopolyGame";
import { parseTsv, parseList, getAllTopics, getModulesForTopic } from "./tsvParser";
import { validateQuestionRows } from "./tsvValidator";
import { normalizeQuestion, prepareQuestion, checkAnswer } from "./questionFormats";
import { bestPreSurveyPlayer } from "./gameRules";
import { resolveImage } from "./images";
import QuestionInput from "./QuestionInput";
import { resetConsent } from "./consent";

import {
  Card, Typography, Container, ToggleButton, ToggleButtonGroup, Button,
  Box, Slider, Divider, Modal, Alert, Paper,
} from "@mui/material";

/* -------------------------------------------------------------------------- */
/* TSV PARSING LOGIC                                                          */
/* -------------------------------------------------------------------------- */

async function fetchDefaultQuestions(url = "./SAB_questions_Jan22_Filtered.tsv") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load default questions (${res.status})`);
  const text = await res.text();
  return parseTsv(text);
}

function filterSurveyRows(all, { bigTopic, module, type }) {
  return all.filter((r) => {
    if (!r.type || r.type.trim().toLowerCase() !== type) return false;
    const rowTopicStr = (r.bigTopic || "").trim();
    if (bigTopic && rowTopicStr) {
      const topics = parseList(rowTopicStr);
      if (!topics.includes(bigTopic)) return false;
    }
    const rowModuleStr = (r.module || "").trim();
    if (module && rowModuleStr) {
      const modules = parseList(rowModuleStr);
      if (!modules.includes(module)) return false;
    }
    return true;
  });
}

/* -------------------------------------------------------------------------- */
/* SURVEY VIEWS                                                               */
/* -------------------------------------------------------------------------- */

function SurveyView({ phase, playerCount, playerQuestionSets, confidenceQuestions, onComplete, resolveImage }) {
  const C = confidenceQuestions || [];
  const isPre = phase === "pre";
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const currentQuestions = playerQuestionSets[currentPlayer] || [];
  const [sliderValues, setSliderValues] = useState(() => Array.from({ length: playerCount }, () => Object.fromEntries(C.map((c) => [c.key, 5]))));
  const [answers, setAnswers] = useState(() => playerQuestionSets.map((set) => set.map(() => null)));
  const [lock, setLock] = useState(() => Array(playerCount).fill(false));

  const handleSliderChange = (key, val) => {
    if (lock[currentPlayer]) return;
    setSliderValues((prev) => prev.map((p, i) => (i === currentPlayer ? { ...p, [key]: val } : p)));
  };
  const submitConfidence = () => setLock((prev) => prev.map((x, i) => (i === currentPlayer ? true : x)));
  const setAns = (qi, response) =>
    setAnswers((prev) => prev.map((P, i) => (i === currentPlayer ? P.map((x, j) => (j === qi ? response : x)) : P)));

  const submitPlayer = () => {
    if (currentPlayer < playerCount - 1) {
      setCurrentPlayer((p) => p + 1);
      window.scrollTo(0, 0);
      return;
    }
    const rows = [];
    for (let p = 0; p < playerCount; p++) {
      const base = { phase, playerIndex: p, playerLabel: `Player ${p + 1}` };
      C.forEach((cfg) => rows.push({ ...base, section: "confidence", questionId: cfg.key, questionPrompt: cfg.label, response: sliderValues[p][cfg.key] }));
      (playerQuestionSets[p] || []).forEach((q, qi) => {
        const response = answers[p]?.[qi] ?? null;
        const result = checkAnswer(q, response);
        rows.push({
          ...base,
          section: "quiz",
          questionId: q.id || "",
          format: q.format,
          questionPrompt: q.prompt,
          selectedIndex: q.format === "mcq" ? response : "",
          selectedOption: result.responseText,
          correctAnswer: result.correctText,
          correct: result.correct,
        });
      });
    }
    onComplete({ tidyRows: rows });
  };

  const currentSliders = sliderValues[currentPlayer];
  const locked = lock[currentPlayer];
  const lastLabel = isPre ? "Start Game" : "Finish Surveys";

  return (
    <Container maxWidth={false} sx={{ mt: 6, width: "95%", maxWidth: "1200px" }}>
      <Card sx={{ p: { xs: 3, md: 6 } }}>
        <Typography variant="h4" gutterBottom>{isPre ? "Pre-Game Survey" : "Post-Game Survey"}</Typography>
        <Typography variant="subtitle1">Player {currentPlayer + 1} of {playerCount}</Typography>
        <Divider sx={{ my: 3 }} />
        {C.length > 0 && (
          <>
            <Typography variant="h5" sx={{ color: "primary.main" }}>Section 1 – Confidence</Typography>
            {C.map((cfg) => (
              <Box key={cfg.key} sx={{ my: 4 }}>
                <Typography variant="h6" gutterBottom>{cfg.label}</Typography>
                <Slider min={0} max={10} marks value={currentSliders[cfg.key] ?? 5} disabled={locked} onChange={(_, v) => handleSliderChange(cfg.key, v)} valueLabelDisplay="auto" aria-label={cfg.label} />
              </Box>
            ))}
          </>
        )}
        {!locked && (
          <Button variant="contained" size="large" sx={{ mt: 2 }} onClick={submitConfidence}>
            {C.length > 0 ? "Continue to Questions" : "Start Questions"}
          </Button>
        )}

        {locked && (
          <>
            <Divider sx={{ my: 4 }} />
            <Typography variant="h5" sx={{ color: "primary.main", mb: 2 }}>{C.length > 0 ? "Section 2 – Questions" : "Questions"}</Typography>
            {currentQuestions.length === 0 && <Typography color="textSecondary">No survey questions in this file.</Typography>}
            {currentQuestions.map((q, qi) => (
              <Box key={`${currentPlayer}-${qi}`} sx={{ mb: 4, p: 2, border: "1px solid #eee", borderRadius: 2 }}>
                <Typography variant="overline" color="textSecondary">Question {qi + 1} of {currentQuestions.length}</Typography>
                <Typography variant="h6" gutterBottom sx={{ mt: 1, whiteSpace: "pre-wrap" }}>{q.prompt}</Typography>
                <QuestionInput
                  key={`${phase}-${currentPlayer}-${qi}`}
                  question={q}
                  survey
                  value={answers[currentPlayer]?.[qi]}
                  onChange={(r) => setAns(qi, r)}
                  resolveImage={resolveImage}
                  imageMaxHeight={300}
                />
              </Box>
            ))}
            <Button variant="contained" size="large" sx={{ mt: 2 }} onClick={submitPlayer}>
              {currentPlayer < playerCount - 1 ? "Next Player" : lastLabel}
            </Button>
          </>
        )}
      </Card>
    </Container>
  );
}

function ValidationReport({ validation, imageMap }) {
  if (!validation) return null;
  const { errors, warnings, images } = validation;
  const missingImages = images.filter((img) => !imageMap[img] && !/^(https?:|data:)/.test(img));
  if (!errors.length && !warnings.length && !missingImages.length) return null;
  return (
    <Box sx={{ mb: 3, textAlign: "left" }}>
      {errors.length > 0 && (
        <Alert severity="error" sx={{ mb: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: "bold" }}>
            {errors.length} problem{errors.length > 1 ? "s" : ""} found in this question file. The game may not work correctly.
          </Typography>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {errors.map((e, i) => <li key={i}><Typography variant="caption">{e}</Typography></li>)}
          </ul>
        </Alert>
      )}
      {warnings.length > 0 && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          <details>
            <summary style={{ cursor: "pointer" }}>
              <Typography variant="body2" component="span">{warnings.length} note{warnings.length > 1 ? "s" : ""} about this question file</Typography>
            </summary>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {warnings.map((w, i) => <li key={i}><Typography variant="caption">{w}</Typography></li>)}
            </ul>
          </details>
        </Alert>
      )}
      {missingImages.length > 0 && (
        <Alert severity="info">
          <Typography variant="body2">
            This file references {missingImages.length} image{missingImages.length > 1 ? "s" : ""} not uploaded yet: {missingImages.join(", ")}
          </Typography>
        </Alert>
      )}
    </Box>
  );
}

function SummaryView({ onExport, onReturn }) {
  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Card sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="h4">Session Complete</Typography>
        <Button variant="contained" fullWidth sx={{ mt: 2 }} onClick={onExport}>Export CSV</Button>
        <Button variant="outlined" fullWidth sx={{ mt: 2 }} onClick={onReturn}>Main Menu</Button>
      </Card>
    </Container>
  );
}

// --- MAIN APP ---

export default function App() {
  const [phase, setPhase] = useState("SETUP");
  const [gameMode, setGameMode] = useState(null);
  const [playerCount, setPlayerCount] = useState(2);
  const [sessionMinutes, setSessionMinutes] = useState(0);
  const [startPlayer, setStartPlayer] = useState(0);
  const [allTsvRows, setAllTsvRows] = useState([]);
  const [loadingError, setLoadingError] = useState(null);
  const [selectedModule, setSelectedModule] = useState(null);
  const [moduleModalOpen, setModuleModalOpen] = useState(false);
  const [modules, setModules] = useState([]);
  const [preRows, setPreRows] = useState([]);
  const [postRows, setPostRows] = useState([]);
  const [gameRows, setGameRows] = useState([]);
  const [playerQuestionSets, setPlayerQuestionSets] = useState([]);
  const [confQ, setConfQ] = useState([]);
  
  // NEW STATES
  const [filesConfirmed, setFilesConfirmed] = useState(false);
  const [localImageMap, setLocalImageMap] = useState({});

  const validation = useMemo(
    () => (allTsvRows.length ? validateQuestionRows(allTsvRows) : null),
    [allTsvRows]
  );

  useEffect(() => {
    const handlePopState = () => window.history.pushState(null, document.title, window.location.href);
    const handleBeforeUnload = (e) => {
      if (phase !== "SETUP" && phase !== "SUMMARY") { e.preventDefault(); e.returnValue = "Game progress will be lost."; return "Game progress will be lost."; }
    };
    window.history.pushState(null, document.title, window.location.href);
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [phase]);

  // Reset confirmation if file is cleared
  useEffect(() => {
    if (allTsvRows.length === 0) {
      setFilesConfirmed(false);
    }
  }, [allTsvRows]);

  // --- Handlers ---

  const handleLoadDefault = async () => {
    setLoadingError(null);
    try {
      const rows = await fetchDefaultQuestions();
      if (rows.length > 0) setAllTsvRows(rows);
      else setLoadingError("Default file is empty.");
    } catch (e) { setLoadingError(e.message); }
  };

  const handleFileUpload = (e) => {
    setLoadingError(null);
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      let text = evt.target.result;
      if (!text.includes("\t")) {
        const password = prompt("Encrypted file detected. Enter Class Password:");
        if (!password) return;
        try {
          const bytes = CryptoJS.AES.decrypt(text, password);
          const decrypted = bytes.toString(CryptoJS.enc.Utf8);
          if (!decrypted || !decrypted.includes("\t")) throw new Error();
          text = decrypted;
        } catch { setLoadingError("Incorrect password or invalid file."); return; }
      }
      try {
        const rows = parseTsv(text);
        if (rows.length > 0) { setAllTsvRows(rows); setGameMode(null); setSelectedModule(null); } 
        else { setLoadingError("File contains no valid rows."); }
      } catch { setLoadingError("Could not parse TSV."); }
    };
    reader.readAsText(file);
  };

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    const newMap = {};
    files.forEach(file => {
      newMap[file.name] = URL.createObjectURL(file);
    });
    setLocalImageMap(prev => ({ ...prev, ...newMap }));
  };

  const resolveImageSource = (imgName) => resolveImage(imgName, localImageMap);

  const selectTopic = (t) => {
    setGameMode(t);
    const mods = getModulesForTopic(allTsvRows, t);
    setModules(mods);
    setSelectedModule(mods[0] || null);
    setModuleModalOpen(true);
  };

  const confirmModule = () => {
    const poolRows = filterSurveyRows(allTsvRows, { bigTopic: gameMode, module: selectedModule, type: "survey" });
    const poolQuestions = poolRows.map(normalizeQuestion);
    const newSets = [];
    for (let i = 0; i < playerCount; i++) {
      const shuffled = [...poolQuestions].sort(() => 0.5 - Math.random());
      newSets.push(shuffled.slice(0, 10).map((q) => prepareQuestion(q)));
    }
    setPlayerQuestionSets(newSets);
    const confRows = filterSurveyRows(allTsvRows, { bigTopic: gameMode, module: selectedModule, type: "confidence" });
    const cQuestions = confRows.map((r, i) => ({ key: r.id || `conf_${i}`, label: r.question }));
    setConfQ(cQuestions);
    setModuleModalOpen(false);
  };

  const handleExport = () => {
    const full = [...preRows, ...gameRows, ...postRows];
    const headers = Array.from(new Set(full.flatMap(Object.keys)));
    const csv = [headers.join(","), ...full.map(r => headers.map(h => `"${String(r[h] ?? "").replace(/"/g,'""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "microbiopoly_data.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // --- Render ---

  // REVISED LOGIC: Show Landing Page if NO Data OR Not Confirmed
  if (allTsvRows.length === 0 || !filesConfirmed) {
    const hasData = allTsvRows.length > 0;
    
    return (
      <Container maxWidth="md" sx={{ textAlign: "center", mt: 8 }}>
        <Typography variant="h2" sx={{ fontWeight: 'bold', color: '#2c3e50', mb: 2 }}>Science Around the Board</Typography>
        <Typography variant="h5" sx={{ color: '#555', mb: 4 }}>A Monopoly-style bioinformatics learning adventure.</Typography>

        <Card sx={{ p: 6, boxShadow: 3, mx: "auto", maxWidth: 600 }}>
          <Typography variant="h6" gutterBottom>Load Question Data</Typography>
          
          {!hasData ? (
             // --- STATE 1: NO DATA LOADED ---
             <>
                <Typography color="textSecondary" sx={{ mb: 3 }}>Select a question source to begin the session.</Typography>
                <Button variant="contained" fullWidth size="large" onClick={handleLoadDefault} sx={{ mb: 2 }}>Load Demo Game</Button>
                <Divider sx={{ my: 2 }}>OR</Divider>
                <Button variant="outlined" component="label" fullWidth size="large">
                    Upload Custom Questions (TSV)
                    <input type="file" hidden accept=".tsv,.txt,.lock" onChange={handleFileUpload} />
                </Button>
             </>
          ) : (
             // --- STATE 2: DATA LOADED (CONFIRMATION STEP) ---
             <>
                <Alert severity="success" sx={{ mb: 3, textAlign: 'left' }}>
                    <Typography variant="body1"><strong>Success!</strong> Loaded {allTsvRows.length} questions.</Typography>
                </Alert>

                <ValidationReport validation={validation} imageMap={localImageMap} />

                <Button variant="outlined" component="label" fullWidth size="large" color="secondary" sx={{ mb: 2 }}>
                    Optional: Upload Images
                    <input type="file" hidden multiple accept="image/*" onChange={handleImageUpload} />
                </Button>
                
                {Object.keys(localImageMap).length > 0 && (
                  <Typography variant="caption" sx={{ display: 'block', mb: 2, color: 'green' }}>
                      {Object.keys(localImageMap).length} images ready.
                  </Typography>
                )}

                <Divider sx={{ my: 3 }} />

                <Button 
                    variant="contained" 
                    fullWidth 
                    size="large" 
                    color="success" 
                    sx={{ mb: 2, fontWeight: 'bold', py: 1.5 }}
                    onClick={() => setFilesConfirmed(true)} // <--- MOVES TO NEXT SCREEN
                >
                    Continue to Game Setup
                </Button>

                <Button size="small" color="error" onClick={() => setAllTsvRows([])}>
                    Reset / Upload Different File
                </Button>
             </>
          )}

          {loadingError && <Alert severity="error" sx={{ mt: 2 }}>{loadingError}</Alert>}
        </Card>
        <Typography variant="caption" sx={{ mt: 4, display: 'block', color: '#888' }}>
          Designed by Hans Ghezzi ·{" "}
          <a href="./privacy.html" target="_blank" rel="noopener" style={{ color: '#888' }}>Privacy</a> ·{" "}
          <a href="#" onClick={(e) => { e.preventDefault(); resetConsent(); }} style={{ color: '#888' }}>Analytics settings</a>
        </Typography>
      </Container>
    );
  }

  // --- STANDARD GAME FLOW ---

  if (phase === "SETUP") {
    const topics = getAllTopics(allTsvRows);
    return (
      <Container maxWidth="md" sx={{ textAlign: "center", mt: 6 }}>
        <Typography variant="h3" gutterBottom sx={{ fontWeight: "bold" }}>Game Setup</Typography>
        <Card sx={{ p: 3, mb: 4, mx: "auto", maxWidth: 600 }}>
          <Typography variant="h6">Players</Typography>
          <ToggleButtonGroup value={playerCount} exclusive onChange={(_, v) => v && setPlayerCount(v)} fullWidth color="primary">
            {[1,2,3,4].map(n => <ToggleButton key={n} value={n}>{n} Player{n>1?'s':''}</ToggleButton>)}
          </ToggleButtonGroup>
          <Typography variant="h6" sx={{ mt: 3 }}>Session length</Typography>
          <Typography variant="caption" color="textSecondary" sx={{ display: "block", mb: 1 }}>
            The game ends when one team is left standing, or when time runs out (highest net worth wins).
          </Typography>
          <ToggleButtonGroup value={sessionMinutes} exclusive onChange={(_, v) => v !== null && setSessionMinutes(v)} fullWidth color="primary" size="small">
            {[0, 30, 45, 60, 90].map(m => <ToggleButton key={m} value={m}>{m === 0 ? "No timer" : `${m} min`}</ToggleButton>)}
          </ToggleButtonGroup>
        </Card>
        <Typography variant="h6" gutterBottom>Select Topic</Typography>
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center', mb: 5 }}>
          {topics.map(t => (
            <Card key={t} sx={{ p: 4, width: 220, cursor: 'pointer', border: gameMode === t ? '3px solid #1976d2' : '1px solid #ddd', boxShadow: gameMode === t ? 4 : 1, transform: gameMode === t ? 'scale(1.05)' : 'scale(1)', transition: 'all 0.2s' }} onClick={() => selectTopic(t)}>
              <Typography variant="h5" color="primary" sx={{ fontWeight: 'bold' }}>{t}</Typography>
            </Card>
          ))}
        </Box>
        <Paper elevation={3} sx={{ p: 2, position: 'fixed', bottom: 0, left: 0, right: 0, bgcolor: '#f5f5f5', display: 'flex', justifyContent: 'center', gap: 2, zIndex: 100 }}>
             <Button variant="contained" color="success" size="large" disabled={!gameMode} onClick={() => setPhase("PRE_SURVEY")} sx={{ px: 6, py: 1.5, fontSize: '1.2rem' }}>Start Game</Button>
             <Button size="small" color="inherit" onClick={() => setAllTsvRows([])}>Change File</Button>
        </Paper>
        <Modal open={moduleModalOpen} onClose={() => setModuleModalOpen(false)}>
          <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 300, bgcolor: 'background.paper', p: 4, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>Select Module</Typography>
            {modules.length > 0 ? modules.map(m => <Button key={m} fullWidth variant={selectedModule === m ? 'contained' : 'outlined'} onClick={() => setSelectedModule(m)} sx={{ mb: 1 }}>{m}</Button>) : <Typography>No specific modules found.</Typography>}
            <Divider sx={{ my: 2 }} />
            <Button fullWidth variant="contained" color="success" sx={{ mt: 1, py: 1.5 }} onClick={confirmModule}>Confirm Selection</Button>
          </Box>
        </Modal>
        <Box sx={{ height: 100 }} />
      </Container>
    );
  }

  if (phase === "PRE_SURVEY") return <SurveyView key="pre" phase="pre" playerCount={playerCount} playerQuestionSets={playerQuestionSets} confidenceQuestions={confQ} resolveImage={resolveImageSource} onComplete={d => { setPreRows(d.tidyRows); setStartPlayer(bestPreSurveyPlayer(d.tidyRows, playerCount)); setPhase("GAME"); }} />;
  if (phase === "GAME") return <MicrobiopolyGame boardData={buildBoardFromTsv(gameMode, allTsvRows, selectedModule)} bigTopic={gameMode} module={selectedModule} playerCount={playerCount} startingPlayerIndex={startPlayer} sessionMinutes={sessionMinutes} tsvRows={allTsvRows} imageMap={localImageMap} onEndGame={d => { setGameRows(d); setPhase("POST_SURVEY"); }} onExit={() => { setPhase("SETUP"); setGameMode(null); }} />;
  if (phase === "POST_SURVEY") return <SurveyView key="post" phase="post" playerCount={playerCount} playerQuestionSets={playerQuestionSets} confidenceQuestions={confQ} resolveImage={resolveImageSource} onComplete={d => { setPostRows(d.tidyRows); setPhase("SUMMARY"); }} />;
  return <SummaryView onExport={handleExport} onReturn={() => { setPhase("SETUP"); setGameMode(null); setAllTsvRows([]); }} />;
}