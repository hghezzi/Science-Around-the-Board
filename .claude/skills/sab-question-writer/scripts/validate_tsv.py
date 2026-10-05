#!/usr/bin/env python3
"""Validate a Science Around the Board question file (TSV).

Usage:
    python validate_tsv.py questions.tsv [--images images/] [--json]

A standard-library mirror of the game's own checker (src/tsvValidator.js in the
SAB repository), plus authoring stats (answer-position balance, image files).
Exit code 1 if any ERROR is found.
"""
import argparse
import json
import os
import re
import sys
from collections import Counter

KNOWN_TYPES = ["property", "milestone", "core", "mishap", "survey", "confidence"]
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


def summarize(labels, n=5):
    return ", ".join(labels) if len(labels) <= n else ", ".join(labels[:n]) + f" and {len(labels) - n} more"


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
                warnings.append(f'[{name}] No "mishap" rows; the built-in general chance cards will be used.')
            if c["survey"] == 0:
                warnings.append(f'[{name}] No "survey" questions; the pre/post check will be empty.')
            elif c["survey"] < SURVEY_Q:
                warnings.append(f'[{name}] Only {c["survey"]} survey question(s); each player normally gets {SURVEY_Q}.')
            if c["confidence"] == 0:
                warnings.append(f'[{name}] No "confidence" rows.')
            games.append(game)

    stats = {"rows": len(rows), "mcq_correct_positions": dict(sorted(positions.items())), "images": sorted(images)}
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
