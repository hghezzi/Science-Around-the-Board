// src/QuestionInput.jsx
// One input component for every question format (see questionFormats.js).
//
// Game mode (onSubmit given): multiple choice submits on click; other formats
// show a Submit button. Survey mode (survey=true): reports every change via
// onChange and never reveals the answer.
//
// Callers should pass a `key` that changes per question so state resets.

import React, { useState } from "react";
import { Box, Button, Checkbox, FormControlLabel, TextField, Typography, Alert } from "@mui/material";
import { hasResponse } from "./questionFormats";

const COLORS = { success: "#4caf50", danger: "#e91e63" };

export function QuestionImage({ src, alt = "Question figure", maxHeight = 250 }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    <Box sx={{ textAlign: "center", my: 2 }}>
      <img src={src} alt={alt} onError={() => setFailed(true)} style={{ maxWidth: "100%", maxHeight, borderRadius: 4 }} />
    </Box>
  );
}

function initialResponse(q, value) {
  if (value !== undefined && value !== null) return value;
  switch (q.format) {
    case "multi": return [];
    case "order": return [...q.options];
    case "numeric":
    case "text": return "";
    default: return null;
  }
}

const HINTS = {
  multi: "Select all that apply.",
  numeric: "Enter a number.",
  order: "Use the arrows to put the items in the correct order.",
  text: "Type your answer.",
};

/**
 * @param {object}   props.question    prepared question object
 * @param {function} [props.onSubmit]  called with the response (game mode)
 * @param {function} [props.onChange]  called with the response on every change (survey mode)
 * @param {*}        [props.value]     initial response (survey mode)
 * @param {object}   [props.reveal]    { response, correct, correctText } once answered
 * @param {boolean}  [props.survey]
 * @param {function} [props.resolveImage] imageFile -> URL
 * @param {number}   [props.imageMaxHeight]
 */
