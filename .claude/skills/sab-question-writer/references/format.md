# SAB question file format

Contents: 1. How the file becomes a board · 2. Columns · 3. Row types · 4. Answer formats · 5. Recommended counts · 6. JSON schema for build_tsv.py · 7. Gotchas · 8. Config rows (instructor settings)

## 1. How the file becomes a board

- The game filters rows by the `bigTopic` and `module` the players pick. A **blank** `bigTopic` or `module` cell means "use in every game". Both cells accept comma-separated lists (`Week 3, Week 4`) to reuse a row in several games.
- Within a game, the **first 4 distinct `theme` values** (in file order, counting only `property` and `milestone` rows) become the 4 board sides. Extra themes are ignored. With fewer than 4, the board is broken.
- In each theme, the **first 2 distinct `subtheme` values** among its `property` rows become two colour groups of 3 tiles each. Group 1 tiles cost $100 and group 2 tiles cost $160. Each tile draws a random question from its subtheme's pool.
- Each side's corner is a **milestone**: a 6-question exam (5 correct to capture) drawn from that theme's `milestone` rows.
- Each side has one **core** tile, with questions drawn from all `core` rows, and one **Wildcard** tile, which draws a random `mishap` row (a "wildcard").
- `survey` rows form the pre- and post-game knowledge check: 10 random questions per player, and the same set again after the game. `confidence` rows become 0–10 sliders, shown before and after.
- **Order matters**: put the rows for theme 1 first, then theme 2, and so on. Within each theme, list subtheme 1 before subtheme 2.

## 2. Columns

The header row must be exactly these names; they are case-sensitive. Column order doesn't matter, but build_tsv.py writes this order:

| column | used by | meaning |
|---|---|---|
| `id` | all | unique, stable id (e.g. `prop_t1s1_01`) |
| `question` | all | prompt text (for mishaps, the event text) |
| `option1`–`option4` | mcq, multi, order | answer options. For true/false, fill only 1–2 |
| `correctIndex` | mcq, multi | mcq: `1`–`4`. multi: list such as `1,3` |
| `explanation` | all | shown after answering (for mishaps: the fun fact or lesson) |
| `bigTopic` | all | main-menu topic |
| `module` | all | sub-menu module |
| `theme` | property, milestone | board side |
| `subtheme` | property (milestone optional) | property group within the side. For `core` rows, the first core row's subtheme names the core tile |
| `type` | all | `property`, `milestone`, `core`, `mishap`, `survey`, `confidence`, `config` (lowercase) |
| `imageFile` | optional | exact image filename, or an https URL |
| `format` | optional | `mcq` (default if blank), `multi`, `numeric`, `order`, `text` |
| `answer` | numeric, text | numeric: the number. text: accepted answers separated by `|` |
| `tolerance` | numeric | blank means exact; `0.5` is ± absolute; `5%` is ± relative |

## 3. Row types

- `property`: needs `theme` and `subtheme`. A recall or understanding question.
- `milestone`: needs `theme`. A synthesis or application question.
- `core`: the cross-cutting skill. `theme` is free text (e.g. `Core`), and `subtheme` names the tile (e.g. `UNIX`).
- `mishap`: `question` = event text with an explicit amount, e.g. `Freezer failure! Samples thawed. (-$100)` or `Scholarship awarded! (+$150)`. The game charges or pays exactly that amount. `explanation` = fun fact. No options are needed. Theme the text to the subject; the game's own wording is neutral.
- `survey`: knowledge-check question in any format. `theme` and `subtheme` are optional (handy for your own analysis).
- `confidence`: `question` = a statement such as "I am confident I can explain …". No options are needed.
- `config`: an instructor setting, not a question: `id` = the setting name, `question` = its value. See section 8.

## 4. Answer formats

Every format is marked simply correct or incorrect.

| format | fill in | students see | marked correct when |
|---|---|---|---|
| `mcq` | option1–4, `correctIndex` | shuffled buttons | they click the right option |
| true/false | option1 `True`, option2 `False`, `correctIndex` | two buttons | as mcq |
| `multi` | option1–4, `correctIndex` like `1,3` | checkboxes plus Submit | the selection matches **exactly** |
| `numeric` | `answer` (e.g. `1500`), optional `tolerance` | number box | within tolerance (commas allowed: `1,500`) |
| `order` | option1–4 **in the correct order** | shuffled list with ↑/↓ buttons | the order matches exactly |
| `text` | `answer` e.g. `beta|beta diversity|β` | text box | it matches an accepted answer, ignoring case, punctuation and extra spaces. One typo is forgiven on answers of 8 or more characters, but not in the first letter or in a number, so short terms such as `alkane` must be exact |

Tips:
- For `multi`, say "(Select all that apply)" in the prompt, and use 2–3 correct answers out of 4.
- For `numeric`, state units in the prompt ("in base pairs") and use a tolerance for estimates.
- For `text`, keep answers to 1–3 words and list every reasonable spelling or synonym. Avoid free-response questions that have many valid phrasings.
- For `order`, use 3–4 steps with one unambiguous sequence.

## 5. Recommended counts (per bigTopic/module game)

