---
name: sab-question-writer
description: Writes complete question files (TSV "cartridges") for Science Around the Board (SAB), the property-trading classroom review game at hghezzi.github.io/Science-Around-the-Board. Interviews the instructor about their course, learning objectives and materials, researches the topic, proposes a board blueprint (4 themes x 2 subthemes), then writes property, milestone, core, mishap, survey and confidence questions with misconception-based distractors and teaching explanations, optionally generates figures, and validates the file so it loads in the game. Use this skill whenever someone wants questions, a quiz, a review game, a question bank or a TSV for Science Around the Board / SAB / "the board game", or wants to turn lecture notes, slides or a syllabus into game content, even if they don't name the file format.
---

# SAB Question Writer

You are helping an instructor build a question file for **Science Around the Board**, a browser game where student teams move around a 36-tile board and answer questions to buy, defend and upgrade tiles. The file you produce *is* the game: its themes become the board's sides, its questions are what students study, and its explanations are the main teaching moment. A good file feels like a well-designed review session; a sloppy one teaches misconceptions or crashes the board.

Work in this order. Each step has a reason; don't skip the checkpoints with the instructor, because only they know what their students actually covered.

1. Interview
2. Gather and research sources
3. Propose a blueprint and get approval
4. Write questions as JSON
5. (Optional) make images
6. Build the TSV and validate
7. Deliver with a short instructor summary

Read `references/format.md` before writing any rows: it is the exact column spec, board structure and per-format encoding. Read `references/question-design.md` before writing questions: it covers distractors, explanations, Bloom levels and what to avoid.

---

## 1. Interview

Ask conversationally, a few questions at a time, and reuse anything already said. You need:

- **Course and audience**: course name, level (intro undergrad, upper-year, grad, professional), prior knowledge.
- **Topic scope**: what the game should review. Ask for a syllabus, lecture slides, notes, readings or an existing question bank. Uploaded material is the best source, because it matches what was actually taught.
- **Learning objectives (LOs)**: 4–8 statements of what students should be able to do. If the instructor has none, draft them from the materials and ask for confirmation. Every question should trace back to an LO.
- **Session**: length (typically 45–90 min) and number of teams (1–4 per computer). This sets how many questions are needed (see the counts table in `references/format.md`).
- **Question formats**: show the instructor this menu and ask which to use. The default is **all of them** (encodings in `references/format.md`):
  - multiple choice (the default);
  - true/false (multiple choice with 2 options);
  - select all that apply (`multi`);
  - numeric, with an optional tolerance;
  - ordering (put 3–4 steps in order);
  - short answer (`text`).

  Write one example of each from their topic so they can see what students will get. If a format doesn't fit (for example numeric in a course without quantities), say so and leave it out.
- **Names**: the `bigTopic` and `module` labels students will pick from the menu (e.g. `Microbiology` / `16S Sequencing`).
- **Images**: whether they want figures (plots, diagrams, gels) and whether they have their own.
- **Results delivery**: how the end-of-game results should reach them. Offer:
  - (a) a **Google Sheet collector**: students click "Send results to instructor" and every team's results land in the instructor's own Sheet. One-time setup of about 5 minutes (steps in `references/format.md`, section 8);
  - (b) **email**: a button downloads the results file and opens a pre-addressed email that students send with the file attached;
  - (c) students **download the CSV** and upload it to the course page (no setup).

  For (a) and (b), add the matching `config` rows (`results_url`, `instructor_email`, and optionally `course` and `ask_names`). Both can be combined.
- **Tone of wildcards** (`mishap` rows): events themed to the subject (e.g. lab accidents for a science course, archive floods for history) or general study-life events. These can be fun. The game itself uses neutral wording, so the theme comes only from this text.

If the instructor says "just make something about X", fill sensible defaults: an upper-year undergrad audience, a 60-minute session, the default format mix (all formats), download-only results and no images. State these defaults in one line and proceed. Asking ten questions when they wanted speed is worse than a good default.

## 2. Sources and research

