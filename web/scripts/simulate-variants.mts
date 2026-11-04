import { readFileSync } from "node:fs";
import { completedLines, generateBoard, type BoardTask } from "../lib/board";

const pool: BoardTask[] = JSON.parse(readFileSync("../tasks.json", "utf8")).tasks.map(
  (t: any) => ({ id: t.id, difficulty: t.difficulty, tags: t.tags }));
const B = { ghost: 0.12, base: 0.25, spread: 0.7, done: [0.55, 0.34, 0.17], maxCloses: 2, bonus: 0.15 };

type Cfg = {
  name: string;
  line: number; firstLine: number; blackout: number; bonusPts: number;
  /** Множитель очков за клетку по сложности. */
  diff: [number, number, number];
  /** Каждая следующая линия приносит меньше предыдущей. */
  lineDecay: number;
  dailyCloseLimit: number;
};

function linePoints(n: number, base: number, decay: number) {
  let s = 0; for (let i = 0; i < n; i++) s += base * Math.pow(decay, i);
  return Math.round(s);
}

function round(cfg: Cfg, seed: number, teams = 30, size = 4, days = 10) {
  const res: any[] = []; const firstStep: (number | null)[] = [];
  for (let t = 0; t < teams; t++) {
    const board = generateBoard(pool, { seed: seed * 7919 + t }).cells;
    const revealed = new Set<number>(), closed = new Set<number>();
    let bonuses = 0, fs: number | null = null;
    const hist: number[] = [];
    const dil = Array.from({ length: size }, () => Math.random() < B.ghost ? Math.random() * 0.08 : Math.random());
    const score = () => {
      const cp = [...closed].reduce((s, i) => s + cfg.diff[board[i].difficulty - 1], 0);
      const ln = completedLines(closed).length;
      return cp + linePoints(ln, cfg.line, cfg.lineDecay) + bonuses * cfg.bonusPts + (closed.size === 25 ? cfg.blackout : 0);
    };
    for (let day = 0; day < days; day++) {
      let teamCloses = 0;
      for (let m = 0; m < size; m++) {
        const d = dil[m];
        if (Math.random() > B.base + B.spread * d) continue;
        const hidden = [...Array(25).keys()].filter((i) => !revealed.has(i));
        if (hidden.length) revealed.add(hidden[Math.floor(Math.random() * hidden.length)]);
        let mine = 0;
        for (const pos of [...revealed].filter((i) => !closed.has(i)).sort(() => Math.random() - 0.5)) {
          if (mine >= B.maxCloses) break;
          if (cfg.dailyCloseLimit > 0 && teamCloses >= cfg.dailyCloseLimit) break;
          if (Math.random() < B.done[board[pos].difficulty - 1] * d) {
            closed.add(pos); mine++; teamCloses++;
            if (Math.random() < B.bonus) bonuses++;
            if (fs === null && completedLines(closed).length > 0) fs = day * 100 + m;
          }
        }
      }
      hist.push(score());
    }
    res.push({ points: score(), cells: closed.size, hist }); firstStep.push(fs);
  }
  let w = -1, best = Infinity;
  firstStep.forEach((s, i) => { if (s !== null && s < best) { best = s; w = i; } });
  if (w >= 0) res[w].points += cfg.firstLine;
  return res;
}

function evaluate(cfg: Cfg, N = 1200) {
  const tops: number[] = [], meds: number[] = [], ratios: number[] = [];
  let ties = 0, runaway = 0, changes = 0, contenders = 0, winnerCells = 0, medCells = 0;
  for (let r = 0; r < N; r++) {
    const res = round(cfg, r + 1);
    const sorted = [...res].sort((a, z) => z.points - a.points);
    tops.push(sorted[0].points); meds.push(sorted[Math.floor(sorted.length / 2)].points);
    ratios.push(sorted[0].points / Math.max(1, sorted[Math.floor(sorted.length / 2)].points));
    if (sorted[0].points === sorted[1].points) ties++;
    if (sorted[1].points > 0 && sorted[0].points / sorted[1].points > 1.25) runaway++;
    winnerCells += sorted[0].cells; medCells += sorted[Math.floor(sorted.length / 2)].cells;
    // Сколько команд на 7-й день были в пределах 20% от лидера
    const d7 = res.map((x) => x.hist[6]); const lead7 = Math.max(...d7);
    contenders += d7.filter((p) => lead7 > 0 && p >= lead7 * 0.8).length;
    let prev = -1; for (let d = 0; d < 10; d++) {
      let bi = 0; for (let i = 1; i < res.length; i++) if (res[i].hist[d] > res[bi].hist[d]) bi = i;
      if (bi !== prev) { changes++; prev = bi; }
    }
  }
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  return {
    name: cfg.name,
    winner: Math.round(mean(tops)),
    median: Math.round(mean(meds)),
    "победитель/средняя": +mean(ratios).toFixed(2),
    "отрыв >25%": `${(runaway / N * 100).toFixed(0)}%`,
    "ничья наверху": `${(ties / N * 100).toFixed(1)}%`,
    "смен лидера": +(changes / N).toFixed(1),
    "в игре на 7-й день": +(contenders / N).toFixed(1),
    "клеток: поб/сред": `${Math.round(winnerCells / N)}/${Math.round(medCells / N)}`,
  };
}

const configs: Cfg[] = [
  { name: "как сейчас",            line: 5,  firstLine: 10, blackout: 25, bonusPts: 2, diff: [1,2,3], lineDecay: 1,    dailyCloseLimit: 0 },
  { name: "линии дешевле (3)",     line: 3,  firstLine: 10, blackout: 10, bonusPts: 2, diff: [1,2,3], lineDecay: 1,    dailyCloseLimit: 0 },
  { name: "затухание линий",       line: 6,  firstLine: 10, blackout: 10, bonusPts: 2, diff: [1,2,3], lineDecay: 0.65, dailyCloseLimit: 0 },
  { name: "дороже сложные клетки", line: 4,  firstLine: 10, blackout: 12, bonusPts: 3, diff: [1,3,6], lineDecay: 0.7,  dailyCloseLimit: 0 },
  { name: "+ лимит 3 клетки/день", line: 5,  firstLine: 10, blackout: 25, bonusPts: 2, diff: [1,2,3], lineDecay: 1,    dailyCloseLimit: 3 },
];

console.table(configs.map((c) => evaluate(c)));
