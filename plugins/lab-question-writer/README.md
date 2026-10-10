# LAB question-writer (Claude Code plugin)

This plugin writes complete, validated question files for [Learn Around the Board](https://hghezzi.github.io/Learn-Around-the-Board/), a free classroom review game. It interviews you about your course, follows your materials, proposes a board layout for your approval, writes and checks every question, and hands you a file that is ready to load.

## Install

```
/plugin marketplace add hghezzi/Learn-Around-the-Board
/plugin install lab-question-writer@lab
```

To update later, run `/plugin marketplace update lab`, or turn on auto-update for the `lab` marketplace in `/plugin`. On claude.ai, use the [skill zip](https://hghezzi.github.io/Learn-Around-the-Board/downloads/lab-question-writer.zip) instead. The [Instructor Guide](https://hghezzi.github.io/Learn-Around-the-Board/guide/#generating-questions-with-claude-optional) explains how to use it.

## Privacy

The skill runs in your own Claude conversation. Everything you upload or paste is read by Claude and handled by Anthropic under your account's terms and privacy settings; Learn Around the Board never receives it.

Before you share materials:

- remove student names, IDs, grades and other personal or confidential data;
- leave out live exams and licensed test banks;
- use your institution's Claude account if it has one.

## For maintainers

The skill's files are a copy of `.claude/skills/lab-question-writer/`. Edit them there, then run `npm run sync-plugin`. The test `tests/plugin.test.js` fails while the two copies differ.

License: free for noncommercial use. The skill's instructions (`SKILL.md`, `references/`) are under CC BY-NC-SA 4.0 and its scripts under the PolyForm Noncommercial License 1.0.0; see [LICENSE](https://github.com/hghezzi/Learn-Around-the-Board/blob/main/LICENSE). Question files you make with it are yours.
