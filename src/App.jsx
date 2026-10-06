// src/App.jsx
import React, { useState, useEffect, useMemo, Suspense } from "react";
import { buildBoardFromTsv } from "./gameData"; 
import { lazyWithReload } from "./lazyLoad";
import { lockFormat, decryptLockFile } from "./lockFile";
import { setUpdateReloadSafe } from "./pwa";
import { parseTsv, getAllTopics, getModulesForTopic } from "./tsvParser";
import { validateQuestionRows } from "./tsvValidator";
import { checkAnswer } from "./questionFormats";
import { buildSurveySets, buildConfidenceQuestions } from "./surveys";
import { readConfig } from "./config";
import { saveSnapshot, loadSnapshot, clearSnapshot } from "./autosave";
import { toCsv, resultsFilename, summarizeTeams, teamInfoRows, makeSessionId, buildPayload, sendResults, buildMailto, downloadText } from "./results";
import { bestPreSurveyPlayer } from "./gameRules";
import { resolveImage } from "./images";
import QuestionInput from "./QuestionInput";
import { resetConsent } from "./consent";
import ConsentBanner from "./ConsentBanner";
import PasswordDialog from "./components/PasswordDialog";
import InstallButton from "./components/InstallButton";
import { DECK_SHORTCUTS, buildShareLink, isUnpublishedSheet, normalizeDeckUrl, normalizeImagesBase, readDeckParams } from "./deckLinks";
import { TEAM_COLORS, TEAM_SYMBOLS } from "./theme";
import { teamDisplayName } from "./labels";

// The board (and its animation library) loads after the start page, which keeps the first
// visit fast. It is fetched in the background right away, so it is ready before a game starts.
const loadGameScreen = () => import("./GameScreen");
const GameScreen = lazyWithReload(loadGameScreen);
const MAX_FILE_BYTES = 5 * 1024 * 1024; // question files are a few hundred kB at most
const TOO_BIG = "This file is too large to be a question file (over 5 MB).";

