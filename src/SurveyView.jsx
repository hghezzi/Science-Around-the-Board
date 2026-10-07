// src/SurveyView.jsx
// Pre- and post-game survey: confidence sliders, then the player's survey questions.
import React, { useRef, useState } from "react";
import { Box, Container, Card, Typography, Alert, Divider, Slider, Button } from "@mui/material";
import QuestionInput from "./QuestionInput";
import TeamToken from "./components/TeamToken";
import { teamDisplayName } from "./labels";
import { surveyRows } from "./surveys";

/* -------------------------------------------------------------------------- */
/* SURVEY VIEWS                                                               */
/* -------------------------------------------------------------------------- */

// `players` lists the players answering on this device (all of them by default;
// in online play, each device surveys only its own). With `score` false (a guest
// device, whose questions carry no answers), onComplete gets only the raw answers.
export default function SurveyView({ phase, playerCount, playerQuestionSets, confidenceQuestions, onComplete, resolveImage, players: onlyPlayers, score = true, finishLabel }) {
  const C = confidenceQuestions || [];
  const isPre = phase === "pre";
  const players = onlyPlayers || Array.from({ length: playerCount }, (_, p) => p);
  const [step, setStep] = useState(0);
  const currentPlayer = players[step];
  const currentQuestions = playerQuestionSets[currentPlayer] || [];
  const [sliderValues, setSliderValues] = useState(() => Array.from({ length: playerCount }, () => Object.fromEntries(C.map((c) => [c.key, 5]))));
  const [answers, setAnswers] = useState(() => playerQuestionSets.map((set) => set.map(() => null)));
  const [lock, setLock] = useState(() => Array(playerCount).fill(false));

  const handleSliderChange = (key, val) => {
    if (lock[currentPlayer]) return;
    setSliderValues((prev) => prev.map((p, i) => (i === currentPlayer ? { ...p, [key]: val } : p)));
  };
  const headingRef = useRef(null);
  const submitConfidence = () => setLock((prev) => prev.map((x, i) => (i === currentPlayer ? true : x)));
  const setAns = (qi, response) =>
    setAnswers((prev) => prev.map((P, i) => (i === currentPlayer ? P.map((x, j) => (j === qi ? response : x)) : P)));

  const submitPlayer = () => {
    if (step < players.length - 1) {
      setStep((k) => k + 1);
      window.scrollTo(0, 0);
      headingRef.current?.focus(); // screen readers start again at the top for the next team
      return;
    }
    const tidyRows = score ? surveyRows({ phase, players, sliders: sliderValues, answers, questionSets: playerQuestionSets, confidence: C }) : null;
    onComplete({ tidyRows, sliders: sliderValues, answers, players });
  };

  const currentSliders = sliderValues[currentPlayer];
  const locked = lock[currentPlayer];
  const lastLabel = finishLabel || (isPre ? "Start Game" : "Finish Surveys");
  const answered = (answers[currentPlayer] || []).filter((a) => a != null && (!Array.isArray(a) || a.length > 0) && a !== "").length;
  const scaleLabels = [{ value: 0, label: "0" }, { value: 5, label: "5" }, { value: 10, label: "10" }];

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", color: "text.primary", py: 5 }}>
    <Container maxWidth="md">
      <Card sx={{ p: { xs: 3, md: 5 } }}>
        <Typography variant="h4" component="h1" gutterBottom ref={headingRef} tabIndex={-1} sx={{ outline: "none" }}>{isPre ? "Pre-Game Survey" : "Post-Game Survey"}</Typography>
        {step > 0 && !locked && (
          <Alert severity="info" icon={<span aria-hidden>🔄</span>} sx={{ mb: 2 }}>
            Thanks, {teamDisplayName(players[step - 1], playerCount)}! Pass the computer to <strong>{teamDisplayName(currentPlayer, playerCount)}</strong>.
          </Alert>
        )}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <TeamToken index={currentPlayer} />
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{teamDisplayName(currentPlayer, playerCount)}{playerCount > 1 ? ` · player ${currentPlayer + 1} of ${playerCount}` : ""}</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {isPre ? "Answer on your own; this is your starting point, not a test. The best score goes first." : "Same questions as before the game. How much have you learned?"}
        </Typography>
        <Divider sx={{ my: 3 }} />
        {C.length > 0 && (
          <>
            <Typography variant="h5" component="h2" sx={{ color: "primary.main" }}>Section 1 – Confidence</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>How much do you agree? 0 = not at all, 10 = completely.</Typography>
            {C.map((cfg) => (
              <Box key={cfg.key} sx={{ my: 3.5, px: 1 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 2, mb: 0.5 }}>
                  <Typography variant="h6" component="h3" sx={{ fontSize: "1.1rem" }}>{cfg.label}</Typography>
                  <Typography aria-hidden sx={{ fontWeight: 800, color: "primary.main", fontSize: "1.25rem", minWidth: 32, textAlign: "right" }}>{currentSliders[cfg.key] ?? 5}</Typography>
                </Box>
                <Slider min={0} max={10} step={1} marks={scaleLabels} value={currentSliders[cfg.key] ?? 5} disabled={locked} onChange={(_, v) => handleSliderChange(cfg.key, v)} valueLabelDisplay="auto" aria-label={cfg.label} getAriaValueText={(v) => `${v} out of 10`} />
                <Box aria-hidden sx={{ display: "flex", justifyContent: "space-between", mt: -0.5 }}>
                  <Typography variant="caption" color="text.secondary">Not at all</Typography>
                  <Typography variant="caption" color="text.secondary">Completely</Typography>
                </Box>
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
            <Typography variant="h5" component="h2" sx={{ color: "primary.main", mb: 2 }}>{C.length > 0 ? "Section 2 – Questions" : "Questions"}</Typography>
            {currentQuestions.length === 0 && <Typography color="textSecondary">No survey questions in this file.</Typography>}
            {currentQuestions.map((q, qi) => (
              <Box key={`${currentPlayer}-${qi}`} sx={{ mb: 3, p: 2.5, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                <Typography variant="overline" color="textSecondary">Question {qi + 1} of {currentQuestions.length}</Typography>
                <Typography variant="h6" component="h3" gutterBottom sx={{ mt: 0.5, whiteSpace: "pre-wrap", fontSize: "1.1rem" }}>{q.prompt}</Typography>
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
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", mt: 2 }}>
              <Button variant="contained" size="large" onClick={submitPlayer}>
                {step < players.length - 1 ? "Next Player" : lastLabel}
              </Button>
              {currentQuestions.length > 0 && (
                <Typography variant="body2" color={answered < currentQuestions.length ? "text.secondary" : "success.main"} sx={{ fontWeight: 700 }} aria-live="polite">
                  {answered} of {currentQuestions.length} answered{answered < currentQuestions.length ? " · blank answers count as not correct" : " ✓"}
                </Typography>
              )}
            </Box>
          </>
        )}
      </Card>
    </Container>
    </Box>
  );
}

