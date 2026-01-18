// src/App.jsx
import React, { useState, useEffect } from "react";
import CryptoJS from "crypto-js"; 
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
  Paper,
} from "@mui/material";

/* -------------------------------------------------------------------------- */
/* TSV PARSING LOGIC                                                          */
/* -------------------------------------------------------------------------- */

async function fetchDefaultQuestions(url = "./questions.tsv") {
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

function getSurveyQuestions(all, { bigTopic, module }) {
  const getQ = (type) => {
    const specific = filterSurveyRows(all, { bigTopic, module, type });
    if (specific.length > 0) return specific;
    return filterSurveyRows(all, { bigTopic, module: null, type });
  };
  const pre = getQ("pre");
  const post = getQ("post");
  const conf = getQ("confidence");
  return {
    preSurveyQuestions: pre.map(rowToSurveyQuestion),
    postSurveyQuestions: post.map(rowToSurveyQuestion),
    confidenceQuestions: conf.map((r, i) => ({ key: r.id || `conf_${i}`, label: r.question })),
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

// --- SURVEY VIEWS ---

function PreSurveyView({ playerCount, quizQuestions, confidenceQuestions, onComplete }) {
  const Q = quizQuestions || [];
  const C = confidenceQuestions || [];
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [sliderValues, setSliderValues] = useState(Array.from({ length: playerCount }, () => { const obj = {}; C.forEach(c => obj[c.key]=5); return obj; }));
  const [answers, setAnswers] = useState(Array.from({ length: playerCount }, () => Q.map(() => null)));
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
        Q.forEach((q, qi) => {
          const sel = answers[p][qi];
          rows.push({ phase: "pre", section: "quiz", playerIndex: p, playerLabel: `Player ${p+1}`, questionPrompt: q.prompt, selectedIndex: sel, selectedOption: sel!=null?q.options[sel]:"", correct: sel===q.answer });
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
            {Q.map((q, qi) => (
              <Box key={qi} sx={{ mb: 4 }}>
                <Typography variant="h6" gutterBottom>{q.prompt}</Typography>
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

function PostSurveyView({ playerCount, quizQuestions, confidenceQuestions, onComplete }) {
  const Q = quizQuestions || [];
  const C = confidenceQuestions || [];
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [sliderValues, setSliderValues] = useState(Array.from({ length: playerCount }, () => { const obj = {}; C.forEach(c => obj[c.key]=5); return obj; }));
  const [answers, setAnswers] = useState(Array.from({ length: playerCount }, () => Q.map(() => null)));
  const [lock, setLock] = useState(Array(playerCount).fill(false));

  const handleSliderChange = (key, val) => { if(!lock[currentPlayer]) setSliderValues(prev => prev.map((p, i) => i === currentPlayer ? { ...p, [key]: val } : p)); };
  const submitConfidence = () => setLock(prev => prev.map((x, i) => i === currentPlayer ? true : x));
  const setAns = (qi, opt) => setAnswers(prev => prev.map((P, i) => i === currentPlayer ? P.map((x, j) => j === qi ? opt : x) : P));
  const submitPlayer = () => {
    if (currentPlayer < playerCount - 1) setCurrentPlayer(p => p + 1);
    else {
      const rows = [];
      for (let p = 0; p < playerCount; p++) {
        C.forEach(cfg => rows.push({ phase: "post", section: "confidence", playerIndex: p, playerLabel: `Player ${p+1}`, questionPrompt: cfg.label, response: sliderValues[p][cfg.key] }));
        Q.forEach((q, qi) => {
          const sel = answers[p][qi];
          rows.push({ phase: "post", section: "quiz", playerIndex: p, playerLabel: `Player ${p+1}`, questionPrompt: q.prompt, selectedIndex: sel, selectedOption: sel!=null?q.options[sel]:"" });
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
            {Q.map((q, qi) => (
              <Box key={qi} sx={{ mb: 4 }}>
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

/* -------------------------------------------------------------------------- */
/* MAIN APP                                                                   */
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

  // Data storage
  const [preRows, setPreRows] = useState([]);
  const [postRows, setPostRows] = useState([]);
  const [gameRows, setGameRows] = useState([]);
  const [preQ, setPreQ] = useState([]);
  const [postQ, setPostQ] = useState([]);
  const [confQ, setConfQ] = useState([]);

  const handleLoadDefault = async () => {
    setLoadingError(null);
    try {
      const rows = await fetchDefaultQuestions();
      if (rows.length > 0) setAllTsvRows(rows);
      else setLoadingError("Default file is empty.");
    } catch (e) {
      setLoadingError(e.message);
    }
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
        } catch (err) {
          setLoadingError("Incorrect password or invalid file.");
          return;
        }
      }
      try {
        const rows = parseTsv(text);
        if (rows.length > 0) {
          setAllTsvRows(rows);
          setGameMode(null);
          setSelectedModule(null);
        } else {
          setLoadingError("File contains no valid rows.");
        }
      } catch (err) {
        setLoadingError("Could not parse TSV.");
      }
    };
    reader.readAsText(file);
  };

  const selectTopic = (t) => {
    setGameMode(t);
    const mods = getModulesForTopic(allTsvRows, t);
    setModules(mods);
    setSelectedModule(mods[0] || null);
    setModuleModalOpen(true);
  };

  const confirmModule = () => {
    const { preSurveyQuestions, postSurveyQuestions, confidenceQuestions } = getSurveyQuestions(allTsvRows, { bigTopic: gameMode, module: selectedModule });
    setPreQ(preSurveyQuestions);
    setPostQ(postSurveyQuestions);
    setConfQ(confidenceQuestions);
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

  // 1. Initial Screen (Load Data)
  if (allTsvRows.length === 0) {
    return (
      <Container maxWidth="md" sx={{ textAlign: "center", mt: 8 }}>
        <Typography variant="h2" sx={{ fontWeight: 'bold', color: '#2c3e50', mb: 2 }}>
          Science Around the Board
        </Typography>
        <Typography variant="h5" sx={{ color: '#555', mb: 4 }}>
          A Monopoly-style bioinformatics learning adventure.
        </Typography>

        <Card sx={{ p: 6, boxShadow: 3, mx: "auto", maxWidth: 600 }}>
          <Typography variant="h6" gutterBottom>Load Question Data</Typography>
          <Typography color="textSecondary" sx={{ mb: 3 }}>
            Select a question source to begin the session.
          </Typography>

          <Button variant="contained" fullWidth size="large" onClick={handleLoadDefault} sx={{ mb: 2 }}>
            Load Default Game
          </Button>
          <Divider sx={{ my: 2 }}>OR</Divider>
          <Button variant="outlined" component="label" fullWidth size="large">
            Upload Custom Questions
            <input type="file" hidden accept=".tsv,.txt,.lock" onChange={handleFileUpload} />
          </Button>

          {loadingError && <Alert severity="error" sx={{ mt: 2 }}>{loadingError}</Alert>}
        </Card>

        <Typography variant="caption" sx={{ mt: 4, display: 'block', color: '#888' }}>
          Designed by Hans Ghezzi
        </Typography>
      </Container>
    );
  }

  // 2. Main Menu
  if (phase === "SETUP") {
    const topics = getAllTopics(allTsvRows);
    return (
      <Container maxWidth="md" sx={{ textAlign: "center", mt: 6 }}>
        <Typography variant="h3" gutterBottom sx={{ fontWeight: "bold" }}>Game Setup</Typography>
        
        {/* Player Selection */}
        <Card sx={{ p: 3, mb: 4, mx: "auto", maxWidth: 600 }}>
          <Typography variant="h6">Players</Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>Select number of research teams</Typography>
          <ToggleButtonGroup value={playerCount} exclusive onChange={(_, v) => v && setPlayerCount(v)} fullWidth color="primary">
            {[1,2,3,4].map(n => <ToggleButton key={n} value={n}>{n} Player{n>1?'s':''}</ToggleButton>)}
          </ToggleButtonGroup>
        </Card>

        {/* Topic Selection Cards */}
        <Typography variant="h6" gutterBottom>Select Topic</Typography>
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center', mb: 5 }}>
          {topics.map(t => (
            <Card 
              key={t} 
              sx={{ 
                p: 4, 
                width: 220, 
                cursor: 'pointer', 
                border: gameMode === t ? '3px solid #1976d2' : '1px solid #ddd',
                boxShadow: gameMode === t ? 4 : 1,
                transform: gameMode === t ? 'scale(1.05)' : 'scale(1)',
                transition: 'all 0.2s ease-in-out'
              }} 
              onClick={() => selectTopic(t)}
            >
              <Typography variant="h5" color="primary" sx={{ fontWeight: 'bold' }}>{t}</Typography>
            </Card>
          ))}
        </Box>

        {/* Action Bar */}
        <Paper elevation={3} sx={{ p: 2, position: 'fixed', bottom: 0, left: 0, right: 0, bgcolor: '#f5f5f5', display: 'flex', justifyContent: 'center', gap: 2, zIndex: 100 }}>
             <Button 
                variant="contained" 
                color="success" 
                size="large" 
                disabled={!gameMode} 
                onClick={() => setPhase("PRE_SURVEY")}
                sx={{ px: 6, py: 1.5, fontSize: '1.2rem' }}
             >
               Start Game
             </Button>
             
             <Button size="small" color="inherit" onClick={() => setAllTsvRows([])}>
               Change File
             </Button>
        </Paper>
        
        {/* Module Selection Modal - FIXED VISUALS */}
        <Modal open={moduleModalOpen} onClose={() => setModuleModalOpen(false)}>
          <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 300, bgcolor: 'background.paper', p: 4, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>Select Module</Typography>
            {modules.length > 0 ? (
               modules.map(m => (
                 <Button 
                   key={m} 
                   fullWidth 
                   variant={selectedModule === m ? 'contained' : 'outlined'} 
                   onClick={() => setSelectedModule(m)} 
                   sx={{ mb: 1 }}
                 >
                   {m}
                 </Button>
               ))
            ) : <Typography>No specific modules found. Continuing with default questions.</Typography>}
            
            <Divider sx={{ my: 2 }} />
            
            {/* The Green Confirm Button */}
            <Button 
              fullWidth 
              variant="contained" 
              color="success"
              sx={{ mt: 1, py: 1.5, fontWeight: 'bold' }} 
              onClick={confirmModule}
            >
              Confirm Selection
            </Button>
          </Box>
        </Modal>

        <Box sx={{ height: 100 }} />
      </Container>
    );
  }

  // 3. Phases
  if (phase === "PRE_SURVEY") return <PreSurveyView playerCount={playerCount} quizQuestions={preQ} confidenceQuestions={confQ} onComplete={d => { setPreRows(d.tidyRows); setPhase("GAME"); }} />;
  if (phase === "GAME") return <MicrobiopolyGame boardData={buildBoardFromTsv(gameMode, allTsvRows, selectedModule)} bigTopic={gameMode} module={selectedModule} playerCount={playerCount} tsvRows={allTsvRows} onEndGame={d => { setGameRows(d); setPhase("POST_SURVEY"); }} onExit={() => { setPhase("SETUP"); setGameMode(null); }} />;
  if (phase === "POST_SURVEY") return <PostSurveyView playerCount={playerCount} quizQuestions={postQ} confidenceQuestions={confQ} onComplete={d => { setPostRows(d.tidyRows); setPhase("SUMMARY"); }} />;
  return <SummaryView onExport={handleExport} onReturn={() => { setPhase("SETUP"); setGameMode(null); setAllTsvRows([]); }} />;
}