/**
 * Optional mechanics, weighed against the two failure modes the baseline
 * simulation found: a runaway leader when engagement is low, and everyone
 * hitting the ceiling when it is high. The question for each mechanic is not
 * "is it fun" but "who does it reward" — several plausible ones quietly make
 * the leader stronger.
 */
import { readFileSync } from "node:fs";
import { completedLines, generateBoard, type BoardTask } from "../lib/board";
const pool: BoardTask[] = JSON.parse(readFileSync("../tasks.json", "utf8")).tasks.map(
  (t: any) => ({ id: t.id, difficulty: t.difficulty, tags: t.tags }));
const lp = (n: number, b: number, d: number) => { let s = 0; for (let i = 0; i < n; i++) s += b * d ** i; return Math.round(s); };
const DIFF = [1, 3, 6], LINE = 4, DECAY = 0.7, BLACKOUT = 12, FIRST = 10;

function reactionsFor() {
  const r = Math.random();
  if (r < 0.45) return Math.floor(Math.random() * 3);
  if (r < 0.85) return 3 + Math.floor(Math.random() * 7);
  return 10 + Math.floor(Math.random() * 35);
}
const bonusOf = (rs: number[]) => rs.reduce((s, r) => s + Math.min(5, Math.floor(r / 4)), 0);

type Mech = {
  name: string;
  /** Reveals allowed per person on a given day. */
  reveals?: (day: number) => number;
  /** Points multiplier on a cell closed on a given day. */
  cellMult?: (day: number, difficulty: number) => number;
  /** Points for the single best photo of each day. */
  photoOfDay?: number;
  /** Points for closing at least one cell every day so far. */
  streakPerDay?: number;
  /** One-off bonus once every member has closed at least one cell. */
  everyoneBonus?: number;
  /** Multiplier on the final day. */
  finaleMult?: number;
};

const MECHS: Mech[] = [
  { name: "без добавок" },
  { name: "фото дня: +3 одной команде", photoOfDay: 3 },
  { name: "фото дня: +8 одной команде", photoOfDay: 8 },
  { name: "ускорение: 1→2 раскрытия со дня 6", reveals: (d) => (d < 5 ? 1 : 2) },
  { name: "ускорение: 1→2→3", reveals: (d) => (d < 4 ? 1 : d < 8 ? 2 : 3) },
  { name: "неделя 2: сложные ×2", cellMult: (d, diff) => (d >= 5 && diff === 3 ? 2 : 1) },
  { name: "серия: +2 за каждый день подряд", streakPerDay: 2 },
  { name: "все участники отметились: +10", everyoneBonus: 10 },
  { name: "последний день: всё ×2", finaleMult: 2 },
];

type Beh = { ghost: number; base: number; spread: number; done: number[]; maxCloses: number };
const BASE: Beh = { ghost: .12, base: .25, spread: .7, done: [.55, .34, .17], maxCloses: 2 };

