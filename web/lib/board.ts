/**
 * Board generation.
 *
 * The board is always 5×5. A larger board does not make the game longer —
 * a line is always one side of the board, so a bigger board just offers more
 * ways to complete one. Difficulty comes from the layout instead: every line
 * must hold at least one hard task and reach a minimum total difficulty.
 * Without that constraint a board almost always contains a line of five easy
 * cells, and the game is over on the first evening.
 */

/** The one supported board size. */
export const BOARD_SIZE = 5;
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
/** Centre of a 5×5 board: the same task for every team in the round. */
export const CENTER_INDEX = 12;
/** Minimum total difficulty of a line: roughly 1.8 points per cell. */
export const MIN_LINE_SUM = 9;

/** How many cells on a board should be satisfiable by something already done. */
export const MIN_RETRO = 3;

export type BoardTask = {
  id: number;
  difficulty: number;
  tags: string[];
  retro?: boolean;
};

/** The 12 lines of a 5×5 board: 5 rows, 5 columns, 2 diagonals. */
export const LINES: readonly (readonly number[])[] = (() => {
  const lines: number[][] = [];
  const range = [0, 1, 2, 3, 4];
  for (const r of range) lines.push(range.map((c) => r * BOARD_SIZE + c));
  for (const c of range) lines.push(range.map((r) => r * BOARD_SIZE + c));
  lines.push(range.map((i) => i * BOARD_SIZE + i));
  lines.push(range.map((i) => i * BOARD_SIZE + (BOARD_SIZE - 1 - i)));
  return lines;
})();

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(arr: T[], rnd: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Keeps only the tasks a team can physically carry out.
 * The office tag requires at least one team member who works from an office.
 */
export function eligibleTasks<T extends BoardTask>(
  pool: T[],
  opts: { hasOfficeMember: boolean },
): T[] {
  return pool.filter((t) => {
    if (t.tags.includes("office") && !opts.hasOfficeMember) return false;
    return true;
  });
}

export class BoardGenerationError extends Error {}

export type GeneratedBoard<T extends BoardTask> = {
  cells: T[];
  balanced: boolean; // whether the per-line constraint was satisfied
  retro: number; // how many cells can be closed with something already done
  attempts: number;
};

/**
 * Swaps a few retro tasks onto the board, trading each one for a task of the
 * same difficulty. Same difficulty on purpose: every board in a round holds
 * the same mix, which is what makes two boards worth the same, and a day-one
 * head start must not cost a team points.
 */
function ensureRetro<T extends BoardTask>(
  picked: T[],
  available: T[],
  used: Set<number>,
  rnd: () => number,
): number {
  let have = picked.filter((t) => t.retro).length;
  if (have >= MIN_RETRO) return have;

  for (const cand of shuffled(available.filter((t) => t.retro && !used.has(t.id)), rnd)) {
    if (have >= MIN_RETRO) break;
    const i = picked.findIndex((t) => !t.retro && t.difficulty === cand.difficulty);
    if (i === -1) continue; // no room at that difficulty; try the next candidate
    used.delete(picked[i].id);
    picked[i] = cand;
    used.add(cand.id);
    have++;
  }
  return have;
}

/**
 * Builds a board from the pool. The center cell is pinned when supplied:
 * it is the same task for every team in the round.
 */
export function generateBoard<T extends BoardTask>(
  pool: T[],
  opts: { centerTask?: T | null; seed: number; maxAttempts?: number },
): GeneratedBoard<T> {
  const { centerTask = null, seed } = opts;
  const maxAttempts = opts.maxAttempts ?? 4000;
  const fixedCenter = centerTask ?? null;
  const needed = CELL_COUNT - (fixedCenter ? 1 : 0);

  const available = pool.filter((t) => !fixedCenter || t.id !== fixedCenter.id);
  if (available.length < needed) {
    throw new BoardGenerationError(
      `Only ${available.length} suitable tasks are available, but a ${BOARD_SIZE}×${BOARD_SIZE} board needs ${needed}. Enable more tasks.`,
    );
  }

  const rnd = mulberry32(seed);

  // Target mix: roughly a third easy, a quarter hard, the rest medium.
  const want = {
    1: Math.floor(needed * 0.33),
    3: Math.ceil(needed * 0.25) - (fixedCenter?.difficulty === 3 ? 1 : 0),
    2: 0,
  };
  want[2] = needed - want[1] - want[3];

  const byDiff = new Map<number, T[]>([
    [1, shuffled(available.filter((t) => t.difficulty === 1), rnd)],
    [2, shuffled(available.filter((t) => t.difficulty === 2), rnd)],
    [3, shuffled(available.filter((t) => t.difficulty === 3), rnd)],
  ]);

  const picked: T[] = [];
  const used = new Set<number>();
  for (const d of [3, 2, 1]) {
    for (const t of byDiff.get(d) ?? []) {
      if (picked.filter((p) => p.difficulty === d).length >= Math.max(0, want[d as 1 | 2 | 3])) break;
      picked.push(t);
      used.add(t.id);
    }
  }
  // If some difficulty ran short, top the board up with whatever is left.
  for (const t of shuffled(available, rnd)) {
    if (picked.length >= needed) break;
    if (!used.has(t.id)) {
      picked.push(t);
      used.add(t.id);
    }
  }

  const retro = ensureRetro(picked, available, used, rnd);

  const threshold = MIN_LINE_SUM;

  let best: T[] | null = null;
  let bestScore = -Infinity;
  let attempts = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    attempts = attempt + 1;
    const rest = shuffled(picked, rnd);
    const grid: T[] = [];
    let k = 0;
    for (let i = 0; i < CELL_COUNT; i++) {
      if (fixedCenter && i === CENTER_INDEX) grid.push(fixedCenter);
      else grid.push(rest[k++]);
    }

    let ok = true;
    let score = 0;
    for (const line of LINES) {
      const hard = line.filter((i) => grid[i].difficulty === 3).length;
      const sum = line.reduce((s, i) => s + grid[i].difficulty, 0);
      if (hard < 1 || sum < threshold) ok = false;
      score += Math.min(hard, 1) * 12 + sum;
    }
    if (ok) return { cells: grid, balanced: true, retro, attempts };
    if (score > bestScore) {
      bestScore = score;
      best = grid;
    }
  }

  // The constraint was never met: return the best layout found and say so,
  // so the caller can warn whoever generated the board.
  return { cells: best!, balanced: false, retro, attempts };
}

/** Indices of the lines whose cells are all closed. */
export function completedLines(closed: Set<number>): readonly (readonly number[])[] {
  return LINES.filter((line) => line.every((i) => closed.has(i)));
}
