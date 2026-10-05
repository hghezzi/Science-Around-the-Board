# Science Around the Board (SAB)

A browser-only, property-trading review game for higher education by Hans Ghezzi. It was built for UBC MICB 475 (16S rRNA / QIIME2), and the engine is meant to work for any subject. Instructors write a question file (TSV), and student teams (1–4 per computer) load it at https://hghezzi.github.io/Science-Around-the-Board/. The project goal is to keep improving the platform and make it easy for **other teaching teams** to adopt. Favour changes that keep it subject-agnostic, zero-install and privacy-preserving.

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
  - `guide/instructor-guide.md`: the living Instructor Guide, built on Hans's March 2026 edition (archived at `public/archive/`). It builds to `public/guide/` and `public/SAB_Instructor_Guide.pdf`.
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
- `npm run package-skill`: zip the question-writer skill to `public/downloads/` (also runs automatically before `build`; the output is gitignored).
- `npm run guide`: rebuilds the Instructor Guide. It runs `vite build`, then `scripts/guide-screenshots.mjs` (Playwright screenshots into `guide/images/`), then `scripts/build-guide.mjs` (writes `public/guide/index.html` and `public/SAB_Instructor_Guide.pdf`). The outputs are committed.
- `npm run smoke`: builds, then `scripts/smoke-test.mjs` plays the built app with Playwright (1–4 teams, dark mode, mocked Google Sheet send, `.lock` and link loading, resume after a refresh, offline). Pick scenarios with `SCENARIOS=teams,dark,results,files,resume,offline`. **Run it before every deploy.** It takes about 5 minutes.
- `npm run a11y`: axe-core checks on the main screens in light and dark mode (including the password dialog, resume notice and end screen). It needs `npm run preview` running on port 4173.
- `python3 scripts/make-icons.py`: regenerates the install icons in `public/icons/` (Pillow).
- `npm run deploy`: builds and pushes `dist/` to the `gh-pages` branch. This is a manual deploy (Vite `base` is `/Science-Around-the-Board/`), so only run it when asked.
- CI (`.github/workflows/ci.yml`) runs lint and tests, validates both example TSVs with the JS and Python validators, and builds.

