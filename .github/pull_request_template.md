## What and why

<!-- What does this change, and what does it mean for a class using SAB? -->

## Checklist

- [ ] `npm run lint`, `npm test` and `npm run build` pass
- [ ] `npm run smoke` passes (CI runs it too)
- [ ] Gameplay, scoring and the CSV columns are unchanged, or the change is flagged above and was discussed in an issue
- [ ] In-game wording is subject-neutral (`src/labels.js`); colours use theme tokens; light and dark mode checked
- [ ] If the engine's assumptions changed: `src/tsvValidator.js` and the skill's `validate_tsv.py` are both updated
- [ ] If users see the change: `guide/instructor-guide.md` (with a *What's new* entry) and the regenerated guide (`npm run guide`) are included
- [ ] If the app now loads something new: the Content-Security-Policy in `vite.config.js` and `public/privacy.html` are updated
- [ ] No student data, names or real results in the code, tests or screenshots
