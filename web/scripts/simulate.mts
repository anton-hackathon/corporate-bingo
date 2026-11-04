/**
 * Monte Carlo of a whole round, to see the shape of the final leaderboard.
 *
 * The game rules here are the real ones: boards come from generateBoard, lines
 * from LINES, and the score is the same formula recomputeTeam uses. What is
 * assumed is human behaviour — engagement, how often people log in, how likely
 * they are to finish a task of a given difficulty. Those assumptions are
 * collected in BEHAVIOUR so they can be varied and the result re-checked.
 */
import { readFileSync } from "node:fs";
import { LINES, completedLines, generateBoard, type BoardTask } from "../lib/board";
import { POINTS } from "../lib/scoring";

const pool: BoardTask[] = JSON.parse(readFileSync("../tasks.json", "utf8")).tasks.map(
  (t: { id: number; difficulty: number; tags: string[] }) => ({ id: t.id, difficulty: t.difficulty, tags: t.tags }),
);

export type Behaviour = {
  /** Share of people who sign up and then never really play. */
  ghostShare: number;
  /** Chance an engaged person opens the app on a given working day. */
  loginBase: number;
  loginSpread: number;
  /** Chance of finishing an open task that day, by difficulty. */
  doneByDifficulty: [number, number, number];
  /** Most cells one person will close in a single day. */
  maxClosesPerDay: number;
  /** Chance a proof collects enough outside reactions to pay the bonus. */
  bonusChance: number;
};

export const BEHAVIOUR: Behaviour = {
  ghostShare: 0.12,
  loginBase: 0.25,
  loginSpread: 0.7,
  doneByDifficulty: [0.55, 0.34, 0.17],
  maxClosesPerDay: 2,
  bonusChance: 0.15,
};

export type Rules = {
  teams: number;
  teamSize: number;
  workingDays: number;
  revealsPerDay: number;
  line: number;
  firstLine: number;
  blackout: number;
  bonusPoints: number;
};

export const RULES: Rules = {
  teams: 30,
  teamSize: 4,
  workingDays: 10,
  revealsPerDay: 1,
  line: POINTS.line,
  firstLine: POINTS.firstLine,
  blackout: POINTS.blackout,
  bonusPoints: 2,
};

type TeamResult = { points: number; cells: number; lines: number; blackout: boolean; bonuses: number; firstLineStep: number | null };

function runRound(rules: Rules, b: Behaviour, seed: number): TeamResult[] {
  const results: TeamResult[] = [];
  const firstLineSteps: (number | null)[] = [];

  for (let t = 0; t < rules.teams; t++) {
    const board = generateBoard(pool, { seed: seed * 7919 + t }).cells;
    const revealed = new Set<number>();
    const closed = new Set<number>();
    let bonuses = 0;
    let firstLineStep: number | null = null;

    // Each member gets a diligence; a few never really show up.
    const diligence = Array.from({ length: rules.teamSize }, () =>
      Math.random() < b.ghostShare ? Math.random() * 0.08 : Math.random(),
    );

    for (let day = 0; day < rules.workingDays; day++) {
      for (let m = 0; m < rules.teamSize; m++) {
        const d = diligence[m];
        if (Math.random() > b.loginBase + b.loginSpread * d) continue;

        // Reveal: the pacing control.
        for (let r = 0; r < rules.revealsPerDay; r++) {
          const hidden = [...Array(25).keys()].filter((i) => !revealed.has(i));
          if (!hidden.length) break;
          revealed.add(hidden[Math.floor(Math.random() * hidden.length)]);
        }

        // Then try to actually do some of what the team has open.
        let closesToday = 0;
        const open = [...revealed].filter((i) => !closed.has(i)).sort(() => Math.random() - 0.5);
        for (const pos of open) {
          if (closesToday >= b.maxClosesPerDay) break;
          const diff = board[pos].difficulty as 1 | 2 | 3;
          if (Math.random() < b.doneByDifficulty[diff - 1] * d) {
            closed.add(pos);
            closesToday++;
            if (Math.random() < b.bonusChance) bonuses++;
            if (firstLineStep === null && completedLines(closed).length > 0) {
              firstLineStep = day * rules.teamSize * 10 + m;
            }
          }
        }
      }
    }

    const cellPoints = [...closed].reduce((sum, i) => sum + board[i].difficulty, 0);
    const lines = completedLines(closed).length;
    const blackout = closed.size === 25;
    results.push({
      points: cellPoints + lines * rules.line + bonuses * rules.bonusPoints + (blackout ? rules.blackout : 0),
      cells: closed.size, lines, blackout, bonuses, firstLineStep,
    });
    firstLineSteps.push(firstLineStep);
  }

  // The first line of the whole round pays one team.
  let winner = -1, best = Infinity;
  firstLineSteps.forEach((s, i) => { if (s !== null && s < best) { best = s; winner = i; } });
  if (winner >= 0) results[winner].points += rules.firstLine;

  return results;
}

export function simulate(rules: Rules, b: Behaviour, rounds: number) {
  const tops: number[] = [], gaps: number[] = [], spreads: number[] = [];
  const allPoints: number[] = [];
  let tiedTop = 0, blackouts = 0, deadTeams = 0, runaway = 0;

  for (let r = 0; r < rounds; r++) {
    const res = runRound(rules, b, r + 1).sort((a, z) => z.points - a.points);
    const pts = res.map((x) => x.points);
    allPoints.push(...pts);
    tops.push(pts[0]);
    gaps.push(pts[0] - pts[1]);
    spreads.push(pts[0] - pts[pts.length - 1]);
    if (pts[0] === pts[1]) tiedTop++;
    // "Runaway": the leader is more than 25% clear of second place.
    if (pts[1] > 0 && pts[0] / pts[1] > 1.25) runaway++;
    blackouts += res.filter((x) => x.blackout).length;
    deadTeams += res.filter((x) => x.cells <= 2).length;
  }

  const q = (arr: number[], p: number) => { const s = [...arr].sort((a, z) => a - z); return s[Math.floor(s.length * p)]; };
  const mean = (arr: number[]) => arr.reduce((a, z) => a + z, 0) / arr.length;

  return {
    rounds,
    points: { min: Math.min(...allPoints), p10: q(allPoints, 0.1), median: q(allPoints, 0.5), p90: q(allPoints, 0.9), max: Math.max(...allPoints), mean: +mean(allPoints).toFixed(1) },
    winner: { mean: +mean(tops).toFixed(1), min: Math.min(...tops), max: Math.max(...tops) },
    gapToSecond: { mean: +mean(gaps).toFixed(2), median: q(gaps, 0.5), zeroPct: +(tiedTop / rounds * 100).toFixed(1) },
    spreadTopToBottom: +mean(spreads).toFixed(1),
    runawayPct: +(runaway / rounds * 100).toFixed(1),
    blackoutsPerRound: +(blackouts / rounds).toFixed(2),
    deadTeamsPerRound: +(deadTeams / rounds).toFixed(2),
  };
}

if (process.argv[1]?.endsWith("simulate.mts")) {
  const out = simulate(RULES, BEHAVIOUR, 2000);
  console.log(JSON.stringify(out, null, 2));
}
