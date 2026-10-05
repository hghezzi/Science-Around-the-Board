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
- **Formats**: multiple choice is the default. Offer multi-select, numeric, ordering and short-text (explained in `references/format.md`). Suggest which fit the topic, for example numeric for calculations or ordering for workflows and pathways.
- **Names**: the `bigTopic` and `module` labels students will pick from the menu (e.g. `Microbiology` / `16S Sequencing`).
- **Images**: whether they want figures (plots, diagrams, gels) and whether they have their own.
- **Tone of wildcards** (`mishap` rows): events themed to the subject (e.g. lab accidents for a science course, archive floods for history) or general study-life events. These can be fun. The game itself uses neutral wording, so the theme comes only from this text.

If the instructor says "just make something about X", fill sensible defaults: an upper-year undergrad audience, a 60-minute session, mostly MCQ with a few other formats, and no images. State these defaults in one line and proceed. Asking ten questions when they wanted speed is worse than a good default.

## 2. Sources and research

- Prefer the instructor's materials. Extract the key concepts, terms, procedures, common mistakes and any worked examples.
- When materials are thin and web search is available, research the topic from reputable sources (textbooks, review articles, official documentation). Note what you relied on so the instructor can check it.
- Accuracy matters more than volume: students will learn whatever the file says is correct. If a fact is contested, version-dependent or you are not sure, don't use it, or flag it in the summary for the instructor to verify. Never invent citations, numbers or tool syntax.

## 3. Blueprint (checkpoint)

Before writing questions, show a compact blueprint and wait for approval or edits:

- `bigTopic` / `module`.
- **4 themes** (one per board side), each with **2 subthemes** (the property groups), mapped to LOs. Order them so the board tells a sensible story (e.g. foundations → methods → analysis → interpretation). The first theme sits on the bottom edge and play moves through them in order.
- The `core` utility-tile theme: one cross-cutting skill used throughout, e.g. "UNIX" or "Statistics".
- Planned counts per type and format, from the counts table in `references/format.md`.
- 3 confidence statements, which become the pre/post sliders. Phrase them as "I am confident I can …", aligned to the LOs.

The blueprint is cheap to change and the questions are not, so this is where the instructor's input matters most.

## 4. Write the questions

Write every row as an object in a JSON list (schema in `references/format.md`). Using JSON rather than raw TSV avoids broken tabs, quotes and column shifts; `scripts/build_tsv.py` converts it safely.

Guidelines that matter most (the full list is in `references/question-design.md`):

- **Property** questions: recall and understanding, answerable in about 20 seconds. Students see one at a time while landing on tiles.
- **Milestone** questions: harder synthesis, application and troubleshooting scenarios for the theme. Students must get 5 of 6 right to capture a corner, so make them fair but demanding.
- **Survey** questions: the pre/post knowledge check. Write them parallel to the board content (same LOs) but **not duplicates** of property or milestone questions; otherwise the post-test measures memory of the exact item rather than learning.
- **Distractors**: every wrong option should be a real misconception or a common error, not a joke. When a student picks it, it should reveal a specific gap.
- **Explanations**: say why the right answer is right *and* address the most tempting distractor. Students read this immediately after answering, right or wrong. One to three sentences.
- **Balance**: spread correct answers across positions 1–4. (The game shuffles options, but balance keeps the source file honest and reviewable.) Vary question stems.
- **Wildcards (`mishap` rows)**: event text with an explicit amount such as `(-$100)` or `(+$150)`; the game pays exactly that amount. Put a related fun fact or practical lesson in `explanation`. Aim for roughly 2/3 penalties, 1/3 rewards, in the range $50–$200.
- **IDs**: stable and readable, e.g. `prop_t1s1_01`, `mile_t2_03`, `surv_04`, `core_02`, `mis_01`, `conf_01`. They are how the instructor traces exported data back to questions.

Write in batches by theme, and re-read each batch for accuracy and for answers that a test-wise student could guess without knowing the material.

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

`build_tsv.py` writes the columns in the right order, strips tabs and newlines from cells, and normalises formats. `validate_tsv.py` mirrors the game's own upload checker: it checks themes and subthemes per board, milestone and survey counts, `correctIndex` validity, numeric, multi and text answers, wildcard amounts, duplicate IDs and missing images. It also reports answer-position balance. Fix every **ERROR**, and fix **WARNING**s unless there is a reason not to. Rerun until it is clean.

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
     - test it with "Upload Custom Questions";
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