export default function QuestionInput({
  question: q,
  onSubmit,
  onChange,
  value,
  reveal = null,
  survey = false,
  resolveImage,
  imageMaxHeight,
}) {
  const [response, setResponse] = useState(() => initialResponse(q, value));
  const locked = Boolean(reveal);
  const format = q.format || "mcq";

  const update = (next) => {
    if (locked) return;
    setResponse(next);
    if (onChange) onChange(next);
  };
  const submit = () => {
    if (locked || !onSubmit || !hasResponse(q, response)) return;
    onSubmit(response);
  };

  const image = q.image && resolveImage ? <QuestionImage src={resolveImage(q.image)} maxHeight={imageMaxHeight} /> : null;
  const hint = HINTS[format] ? (
    <Typography variant="caption" color="textSecondary" sx={{ display: "block", mb: 1 }}>{HINTS[format]}</Typography>
  ) : null;

  const submitButton = !survey && onSubmit && format !== "mcq" && !locked ? (
    <Button variant="contained" sx={{ mt: 2 }} disabled={!hasResponse(q, response)} onClick={submit}>
      Submit answer
    </Button>
  ) : null;

  const correctNote = locked && !reveal.correct && format !== "mcq" ? (
    <Alert severity="info" sx={{ mt: 2 }}>Correct answer: <strong>{reveal.correctText}</strong></Alert>
  ) : null;

  let body;
  if (format === "mcq") {
    const picked = locked ? reveal.response : response;
    body = (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        {q.options.map((opt, i) => {
          let borderColor = "#999", bgColor = "transparent", textColor = "#333";
          if (locked) {
            if (i === picked) {
              borderColor = reveal.correct ? COLORS.success : COLORS.danger;
              bgColor = reveal.correct ? "#e8f5e9" : "#ffebee";
              textColor = borderColor;
            } else if (i === q.answer && !reveal.correct) {
              borderColor = COLORS.success;
            }
          } else if (survey && i === picked) {
            borderColor = "#1976d2"; bgColor = "#e3f2fd";
          }
          return (
            <Button
              key={i}
              variant="outlined"
              fullWidth
              disabled={locked}
              aria-pressed={i === picked}
              onClick={() => (survey ? update(i) : onSubmit && onSubmit(i))}
              sx={{
                justifyContent: "flex-start", textAlign: "left", py: 1.5, px: 2, textTransform: "none",
                borderColor, backgroundColor: bgColor, color: textColor, whiteSpace: "normal",
                borderWidth: i === picked ? "2px" : "1px",
                "&.Mui-disabled": { color: textColor, borderColor },
              }}
            >
              <span style={{ fontWeight: "bold", marginRight: 10, minWidth: 20 }}>{String.fromCharCode(65 + i)}.</span> {opt}
            </Button>
          );
        })}
      </Box>
    );
  } else if (format === "multi") {
    const picked = locked ? reveal.response || [] : response;
    body = (
      <Box sx={{ display: "flex", flexDirection: "column" }}>
        {q.options.map((opt, i) => {
          const checked = picked.includes(i);
          const isAnswer = (q.answers || []).includes(i);
          const color = locked ? (isAnswer ? COLORS.success : checked ? COLORS.danger : undefined) : undefined;
          return (
            <FormControlLabel
              key={i}
              disabled={locked}
              control={<Checkbox checked={checked} onChange={() => update(checked ? picked.filter((x) => x !== i) : [...picked, i])} />}
              label={<Typography sx={{ color, fontWeight: locked && isAnswer ? "bold" : "normal" }}>{opt}</Typography>}
              sx={{ "& .Mui-disabled": { color: color ? `${color} !important` : undefined } }}
            />
          );
        })}
      </Box>
    );
  } else if (format === "numeric" || format === "text") {
    body = (
      <TextField
        fullWidth
        autoFocus={!survey}
        disabled={locked}
        value={locked ? String(reveal.response ?? "") : response}
        onChange={(e) => update(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder={format === "numeric" ? "e.g. 42" : "Your answer"}
        slotProps={{ htmlInput: { inputMode: format === "numeric" ? "decimal" : "text", "aria-label": "Answer" } }}
        sx={locked ? { "& .MuiOutlinedInput-notchedOutline": { borderColor: `${reveal.correct ? COLORS.success : COLORS.danger} !important`, borderWidth: 2 } } : undefined}
      />
    );
  } else if (format === "order") {
    const items = locked ? reveal.response || [] : response;
    const move = (i, d) => {
      const j = i + d;
      if (j < 0 || j >= items.length) return;
      const next = [...items];
      [next[i], next[j]] = [next[j], next[i]];
      update(next);
    };
    body = (
      <Box component="ol" sx={{ pl: 0, m: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 1 }}>
        {items.map((item, i) => {
          const right = locked && (q.correctOrder || [])[i] === item;
          return (
            <Box
              component="li"
              key={item}
              sx={{
                display: "flex", alignItems: "center", gap: 1, p: 1, borderRadius: 1,
                border: `1px solid ${locked ? (right ? COLORS.success : COLORS.danger) : "#bbb"}`,
                bgcolor: locked ? (right ? "#e8f5e9" : "#ffebee") : "#fff",
              }}
            >
              <Typography sx={{ fontWeight: "bold", minWidth: 24 }}>{i + 1}.</Typography>
              <Typography sx={{ flex: 1 }}>{item}</Typography>
              {!locked && (
                <>
                  <Button size="small" variant="outlined" sx={{ minWidth: 36 }} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move "${item}" up`}>↑</Button>
                  <Button size="small" variant="outlined" sx={{ minWidth: 36 }} disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={`Move "${item}" down`}>↓</Button>
                </>
              )}
            </Box>
          );
        })}
      </Box>
    );
  } else {
    body = <Typography color="error">Unsupported question format.</Typography>;
  }

  return (
    <Box>
      {image}
      {hint}
      {body}
      {submitButton}
      {correctNote}
    </Box>
  );
}
