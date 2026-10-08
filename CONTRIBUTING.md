# Contributing to Science Around the Board

Thank you for helping! SAB is used in real classes, so changes need to be careful, tested and easy for other teaching teams to adopt. Please read [CLAUDE.md](CLAUDE.md) first: it maps the code and lists the project rules.

## Ways to help

- **Report a bug** or a confusing moment in class with the *Bug report* issue form. A screenshot and the question file (or a small one that shows the problem) help most.
- **Share a question file** for a new subject. An example that others can learn from is very welcome. Run it through the checker first (below).
- **Suggest a feature** with the *Feature idea* form. Please explain the teaching need behind it.
- **Improve the Instructor Guide** (`guide/instructor-guide.md`).

## Ground rules

- **Keep it subject-neutral.** In-game words live in `src/labels.js` and must not assume a field (no lab or science vocabulary). Theming comes from the instructor's question file.
- **Keep it zero-install and private.** No accounts, no server, no tracking without opt-in. Student data stays on the students' computer unless they choose to send it.
- **Gameplay, scoring and the CSV format are stable.** Open an issue to discuss before changing them; teams compare results across terms.
- **Use theme tokens for colours**, never hard-coded text or background colours, and check light and dark mode.
- Keep the pure logic (parser, board builder, rules, validator, `lockFile.js`) free of React, and add tests in `tests/`.
- When engine assumptions change, update `src/tsvValidator.js` **and** its Python mirror in `.claude/skills/sab-question-writer/scripts/validate_tsv.py`.

## Development

```bash
npm ci            # Node 20.19+ or 22.12+
npm run dev       # http://localhost:5173/Science-Around-the-Board/
npm run lint && npm test && npm run build
npm run validate-tsv -- my_questions.tsv
```

Before opening a pull request for a change that users will see, also run:

- `npm run smoke`: plays the built app end to end with Playwright (about 5 minutes; run `npx playwright install chromium` once).
- `npm run privacy`: checks consent, share-link safety and the Content-Security-Policy.
- `npm run a11y` (with `npm run preview` running): accessibility checks in light and dark mode.
- `npm run guide`: if the change affects what instructors or students see, update `guide/instructor-guide.md` (including a *What's new* entry) and commit the regenerated guide.

## Pull requests

Keep each pull request focused, describe the classroom effect, and fill in the checklist in the template. CI runs lint, tests, both question-file validators, the build and the smoke test.

## License

By contributing, you agree that your contribution is licensed under the same terms as the files it changes (see [LICENSE](LICENSE): PolyForm Noncommercial 1.0.0 for code, CC BY-NC-SA 4.0 for content). You also grant Hans Ghezzi a perpetual, worldwide, royalty-free right to use, change and relicense your contribution under other terms, including commercial ones, and you confirm that you have the right to grant this.