import {
  Card, Typography, Container, ToggleButton, ToggleButtonGroup, Button,
  Box, Slider, Divider, Modal, Alert, Paper, TextField, Accordion, AccordionSummary, AccordionDetails,
} from "@mui/material";

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
  // A failed check (offline, or a host without CORS headers) is not proof that an image is missing.
  useEffect(() => {
    let cancelled = false;
    const candidates = images.filter((img) => !imageMap[img] && !/^(https?:|data:)/i.test(img));
    Promise.all(candidates.map(async (img) => {
      try {
        const res = await fetch(resolveImage(img, {}, imageBase), { method: "HEAD" });
        return res.ok && (res.headers.get("content-type") || "").startsWith("image/") ? null : img;
      } catch {
        return null;
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

function SummaryView({ playerCount, config, topic, module, preRows, postRows, gameRows, sessionId: savedSessionId, onReturn }) {
  const [members, setMembers] = useState(() => Array(playerCount).fill(""));
  const [fallbackId] = useState(() => makeSessionId());
  const sessionId = savedSessionId || fallbackId; // one id per game, so a re-sent result can be spotted
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

// Instructors paste a question-file link and get a game link for students.
function ShareLinkBuilder() {
  const [deck, setDeck] = useState("");
  const [images, setImages] = useState("");
  const [copied, setCopied] = useState(false);
  const pageUrl = `${window.location.origin}${window.location.pathname}`;
  const link = deck.trim() ? buildShareLink(pageUrl, deck, images) : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); }
  };
  return (
    <Accordion sx={{ mt: 3, textAlign: "left" }}>
      <AccordionSummary expandIcon={<span aria-hidden>▾</span>}>
        <Typography sx={{ fontWeight: 700 }}>🔗 For instructors: share your questions as a link</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Students open the link and your questions load automatically. Use a Google Sheets "Publish to web → Tab-separated values" link,
          a GitHub file, or any public .tsv or .lock link. Anyone with a plain .tsv link can read the answers; share an encrypted .lock file to keep them hidden.
        </Typography>
        {isUnpublishedSheet(deck) && <Alert severity="warning" sx={{ mb: 2 }}>This Sheets link isn't published yet: File → Share → Publish to web → Tab-separated values.</Alert>}
        <TextField fullWidth label="Link to your question file" value={deck} onChange={(e) => { setDeck(e.target.value); setCopied(false); }} sx={{ mb: 2 }} />
        <TextField fullWidth label="Link to your image folder (optional)" value={images} onChange={(e) => { setImages(e.target.value); setCopied(false); }} sx={{ mb: 2 }} />
        {link && (
          <>
            <TextField fullWidth label="Game link for students" value={link} slotProps={{ htmlInput: { readOnly: true } }} sx={{ mb: 1 }} />
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button variant="contained" onClick={copy}>{copied ? "Copied ✓" : "Copy link"}</Button>
              <Button href={link} target="_blank" rel="noopener">Test it</Button>
            </Box>
          </>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

// --- MAIN APP ---

// Phases that are autosaved and can be resumed after a refresh.
const RESUMABLE_PHASES = ["PRE_SURVEY", "GAME", "POST_SURVEY", "SUMMARY"];

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
  const [imagesBase, setImagesBase] = useState(""); // image folder link (?images=)
  const [pendingCipher, setPendingCipher] = useState(null); // encrypted file waiting for its password
  const [passwordError, setPasswordError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  // Autosave: a saved session offered on the start page, the game's latest state and the state to resume from.
  const [resumeOffer, setResumeOffer] = useState(() => {
    const saved = loadSnapshot();
    return saved && RESUMABLE_PHASES.includes(saved.phase) ? saved : null;
  });
  const [gameSnapshot, setGameSnapshot] = useState(null);
  const [resumeGame, setResumeGame] = useState(null);
  const [sessionId, setSessionId] = useState("");

  const validation = useMemo(
    () => (allTsvRows.length ? validateQuestionRows(allTsvRows) : null),
    [allTsvRows]
  );
  const config = useMemo(() => readConfig(allTsvRows), [allTsvRows]);

  // Save the session in this browser so an accidental refresh doesn't lose it.
  useEffect(() => {
    if (!RESUMABLE_PHASES.includes(phase)) return;
    saveSnapshot({
      phase, sessionId, allTsvRows, imagesBase, gameMode, selectedModule, playerCount, sessionMinutes, startPlayer,
      playerQuestionSets, confQ, preRows, postRows, gameRows, game: gameSnapshot,
      hadImages: Object.keys(localImageMap).length > 0,
    });
  }, [phase, sessionId, allTsvRows, imagesBase, gameMode, selectedModule, playerCount, sessionMinutes, startPlayer,
      playerQuestionSets, confQ, preRows, postRows, gameRows, gameSnapshot, localImageMap]);

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

  // Fetch the board code in the background once the start page is showing.
  useEffect(() => {
    const warm = () => loadGameScreen().catch(() => { /* retried when the game starts */ });
    const id = window.requestIdleCallback ? window.requestIdleCallback(warm, { timeout: 3000 }) : window.setTimeout(warm, 1500);
    return () => (window.cancelIdleCallback ? window.cancelIdleCallback(id) : window.clearTimeout(id));
  }, []);

  // A new version of the app may reload the page by itself only on an empty start page.
  useEffect(() => { setUpdateReloadSafe(phase === "SETUP" && allTsvRows.length === 0 && !resumeOffer); }, [phase, allTsvRows, resumeOffer]);

  // Reset confirmation if file is cleared
  useEffect(() => {
    if (allTsvRows.length === 0) {
      setFilesConfirmed(false);
    }
  }, [allTsvRows]);

  // --- Handlers ---

  const parseAndLoad = (text) => {
    let rows = [];
    try { rows = parseTsv(text); } catch { /* reported below */ }
    if (rows.length > 0) { setAllTsvRows(rows); setGameMode(null); setSelectedModule(null); }
    else setLoadingError("This question file has no question rows. It needs a header line plus at least one row.");
  };
  const acceptQuestionText = (text) => {
    if (text.length > MAX_FILE_BYTES) { setLoadingError(TOO_BIG); return; }
    // Encrypted files from encryptor.html (see lockFile.js for both formats).
    if (lockFormat(text)) { setPasswordError(""); setPendingCipher(text); return; }
    if (!text.includes("\t")) {
      setLoadingError("This isn't a question file (.tsv or .lock). If you used a link, check that it points to the file itself, not to a web page.");
      return;
    }
    parseAndLoad(text);
  };
  const unlock = async (password) => {
    setUnlocking(true);
    let text = null;
    try {
      text = await decryptLockFile(pendingCipher, password);
    } catch (e) {
      setUnlocking(false);
      setPasswordError(e instanceof Error && /Web Crypto/.test(e.message) ? e.message : "Couldn't open the file. Check the internet connection and reload the page.");
      return;
    }
    setUnlocking(false);
    if (!text) { setPasswordError("That password didn't work. Passwords are case-sensitive."); return; }
    setPendingCipher(null);
    parseAndLoad(text);
  };
  const loadFromLink = async (input) => {
    setLoadingError(null);
    if (isUnpublishedSheet(input)) {
      setLoadingError("This Google Sheets link isn't published. In Google Sheets choose File → Share → Publish to web → Tab-separated values (.tsv), then use that link.");
      return;
    }
    const url = normalizeDeckUrl(input);
    if (!url) { setLoadingError("That doesn't look like a link to a question file."); return; }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      acceptQuestionText(await res.text());
    } catch {
      setLoadingError(DECK_SHORTCUTS[String(input).trim().toLowerCase()]
        ? "Couldn't load the example questions. Check your internet connection and try again."
        : "Couldn't load the question file from this link. Check that it's public (for Google Sheets: Publish to web as TSV) and that you're online.");
    }
  };
  const forgetSavedGame = () => {
    clearSnapshot(); setGameSnapshot(null); setResumeGame(null);
  };
  // Back to the start page with no file (also drops ?deck= from the address bar).
  const resetFile = () => {
    forgetSavedGame();
    setAllTsvRows([]); setImagesBase("");
    window.history.replaceState(null, "", window.location.pathname);
  };
  const resumeSaved = () => {
    const saved = resumeOffer;
    setAllTsvRows(saved.allTsvRows); setImagesBase(saved.imagesBase || "");
    setGameMode(saved.gameMode); setSelectedModule(saved.selectedModule); setPlayerCount(saved.playerCount);
    setSessionMinutes(saved.sessionMinutes); setStartPlayer(saved.startPlayer); setSessionId(saved.sessionId || "");
    setPlayerQuestionSets(saved.playerQuestionSets); setConfQ(saved.confQ);
    setPreRows(saved.preRows); setPostRows(saved.postRows); setGameRows(saved.gameRows);
    setResumeGame(saved.game || null); setGameSnapshot(saved.game || null);
    setFilesConfirmed(true); setPhase(saved.phase); setResumeOffer(null);
  };
  const discardSaved = () => {
    clearSnapshot(); setResumeOffer(null);
    const { deck } = readDeckParams(window.location.search);
    if (deck) loadFromLink(deck);
  };

  // Shareable links: ?deck=<question file link or shortcut>&images=<image folder link>
  useEffect(() => {
    const { deck, images } = readDeckParams(window.location.search);
    if (images) setImagesBase(normalizeImagesBase(images));
    if (deck && !resumeOffer) loadFromLink(deck); // a saved game is offered first
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileUpload = (e) => {
    setLoadingError(null);
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setLoadingError(TOO_BIG); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = (evt) => acceptQuestionText(String(evt.target.result || ""));
    reader.readAsText(file);
    e.target.value = ""; // allow choosing the same file again
  };

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    const newMap = {};
    files.forEach(file => {
      newMap[file.name] = URL.createObjectURL(file);
    });
    setLocalImageMap(prev => ({ ...prev, ...newMap }));
  };

  const resolveImageSource = (imgName) => resolveImage(imgName, localImageMap, imagesBase);

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
    forgetSavedGame(); // a new game replaces any saved one
    setSessionId(makeSessionId());
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

          {resumeOffer && !hasData && (
            <Alert
              severity="info"
              sx={{ mb: 2, textAlign: "left" }}
              action={
                <Box sx={{ display: "flex", gap: 1 }}>
                  <Button variant="contained" size="small" onClick={resumeSaved}>Resume</Button>
                  <Button size="small" color="inherit" onClick={discardSaved}>Start over</Button>
                </Box>
              }
            >
              <strong>Resume your game?</strong>{" "}
              Saved at {new Date(resumeOffer.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·{" "}
              {[resumeOffer.gameMode, resumeOffer.selectedModule].filter(Boolean).join(" / ")} · {resumeOffer.playerCount === 1 ? "solo" : `${resumeOffer.playerCount} teams`} ·{" "}
              {{ PRE_SURVEY: "pre-game survey", GAME: `turn ${resumeOffer.game?.totalTurns ?? 0}`, POST_SURVEY: "post-game survey", SUMMARY: "results screen" }[resumeOffer.phase]}.
              {resumeOffer.hadImages && " Uploaded images aren't saved; upload them again if your questions use them."}
            </Alert>
          )}
          {!hasData ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, textAlign: "left" }}>
              {choice("🧬", "Play the demo", "16S rRNA sequencing & QIIME 2 (the original course).", { onClick: () => loadFromLink("demo") })}
              {choice("📊", "Try a different subject", "Intro Statistics example, made with the question-writer skill.", { onClick: () => loadFromLink("stats") })}
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
              <ValidationReport validation={validation} imageMap={localImageMap} imageBase={imagesBase} />
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
              <Button fullWidth size="small" color="inherit" sx={{ mt: 1 }} onClick={resetFile}>Use a different file</Button>
            </Card>
          )}

          {loadingError && <Alert severity="error" sx={{ mt: 2, textAlign: "left" }}>{loadingError}</Alert>}
          {!hasData && <ShareLinkBuilder />}
          <InstallButton />

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
        {pendingCipher != null && <PasswordDialog error={passwordError} busy={unlocking} onSubmit={unlock} onCancel={() => setPendingCipher(null)} />}
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
          <Button size="small" color="inherit" onClick={resetFile}>Change file</Button>
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
  if (phase === "GAME") return <Suspense fallback={<Box role="status" sx={{ p: 6, textAlign: "center" }}><Typography>Setting up the board…</Typography></Box>}><GameScreen boardData={buildBoardFromTsv(gameMode, allTsvRows, selectedModule)} bigTopic={gameMode} module={selectedModule} playerCount={playerCount} startingPlayerIndex={startPlayer} sessionMinutes={sessionMinutes} tsvRows={allTsvRows} imageMap={localImageMap} imageBase={imagesBase} resume={resumeGame} onSnapshot={setGameSnapshot} onEndGame={d => { setGameRows(d); setPhase("POST_SURVEY"); }} onExit={() => { forgetSavedGame(); setPhase("SETUP"); setGameMode(null); }} /></Suspense>;
  if (phase === "POST_SURVEY") return <SurveyView key="post" phase="post" playerCount={playerCount} playerQuestionSets={playerQuestionSets} confidenceQuestions={confQ} resolveImage={resolveImageSource} onComplete={d => { setPostRows(d.tidyRows); setPhase("SUMMARY"); }} />;
  return <SummaryView playerCount={playerCount} config={config} topic={gameMode} module={selectedModule} preRows={preRows} postRows={postRows} gameRows={gameRows} sessionId={sessionId} onReturn={() => { setPhase("SETUP"); setGameMode(null); resetFile(); }} />;
}