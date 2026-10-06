#!/usr/bin/env python3
"""Validate a Science Around the Board question file (TSV).

Usage:
    python validate_tsv.py questions.tsv [--images images/] [--json]

A standard-library mirror of the game's own checker (src/tsvValidator.js and
src/itemQuality.js in the SAB repository), plus authoring stats (answer-position
balance, image files). It also measures answer cues: how often a student who
always picks the longest (or shortest) option, or the option that repeats the
question's words, would be right, compared with chance.
Exit code 1 if any ERROR is found.
"""
import argparse
import json
import math
import os
import re
import sys
from collections import Counter

KNOWN_TYPES = ["property", "milestone", "core", "mishap", "survey", "confidence", "config"]
CONFIG_KEYS = ["results_url", "instructor_email", "course", "ask_names"]
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
QUIZ_TYPES = ["property", "milestone", "core", "survey"]
REQUIRED = ["id", "question", "type"]
QUIZ_HEADERS = ["option1", "option2", "option3", "option4", "correctIndex", "explanation"]
BOARD_HEADERS = ["theme", "subtheme"]
FILTER_HEADERS = ["bigTopic", "module"]
OPTIONAL = ["imageFile", "format", "answer", "tolerance"]
FORMATS = ["mcq", "multi", "numeric", "order", "text"]
FORMAT_ALIASES = {
    "": "mcq", "mc": "mcq", "mcq": "mcq", "multiple choice": "mcq", "tf": "mcq", "true/false": "mcq",
    "multi": "multi", "multiselect": "multi", "multi-select": "multi",
    "numeric": "numeric", "number": "numeric",
    "order": "order", "ordering": "order", "sequence": "order",
    "text": "text", "short": "text", "short text": "text",
}
SIDES, SUBS, MILESTONE_Q, SURVEY_Q = 4, 2, 6, 10


