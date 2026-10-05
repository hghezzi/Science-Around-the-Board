# Science Around the Board (SAB)

A browser-only, Monopoly-style review game for higher education by Hans Ghezzi. It was built for UBC MICB 475 (16S rRNA / QIIME2), and the engine is meant to work for any subject. Instructors write a question file (TSV), and student teams (1–4 per computer) load it at https://hghezzi.github.io/Science-Around-the-Board/. The project goal is to keep improving the platform and make it easy for **other teaching teams** to adopt. Favour changes that keep it subject-agnostic, zero-install and privacy-preserving.

License: CC BY-NC-SA 4.0 (non-commercial).

## Pedagogy (why features exist)
- **Purpose:** it replaces review sessions. It rests on playful pedagogy, active recall, and frequent low-stakes assessment with an immediate explanation after every answer. It targets Bloom's "understand/apply", uses backward design from learning outcomes, and suits the BOPPPS lesson plan (80 min).
- **"Data sandwich":**
  - Pre-survey: confidence sliders plus 10 random `survey` MCQs per player.
  - Gameplay.
  - Post-survey: the same questions.
  - CSV export, which students submit to the LMS.
- **Mapping of content to mechanics:**
  - Property tiles hold recall questions.
  - Corner milestones hold harder synthesis questions.
  - Mishaps hold practical pitfalls and fun facts.
  - The `explanation` column is the main teaching moment.
- **Sources of truth for the instructor docs:**
  - `public/SAB_Instructor_Guide.pdf` (most complete; Google-Docs-authored, not in the repo as source).
  - `website/docs/*.md` (Docusaurus, not currently deployed).
  - `README.md`.
  - These docs disagree with each other and with the code in places (see "Known gaps").

## Stack & commands
- React 19, Vite 7, MUI 7, framer-motion and crypto-js. It is a static SPA with no backend.
- `npm run dev`: local dev server.
- `npm test`: Vitest unit tests in `tests/`.
- `npm run lint`: ESLint, scoped to app code.
- `npm run build`: production build to `dist/`.
- `npm run validate-tsv -- file.tsv`: check a question file. Exits 1 on errors.
- `npm run deploy`: builds and pushes `dist/` to the `gh-pages` branch. This is a manual deploy (Vite `base` is `/Science-Around-the-Board/`), so only run it when asked.
- CI (`.github/workflows/ci.yml`) runs lint, test, validates the demo TSV, and builds.

## Code map
- `src/App.jsx`:
  - Phase machine: landing (load the demo, or upload a TSV or `.lock`, plus optional images), then `SETUP` (players, topic/module), `PRE_SURVEY`, `GAME`, `POST_SURVEY`, `SUMMARY` (export `microbiopoly_data.csv`).
  - Also handles AES decryption of `.lock` files (CryptoJS passphrase), uploaded images mapped to blob URLs by filename, and the validation report on upload.
- `src/tsvParser.js` (pure): `parseTsv`, `parseTsvHeaders`, `parseList` (comma lists), `getAllTopics`, `getModulesForTopic`.
- `src/tsvBoardBuilder.js` (pure):
  - Filters rows by `bigTopic`/`module`; a blank cell matches all.
  - The first 4 `theme`s (by first appearance in property/milestone rows) become the sides, and each side takes its first 2 `subtheme`s.
  - `core` rows are shared by all 4 core tiles.
  - Output shape: `{CoreTech, Side1..4}`.
- `src/gameData.js`:
  - Builds a fixed **36-tile** loop. Tiles 0/9/18/27 are milestones, and tile 0 (START) is Side4's milestone.
  - Each side is 3×sub1 ($100), core ($200), 3×sub2 ($160), Lab Mishap.
  - Base rent is 20% of price; a core's is 120 and a milestone's is 250.
- `src/gameRules.js` (pure): subgroup ownership and rent multipliers (0.5× without the full set; otherwise 1/3/6/10/20× by level 0–4).
- `src/MicrobiopolyGame.jsx`: a single component (~1300 lines) holding all turn logic and UI, with modal flows keyed by `modalStage` / `activeCard.type`.
  - Start money $2500; passing Go +$200.
  - Property question: right gives the option to buy; wrong is −$20.
  - Rent defense: right pays 50%.
  - Milestone exam: 6 questions, 5 to pass, failing on the 2nd mistake; a pass earns a chaos token. Owning all 4 milestones wins.
  - Chaos steal at 50% of price; tokens can be bought for $500 once all milestones are owned.
  - Liquidation, then Emergency Grant (sets `hasBailedOut`, which makes the player ineligible to win).
- `src/tsvValidator.js` (pure): instructor-facing checks that mirror what the engine needs. Shared by the UI, CLI and tests. **Update it whenever engine assumptions change.**
- `src/questionBank.js`: legacy. Only `LAB_MISHAPS` (fallback mishaps) is used.
- `public/encryptor.html`: standalone tool that encrypts a TSV into a `.lock` file.
- `public/SAB_questions_Jan22_Filtered.tsv`: demo file (`16S`/`QIIME2`, 164 rows).
- `MICB_475_2026_Workshop/`: the real course's encrypted `.lock` and images. Don't modify it without asking.
- `BackupCode/` and `website/build` + `website/.docusaurus` are committed clutter, ignored by lint.

## Question file (TSV) format
- Columns: `id, question, option1..option4, correctIndex (1-4), explanation, bigTopic, module, theme, subtheme, type, imageFile`.
- `type` values: `property | milestone | core | mishap | survey | confidence`.
- `bigTopic`/`module` accept comma lists.
- Mishap rows: `question` holds the event text and `explanation` the fun fact. A `+` in the text makes it a reward.
- The parser is a simple tab split: quoted cells may not contain tabs or newlines.

## Known gaps (code vs docs). Confirm with the user before changing gameplay.
1. Chaos challenges use the hard-coded QIIME2 `CODE_CHALLENGE_BANK`, not the tile's questions. The grant exam also falls back to it.
2. Answer options are never shuffled, although the PDF says they are.
3. "Best pre-survey score starts" is not implemented: `startingPlayerIndex` is never passed.
4. Mishaps are always +$50 or −$100, regardless of the amount in the text.
5. Victory conditions differ between the code (all 4 milestones), the student guide (mastery or net worth) and the PDF (last standing or net worth). There is no net-worth or timer logic.
6. Passing and failing the Emergency Grant have identical outcomes.
7. The image fallback path is `./question_images/`, but the folder is `public/questionImages/`.
8. Fewer than 4 themes gives a short board, but movement is `% 36`, so it breaks. The validator now reports this.
9. Post-survey rows have no `correct` field, and their image is placed above the prompt. `type=post` rows are ignored.
10. CSV analytics are thin: question ids are dropped in `rowToQuestion`, and chosen options and per-question milestone, chaos and grant answers aren't logged.
11. The UI has hard-coded domain wording: "THE SEQUENCING RUN", the "HGPvS" watermark, NIH/Nobel copy.
12. `index.html` loads Google Analytics (`G-B2Z5WS4KQR`, with a placeholder in the script `src`), which conflicts with the "no data" privacy claim.
13. There is no autosave (a refresh loses everything), the board is not responsive, and accessibility is minimal.

## Conventions
- Develop on the session's assigned branch. Don't push to `main` or deploy unless asked.
- Keep the pure logic (parser, builder, rules, validator) free of React so it stays testable. Add tests in `tests/` for rule changes.
- Teams use the live site for classes, so flag any change that alters gameplay, scoring or the CSV format.
