# Changelog

Notable changes to Science Around the Board. The live site is deployed automatically from `main` once CI passes (`.github/workflows/deploy.yml`); dates are deploy dates. The instructor-facing summary is the *What's new* section of the [Instructor Guide](guide/instructor-guide.md).

## Unreleased: public release preparation (October 2026)

### Gameplay (changes scores)
- Questions: unseen ones first; a question answered wrongly returns about 6 turns later (`src/questionPicker.js`), for tiles, exams, chaos challenges and the Rescue Quiz.
- Economy: starting cash $1,500 (was $2,500); every rent ×2.5 (property 50% of price, core $300, rival milestone fee $625).
- Net worth counts money actually spent: each tile at what its owner paid, each upgrade once per group (it was counted once per tile). Liquidation returns half of what was paid, consistently.
- Chaos: complete sets can't be challenged; the token is spent and the turn ends either way; Challenge is disabled when the team can't pay.
- Short answers: one typo is forgiven only in answers of 8+ characters and never in the first letter or a number.
- A new game opens with the quick rules (**How to play**); the start page has a **Quick rules** link. The setup screen says "players" instead of "teams".

### CSV
- Survey `selectedIndex` is the option number in the question file (1–4) rather than the on-screen position; `TRANSACTION` rows have a `timestamp`.

### Content
- The demo's five figures were redrawn from synthetic data (`scripts/make-demo-images.py`, `sab_*.png`); the 11 earlier hosted images of uncertain origin are no longer served.

### Changed
- **New `.lock` encryption.** The encryptor now uses PBKDF2-SHA256 (600,000 rounds) and AES-256-GCM through the browser's Web Crypto API, and says honestly what it protects against. Existing `.lock` files still open. The encryptor no longer loads a script from a CDN and works offline.
- **Updates reach players reliably.** An open page checks for a new deploy every 30 minutes and when the tab is focused again. An empty start page reloads into the new version by itself; during a session a notice offers **Reload** instead of interrupting the game.
- Faster first load: the board code, the confetti and the legacy decryption code load separately, and the demo images are about a third smaller.
- The results collector script (version 2) limits submission size, rows, columns and submissions per minute, and shortens very long text.
- Choosing **No thanks** after allowing analytics now switches Google Analytics off at once and deletes its cookies. Analytics no longer receives a game link's query string.
- Instructor email addresses containing `?`, `&`, `,` and similar characters are rejected, so they can't add recipients to the email draft. CSV cells starting with a tab or carriage return are also neutralised.

### Added
- A Content-Security-Policy on the app and the encryptor; link previews (Open Graph and Twitter cards), a canonical URL and a meta description; a `404.html` that sends old or mistyped links to the game, keeping `?deck=`.
- An error screen with **Reload** instead of a blank page.
- `npm run privacy` (consent, share-link and CSP checks) and an `update` smoke-test scenario.
- `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CITATION.cff`, issue and pull-request templates, and Dependabot.

### Removed
- Old code backups (`BackupCode/`), the unused Docusaurus site (`website/`) and an outdated README image. They held the last traces of the project's old name.

## 2026-10-05
Results to the instructor (Google Sheet, email, download), shareable game links, autosave and resume, install as an app and offline play, demo fixes, subject-neutral wording, dark mode, the redesigned board, new question formats, the file checker, the question-writer skill and the Intro Statistics example. See the guide's *What's new*.

## 2026-03-05
The March 2026 edition of the Instructor Guide (archived in `public/archive/`).

## 2025-12-08
First version, built for UBC MICB 475.