| type | minimum | good (60–90 min) | why |
|---|---|---|---|
| property | 4 per subtheme | 8–10 per subtheme (64–80 total) | each subtheme pool feeds 3 tiles; small pools repeat quickly |
| milestone | 6 per theme | 8–10 per theme | each exam asks 6, and teams retry |
| core | 4 | 8–12 | shared by 4 tiles |
| mishap | 3 | 6–10 | variety keeps wildcard tiles fun |
| survey | 10 | 15–20 | each player draws 10; a bigger pool varies sets between players |
| confidence | 1 | 3 | slider statements tied to LOs |

For 45-minute sessions, the minimums plus about 50% are enough.

## 6. JSON schema for build_tsv.py

A JSON list. Each object uses the column names above; any omitted key becomes blank. You may use `options` (a list of up to 4) instead of option1–4, and `correct` instead of `correctIndex`:

```json
[
  {"id": "prop_t1s1_01", "type": "property", "theme": "Sequencing basics", "subtheme": "Library prep",
   "question": "What is the main purpose of adding adapters during library preparation?",
   "options": ["To let fragments bind the flow cell and primers", "To remove PCR duplicates", "To fragment the DNA", "To label samples by species"],
   "correct": 1,
   "explanation": "Adapters contain the sequences that hybridise to the flow cell and prime sequencing. Duplicates are removed bioinformatically, not by adapters."},
  {"id": "prop_t1s2_04", "type": "property", "format": "numeric", "theme": "Sequencing basics", "subtheme": "Read quality",
   "question": "A Phred score of Q30 corresponds to an error probability of 1 in how many base calls?",
   "answer": 1000, "explanation": "Q = -10·log10(P), so Q30 means P = 0.001, or 1 error in 1,000 calls."},
  {"id": "mis_01", "type": "mishap", "question": "Someone left the -80 °C freezer open overnight! (-$100)",
   "explanation": "Repeated freeze-thaw cycles fragment DNA and degrade enzymes; aliquot your reagents."}
]
```

Pass `--bigTopic` and `--module` to build_tsv.py to fill those columns on every row that leaves them blank (except config rows).

## 7. Gotchas

- No tabs or line breaks inside cells; build_tsv.py replaces them with spaces.
- `type` values must be lowercase (survey and confidence rows are matched exactly).
- Correct answers must not depend on option position ("both A and C"), because options are shuffled. Use the `multi` format instead.
- Avoid "All of the above" and "None of the above" for the same reason, and never refer to "option C" in an explanation; name the option's content instead.
- Spreadsheets turn a cell that starts with `-`, `+`, `=` or `@` into a formula, so `--p-sampling-depth` becomes `#NAME?` after a round trip through Excel or Google Sheets. Wrap commands and flags in backticks (`` `--p-sampling-depth` ``), or type an apostrophe first when editing in a spreadsheet. The validator reports `#NAME?`, `#REF!` and similar values as errors.
- Keep prompts under about 300 characters; teams read them aloud under time pressure.
- An encrypted `.lock` file can't be validated. Validate the plain `.tsv` first, then encrypt.

## 8. Config rows (instructor settings)

Optional rows that set up how results reach the instructor. Put the setting name in `id`, its value in `question` and `config` in `type`, and leave the other columns blank. Settings apply to the whole file, whatever topic and module the players pick (build_tsv.py leaves `bigTopic` and `module` blank on config rows).

| `id` | value (`question` column) | effect |
|---|---|---|
| `results_url` | the collector's Web app URL, `https://script.google.com/macros/s/…/exec` | the end screen shows **Send results to instructor**, which adds each team's results to the instructor's Google Sheet |
| `instructor_email` | an email address | the end screen shows **Email results to instructor**: it downloads the results file and opens a pre-addressed email; students attach the file |
| `course` | e.g. `BIOL 301 – Week 5` | labels the results (Sheet rows and the email subject) |
| `ask_names` | `yes` or `no` | whether students must type their names or student IDs before sending. Default: `yes` when `results_url` or `instructor_email` is set |

Without config rows, students simply download the results file (CSV) and submit it as the instructor asks.

JSON for build_tsv.py:

```json
[
  {"id": "results_url", "type": "config", "question": "https://script.google.com/macros/s/AKfy…/exec"},
  {"id": "instructor_email", "type": "config", "question": "prof@university.edu"},
  {"id": "course", "type": "config", "question": "BIOL 301 – Week 5"}
]
```

**Setting up the Google Sheet collector** (once per course, about 5 minutes):

1. Create a Google Sheet, for example "SAB results – BIOL 301".
2. Choose Extensions → Apps Script. Delete the sample code, paste the collector script from https://hghezzi.github.io/Science-Around-the-Board/tools/sab-results-collector.gs and save.
3. Choose Deploy → New deployment, select type **Web app**, set Execute as: **Me** and Who has access: **Anyone**, then Deploy and authorize.
4. Copy the Web app URL (it ends in `/exec`) into a `results_url` config row.
5. Test: play a quick solo game with the file and click **Send results to instructor**. A "Summary" tab (one row per team) and a "Details" tab (every answer and transaction) appear in the Sheet.
6. If the script is edited later, use Deploy → Manage deployments → Edit → Version: New version, so the URL stays the same.

Notes:
- Anyone who has the link can send data to the Sheet, so treat it like an unlisted form link. The collector only accepts game submissions and stops typed text from becoming formulas.
- A plain `.tsv` shows its config rows to anyone who opens it. Encrypt the file (`.lock`) if the address or link shouldn't be visible.
- If an institution doesn't allow Google services for student data, use `instructor_email` or plain downloads instead, and ask students to type student numbers or initials rather than full names if required.
