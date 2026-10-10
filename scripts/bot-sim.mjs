#!/usr/bin/env node
// Monte Carlo of a solo game against the bot, with the real rules (gameRules.js) and
// the bot's real choices (bot.js). Prints how often a student who answers a given
// share of questions right beats each bot level. Used to size BOT_LEVELS.
// Run: node scripts/bot-sim.mjs   (GAMES=4000 ROUNDS=21,32,42 to change)
import { readFileSync } from "node:fs";
import { parseTsv } from "../src/tsvParser.js";
import { buildBoardFromTsv } from "../src/gameData.js";
import * as R from "../src/gameRules.js";
import * as B from "../src/bot.js";

const rows = parseTsv(readFileSync(new URL("../public/SAB_questions_Jan22_Filtered.tsv", import.meta.url), "utf8"));
const base = buildBoardFromTsv("16S", rows, "QIIME2");
const MISHAPS = [100, 100, 150, -100, -100, -100, -150, -50];
const GAMES = Number(process.env.GAMES || 4000);
// Rounds (one student turn + one bot turn) per session: about 85 s a round.
const ROUNDS = (process.env.ROUNDS || "21,32,42").split(",").map(Number);
const exam = (p) => p ** 6 + 6 * p ** 5 * (1 - p); // 5 of 6, the exam stops on the 2nd mistake
const rescue = (p) => p ** 3 + 3 * p * p * (1 - p);

function play(pStudent, level, rounds) {
  let board = base.map((t) => ({ ...t }));
  const start = R.startingMoney(2);
  const pl = [0, 1].map((id) => ({ id, money: start, pos: 0, chaosTokens: 0, rescueUsed: false, eliminated: false }));
  const acc = [pStudent, B.botAccuracy(level)];
  const isBot = (p) => p.id === 1;
  const reserve = (p) => (isBot(p) ? B.BOT_RESERVE : 0);
  for (let k = 0; k < rounds * 2; k++) {
    const p = pl[k % 2];
    if (p.eliminated) continue;
    const right = () => Math.random() < acc[p.id];
    // Before rolling: upgrades, then a chaos challenge (which ends the turn).
    // The student upgrades a little more boldly (keeps $150 instead of the bot's $300).
    const budget = () => (isBot(p) ? p.money : p.money + 150);
    for (let u = B.upgradeChoice(board, p.id, budget()); u; u = B.upgradeChoice(board, p.id, budget())) {
      p.money -= u.cost; board = R.applyUpgrade(board, u.tile, p.id, u.level);
    }
    const target = B.chaosChoice(board, p);
    if (target) {
      p.chaosTokens--;
      if (right()) { const c = R.chaosStealCost(target); p.money -= c; pl[target.owner].money += c; board = R.acquireTile(board, target, p.id, c); }
      else p.money -= R.chaosFailPenalty(target);
      continue;
    }
    const roll = 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6);
    const np = (p.pos + roll) % 36;
    if (np < p.pos || np === 0) p.money += R.ECONOMY.lapBonus;
    p.pos = np;
    const t = board[np];
    if (t.type === "property" || t.type === "sequencing_core") {
      if (t.owner == null) {
        if (right()) { if (p.money - t.price >= reserve(p)) { p.money -= t.price; board = R.acquireTile(board, t, p.id, t.price); } }
        else p.money -= R.ECONOMY.wrongAnswerPenalty;
      } else if (t.owner !== p.id) {
        let rent = R.computeRent(board, t); if (right()) rent = Math.floor(rent / 2);
        p.money -= rent; pl[t.owner].money += rent;
      }
    } else if (t.type === "milestone") {
      if (t.owner == null) {
        if (p.money - t.price >= reserve(p) && Math.random() < exam(acc[p.id])) { p.money -= t.price; board = R.acquireTile(board, t, p.id, t.price); p.chaosTokens++; }
      } else if (t.owner !== p.id) {
        const fee = Math.random() < exam(acc[p.id]) ? Math.floor(t.baseRent / 2) : t.baseRent;
        p.money -= fee; pl[t.owner].money += fee;
      }
    } else if (t.type === "chance") p.money += MISHAPS[Math.floor(Math.random() * MISHAPS.length)];
    if (p.money < 0) {
      const a = R.bankruptcyAction(p, board);
      if (a === "liquidate") {
        while (p.money < 0) {
          const x = B.liquidationChoice(board, p.id);
          const r = x.level > 0 ? R.downgradeSubgroup(board, x, p.id) : R.sellDeed(board, x);
          board = r.board; p.money += r.refund ?? r.value;
        }
      } else if (a === "rescue" && Math.random() < rescue(acc[p.id])) { p.rescueUsed = true; p.money = R.ECONOMY.rescueBonus; }
      else { p.eliminated = true; board = R.releaseTiles(board, p.id); }
    }
    if (pl.some((q) => q.eliminated)) break;
  }
  if (pl[1].eliminated) return 1;
  if (pl[0].eliminated) return 0;
  const [s, b] = pl.map((q) => R.netWorth(q, board));
  return s === b ? 0.5 : s > b ? 1 : 0;
}

console.log(`Student win rate against each bot level (${GAMES} games each; rounds = student turns per game)`);
console.log(`level   (bot right)  rounds   student 50%   60%    70%    80%    90%`);
for (const level of B.BOT_LEVEL_IDS) {
  for (const rounds of ROUNDS) {
    const cells = [0.5, 0.6, 0.7, 0.8, 0.9].map((p) => {
      let w = 0;
      for (let g = 0; g < GAMES; g++) w += play(p, level, rounds);
      return `${Math.round((100 * w) / GAMES)}%`.padStart(6);
    });
    console.log(`${level.padEnd(7)} ${String(Math.round(100 * B.botAccuracy(level))).padStart(5)}%      ${String(rounds).padStart(4)}    ${cells.join(" ")}`);
  }
}
