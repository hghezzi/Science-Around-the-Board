#!/usr/bin/env python3
"""Convert a JSON list of question objects into a Science Around the Board TSV.

Usage:
    python build_tsv.py questions.json questions.tsv [--bigTopic "Biology"] [--module "Week 3"]

Each object uses the TSV column names (see references/format.md). Conveniences:
  - "options": [..] instead of option1..option4
  - "correct": 2 or [1, 3] instead of correctIndex
  - "answer" may be a number or a list of accepted text answers
Cells are cleaned: tabs/newlines become spaces, and surrounding whitespace is trimmed.
"""
import argparse
import json
import sys

COLUMNS = [
    "id", "question", "option1", "option2", "option3", "option4", "correctIndex",
    "explanation", "bigTopic", "module", "theme", "subtheme", "type", "imageFile",
    "format", "answer", "tolerance",
]


def clean(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        value = "true" if value else "false"
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    s = str(value).replace("\r", " ").replace("\n", " ").replace("\t", " ")
    s = " ".join(s.split())
    # A cell that starts and ends with quotes would be unwrapped by the game's parser.
    if len(s) >= 2 and s.startswith('"') and s.endswith('"'):
        s = "“" + s[1:-1] + "”"
    return s


def to_row(obj, defaults):
    o = dict(obj)
    if "options" in o:
        opts = list(o.pop("options") or [])
        if len(opts) > 4:
            raise ValueError(f"{o.get('id')}: at most 4 options are supported")
        for i in range(4):
            o.setdefault(f"option{i + 1}", opts[i] if i < len(opts) else "")
    if "correct" in o:
        c = o.pop("correct")
        o.setdefault("correctIndex", ",".join(str(x) for x in c) if isinstance(c, (list, tuple)) else c)
    if isinstance(o.get("answer"), (list, tuple)):
        o["answer"] = "|".join(str(a) for a in o["answer"])
    if isinstance(o.get("bigTopic"), (list, tuple)):
        o["bigTopic"] = ", ".join(o["bigTopic"])
    if isinstance(o.get("module"), (list, tuple)):
        o["module"] = ", ".join(o["module"])
    o["type"] = str(o.get("type", "")).strip().lower()
    if o.get("format"):
        o["format"] = str(o["format"]).strip().lower()
        if o["format"] == "mcq":
            o["format"] = ""
    if o["type"] != "config":  # config rows apply to the whole file
        for k, v in defaults.items():
            if v and not o.get(k):
                o[k] = v
    unknown = set(o) - set(COLUMNS)
    if unknown:
        print(f"note: {o.get('id')}: ignoring unknown keys {sorted(unknown)}", file=sys.stderr)
    return [clean(o.get(c, "")) for c in COLUMNS]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("json_in")
    ap.add_argument("tsv_out")
    ap.add_argument("--bigTopic", default="")
    ap.add_argument("--module", default="")
    args = ap.parse_args()

    with open(args.json_in, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        sys.exit("Input must be a JSON list of question objects.")

    rows = [to_row(obj, {"bigTopic": args.bigTopic, "module": args.module}) for obj in data]
    with open(args.tsv_out, "w", encoding="utf-8", newline="") as f:
        f.write("\t".join(COLUMNS) + "\n")
        for r in rows:
            f.write("\t".join(r) + "\n")
    print(f"Wrote {len(rows)} rows to {args.tsv_out}")


if __name__ == "__main__":
    main()
