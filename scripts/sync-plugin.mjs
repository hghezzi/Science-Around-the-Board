#!/usr/bin/env node
// Copy the question-writer skill into the Claude Code plugin folder.
// The skill is written in .claude/skills/sab-question-writer/ (where Claude Code
// finds it when this repo is open); the plugin needs its own copy under
// plugins/sab-question-writer/skills/, because symlinks break in Windows clones.
// Run `npm run sync-plugin` after editing the skill; tests/plugin.test.js fails
// while the two differ.
import { cpSync, rmSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const SKILL = ".claude/skills/sab-question-writer";
export const PLUGIN_SKILL = "plugins/sab-question-writer/skills/sab-question-writer";
export const SKIP = (name) => name === "__pycache__" || name === ".DS_Store" || name === "evals" || name.endsWith(".pyc");

/** Relative paths of the files that belong in the skill. */
export function skillFiles(dir, base = dir) {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP(name)) return [];
    const p = join(dir, name);
    return statSync(p).isDirectory() ? skillFiles(p, base) : [p.slice(base.length + 1)];
  }).sort();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  rmSync(PLUGIN_SKILL, { recursive: true, force: true });
  cpSync(SKILL, PLUGIN_SKILL, { recursive: true, filter: (src) => !SKIP(src.split(/[\\/]/).pop()) });
  console.log(`Copied ${skillFiles(SKILL).length} files to ${PLUGIN_SKILL}`);
}