- Prefer the instructor's materials. Extract the key concepts, terms, procedures, common mistakes and any worked examples.
- When materials are thin and web search is available, research the topic from reputable sources (textbooks, review articles, official documentation). Note what you relied on so the instructor can check it.
- Accuracy matters more than volume: students will learn whatever the file says is correct. If a fact is contested, version-dependent or you are not sure, don't use it, or flag it in the summary for the instructor to verify. Never invent citations, numbers or tool syntax.

## 3. Blueprint (checkpoint)

Before writing questions, show a compact blueprint and wait for approval or edits:

- `bigTopic` / `module`.
- **4 themes** (one per board side), each with **2 subthemes** (the property groups), mapped to LOs. Order them so the board tells a sensible story (e.g. foundations → methods → analysis → interpretation). The first theme sits on the bottom edge and play moves through them in order.
- The `core` utility-tile theme: one cross-cutting skill used throughout, e.g. "UNIX" or "Statistics".
- Planned counts per type, from the counts table in `references/format.md`.
- A **formats table**: the planned count of each format for property, milestone, core and survey rows. Unless the instructor opted out of a format, every format appears at least twice.
- 3 confidence statements, which become the pre/post sliders. Phrase them as "I am confident I can …", aligned to the LOs.

The blueprint is cheap to change and the questions are not, so this is where the instructor's input matters most.

## 4. Write the questions

Write every row as an object in a JSON list (schema in `references/format.md`). Using JSON rather than raw TSV avoids broken tabs, quotes and column shifts; `scripts/build_tsv.py` converts it safely.

Guidelines that matter most (the full list is in `references/question-design.md`):

- **Property** questions: recall and understanding, answerable in about 20 seconds. Students see one at a time while landing on tiles.
- **Milestone** questions: harder synthesis, application and troubleshooting scenarios for the theme. Students must get 5 of 6 right to capture a corner, so make them fair but demanding.
- **Survey** questions: the pre/post knowledge check. Write them parallel to the board content (same LOs) but **not duplicates** of property or milestone questions; otherwise the post-test measures memory of the exact item rather than learning.
- **Distractors**: every wrong option should be a real misconception or a common error, not a joke. When a student picks it, it should reveal a specific gap.
- **No give-away cues (the most common flaw in generated questions)**: you will be tempted to make the correct answer the longest, most precise and most qualified option. Don't. Write the correct answer first, then make each distractor the **same length (±20%), detail and grammar**. Across the file the correct answer should be the longest option in only about 1 question in 4 and the shortest in about 1 in 4. Absolute words ("always", "never", "only", "all") must not appear only in distractors, and the correct answer must not be the only option that repeats the stem's key words. Details and before/after examples: `references/question-design.md`, "Don't let the answer give itself away".
- **Explanations**: say why the right answer is right *and* address the most tempting distractor. Students read this immediately after answering, right or wrong. One to three sentences.
- **Format mix** (unless the instructor chose otherwise): about 60% multiple choice (including 2–4 true/false) and about 10% each of multi, order, numeric and text, spread across property, milestone and core rows. Ordering suits milestone workflows and numeric suits calculations. Keep survey rows mostly multiple choice so pre/post scores stay comparable.
- **Balance**: spread correct answers across positions 1–4. (The game shuffles options, but balance keeps the source file honest and reviewable.) Vary question stems.
- **Wildcards (`mishap` rows)**: event text with an explicit amount such as `(-$100)` or `(+$150)`; the game pays exactly that amount. Put a related fun fact or practical lesson in `explanation`. Aim for roughly 2/3 penalties, 1/3 rewards, in the range $50–$200.
- **IDs**: stable and readable, e.g. `prop_t1s1_01`, `mile_t2_03`, `surv_04`, `core_02`, `mis_01`, `conf_01`. They are how the instructor traces exported data back to questions.

Write in batches by theme. **Self-check every batch before moving on (mandatory):**

