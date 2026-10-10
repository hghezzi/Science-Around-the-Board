#!/usr/bin/env node
// Zip the LAB question-writer skill so instructors can upload it to Claude.
// Output: public/downloads/lab-question-writer.zip (served with the site; not committed).
// Runs automatically before `npm run build`.
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { deflateRawSync } from "node:zlib";

const SKILL = ".claude/skills/lab-question-writer";
const OUT_DIR = "public/downloads";
const OUT = join(OUT_DIR, "lab-question-writer.zip");
const SKIP = new Set(["__pycache__", ".DS_Store", "evals"]);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name) || name.endsWith(".pyc")) return [];
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(SKILL).sort();
const local = [];
const central = [];
let offset = 0;
for (const file of files) {
  // Archive paths start with the skill folder name, e.g. lab-question-writer/SKILL.md
  const name = Buffer.from(["lab-question-writer", ...relative(SKILL, file).split(sep)].join("/"));
  const data = readFileSync(file);
  const comp = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6);
  head.writeUInt16LE(8, 8); head.writeUInt32LE(0, 10); // method deflate, time/date 0 (reproducible)
  head.writeUInt32LE(crc, 14); head.writeUInt32LE(comp.length, 18); head.writeUInt32LE(data.length, 22);
  head.writeUInt16LE(name.length, 26); head.writeUInt16LE(0, 28);
  local.push(head, name, comp);
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8);
  cen.writeUInt16LE(8, 10); cen.writeUInt32LE(0, 12); cen.writeUInt32LE(crc, 16);
  cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(name.length, 28);
  cen.writeUInt32LE(offset, 42);
  central.push(cen, name);
  offset += head.length + name.length + comp.length;
}
const cenBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(offset, 16);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, Buffer.concat([...local, cenBuf, end]));
console.log(`Packaged ${files.length} files into ${OUT}`);
