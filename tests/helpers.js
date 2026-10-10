import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const DEMO_TSV = readFileSync(
  fileURLToPath(new URL("../public/examples/16S_QIIME2_demo.tsv", import.meta.url)),
  "utf8"
);

export const HEADER = "id\tquestion\toption1\toption2\toption3\toption4\tcorrectIndex\texplanation\tbigTopic\tmodule\ttheme\tsubtheme\ttype\timageFile";

/** Build a minimal valid question file: 4 themes x 2 subthemes, 6 milestone Qs each. */
export function makeTsv({ themes = ["T1", "T2", "T3", "T4"], extra = [] } = {}) {
  const lines = [HEADER];
  let n = 0;
  const q = (type, theme, sub) =>
    lines.push([`q${n++}`, `Question ${n}?`, "A", "B", "C", "D", "1", "Because A.", "Topic", "Mod", theme, sub, type, ""].join("\t"));
  themes.forEach((t) => {
    q("property", t, `${t}-a`);
    q("property", t, `${t}-b`);
    for (let i = 0; i < 6; i++) q("milestone", t, `${t}-a`);
  });
  q("core", "Core", "Core Lab");
  for (let i = 0; i < 10; i++) q("survey", "", "");
  q("confidence", "", "");
  lines.push(["m1", "Grant! (+$100)", "", "", "", "", "", "Fun fact.", "Topic", "Mod", "", "", "mishap", ""].join("\t"));
  return [...lines, ...extra].join("\n");
}
