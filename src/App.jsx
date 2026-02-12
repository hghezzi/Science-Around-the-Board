// src/App.jsx
import React, { useState, useEffect, useMemo } from "react";
import CryptoJS from "crypto-js"; 
import { buildBoardFromTsv } from "./gameData"; 
import MicrobiopolyGame from "./MicrobiopolyGame";

import {
  Card, Typography, Container, ToggleButton, ToggleButtonGroup, Button,
  Box, Slider, RadioGroup, Radio, FormControlLabel, Divider, Modal, Alert, Paper,
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

function parseTsv(text) {
  const cleanText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = cleanText.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (lines.length < 2) return [];
  const headers = lines[0].split("\t").map((h) => h.trim());
  return lines.slice(1).map((ln) => {
    const cols = ln.split("\t");
    const obj = {};
    headers.forEach((h, i) => {
      let val = (cols[i] || "").trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/""/g, '"');
      obj[h.trim()] = val;
    });
    return obj;
  });
}

function parseList(str) {
  if (!str) return [];
  return str.split(",").map((item) => item.trim().replace(/^"|"$/g, ""));
}

function rowToSurveyQuestion(row) {
  const opts = [row.option1, row.option2, row.option3, row.option4].filter(o => o && o.length > 0);
  let idx = null;
  if (row.correctIndex) idx = parseInt(row.correctIndex, 10);
  return {
    id: row.id || null,
    prompt: row.question || "",
    options: opts,
    answer: idx && !isNaN(idx) ? idx - 1 : null,
    image: row.imageFile || null, 
  };
}