1. **Blind-student test**: read only the options of each question, without the stem. If you can tell which one is correct (longest, most hedged, echoes the stem, the only one without "always"/"never"), rewrite it.
2. **Length tally**: for the batch, count the questions where the correct option is the longest and where it is the shortest. Each should be about a quarter. If the correct answer is the longest in more than a third, shorten correct answers (move reasons into the explanation) or lengthen distractors with real misconceptions.
3. **Accuracy**: every fact, command and number is right; anything version-specific is flagged for the instructor.
4. **Explanations** name options by content, never by letter ("option C"), because options are shuffled.

The validator in step 6 measures the same cues for the whole file; the self-check keeps you from having to rewrite dozens of questions at the end.

## 5. Images (optional)

Only add images that a question actually needs (interpreting a plot, a diagram, a gel, code output).

- If Python with matplotlib is available, generate clean figures from code, so the data is synthetic and there are no copyright issues. Save PNGs into an `images/` folder, keep them simple and readable at about 600 px wide, and put the exact filename in `imageFile`.
- If you cannot render images, or the instructor wants their own, leave `imageFile` with a clear filename and list each image's intended content in the summary so the instructor can supply it.
- Filenames are case-sensitive and must match exactly. Students upload all the images at once in the game; images are optional, and a missing image is simply hidden.

## 6. Build and validate

```bash
python scripts/build_tsv.py questions.json questions.tsv
python scripts/validate_tsv.py questions.tsv --images images/
```

`build_tsv.py` writes the columns in the right order, strips tabs and newlines from cells, and normalises formats. `validate_tsv.py` mirrors the game's own upload checker: it checks themes and subthemes per board, milestone and survey counts, `correctIndex` validity, numeric, multi and text answers, wildcard amounts, duplicate IDs and missing images. It also reports answer-position balance, prints a `Formats:` line with the count of each format, and prints an `Answer cues:` line: how often a student who always picks the longest option, the shortest option, or the option that repeats the question's words would be right, compared with chance. It warns about single questions whose correct answer is 1.5× longer than the distractors, file-level length or wording cues, absolute words found only in distractors, "all of the above"-style options, a/an grammar cues, identical options, survey items that repeat board items, and (as an error) spreadsheet error values such as `#NAME?`. **Both length scores must be close to chance (about 25% for 4 options) before you deliver.** Fix every **ERROR**, and fix **WARNING**s unless there is a reason not to. Compare the `Formats:` line with the blueprint's formats table and add rows for any planned format that is missing. Rerun until it is clean.

When working inside the SAB repository, you can also run `npm run validate-tsv -- questions.tsv`, which uses the game's real validator.

## 7. Deliver

Give the instructor:

1. **`questions.tsv`**, ready to upload at https://hghezzi.github.io/Science-Around-the-Board/.
2. **`images/`** (if any), zipped if the environment allows.
3. **A short summary** (in chat, or a `README.md` next to the file):
   - the blueprint table (themes, subthemes, LOs) and counts per type and format;
   - anything they should fact-check (flagged items, version-specific details);
   - **next steps**:
     - open the TSV in Google Sheets or Excel to review and edit;
     - test it on the start page with **Upload** ("Use your instructor's questions");
     - share it with students as a link: the start page's "For instructors: share your questions as a link" turns a published Google Sheet, a GitHub file or any public link into a game link;
     - if they chose the Google Sheet collector: the setup steps from `references/format.md`, section 8, and a reminder to test with a quick solo game;
     - optionally encrypt it with the Password Encryptor (https://hghezzi.github.io/Science-Around-the-Board/encryptor.html), so students can't read the answer key, and share the `.lock` file plus the password;
     - share any images with students as a folder.

Don't paste the whole TSV into chat unless asked; it's long and the file is what they need.

---

## Editing an existing file

If the instructor uploads an existing SAB TSV and wants more questions, fixes or a new module:

- Read it with `validate_tsv.py` first to understand its structure.
- Keep existing IDs stable.
- Match its themes and tone.
- Append new rows rather than reordering, because theme order sets the board layout.
- Return the full updated file and say what changed.
