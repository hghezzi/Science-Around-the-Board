// src/App.jsx
import React, { useState, useEffect, useMemo } from "react";
import CryptoJS from "crypto-js"; 
import { buildBoardFromTsv } from "./gameData"; 
import GameScreen from "./GameScreen";
import { parseTsv, getAllTopics, getModulesForTopic } from "./tsvParser";
import { validateQuestionRows } from "./tsvValidator";
import { checkAnswer } from "./questionFormats";
import { buildSurveySets, buildConfidenceQuestions } from "./surveys";
import { readConfig } from "./config";
import { toCsv, resultsFilename, summarizeTeams, teamInfoRows, makeSessionId, buildPayload, sendResults, buildMailto, downloadText } from "./results";
import { bestPreSurveyPlayer } from "./gameRules";
import { resolveImage } from "./images";
import QuestionInput from "./QuestionInput";
import { resetConsent } from "./consent";
import ConsentBanner from "./ConsentBanner";
import { TEAM_COLORS, TEAM_SYMBOLS } from "./theme";
import { teamDisplayName } from "./labels";

import {
  Card, Typography, Container, ToggleButton, ToggleButtonGroup, Button,
  Box, Slider, Divider, Modal, Alert, Paper, TextField,
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
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", color: "text.primary", py: 5 }}>
    <Container maxWidth="md">
      <Card sx={{ p: { xs: 3, md: 5 } }}>
        <Typography variant="h4" gutterBottom>{isPre ? "Pre-Game Survey" : "Post-Game Survey"}</Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box aria-hidden sx={{ width: 22, height: 22, borderRadius: "50%", bgcolor: TEAM_COLORS[currentPlayer], color: "#fff", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", textShadow: "0 0 2px rgba(0,0,0,.7)" }}>{TEAM_SYMBOLS[currentPlayer]}</Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{teamDisplayName(currentPlayer, playerCount)} · player {currentPlayer + 1} of {playerCount}</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {isPre ? "Answer on your own; this is your starting point, not a test. The best score goes first." : "Same questions as before the game. How much have you learned?"}
        </Typography>
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
              <Box key={`${currentPlayer}-${qi}`} sx={{ mb: 3, p: 2.5, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
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
    </Box>
  );
}

function ValidationReport({ validation, imageMap, imageBase = "" }) {
  const [missingImages, setMissingImages] = useState([]);
  const images = validation ? validation.images : [];
  const imagesKey = images.join("|");
  // Only warn about images that can't be found anywhere (uploads, links, hosted copies).
  useEffect(() => {
    let cancelled = false;
    const candidates = images.filter((img) => !imageMap[img] && !/^(https?:|data:)/i.test(img));
    Promise.all(candidates.map(async (img) => {
      try {
        const res = await fetch(resolveImage(img, {}, imageBase), { method: "HEAD" });
        return res.ok && (res.headers.get("content-type") || "").startsWith("image/") ? null : img;
      } catch {
        return img;
      }
    })).then((found) => { if (!cancelled) setMissingImages(found.filter(Boolean)); });
    return () => { cancelled = true; };
  }, [imagesKey, imageMap, imageBase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!validation) return null;
  const { errors, warnings } = validation;
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
            {missingImages.length} image{missingImages.length > 1 ? "s" : ""} couldn't be found: {missingImages.join(", ")}.
            Those questions still work, just without the picture. If you have the files, add them with "Optional: upload images".
          </Typography>
        </Alert>
      )}
    </Box>
  );
}

function SummaryView({ playerCount, config, topic, module, preRows, postRows, gameRows, onReturn }) {
  const [members, setMembers] = useState(() => Array(playerCount).fill(""));
  const [sessionId] = useState(() => makeSessionId());
  const [sendState, setSendState] = useState({ status: "idle", message: "" });
  const summary = summarizeTeams({ preRows, postRows, gameRows, playerCount, members });
  const namesMissing = config.askNames && members.some((m) => !m.trim());
  const filename = resultsFilename(topic, module);
  const allRows = () => [...teamInfoRows(summary, sessionId), ...preRows, ...gameRows, ...postRows];
  const download = () => downloadText(filename, toCsv(allRows()));
  const send = async () => {
    setSendState({ status: "sending", message: "" });
    const result = await sendResults(config.resultsUrl, buildPayload({ sessionId, config, topic, module, summary, rows: allRows() }));
    setSendState(result.status === "sent" ? { status: "sent", message: "" } : { status: "error", message: result.message });
  };
  // A real mailto: link (most reliable way to open the email app); clicking it also downloads the file to attach.
  const mailtoHref = config.instructorEmail
    ? buildMailto({ to: config.instructorEmail, course: config.course, topic, module, summary, filename })
    : "";
  const hasDelivery = Boolean(config.resultsUrl || config.instructorEmail);
  let sheetHost = "";
  try { sheetHost = config.resultsUrl ? new URL(config.resultsUrl).hostname : ""; } catch { /* filtered by readConfig */ }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", color: "text.primary", py: 6 }}>
      <Container maxWidth="sm">
        <Card sx={{ p: { xs: 3, md: 4 } }}>
          <Box sx={{ textAlign: "center" }}>
            <Box aria-hidden sx={{ fontSize: 56, lineHeight: 1 }}>🏁</Box>
            <Typography variant="h4" component="h1" sx={{ mt: 1 }}>Session complete</Typography>
          </Box>
          <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", my: 3, "& td, & th": { p: 1, borderBottom: "1px solid", borderColor: "divider", textAlign: "left" } }}>
            <thead><tr><th>Team</th><th>Survey before</th><th>Survey after</th></tr></thead>
            <tbody>
              {summary.map((t) => (
                <tr key={t.playerIndex}>
                  <td>{TEAM_SYMBOLS[t.playerIndex]} {t.team}</td>
                  <td>{t.preScore}/{t.surveyQuestions}</td>
                  <td><strong>{t.postScore}/{t.surveyQuestions}</strong></td>
                </tr>
              ))}
            </tbody>
          </Box>
          <Typography variant="h6" component="h2">Who played?</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {config.askNames ? "Required by your instructor:" : "Optional:"} type the names or student IDs of everyone on each team.
          </Typography>
          {summary.map((t, i) => (
            <TextField
              key={i}
              fullWidth
              required={config.askNames}
              sx={{ mb: 1.5 }}
              label={`${TEAM_SYMBOLS[i]} ${t.team}: names or student IDs`}
              value={members[i]}
              onChange={(e) => setMembers((prev) => prev.map((m, j) => (j === i ? e.target.value : m)))}
            />
          ))}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mt: 2 }}>
            {config.resultsUrl && (
              <>
                <Button variant="contained" size="large" disabled={namesMissing || ["sending", "sent"].includes(sendState.status)} onClick={send}>
                  {sendState.status === "sending" ? "Sending…" : sendState.status === "sent" ? "Sent ✓" : "📤 Send results to instructor"}
                </Button>
                <Typography variant="caption" color="text.secondary">Goes straight to your instructor's results sheet ({sheetHost}).</Typography>
                {sendState.status === "sent" && <Alert severity="success">Sent! Your instructor has your results. You can also download a copy below.</Alert>}
                {sendState.status === "error" && <Alert severity="error">{sendState.message}</Alert>}
              </>
            )}
            {config.instructorEmail && (
              <>
                <Button variant={config.resultsUrl ? "outlined" : "contained"} size="large" disabled={namesMissing} href={mailtoHref} onClick={download}>✉ Email results to instructor</Button>
                <Typography variant="caption" color="text.secondary">Downloads the results file and opens your email app. Attach the file before sending.</Typography>
              </>
            )}
            <Button variant={hasDelivery ? "text" : "contained"} size="large" onClick={download}>⬇ Download results (CSV)</Button>
            {!hasDelivery && <Typography variant="caption" color="text.secondary">Submit this file as your instructor asked, for example on your course page.</Typography>}
            <Button variant="text" color="inherit" onClick={onReturn}>Back to main menu</Button>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
            Closing this tab before sending or downloading loses the results.
          </Typography>
        </Card>
      </Container>
    </Box>
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
  const config = useMemo(() => readConfig(allTsvRows), [allTsvRows]);

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

  const handleLoadDefault = async (url) => {
    setLoadingError(null);
    try {
      const rows = await fetchDefaultQuestions(url);
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
    setModuleModalOpen(false);
  };

  // Survey sets are built here (not when the module is confirmed) so they always
  // match the final team count.
  const startGame = () => {
    setPlayerQuestionSets(buildSurveySets(allTsvRows, { topic: gameMode, module: selectedModule, playerCount }));
    setConfQ(buildConfidenceQuestions(allTsvRows, { topic: gameMode, module: selectedModule }));
    setPhase("PRE_SURVEY");
  };

  // --- Render ---

  // REVISED LOGIC: Show Landing Page if NO Data OR Not Confirmed
  if (allTsvRows.length === 0 || !filesConfirmed) {
    const hasData = allTsvRows.length > 0;
    
    const choice = (icon, title, text, action) => (
      <Card
        component="button"
        onClick={action.onClick}
        sx={{ p: 2.5, textAlign: "left", cursor: "pointer", font: "inherit", color: "text.primary", bgcolor: "background.paper", display: "flex", gap: 2, alignItems: "center", width: "100%", transition: "transform .15s, box-shadow .15s", "&:hover": { transform: "translateY(-2px)", boxShadow: 6 }, "&:focus-visible": { outline: "3px solid", outlineColor: "primary.main" } }}
      >
        <Box aria-hidden sx={{ fontSize: 34, lineHeight: 1 }}>{icon}</Box>
        <Box>
          <Typography variant="h6" sx={{ lineHeight: 1.2 }}>{title}</Typography>
          <Typography variant="body2" color="text.secondary">{text}</Typography>
        </Box>
      </Card>
    );

    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default", color: "text.primary", py: { xs: 4, md: 8 } }}>
        <Container maxWidth="sm" sx={{ textAlign: "center" }}>
          <Box aria-hidden sx={{ fontSize: 56, lineHeight: 1, mb: 1 }}>🎲</Box>
          <Typography variant="h2" component="h1" sx={{ fontSize: { xs: "2.4rem", md: "3.4rem" }, mb: 1 }}>Science Around the Board</Typography>
          <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 500, mb: 4 }}>
            Turn any course into a board-game review session: roll, answer, invest and outwit the other teams.
          </Typography>

          {!hasData ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, textAlign: "left" }}>
              {choice("🧬", "Play the demo", "16S rRNA sequencing & QIIME 2 (the original course).", { onClick: () => handleLoadDefault() })}
              {choice("📊", "Try a different subject", "Intro Statistics example, made with the question-writer skill.", { onClick: () => handleLoadDefault("./examples/intro_statistics.tsv") })}
              <Card sx={{ p: 2.5, display: "flex", gap: 2, alignItems: "center", bgcolor: "background.paper" }}>
                <Box aria-hidden sx={{ fontSize: 34, lineHeight: 1 }}>📂</Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h6" sx={{ lineHeight: 1.2 }}>Use your instructor's questions</Typography>
                  <Typography variant="body2" color="text.secondary">Upload the .tsv or encrypted .lock file you were given.</Typography>
                </Box>
                <Button variant="contained" component="label">
                  Upload
                  <input type="file" hidden accept=".tsv,.txt,.lock" onChange={handleFileUpload} />
                </Button>
              </Card>
            </Box>
          ) : (
            <Card sx={{ p: { xs: 3, md: 4 }, textAlign: "left" }}>
              <Alert severity="success" sx={{ mb: 2 }}>
                <strong>Loaded {allTsvRows.length} questions.</strong> Check the notes below, then continue.
              </Alert>
              {(config.resultsUrl || config.instructorEmail) && (
                <Alert severity="info" sx={{ mb: 2 }}>Results will be sent to your instructor at the end of the game.</Alert>
              )}
              <ValidationReport validation={validation} imageMap={localImageMap} />
              <Button variant="outlined" component="label" fullWidth size="large" color="secondary" sx={{ mb: 1 }}>
                🖼️ Optional: upload images
                <input type="file" hidden multiple accept="image/*" onChange={handleImageUpload} />
              </Button>
              {Object.keys(localImageMap).length > 0 && (
                <Typography variant="caption" sx={{ display: "block", mb: 1, color: "success.main", fontWeight: 700 }}>
                  {Object.keys(localImageMap).length} images ready.
                </Typography>
              )}
              <Button variant="contained" fullWidth size="large" color="success" sx={{ mt: 2, py: 1.5, fontSize: "1.1rem" }} onClick={() => setFilesConfirmed(true)}>
                Continue to game setup →
              </Button>
              <Button fullWidth size="small" color="inherit" sx={{ mt: 1 }} onClick={() => setAllTsvRows([])}>Use a different file</Button>
            </Card>
          )}

          {loadingError && <Alert severity="error" sx={{ mt: 2, textAlign: "left" }}>{loadingError}</Alert>}

          <Typography variant="body2" sx={{ mt: 4 }}>
            <a href="./guide/" target="_blank" rel="noopener">Instructor guide</a> ·{" "}
            <a href="./encryptor.html" target="_blank" rel="noopener">Encrypt a question file</a>
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            Designed by Hans Ghezzi ·{" "}
            <a href="./privacy.html" target="_blank" rel="noopener">Privacy</a> ·{" "}
            <a href="#" onClick={(e) => { e.preventDefault(); resetConsent(); }}>Analytics settings</a>
          </Typography>
        </Container>
        <ConsentBanner />
      </Box>
    );
  }

  // --- STANDARD GAME FLOW ---

  if (phase === "SETUP") {
    const topics = getAllTopics(allTsvRows);
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default", color: "text.primary", py: 5, pb: 14 }}>
        <Container maxWidth="md">
          <Typography variant="h3" component="h1" sx={{ textAlign: "center", mb: 4 }}>Game setup</Typography>

          <Card sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>1 · How many teams?</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1.5 }}>
              {[1, 2, 3, 4].map((n) => (
                <Box
                  key={n}
                  component="button"
                  aria-pressed={playerCount === n}
                  onClick={() => setPlayerCount(n)}
                  sx={{ p: 1.5, borderRadius: 2, cursor: "pointer", font: "inherit", color: "text.primary", bgcolor: playerCount === n ? "action.selected" : "background.paper", border: "2px solid", borderColor: playerCount === n ? "primary.main" : "divider" }}
                >
                  <Box sx={{ display: "flex", justifyContent: "center", gap: 0.5, mb: 0.5 }}>
                    {TEAM_COLORS.slice(0, n).map((c, i) => (
                      <Box key={i} aria-hidden sx={{ width: 20, height: 20, borderRadius: "50%", bgcolor: c, color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", textShadow: "0 0 2px rgba(0,0,0,.7)" }}>{TEAM_SYMBOLS[i]}</Box>
                    ))}
                  </Box>
                  <Typography sx={{ fontWeight: 800 }}>{n === 1 ? "Solo" : `${n} teams`}</Typography>
                </Box>
              ))}
            </Box>
          </Card>

          <Card sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6">2 · Session length</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              The game ends when one team is left standing, or when time runs out (highest net worth wins).
            </Typography>
            <ToggleButtonGroup value={sessionMinutes} exclusive onChange={(_, v) => v !== null && setSessionMinutes(v)} fullWidth color="primary">
              {[0, 30, 45, 60, 90].map((m) => <ToggleButton key={m} value={m} sx={{ fontWeight: 800 }}>{m === 0 ? "No timer" : `${m} min`}</ToggleButton>)}
            </ToggleButtonGroup>
          </Card>

          <Card sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>3 · Choose a topic</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 1.5 }}>
              {topics.map((t) => (
                <Box
                  key={t}
                  component="button"
                  aria-pressed={gameMode === t}
                  onClick={() => selectTopic(t)}
                  sx={{ p: 2.5, borderRadius: 2, cursor: "pointer", font: "inherit", textAlign: "left", color: "text.primary", bgcolor: gameMode === t ? "action.selected" : "background.paper", border: "2px solid", borderColor: gameMode === t ? "primary.main" : "divider", transition: "transform .15s", "&:hover": { transform: "translateY(-2px)" } }}
                >
                  <Typography variant="h6" sx={{ color: "primary.main" }}>{t}</Typography>
                  {gameMode === t && selectedModule && <Typography variant="body2" color="text.secondary">Module: {selectedModule}</Typography>}
                </Box>
              ))}
            </Box>
          </Card>
        </Container>

        <Paper elevation={6} sx={{ p: 2, position: "fixed", bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 2, zIndex: 100, borderRadius: 0 }}>
          <Button size="small" color="inherit" onClick={() => setAllTsvRows([])}>Change file</Button>
          <Button variant="contained" color="success" size="large" disabled={!gameMode} onClick={startGame} sx={{ px: 6, py: 1.5, fontSize: "1.15rem" }}>Start game →</Button>
        </Paper>

        <Modal open={moduleModalOpen} onClose={() => setModuleModalOpen(false)}>
          <Box sx={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "min(360px, 92vw)", bgcolor: "background.paper", color: "text.primary", p: 4, borderRadius: 3, boxShadow: 24 }}>
            <Typography variant="h6" gutterBottom>Select module</Typography>
            {modules.length > 0 ? modules.map((m) => <Button key={m} fullWidth variant={selectedModule === m ? "contained" : "outlined"} onClick={() => setSelectedModule(m)} sx={{ mb: 1 }}>{m}</Button>) : <Typography>No specific modules found.</Typography>}
            <Divider sx={{ my: 2 }} />
            <Button fullWidth variant="contained" color="success" sx={{ py: 1.5 }} onClick={confirmModule}>Confirm selection</Button>
          </Box>
        </Modal>
      </Box>
    );
  }

  if (phase === "PRE_SURVEY") return <SurveyView key="pre" phase="pre" playerCount={playerCount} playerQuestionSets={playerQuestionSets} confidenceQuestions={confQ} resolveImage={resolveImageSource} onComplete={d => { setPreRows(d.tidyRows); setStartPlayer(bestPreSurveyPlayer(d.tidyRows, playerCount)); setPhase("GAME"); }} />;
  if (phase === "GAME") return <GameScreen boardData={buildBoardFromTsv(gameMode, allTsvRows, selectedModule)} bigTopic={gameMode} module={selectedModule} playerCount={playerCount} startingPlayerIndex={startPlayer} sessionMinutes={sessionMinutes} tsvRows={allTsvRows} imageMap={localImageMap} onEndGame={d => { setGameRows(d); setPhase("POST_SURVEY"); }} onExit={() => { setPhase("SETUP"); setGameMode(null); }} />;
  if (phase === "POST_SURVEY") return <SurveyView key="post" phase="post" playerCount={playerCount} playerQuestionSets={playerQuestionSets} confidenceQuestions={confQ} resolveImage={resolveImageSource} onComplete={d => { setPostRows(d.tidyRows); setPhase("SUMMARY"); }} />;
  return <SummaryView playerCount={playerCount} config={config} topic={gameMode} module={selectedModule} preRows={preRows} postRows={postRows} gameRows={gameRows} onReturn={() => { setPhase("SETUP"); setGameMode(null); setAllTsvRows([]); }} />;
}