import { readFileSync } from "node:fs";
import { completedLines, generateBoard, type BoardTask } from "../lib/board";
const pool: BoardTask[] = JSON.parse(readFileSync("../tasks.json", "utf8")).tasks.map(
  (t: any) => ({ id: t.id, difficulty: t.difficulty, tags: t.tags }));

type Beh = { ghost: number; base: number; spread: number; done: number[]; maxCloses: number; bonus: number };
type Cfg = { line: number; firstLine: number; blackout: number; bonusPts: number; diff: number[]; lineDecay: number };

const NOW: Cfg  = { line: 5, firstLine: 10, blackout: 25, bonusPts: 2, diff: [1,2,3], lineDecay: 1 };
const TUNED: Cfg = { line: 4, firstLine: 10, blackout: 12, bonusPts: 3, diff: [1,3,6], lineDecay: 0.7 };

function lp(n: number, base: number, decay: number) { let s = 0; for (let i = 0; i < n; i++) s += base * decay ** i; return Math.round(s); }

function evaluate(cfg: Cfg, B: Beh, teams: number, size: number, days: number, N = 800) {
  const tops: number[] = [], meds: number[] = []; let runaway = 0, ties = 0, bo = 0;
  for (let r = 0; r < N; r++) {
    const res: number[] = []; const cells: number[] = [];
    for (let t = 0; t < teams; t++) {
      const board = generateBoard(pool, { seed: (r + 1) * 7919 + t }).cells;
      const revealed = new Set<number>(), closed = new Set<number>(); let bonuses = 0;
      const dil = Array.from({ length: size }, () => Math.random() < B.ghost ? Math.random() * 0.08 : Math.random());
      for (let day = 0; day < days; day++) for (let m = 0; m < size; m++) {
        const d = dil[m];
        if (Math.random() > B.base + B.spread * d) continue;
        const hidden = [...Array(25).keys()].filter((i) => !revealed.has(i));
        if (hidden.length) revealed.add(hidden[Math.floor(Math.random() * hidden.length)]);
        let mine = 0;
        for (const pos of [...revealed].filter((i) => !closed.has(i)).sort(() => Math.random() - 0.5)) {
          if (mine >= B.maxCloses) break;
          if (Math.random() < B.done[board[pos].difficulty - 1] * d) { closed.add(pos); mine++; if (Math.random() < B.bonus) bonuses++; }
        }
      }
      const cp = [...closed].reduce((s, i) => s + cfg.diff[board[i].difficulty - 1], 0);
      const ln = completedLines(closed).length;
      res.push(cp + lp(ln, cfg.line, cfg.lineDecay) + bonuses * cfg.bonusPts + (closed.size === 25 ? cfg.blackout : 0));
      cells.push(closed.size);
      if (closed.size === 25) bo++;
    }
    res.sort((a, z) => z - a);
    tops.push(res[0]); meds.push(res[Math.floor(res.length / 2)]);
    if (res[1] > 0 && res[0] / res[1] > 1.25) runaway++;
    if (res[0] === res[1]) ties++;
  }
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  return { ratio: +(mean(tops) / mean(meds)).toFixed(2), runaway: +(runaway / N * 100).toFixed(0),
           ties: +(ties / N * 100).toFixed(1), winner: Math.round(mean(tops)), median: Math.round(mean(meds)),
           blackoutsPerRound: +(bo / N).toFixed(1) };
}

const scenarios: [string, Beh, number, number, number][] = [
  ["базовый (30×4, 10 дней)",      { ghost: .12, base: .25, spread: .7, done: [.55,.34,.17], maxCloses: 2, bonus: .15 }, 30, 4, 10],
  ["народ вялый",                   { ghost: .25, base: .15, spread: .5, done: [.40,.22,.10], maxCloses: 2, bonus: .10 }, 30, 4, 10],
  ["народ в азарте",                { ghost: .05, base: .40, spread: .55,done: [.70,.50,.30], maxCloses: 3, bonus: .25 }, 30, 4, 10],
  ["тройки (40×3)",                 { ghost: .12, base: .25, spread: .7, done: [.55,.34,.17], maxCloses: 2, bonus: .15 }, 40, 3, 10],
  ["короткий раунд (7 дней)",       { ghost: .12, base: .25, spread: .7, done: [.55,.34,.17], maxCloses: 2, bonus: .15 }, 30, 4, 7],
];

console.log("СЕЙЧАС");
console.table(Object.fromEntries(scenarios.map(([n, b, t, s, d]) => [n, evaluate(NOW, b, t, s, d)])));
console.log("\nПРЕДЛАГАЕМЫЙ БАЛАНС (клетки 1/3/6, линия 4 с затуханием 0.7, блэкаут 12, бонус 3)");
console.table(Object.fromEntries(scenarios.map(([n, b, t, s, d]) => [n, evaluate(TUNED, b, t, s, d)])));