function evaluate(m: Mech, B: Beh, N = 1000, teams = 30, size = 4, days = 10) {
  const tops: number[] = [], meds: number[] = [];
  let runaway = 0, ties = 0, contenders = 0, blackouts = 0, changes = 0;

  for (let r = 0; r < N; r++) {
    const state = Array.from({ length: teams }, (_, t) => ({
      board: generateBoard(pool, { seed: (r + 1) * 7919 + t }).cells,
      revealed: new Set<number>(), closed: new Set<number>(),
      reactions: [] as number[], cellPts: 0, extra: 0, streak: 0, alive: true,
      byMember: new Set<number>(), everyonePaid: false,
      firstLine: null as number | null,
      dil: Array.from({ length: size }, () => Math.random() < B.ghost ? Math.random() * 0.08 : Math.random()),
      hist: [] as number[],
    }));

    const score = (s: typeof state[0]) =>
      s.cellPts + lp(completedLines(s.closed).length, LINE, DECAY) + bonusOf(s.reactions) +
      (s.closed.size === 25 ? BLACKOUT : 0) + s.extra;

    let tick = 0;
    for (let day = 0; day < days; day++) {
      const dayBest = { team: -1, reactions: -1 };
      for (const [ti, s] of state.entries()) {
        let closedToday = 0;
        for (let mi = 0; mi < size; mi++) {
          tick++;
          const d = s.dil[mi];
          if (Math.random() > B.base + B.spread * d) continue;
          const allowed = m.reveals ? m.reveals(day) : 1;
          for (let k = 0; k < allowed; k++) {
            const hidden = [...Array(25).keys()].filter((i) => !s.revealed.has(i));
            if (!hidden.length) break;
            s.revealed.add(hidden[Math.floor(Math.random() * hidden.length)]);
          }
          let mine = 0;
          for (const pos of [...s.revealed].filter((i) => !s.closed.has(i)).sort(() => Math.random() - 0.5)) {
            if (mine >= B.maxCloses) break;
            const diff = s.board[pos].difficulty;
            if (Math.random() < B.done[diff - 1] * d) {
              s.closed.add(pos); mine++; closedToday++;
              const finale = m.finaleMult && day === days - 1 ? m.finaleMult : 1;
              s.cellPts += DIFF[diff - 1] * (m.cellMult ? m.cellMult(day, diff) : 1) * finale;
              s.byMember.add(mi);
              if (m.everyoneBonus && !s.everyonePaid && s.byMember.size === size) {
                s.extra += m.everyoneBonus; s.everyonePaid = true;
              }
              const rx = reactionsFor(); s.reactions.push(rx);
              if (rx > dayBest.reactions) { dayBest.reactions = rx; dayBest.team = ti; }
              if (s.firstLine === null && completedLines(s.closed).length > 0) s.firstLine = tick;
            }
          }
        }
        if (m.streakPerDay) {
          if (closedToday > 0 && s.alive) { s.streak++; s.extra += m.streakPerDay; }
          else if (closedToday === 0) s.alive = false;
        }
      }
      if (m.photoOfDay && dayBest.team >= 0) state[dayBest.team].extra += m.photoOfDay;
      state.forEach((s) => s.hist.push(score(s)));
    }

    const pts = state.map(score);
    let w = -1, best = Infinity;
    state.forEach((s, i) => { if (s.firstLine !== null && s.firstLine < best) { best = s.firstLine; w = i; } });
    if (w >= 0) pts[w] += FIRST;

    const sorted = [...pts].sort((a, z) => z - a);
    tops.push(sorted[0]); meds.push(sorted[Math.floor(sorted.length / 2)]);
    if (sorted[1] > 0 && sorted[0] / sorted[1] > 1.25) runaway++;
    if (sorted[0] === sorted[1]) ties++;
    blackouts += state.filter((s) => s.closed.size === 25).length;
    const d7 = state.map((s) => s.hist[6]); const lead = Math.max(...d7);
    contenders += d7.filter((p) => lead > 0 && p >= lead * 0.8).length;
    let prev = -1;
    for (let d = 0; d < days; d++) {
      let bi = 0; for (let i = 1; i < teams; i++) if (state[i].hist[d] > state[bi].hist[d]) bi = i;
      if (bi !== prev) { changes++; prev = bi; }
    }
  }
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  return {
    "поб/сред": +(mean(tops) / mean(meds)).toFixed(2),
    "отрыв>25%": `${(runaway / N * 100).toFixed(0)}%`,
    "ничья": `${(ties / N * 100).toFixed(0)}%`,
    "победитель": Math.round(mean(tops)),
    "средняя": Math.round(mean(meds)),
    "в игре на 7-й": +(contenders / N).toFixed(1),
    "полных полей": +(blackouts / N).toFixed(1),
    "смен лидера": +(changes / N).toFixed(1),
  };
}

const SCEN: [string, Beh][] = [
  ["вялый",    { ghost: .25, base: .15, spread: .5, done: [.40, .22, .10], maxCloses: 2 }],
  ["базовый",  BASE],
];

const PICK = MECHS.filter((m) => ["без добавок", "все участники отметились: +10", "последний день: всё ×2", "ускорение: 1→2→3"].includes(m.name));

for (const [sname, beh] of SCEN) {
  console.log(`\n=== сценарий: ${sname} ===`);
  console.table(Object.fromEntries(PICK.map((m) => [m.name, evaluate(m, beh, 700)])));
}