def parse_tsv(text):
    """Same rules as the game: skip blank and '#' lines, split on tabs, unwrap quotes."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [l for l in text.split("\n") if l.strip() and not l.strip().startswith("#")]
    if not lines:
        return [], []
    headers = [h.strip() for h in lines[0].split("\t")]
    rows = []
    for ln in lines[1:]:
        cols = ln.split("\t")
        row = {}
        for i, h in enumerate(headers):
            v = cols[i].strip() if i < len(cols) else ""
            if len(v) >= 2 and v.startswith('"') and v.endswith('"'):
                v = v[1:-1].replace('""', '"')
            row[h] = v
        rows.append(row)
    return headers, rows


def parse_list(s):
    return [x.strip().strip('"') for x in s.split(",")] if s else []


def matches(row, topic, module):
    rt = (row.get("bigTopic") or "").strip()
    if topic and rt and topic not in parse_list(rt):
        return False
    rm = (row.get("module") or "").strip()
    if module and rm and module not in parse_list(rm):
        return False
    return True


def ordered_unique(items):
    out = []
    for x in items:
        if x and x not in out:
            out.append(x)
    return out


def parse_number(v):
    s = str(v or "").strip().replace(",", "")
    if not re.fullmatch(r"[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?", s, re.I):
        return None
    return float(s)


def tolerance_ok(v):
    s = str(v or "").strip()
    if not s:
        return True
    if s.endswith("%"):
        s = s[:-1]
    n = parse_number(s)
    return n is not None and n >= 0


def explicit_amount(text):
    s = text or ""
    return bool(re.search(r"[+\-−]\s*\$\s*\d", s) or re.search(r"\(\s*[+\-−]\s*\d[\d,]*\s*\)", s))


def check_config(r, label, errors, warnings):
    """Instructor settings (type = config): setting name in `id`, value in `question`."""
    key = (r.get("id") or "").strip().lower()
    value = (r.get("question") or "").strip()
    if key not in CONFIG_KEYS:
        warnings.append(f"Unknown config setting {label} will be ignored. Valid settings: {', '.join(CONFIG_KEYS)}.")
        return
    if not value:
        errors.append(f'Config "{key}" has no value; put the value in the question column.')
        return
    if key == "results_url":
        if not re.match(r"^https://", value, re.I):
            errors.append('Config "results_url" must be an https:// link (the Web app URL from Google Apps Script).')
        elif not re.match(r"^https://script\.google\.com/macros/s/.+/exec", value, re.I):
            warnings.append('Config "results_url" doesn\'t look like a Google Apps Script Web app link (https://script.google.com/macros/s/…/exec). It will still be used.')
    if key == "instructor_email" and not EMAIL_RE.match(value):
        errors.append('Config "instructor_email" is not a valid email address.')
    if key == "ask_names" and value.lower() not in ("yes", "no", "y", "n", "true", "false", "1", "0"):
        warnings.append('Config "ask_names" should be yes or no.')


def summarize(labels, n=5):
    return ", ".join(labels) if len(labels) <= n else ", ".join(labels[:n]) + f" and {len(labels) - n} more"


# ---------- Answer-option quality (mirror of src/itemQuality.js) ----------
# Same rules, thresholds and messages as the game's checker; keep them in step.
BOARD_TYPES = ["property", "milestone", "core"]
MIN_CUE_ITEMS, CUE_MARGIN, Z_95 = 10, 0.1, 1.645
LONG_RATIO, LONG_MIN_GAP = 1.5, 10
MIN_ABSOLUTE_OPTIONS, SURVEY_DUP_JACCARD = 6, 0.6
ABSOLUTE_WORDS = [
    "always", "never", "all", "none", "only", "every", "must", "cannot", "impossible",
    "completely", "entirely", "totally", "absolutely", "guaranteed", "guarantees",
]
STOPWORDS = set("""
about after also among another because been before being best between both does doing each either
from have having here into just least less like many more most much must need only other over same
should show some such than that their them then there these they this those through under used using
very were what when where which while will with would your following true false statement
""".split())
SPREADSHEET_ERROR = re.compile(r"^#(?:NAME\?|REF!|VALUE!|DIV/0!|N/A|NUM!|NULL!|SPILL!|CALC!)$", re.I)
OPTION_REFERENCE = [
    re.compile(r"\b(?:all|none|both|neither)\s+of\s+(?:the\s+)?(?:above|below|these|those|the\s+(?:other\s+)?(?:options|answers|choices))\b", re.I),
    re.compile(r"\b(?:[Oo]ptions?|[Aa]nswers?|[Cc]hoices?)\s+[A-D1-4]\b"),
    re.compile(r"\b(?:[Bb]oth|[Ee]ither|[Nn]either|[Oo]nly)\s+[A-D]\s+(?:and|or|nor)\s+[A-D]\b"),
]


def js_round(x):
    """Math.round from JavaScript (Python's round() rounds halves to even)."""
    return int(math.floor(x + 0.5))


def pct(x):
    return js_round(100 * x)


def words(text):
    return re.findall(r"[a-z0-9]+", str(text or "").lower())


def content_words(text):
    """Content words: 4+ characters, not a function word, with a plural "s" removed."""
    out = set()
    for w in words(text):
        if len(w) < 4 or w in STOPWORDS:
            continue
        out.add(w[:-1] if len(w) > 4 and w.endswith("s") else w)
    return out


def has_absolute(text):
    return any(w in ABSOLUTE_WORDS for w in words(text))


def fmt_num(x):
    """Format like JavaScript's String(number): 1.5 -> '1.5', 2.0 -> '2'."""
    return str(int(x)) if float(x).is_integer() else str(x)


def strategy_score(picked, correct):
    return 1 / len(picked) if correct in picked else 0


def new_tally():
    return {"items": 0, "score": 0.0, "chance": 0.0, "variance": 0.0}


def add_to_tally(t, score, n):
    t["items"] += 1
    t["score"] += score
    t["chance"] += 1 / n
    t["variance"] += (1 / n) * (1 - 1 / n)


def beats_chance(t):
    margin = max(CUE_MARGIN * t["items"], Z_95 * math.sqrt(t["variance"]))
    return t["items"] >= MIN_CUE_ITEMS and t["score"] - t["chance"] > margin


def jaccard(a, b):
    if len(a) < 3 or len(b) < 3:
        return 0
    shared = len(a & b)
    return shared / (len(a) + len(b) - shared)


def check_item_quality(rows):
    """Cues that let test-wise students find the answer without the content."""
    errors, warnings = [], []
    sheet_errors, option_refs, dup_options, article_cue, long_items = [], [], [], [], []
    longest, shortest, overlap = new_tally(), new_tally(), new_tally()
    absolute = {"options": 0, "correct": 0, "chance": 0.0, "variance": 0.0}
    survey_stems, board_stems = [], []
    for i, r in enumerate(rows):
        label = f'"{r["id"]}"' if r.get("id") else f"row {i + 2}"
        t = (r.get("type") or "").strip().lower()
        if not t or t == "config":
            continue
        cells = ["question", "option1", "option2", "option3", "option4", "explanation", "answer"]
        if any(SPREADSHEET_ERROR.match((r.get(c) or "").strip()) for c in cells):
            sheet_errors.append(label)
        if t not in QUIZ_TYPES:
            continue
        fmt = FORMAT_ALIASES.get((r.get("format") or "").strip().lower())
        options = [(r.get(f"option{k}") or "").strip() for k in range(1, 5)]
        options = [o for o in options if o]
        stem = r.get("question") or ""
        if t == "survey":
            survey_stems.append((label, content_words(stem)))
        elif t in BOARD_TYPES:
            board_stems.append((label, content_words(stem)))
        if fmt not in ("mcq", "multi"):
            continue
        if any(rx.search(o) for o in options for rx in OPTION_REFERENCE):
            option_refs.append(label)
        lowered = [o.lower() for o in options]
        if len(set(lowered)) < len(lowered):
            dup_options.append(label)
        if fmt != "mcq" or len(options) < 3:
            continue
        m = re.match(r"^\s*([-+]?\d+)", str(r.get("correctIndex") or ""))
        if not m:
            continue
        correct = int(m.group(1)) - 1
        if correct < 0 or correct >= len(options):
            continue
        n = len(options)

        # Grammatical cue: "...is an" followed by options that don't all fit.
        end = re.sub(r"[\s:._…-]+$", "", stem.strip()).lower()
        art = re.search(r"\b(an?)$", end)
        if art:
            fits = [bool(re.match(r"[aeiou]", o, re.I)) == (art.group(1) == "an") for o in options]
            if not all(fits):
                article_cue.append(label)

        # Length cues.
        lengths = [len(o) for o in options]
        longest_idx = [k for k, ln in enumerate(lengths) if ln == max(lengths)]
        shortest_idx = [k for k, ln in enumerate(lengths) if ln == min(lengths)]
        add_to_tally(longest, strategy_score(longest_idx, correct), n)
        add_to_tally(shortest, strategy_score(shortest_idx, correct), n)
        others = [ln for k, ln in enumerate(lengths) if k != correct]
        mean_other = sum(others) / len(others)
        lc = lengths[correct]
        if longest_idx == [correct] and lc >= LONG_RATIO * mean_other and lc - mean_other >= LONG_MIN_GAP:
            long_items.append(f"{label} ({lc} vs {js_round(mean_other)} characters)")

        # Word-overlap cue: the option that echoes the question's wording.
        stem_words = content_words(stem)
        shared = [len(content_words(o) & stem_words) for o in options]
        if max(shared) > 0:
            picked = [k for k, sh in enumerate(shared) if sh == max(shared)]
            add_to_tally(overlap, strategy_score(picked, correct), n)

        # Absolute words ("always", "never") that only appear in distractors.
        for k, o in enumerate(options):
            if not has_absolute(o):
                continue
            absolute["options"] += 1
            if k == correct:
                absolute["correct"] += 1
            absolute["chance"] += 1 / n
            absolute["variance"] += (1 / n) * (1 - 1 / n)

    # Survey items that repeat a board item (the pre/post survey would measure memory of it).
    survey_dups = []
    for s_label, s_words in survey_stems:
        match = next((b for b in board_stems if jaccard(s_words, b[1]) >= SURVEY_DUP_JACCARD), None)
        if match:
            survey_dups.append(f"{s_label} ≈ {match[0]}")

    if sheet_errors:
        errors.append(f'Spreadsheet error value (such as #NAME?) instead of text: {summarize(sheet_errors)}. A spreadsheet treated text starting with "-", "+" or "=" as a formula. Retype it with an apostrophe in front (for example \'--input-path), then export the file again.')
    if option_refs:
        warnings.append(f'Option refers to other options ("all of the above", "both A and B", "option 2"): {summarize(option_refs)}. Options are shuffled in the game, so use the multi (select all that apply) format instead.')
    if dup_options:
        warnings.append(f"Two or more options are identical: {summarize(dup_options)}.")
    if article_cue:
        warnings.append(f'Question ends with "a" or "an", which rules out options that don\'t fit grammatically: {summarize(article_cue)}. End with "a(n)" or rephrase the question.')
    if long_items:
        warnings.append(f"Correct answer much longer than the other options ({fmt_num(LONG_RATIO)}× their average length or more): {summarize(long_items)}. Students can pick it without knowing the content; make the distractors just as detailed, or trim the correct answer.")
    if beats_chance(longest):
        warnings.append(f"Length cue: always picking the longest option would answer {pct(longest['score'] / longest['items'])}% of the {longest['items']} multiple-choice questions correctly (chance is {pct(longest['chance'] / longest['items'])}%). Vary which option is longest, so that length gives nothing away.")
    if beats_chance(shortest):
        warnings.append(f"Length cue: always picking the shortest option would answer {pct(shortest['score'] / shortest['items'])}% of the {shortest['items']} multiple-choice questions correctly (chance is {pct(shortest['chance'] / shortest['items'])}%). Vary which option is shortest, so that length gives nothing away.")
    if beats_chance(overlap):
        warnings.append(f"Wording cue: picking the option that repeats the most words from the question would answer {pct(overlap['score'] / overlap['items'])}% of the {overlap['items']} multiple-choice questions where an option repeats a question word (chance is {pct(overlap['chance'] / overlap['items'])}%). Echo the question's key words in the distractors too, or in none of the options.")
    if absolute["options"] >= MIN_ABSOLUTE_OPTIONS and absolute["chance"] - absolute["correct"] >= max(1.5, Z_95 * math.sqrt(absolute["variance"])):
        which = "none" if absolute["correct"] == 0 else f"only {absolute['correct']}"
        warnings.append(f'Absolute-word cue: {absolute["options"]} options use words such as "always", "never", "all" or "only", but {which} of them are correct answers (about {js_round(absolute["chance"])} expected by chance). Test-wise students rule such options out; use these words in correct answers too, or avoid them.')
    if survey_dups:
        warnings.append(f"Survey question nearly repeats a board question, so students practise the survey item itself during the game: {summarize(survey_dups)}. Write a different item on the same learning objective.")

    def rate(t):
        return t["score"] / t["items"] if t["items"] else None

    cues = {
        "items": longest["items"],
        "chance": longest["chance"] / longest["items"] if longest["items"] else None,
        "longest": rate(longest),
        "shortest": rate(shortest),
        "overlap": rate(overlap),
        "overlapItems": overlap["items"],
        "overlapChance": overlap["chance"] / overlap["items"] if overlap["items"] else None,
        "absoluteOptions": absolute["options"],
        "absoluteCorrect": absolute["correct"],
        "absoluteChance": absolute["chance"],
    }
    return errors, warnings, cues


def format_cue_summary(c):
    """One-line summary of the answer cues (same text as the game's CLI report)."""
    if not c or not c["items"]:
        return ""
    parts = [f"longest option correct {pct(c['longest'])}%", f"shortest {pct(c['shortest'])}%", f"chance {pct(c['chance'])}%"]
    if c["overlapItems"]:
        parts.append(f"most words shared with the question {pct(c['overlap'])}% of {c['overlapItems']} (chance {pct(c['overlapChance'])}%)")
    parts.append(f"absolute words in {c['absoluteOptions']} options, {c['absoluteCorrect']} correct ({js_round(c['absoluteChance'])} expected)")
    return f"Answer cues ({c['items']} multiple-choice questions with 3+ options): {', '.join(parts)}"


def validate(headers, rows, image_dir=None):
    errors, warnings, games = [], [], []
    if not rows:
        return {"errors": ["The file has no question rows."], "warnings": [], "games": [], "stats": {}}

    missing = [h for h in REQUIRED if h not in headers]
    if missing:
        errors.append(f"Missing required column(s): {', '.join(missing)}. Column names are case-sensitive.")
    other = [h for h in QUIZ_HEADERS + BOARD_HEADERS + FILTER_HEADERS if h not in headers]
    if other:
        warnings.append(f"Missing column(s): {', '.join(other)}. Column names are case-sensitive.")
    unknown = [h for h in headers if h and h not in REQUIRED + QUIZ_HEADERS + BOARD_HEADERS + FILTER_HEADERS + OPTIONAL]
    if unknown:
        warnings.append(f"Unrecognised column(s) will be ignored: {', '.join(unknown)}.")

    buckets = {k: [] for k in ["type", "case", "noq", "few", "ans", "fmt", "multi", "num", "tol", "text", "noexp", "mishap"]}
    ids = Counter(r.get("id") for r in rows if r.get("id"))
    images, positions = set(), Counter()
    format_counts = {"mcq": 0, "trueFalse": 0, "multi": 0, "numeric": 0, "order": 0, "text": 0}
    for i, r in enumerate(rows):
        label = f'"{r["id"]}"' if r.get("id") else f"row {i + 2}"
        raw = (r.get("type") or "").strip()
        t = raw.lower()
        if r.get("imageFile"):
            images.add(r["imageFile"].strip())
        if t not in KNOWN_TYPES:
            buckets["type"].append(f"{label} ({raw or 'blank'})")
            continue
        if raw != t:
            buckets["case"].append(label)
        if t == "config":
            check_config(r, label, errors, warnings)
            continue
        if not (r.get("question") or "").strip():
            buckets["noq"].append(label)
        if t == "mishap" and not explicit_amount(r.get("question")):
            buckets["mishap"].append(label)
        if t not in QUIZ_TYPES:
            continue
        key = (r.get("format") or "").strip().lower()
        fmt = FORMAT_ALIASES.get(key)
        if fmt is None:
            buckets["fmt"].append(f"{label} ({r.get('format')})")
            continue
        opts = [r.get(f"option{k}", "") for k in range(1, 5)]
        opts = [o for o in opts if o]
        format_counts[fmt] += 1
        if fmt == "mcq" and len(opts) == 2:
            format_counts["trueFalse"] += 1
        if fmt == "mcq":
            if len(opts) < 2:
                buckets["few"].append(label)
            try:
                idx = int(str(r.get("correctIndex", "")).strip())
            except ValueError:
                idx = None
            if idx is None or idx < 1 or idx > len(opts):
                buckets["ans"].append(label)
            else:
                positions[idx] += 1
        elif fmt == "multi":
            if len(opts) < 2:
                buckets["few"].append(label)
            parts = [p for p in re.split(r"[,;|\s]+", str(r.get("correctIndex", ""))) if p]
            try:
                idxs = [int(p) for p in parts]
            except ValueError:
                idxs = []
            if not idxs or any(x < 1 or x > len(opts) for x in idxs):
                buckets["multi"].append(label)
        elif fmt == "order":
            if len(opts) < 2:
                buckets["few"].append(label)
        elif fmt == "numeric":
            if parse_number(r.get("answer")) is None:
                buckets["num"].append(label)
            if not tolerance_ok(r.get("tolerance")):
                buckets["tol"].append(label)
        elif fmt == "text":
            if not any(a.strip() for a in str(r.get("answer", "")).split("|")):
                buckets["text"].append(label)
        if t != "survey" and not (r.get("explanation") or "").strip():
            buckets["noexp"].append(label)

    dups = [f'"{k}"' for k, n in ids.items() if n > 1]
    if dups:
        warnings.append(f"Duplicate id(s): {summarize(dups)}.")
    b = buckets
    if b["type"]:
        warnings.append(f"Unknown type, row will be ignored: {summarize(b['type'])}. Valid types: {', '.join(KNOWN_TYPES)}.")
    if b["case"]:
        warnings.append(f"Type is not lowercase: {summarize(b['case'])}.")
    if b["noq"]:
        errors.append(f"Empty question text: {summarize(b['noq'])}.")
    if b["few"]:
        errors.append(f"Fewer than 2 answer options: {summarize(b['few'])}.")
    if b["ans"]:
        errors.append(f"correctIndex is missing or does not point to a filled option (use 1-4): {summarize(b['ans'])}.")
    if b["fmt"]:
        errors.append(f"Unknown format: {summarize(b['fmt'])}. Valid formats: {', '.join(FORMATS)} (blank = mcq).")
    if b["multi"]:
        errors.append(f'Multi-select correctIndex must list filled options, e.g. "1,3": {summarize(b["multi"])}.')
    if b["num"]:
        errors.append(f'Numeric questions need a number in the "answer" column: {summarize(b["num"])}.')
    if b["tol"]:
        errors.append(f"Invalid tolerance (use 0.5 or 5%): {summarize(b['tol'])}.")
    if b["text"]:
        errors.append(f'Short-text questions need accepted answers in "answer", separated by |: {summarize(b["text"])}.')
    if b["mishap"]:
        warnings.append(f"Mishap without an explicit amount such as (+$100) or (-$50): {summarize(b['mishap'])}.")
    if b["noexp"]:
        warnings.append(f"No explanation: {summarize(b['noexp'])}.")

    q_errors, q_warnings, cues = check_item_quality(rows)
    errors.extend(q_errors)
    warnings.extend(q_warnings)

    topics = ordered_unique(t for r in rows for t in parse_list((r.get("bigTopic") or "").strip())) or [None]
    for topic in topics:
        modules = []
        if topic:
            modules = ordered_unique(
                m for r in rows if topic in parse_list((r.get("bigTopic") or "").strip())
                for m in parse_list((r.get("module") or "").strip())
            )
        for module in modules or [None]:
            name = " / ".join(x for x in [topic, module] if x) or "(all rows)"
            scoped = [r for r in rows if matches(r, topic, module)]
            typ = lambda r: (r.get("type") or "").strip().lower()  # noqa: E731
            counts = Counter(typ(r) for r in scoped)
            themes = ordered_unique((r.get("theme") or "").strip() for r in scoped if typ(r) in ("property", "milestone"))
            game = {"name": name, "themes": [], "counts": {t: counts.get(t, 0) for t in KNOWN_TYPES}}
            if len(themes) < SIDES:
                errors.append(f"[{name}] The board needs {SIDES} themes but found {len(themes)}: {', '.join(themes) or 'none'}.")
            elif len(themes) > SIDES:
                warnings.append(f"[{name}] {len(themes)} themes found; only the first {SIDES} are used. Ignored: {', '.join(themes[SIDES:])}.")
            for th in themes[:SIDES]:
                props = [r for r in scoped if typ(r) == "property" and (r.get("theme") or "").strip() == th]
                miles = [r for r in scoped if typ(r) == "milestone" and (r.get("theme") or "").strip() == th]
                subs = ordered_unique((r.get("subtheme") or "").strip() for r in props)
                game["themes"].append({
                    "name": th,
                    "subthemes": {s: sum(1 for r in props if (r.get("subtheme") or "").strip() == s) for s in subs},
                    "milestone": len(miles),
                })
                if not props:
                    errors.append(f'[{name}] Theme "{th}" has no property questions.')
                elif len(subs) < SUBS:
                    warnings.append(f'[{name}] Theme "{th}" has {len(subs)} subtheme(s); each side uses {SUBS}.')
                elif len(subs) > SUBS:
                    warnings.append(f'[{name}] Theme "{th}" has {len(subs)} subthemes; only the first {SUBS} are used. Ignored: {", ".join(subs[SUBS:])}.')
                if not miles:
                    errors.append(f'[{name}] Theme "{th}" has no milestone questions.')
                elif len(miles) < MILESTONE_Q:
                    warnings.append(f'[{name}] Theme "{th}" has {len(miles)} milestone question(s); exams ask {MILESTONE_Q}.')
            c = game["counts"]
            if c["core"] == 0:
                warnings.append(f'[{name}] No "core" questions.')
            if c["mishap"] == 0:
                warnings.append(f'[{name}] No "mishap" rows; the built-in general wildcards will be used.')
            if c["survey"] == 0:
                warnings.append(f'[{name}] No "survey" questions; the pre/post check will be empty.')
            elif c["survey"] < SURVEY_Q:
                warnings.append(f'[{name}] Only {c["survey"]} survey question(s); each player normally gets {SURVEY_Q}.')
            if c["confidence"] == 0:
                warnings.append(f'[{name}] No "confidence" rows.')
            games.append(game)

    stats = {"rows": len(rows), "mcq_correct_positions": dict(sorted(positions.items())), "images": sorted(images),
             "format_counts": format_counts, "answer_cues": cues}
    if image_dir is not None:
        present = set(os.listdir(image_dir)) if os.path.isdir(image_dir) else set()
        missing_imgs = [i for i in sorted(images) if not re.match(r"^(https?:|data:)", i, re.I) and i not in present]
        stats["missing_images"] = missing_imgs
        if missing_imgs:
            warnings.append(f"Image file(s) not found in {image_dir}: {summarize(missing_imgs)}.")
    total = sum(positions.values())
    if total >= 12:
        most, n = max(positions.items(), key=lambda kv: kv[1])
        if n / total > 0.4:
            warnings.append(f"{n} of {total} multiple-choice answers are option {most}; spread correct answers across positions.")
    return {"errors": errors, "warnings": warnings, "games": games, "stats": stats}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("tsv")
    ap.add_argument("--images", help="folder with the image files referenced by imageFile")
    ap.add_argument("--json", action="store_true", help="print machine-readable JSON")
    args = ap.parse_args()
    with open(args.tsv, encoding="utf-8-sig") as f:
        text = f.read()
    if "\t" not in text:
        sys.exit(f"{args.tsv}: no tab characters found. Is this an encrypted .lock file? Validate the plain .tsv.")
    headers, rows = parse_tsv(text)
    result = validate(headers, rows, args.images)
    if args.json:
        print(json.dumps(result, indent=1, ensure_ascii=False))
    else:
        for g in result["games"]:
            print(f"Game: {g['name']}")
            for i, t in enumerate(g["themes"], 1):
                subs = ", ".join(f"{k} ({v})" for k, v in t["subthemes"].items()) or "none"
                print(f"  Side {i}: {t['name']} | subthemes: {subs} | milestone: {t['milestone']}")
            c = g["counts"]
            print(f"  core: {c['core']}, mishap: {c['mishap']}, survey: {c['survey']}, confidence: {c['confidence']}")
        s = result["stats"]
        print(f"Rows: {s['rows']}; mcq correct positions: {s['mcq_correct_positions']}")
        f = s["format_counts"]
        print(f"Formats: mcq {f['mcq']} (true/false {f['trueFalse']}), multi {f['multi']}, numeric {f['numeric']}, order {f['order']}, text {f['text']}")
        cue_line = format_cue_summary(s.get("answer_cues"))
        if cue_line:
            print(cue_line)
        if s["images"]:
            print(f"Images referenced: {', '.join(s['images'])}")
        print()
        for e in result["errors"]:
            print(f"ERROR: {e}")
        for w in result["warnings"]:
            print(f"WARNING: {w}")
        print(f"\n{len(result['errors'])} error(s), {len(result['warnings'])} warning(s).")
    sys.exit(1 if result["errors"] else 0)


if __name__ == "__main__":
    main()
