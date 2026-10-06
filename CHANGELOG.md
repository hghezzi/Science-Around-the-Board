# Changelog

Notable changes to Science Around the Board. The live site is updated by hand from `main` (`npm run deploy`); dates are deploy dates. The instructor-facing summary is the *What's new* section of the [Instructor Guide](guide/instructor-guide.md).

## Unreleased: public release preparation (October 2026)

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
- Old code backups (`BackupCode/`), the unused Docusaurus site (`website/`) and an outdated README image. They held the last traces of the project's old Monopoly-era name.

## 2026-10-05
Results to the instructor (Google Sheet, email, download), shareable game links, autosave and resume, install as an app and offline play, demo fixes, subject-neutral wording, dark mode, the redesigned board, new question formats, the file checker, the question-writer skill and the Intro Statistics example. See the guide's *What's new*.

## 2026-03-05
The March 2026 edition of the Instructor Guide (archived in `public/archive/`).

## 2025-12-08
First version, built for UBC MICB 475.