function filterSurveyRows(all, { bigTopic, module, type }) {
  return all.filter((r) => {
    if (!r.type || r.type.trim() !== type) return false;
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

function getModulesForTopic(all, bigTopic) {
  const set = new Set();
  all.forEach((r) => {
    const rowTopicStr = (r.bigTopic || "").trim();
    if (!rowTopicStr) return;
    const topics = parseList(rowTopicStr);
    if (topics.includes(bigTopic)) {
      const mStr = (r.module || "").trim();
      if (mStr) parseList(mStr).forEach((m) => set.add(m));
    }
  });
  return Array.from(set);
}

function getAllTopics(all) {
  const set = new Set();
  all.forEach((r) => {
    const tStr = (r.bigTopic || "").trim();
    if (!tStr) return;
    parseList(tStr).forEach((t) => { if (t) set.add(t); });
  });
  return Array.from(set);
}

/* -------------------------------------------------------------------------- */
/* SURVEY VIEWS                                                               */
/* -------------------------------------------------------------------------- */

function PreSurveyView({ playerCount, playerQuestionSets, confidenceQuestions, onComplete, resolveImage }) {
  const C = confidenceQuestions || [];
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const currentQuestions = playerQuestionSets[currentPlayer] || [];
  const [sliderValues, setSliderValues] = useState(Array.from({ length: playerCount }, () => { const obj = {}; C.forEach(c => obj[c.key]=5); return obj; }));
  const [answers, setAnswers] = useState(playerQuestionSets.map(set => set.map(() => null)));
  const [lock, setLock] = useState(Array(playerCount).fill(false));

  const handleSliderChange = (key, val) => {
    if (lock[currentPlayer]) return;
    setSliderValues(prev => prev.map((p, i) => i === currentPlayer ? { ...p, [key]: val } : p));
  };
  const submitConfidence = () => setLock(prev => prev.map((x, i) => i === currentPlayer ? true : x));
  const setAns = (qi, opt) => setAnswers(prev => prev.map((P, i) => i === currentPlayer ? P.map((x, j) => j === qi ? opt : x) : P));
  
  const submitPlayer = () => {
    if (currentPlayer < playerCount - 1) setCurrentPlayer(p => p + 1);
    else {
      const rows = [];
      for (let p = 0; p < playerCount; p++) {
        C.forEach(cfg => rows.push({ phase: "pre", section: "confidence", playerIndex: p, playerLabel: `Player ${p+1}`, questionPrompt: cfg.label, response: sliderValues[p][cfg.key] }));
        const pSet = playerQuestionSets[p];
        pSet.forEach((q, qi) => {
          const sel = answers[p][qi];
          rows.push({ 
            phase: "pre", section: "quiz", playerIndex: p, playerLabel: `Player ${p+1}`, 
            questionPrompt: q.prompt, selectedIndex: sel, 
            selectedOption: sel!=null?q.options[sel]:"", correct: sel===q.answer 
          });
        });
      }
      onComplete({ tidyRows: rows });
    }
  };
  
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
        {C.map(cfg => (
          <Box key={cfg.key} sx={{ my: 4 }}>
            <Typography variant="h6" gutterBottom>{cfg.label}</Typography>
            <Slider min={0} max={10} marks value={currentSliders[cfg.key]||5} disabled={locked} onChange={(_,v)=>handleSliderChange(cfg.key,v)} valueLabelDisplay="auto"/>
          </Box>
        ))}
        {!locked && <Button variant="contained" size="large" sx={{ mt: 2 }} onClick={submitConfidence}>Continue to Questions</Button>}
        
        {locked && (
          <>
            <Divider sx={{ my: 4 }} />
            <Typography variant="h5" sx={{ color: "primary.main", mb: 2 }}>Section 2 – Questions</Typography>
            {currentQuestions.map((q, qi) => (
              <Box key={qi} sx={{ mb: 4, p: 2, border: '1px solid #eee', borderRadius: 2 }}>
                {/* 1. NUMBERING */}
                <Typography variant="overline" color="textSecondary">
                  Question {qi + 1} of {currentQuestions.length}
                </Typography>

                <Typography variant="h6" gutterBottom sx={{ mt: 1 }}>{q.prompt}</Typography>
                
                {/* 2. IMAGE MOVED BELOW TEXT */}
                {q.image && (
                  <Box sx={{ mb: 2, mt: 2, textAlign: 'center' }}>
                    <img 
                      src={resolveImage(q.image)} 
                      alt="Question Diagram" 
                      style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '4px' }}
                    />
                  </Box>
                )}

                <RadioGroup value={currentAns[qi]??-1} onChange={(e)=>setAns(qi, Number(e.target.value))}>
                  {q.options.map((o, oi) => <FormControlLabel key={oi} value={oi} control={<Radio />} label={<Typography variant="body1">{o}</Typography>} />)}
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

function PostSurveyView({ playerCount, playerQuestionSets, confidenceQuestions, onComplete, resolveImage }) {
  const C = confidenceQuestions || [];
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const displayedQuestions = playerQuestionSets[currentPlayer] || [];
  const [sliderValues, setSliderValues] = useState(Array.from({ length: playerCount }, () => { const obj = {}; C.forEach(c => obj[c.key]=5); return obj; }));
  const [answers, setAnswers] = useState(Array(playerCount).fill([]).map(() => []));
  const [lock, setLock] = useState(Array(playerCount).fill(false));

  const handleSliderChange = (key, val) => {
    if(!lock[currentPlayer]) setSliderValues(prev => prev.map((p, i) => i === currentPlayer ? { ...p, [key]: val } : p));
  };
  const submitConfidence = () => setLock(prev => prev.map((x, i) => i === currentPlayer ? true : x));
  
  const setAns = (qi, opt) => {
    setAnswers(prev => {
      const pAnswers = [...prev[currentPlayer]];
      pAnswers[qi] = opt;
      const newAll = [...prev];
      newAll[currentPlayer] = pAnswers;
      return newAll;
    });
  };

  const submitPlayer = () => {
    if (currentPlayer < playerCount - 1) setCurrentPlayer(p => p + 1);
    else {
      const rows = [];
      for (let p = 0; p < playerCount; p++) {
        C.forEach(cfg => rows.push({ phase: "post", section: "confidence", playerIndex: p, playerLabel: `Player ${p+1}`, questionPrompt: cfg.label, response: sliderValues[p][cfg.key] }));
        const pSet = playerQuestionSets[p];
        pSet.forEach((q, qi) => {
          const sel = answers[p][qi];
          rows.push({ 
            phase: "post", section: "quiz", playerIndex: p, playerLabel: `Player ${p+1}`, 
            questionPrompt: q.prompt, selectedIndex: sel, selectedOption: sel!=null?q.options[sel]:"" 
          });
        });
      }
      onComplete({ tidyRows: rows });
    }
  };

  const currentSliders = sliderValues[currentPlayer];
  const currentAns = answers[currentPlayer] || [];
  const locked = lock[currentPlayer];

  return (
    <Container maxWidth={false} sx={{ mt: 6, width: "95%", maxWidth: "1200px" }}>
      <Card sx={{ p: 6 }}>
        <Typography variant="h4" gutterBottom>Post-Game Survey</Typography>
        <Typography variant="subtitle1">Player {currentPlayer + 1} of {playerCount}</Typography>
        <Divider sx={{ my: 3 }} />
        <Typography variant="h5" sx={{ color: "primary.main" }}>Section 1 – Confidence</Typography>
        {C.map(cfg => (
          <Box key={cfg.key} sx={{ my: 4 }}>
            <Typography variant="h6" gutterBottom>{cfg.label}</Typography>
            <Slider min={0} max={10} marks value={currentSliders[cfg.key]||5} disabled={locked} onChange={(_,v)=>handleSliderChange(cfg.key,v)} valueLabelDisplay="auto"/>
          </Box>
        ))}
        {!locked && <Button variant="contained" size="large" sx={{ mt: 2 }} onClick={submitConfidence}>Continue to Questions</Button>}
        
        {locked && (
          <>
            <Divider sx={{ my: 4 }} />
            <Typography variant="h5" sx={{ color: "primary.main", mb: 2 }}>Section 2 – Questions</Typography>
            {displayedQuestions.map((q, qi) => (
              <Box key={qi} sx={{ mb: 4 }}>
                {q.image && (
                  <Box sx={{ mb: 2, textAlign: 'center' }}>
                    <img 
                      src={resolveImage(q.image)} 
                      alt="Question Diagram" 
                      style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '4px' }}
                    />
                  </Box>
                )}
                <Typography variant="h6" gutterBottom>{q.prompt}</Typography>
                <RadioGroup value={currentAns[qi]??-1} onChange={(e)=>setAns(qi, Number(e.target.value))}>
                  {q.options.map((o, oi) => <FormControlLabel key={oi} value={oi} control={<Radio />} label={<Typography variant="body1">{o}</Typography>} />)}
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

  useEffect(() => {
    const handlePopState = (event) => window.history.pushState(null, document.title, window.location.href);
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
        } catch (err) { setLoadingError("Incorrect password or invalid file."); return; }
      }
      try {
        const rows = parseTsv(text);
        if (rows.length > 0) { setAllTsvRows(rows); setGameMode(null); setSelectedModule(null); } 
        else { setLoadingError("File contains no valid rows."); }
      } catch (err) { setLoadingError("Could not parse TSV."); }
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

  const resolveImageSource = (imgName) => {
    if (!imgName) return null;
    if (localImageMap[imgName]) return localImageMap[imgName];
    if (imgName.startsWith("http") || imgName.startsWith("data:")) return imgName;
    return `./question_images/${imgName}`;
  };

  const selectTopic = (t) => {
    setGameMode(t);
    const mods = getModulesForTopic(allTsvRows, t);
    setModules(mods);
    setSelectedModule(mods[0] || null);
    setModuleModalOpen(true);
  };

  const confirmModule = () => {
    const poolRows = filterSurveyRows(allTsvRows, { bigTopic: gameMode, module: selectedModule, type: "survey" });
    const poolQuestions = poolRows.map(rowToSurveyQuestion);
    const newSets = [];
    for (let i = 0; i < playerCount; i++) {
      const shuffled = [...poolQuestions].sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, 10);
      newSets.push(selected);
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
    const csv = [headers.join(","), ...full.map(r => headers.map(h => `"${(r[h]||"").toString().replace(/"/g,'""')}"`).join(","))].join("\n");
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
        <Typography variant="caption" sx={{ mt: 4, display: 'block', color: '#888' }}>Designed by Hans Ghezzi</Typography>
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

  if (phase === "PRE_SURVEY") return <PreSurveyView playerCount={playerCount} playerQuestionSets={playerQuestionSets} confidenceQuestions={confQ} resolveImage={resolveImageSource} onComplete={d => { setPreRows(d.tidyRows); setPhase("GAME"); }} />;
  if (phase === "GAME") return <MicrobiopolyGame boardData={buildBoardFromTsv(gameMode, allTsvRows, selectedModule)} bigTopic={gameMode} module={selectedModule} playerCount={playerCount} tsvRows={allTsvRows} imageMap={localImageMap} onEndGame={d => { setGameRows(d); setPhase("POST_SURVEY"); }} onExit={() => { setPhase("SETUP"); setGameMode(null); }} />;
  if (phase === "POST_SURVEY") return <PostSurveyView playerCount={playerCount} playerQuestionSets={playerQuestionSets} confidenceQuestions={confQ} resolveImage={resolveImageSource} onComplete={d => { setPostRows(d.tidyRows); setPhase("SUMMARY"); }} />;
  return <SummaryView onExport={handleExport} onReturn={() => { setPhase("SETUP"); setGameMode(null); setAllTsvRows([]); }} />;
}