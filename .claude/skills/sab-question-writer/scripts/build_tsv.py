#!/usr/bin/env python3
"""Convert a JSON list of question objects into a Science Around the Board TSV.

Usage:
    python build_tsv.py questions.json questions.tsv [--bigTopic "Biology"] [--module "Week 3"]
    python build_tsv.py --to-json existing.tsv existing.json

Each object uses the TSV column names (see references/format.md). Conveniences:
  - "options": [..] instead of option1..option4
  - "correct": 2 or [1, 3] instead of correctIndex
  - "answer" may be a number or a list of accepted text answers
  - --bigTopic / --module fill rows that leave that key out entirely; a row with
    "module": "" stays blank, which means "use in every game"
Cells are cleaned: tabs/newlines become spaces, and surrounding whitespace is trimmed.
A cell that starts and ends with a straight quote (e.g. the code option "w") is
written in spreadsheet form (wrapped in quotes, inner quotes doubled), which the
game reads back exactly.

--to-json reads an existing TSV the way the game does and writes one JSON object
per row (all columns kept), so an existing file can be edited and rebuilt.
"""
import argparse
import json
import os
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
    # The game unwraps a cell that starts and ends with quotes ("..." -> ..., "" -> ").
    # Write such cells in that quoted form so they read back unchanged.
    if len(s) >= 2 and s.startswith('"') and s.endswith('"'):
        s = '"' + s.replace('"', '""') + '"'
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
            if v and k not in o:  # an explicit "" keeps the row shared by every game
                o[k] = v
    unknown = set(o) - set(COLUMNS)
    if unknown:
        print(f"note: {o.get('id')}: ignoring unknown keys {sorted(unknown)}", file=sys.stderr)
    return [clean(o.get(c, "")) for c in COLUMNS]


def tsv_to_json(tsv_in, json_out):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from validate_tsv import parse_tsv  # same parsing rules as the game

    with open(tsv_in, encoding="utf-8-sig") as f:
        headers, rows = parse_tsv(f.read())
    keep = [h for h in headers if h]
    data = [{h: r.get(h, "") for h in keep} for r in rows]
    with open(json_out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"Wrote {len(data)} rows to {json_out}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src")
    ap.add_argument("dest")
    ap.add_argument("--bigTopic", default="")
    ap.add_argument("--module", default="")
    ap.add_argument("--to-json", action="store_true", help="convert an existing TSV (src) into JSON (dest)")
    args = ap.parse_args()

    if args.to_json:
        tsv_to_json(args.src, args.dest)
        return

    with open(args.src, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        sys.exit("Input must be a JSON list of question objects.")

    rows = [to_row(obj, {"bigTopic": args.bigTopic, "module": args.module}) for obj in data]
    with open(args.dest, "w", encoding="utf-8", newline="") as f:
        f.write("\t".join(COLUMNS) + "\n")
        for r in rows:
            f.write("\t".join(r) + "\n")
    print(f"Wrote {len(rows)} rows to {args.dest}")


if __name__ == "__main__":
    main()
