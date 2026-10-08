// The Claude Code plugin ships its own copy of the question-writer skill
// (plugins/sab-question-writer/skills/). It must match the skill in .claude/skills/.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SKILL, PLUGIN_SKILL, skillFiles } from "../scripts/sync-plugin.mjs";

describe("Claude Code plugin", () => {
  it("ships the same skill files as .claude/skills (run `npm run sync-plugin` after editing the skill)", () => {
    const files = skillFiles(SKILL);
    expect(skillFiles(PLUGIN_SKILL)).toEqual(files);
    for (const f of files) expect(readFileSync(join(PLUGIN_SKILL, f), "utf8"), f).toBe(readFileSync(join(SKILL, f), "utf8"));
  });

  it("is listed in the marketplace with a matching name", () => {
    const market = JSON.parse(readFileSync(".claude-plugin/marketplace.json", "utf8"));
    const plugin = JSON.parse(readFileSync("plugins/sab-question-writer/.claude-plugin/plugin.json", "utf8"));
    const entry = market.plugins.find((p) => p.name === plugin.name);
    expect(entry?.source).toBe("./plugins/sab-question-writer");
    expect(readFileSync(join(PLUGIN_SKILL, "SKILL.md"), "utf8")).toMatch(/^---\nname: sab-question-writer\n/);
  });
});