## Code map
- `src/App.jsx`:
  - Phase machine: landing, then `SETUP` (players, session length, topic/module), `PRE_SURVEY`, `GAME`, `POST_SURVEY`, `SUMMARY`.
  - Landing: demo and Intro Statistics (`loadFromLink("demo"|"stats")`), upload a TSV or `.lock` (`PasswordDialog`; `.lock` files start with `U2FsdGVkX1`), `?deck=`/`?images=` links, optional images, the validation report (lists only images that can't be found), `ShareLinkBuilder`, the "Resume your game?" offer, `InstallButton` and the consent banner.
  - `startGame()` builds the survey sets with the final team count (`surveys.js`) and a new `sessionId`.
  - Autosave: while in `PRE_SURVEY`…`SUMMARY`, App saves a snapshot (`autosave.js`), including the game's state from `GameScreen`'s `onSnapshot`. It is cleared by `resetFile()`/main menu, Exit session and `startGame()`.
  - `SurveyView` serves both pre and post surveys. The best pre-survey scorer starts the game (`bestPreSurveyPlayer`).
  - `SummaryView`: score table, names or IDs per team (required when `config.askNames`), then Send (results sheet), Email (a `mailto:` link that also downloads the file) and Download. The CSV starts with `TEAM_INFO` rows.
- `src/GameScreen.jsx`: a single component (~1300 lines) holding all turn logic and UI, with modal flows keyed by `modalStage` / `activeCard.type`.
  - Start money $2500; passing START +$200 (the "lap bonus").
  - `checkLanding` reads `playersRef` and must not run side effects inside a state updater (StrictMode runs updaters twice in dev).
  - Autosave: `onSnapshot` fires only between turns (`turnInProgressRef` is set by the roll and cleared by `passTurn`). `resume` restores players, turn, logs and tile `owner`/`level` onto a freshly built board; tiles share question arrays, so the board itself is never serialized.
  - Property question: right gives the option to buy; wrong is −$20.
  - Rent defense: right pays 50%.
  - Milestone exam: 6 questions, 5 to pass, failing on the 2nd mistake; a pass earns a chaos token.
  - Chaos steal at 50% of price, using the target tile's own questions.
  - Liquidation, then **one** Rescue Quiz (2 of 3 to pass; CSV action `EMERGENCY_GRANT`). Failing it, or a second bankruptcy, eliminates the team and returns its tiles to the bank.
  - **The game ends** with last team standing (`WIN`), or with the `STANDINGS` modal ranking by net worth. Standings open from END GAME, from the optional `sessionMinutes` timer, or after a win. `handleEndGame` appends `GAME_RESULT` rows.
  - `logAnswer` writes one CSV row per answered question.
- `src/questionFormats.js` (pure):
  - Formats: `mcq | multi | numeric | order | text`.
  - `normalizeQuestion` turns a TSV row into a question; `prepareQuestion` shuffles the options and remaps answers.
  - `checkAnswer` returns `{correct, responseText, correctText}`.
  - `parseMishapAmount` reads the amount from mishap text.
- `src/theme.js`:
  - MUI theme with light/dark `colorSchemes`, selected by the media query, so it follows the device setting. Exposed as CSS variables, e.g. `var(--mui-palette-board-felt)`; `v()` builds that string.
  - Custom `palette.board.*` colours.
  - `TEAM_COLORS` and `TEAM_SYMBOLS` (`TEAM_NAMES` is re-exported from `labels.js`).
  - Bundled Fredoka (headings) and Nunito (body) fonts.
  - **Never hard-code text or background colours in components; use theme tokens.** The old Vite template CSS caused white-on-white text in dark mode.
- `src/components/`:
  - `Board.jsx`: responsive 10×10 grid sized with container-query units. The centre holds the title, turn banner, dice and actions.
  - `Dice.jsx`, `TeamPanel.jsx`, and `confetti.js` (`celebrate()`, which respects reduced motion).
- `src/QuestionInput.jsx`: renders any format, in game mode (`onSubmit`, `reveal`) or survey mode (`survey`, `onChange`). `QuestionImage` hides images that fail to load.
- `src/tsvParser.js` (pure): `parseTsv`, `parseTsvHeaders`, `parseList` (comma lists), `getAllTopics`, `getModulesForTopic`.
- `src/tsvBoardBuilder.js` (pure):
  - Filters rows by `bigTopic`/`module`; a blank cell matches all.
  - The first 4 `theme`s (by first appearance in property/milestone rows) become the sides, and each side takes its first 2 `subtheme`s.
  - `core` rows are shared by all 4 core tiles.
  - Output shape: `{CoreTech, Side1..4}`.
- `src/gameData.js`:
  - Builds a fixed **36-tile** loop. Tiles 0/9/18/27 are milestones, and tile 0 (START) is Side4's milestone.
  - Each side is 3×sub1 ($100), core ($200), 3×sub2 ($160), Wildcard (internal type `chance`).
  - Base rent is 20% of price; a core's is 120 and a milestone's is 250.
- `src/gameRules.js` (pure):
  - Rent multipliers: 0.5× without the full set, otherwise 1/3/6/10/20× by level.
  - Victory helpers: `assetValue`, `netWorth`, `rankPlayers`, `nextActivePlayer`, `bestPreSurveyPlayer`.
- `src/images.js` (pure): `resolveImage(name, uploaded, base)`. Order: uploaded file, then http/data URL, then the `?images=` folder (`base`), then `./questionImages/<name>` (hosted in `public/questionImages`).
- `src/surveys.js` (pure): `buildSurveySets` (10 per player) and `buildConfidenceQuestions`, filtered by topic/module.
- `src/config.js` (pure): `readConfig(rows)` reads `type=config` rows (`results_url`, `instructor_email`, `course`, `ask_names`).
- `src/results.js`: `toCsv` (formula-safe), `resultsFilename`, `summarizeTeams`, `teamInfoRows`, `buildPayload`, `sendResults` (text/plain POST, no CORS preflight), `buildMailto`, `downloadText`.
- `src/deckLinks.js` (pure): `?deck=`/`?images=` links. Shortcuts `demo`/`stats`; published Google Sheets become TSV exports and GitHub pages become raw links; `buildShareLink`, `isUnpublishedSheet`.
- `src/autosave.js`: `saveSnapshot`/`loadSnapshot`/`clearSnapshot` in localStorage (`sab-autosave-v1`, 12-hour expiry, never throws).
- `src/components/PasswordDialog.jsx` and `src/components/InstallButton.jsx` (`main.jsx` keeps the `beforeinstallprompt` event in `window.__sabInstallPrompt`).
- `vite.config.js`: `vite-plugin-pwa` (manifest, service worker, precache of the app, demo files and hosted images; not the guide or PDFs).
- `public/tools/sab-results-collector.gs`: the Google Apps Script instructors paste into their own Sheet (Summary and Details tabs). `tests/collector.test.js` runs it against a fake Sheet.
- `src/tsvValidator.js` (pure): instructor-facing checks that mirror what the engine needs. Shared by the UI, CLI and tests. **Update it, and its Python mirror in the skill, whenever engine assumptions change.**
- `src/consent.js` and `src/ConsentBanner.jsx`: Google Analytics (`G-B2Z5WS4KQR`) loads only after opt-in. The banner appears on the start page only. `public/privacy.html` is the privacy notice.
- `src/labels.js`: all player-facing game terms (Wildcard, Buy, Upgrades, Rescue Quiz…), kept subject-neutral, plus `TEAM_NAMES` and `teamDisplayName` (a single team is "Solo Team").
- `src/questionBank.js`: `DEFAULT_CHANCE_CARDS`, the neutral fallback wildcards used when a file has no `mishap` rows.
- `public/encryptor.html`: standalone tool that encrypts a TSV into a `.lock` file.
- `public/icons/`: install icons, generated by `scripts/make-icons.py`.
- `public/SAB_questions_Jan22_Filtered.tsv`: demo file (`16S`/`QIIME2`, 177 rows, including rows in every format and 7 questions using the hosted images).
- `public/examples/intro_statistics.tsv`: a non-biology example, generated with the skill.
- `.claude/skills/sab-question-writer/`: a Claude skill that interviews instructors and writes validated question files.
  - `scripts/build_tsv.py` converts JSON to TSV.
  - `scripts/validate_tsv.py` is a stdlib Python mirror of the validator.
  - `references/` holds the format spec and the question-design guide.
- `MICB_475_2026_Workshop/`: the real course's encrypted `.lock` and images. Don't modify it without asking.
- `BackupCode/` and `website/build` + `website/.docusaurus` are committed clutter, ignored by lint.

## Question file (TSV) format
- Columns: `id, question, option1..option4, correctIndex (1-4), explanation, bigTopic, module, theme, subtheme, type, imageFile`, plus the optional `format, answer, tolerance`. The full spec is in `.claude/skills/sab-question-writer/references/format.md`.
- `type` values: `property | milestone | core | mishap | survey | confidence | config`.
- Config rows: `id` = setting name, `question` = value, other columns blank; they apply to the whole file.
- `bigTopic`/`module` accept comma lists.
- Mishap rows: `question` holds the event text with an amount such as `(-$100)`, and `explanation` holds the fun fact.
- The parser is a simple tab split: quoted cells may not contain tabs or newlines.

## Known gaps / ideas. Confirm with the user before changing gameplay.
1. Instructor-configurable labels (e.g. renaming Wildcards or the currency from the TSV) are planned. `src/labels.js` is the hook.
2. The board needs at least about 600 px of width, and phone layouts are not a target.
3. `type=post` rows are ignored. Pre and post surveys use the same items; parallel forms are an idea.
4. Question selection is random with repeats. Preferring unseen questions and re-asking missed ones later is an idea.
5. Instructor analytics dashboard (aggregating class CSVs locally): an idea.
6. `website/` (Docusaurus) is not deployed and partly duplicates the guide. The living guide in `guide/` is the source of truth.
7. PWA: a deploy reaches students on their next visit (the service worker updates itself). If a broken version ships, deploy a fix quickly; in an emergency, `selfDestroying: true` in the VitePWA options removes the service worker.
8. Google endpoints (Sheets links, Apps Script) can't be reached from the cloud sandbox. The smoke test mocks them and `tests/collector.test.js` uses a fake Sheet, so test the real Sheet flow by hand after deploying.
9. Multi-device live play (each team on its own device) would need a server and accounts; not planned.

## Conventions
- Develop on the session's assigned branch. Don't push to `main` or deploy unless asked.
- Keep the pure logic (parser, builder, rules, validator) free of React so it stays testable. Add tests in `tests/` for rule changes.
- Teams use the live site for classes, so flag any change that alters gameplay, scoring or the CSV format.
- **Keep the Instructor Guide current.** Every user-facing change updates `guide/instructor-guide.md` and adds a "What's new" entry, then runs `npm run guide` and commits the regenerated outputs.
- After UI changes, run `npm run a11y` and check both light and dark mode. Keep `npm run smoke` passing.
- **Keep in-game wording subject-neutral.** SAB is used for any field. Player-facing game terms live in `src/labels.js` and must not use lab or science vocabulary; any theming comes from the instructor's question file. CSV codes such as `LAB_MISHAP` and `EMERGENCY_GRANT` are kept for data continuity.
