/**
 * Takes text-only tasks out of a running round.
 *
 * The feed is a wall of photographs and a paragraph of prose sits in it like a
 * broken image, so these tasks go. That is not a config change: boards already
 * hold them and people have already closed some, which means this has to
 *
 *   1. take the text proofs out of the feed,
 *   2. put a same-difficulty photo task in each cell that held a text one, so
 *      every board keeps the 8/10/7 mix its score was built on,
 *   3. stop the tasks being dealt again,
 *   4. recompute every team, because points move when a proof goes.
 *
 * Same difficulty is the whole trick: the line constraints (every line needs a
 * hard task and nine points) survive untouched, and a board is worth exactly
 * what it was worth before.
 *
 *   npx tsx scripts/drop-text-tasks.mts [--dry-run]
 */
import { prisma } from "../lib/prisma";
import { recomputeTeam } from "../lib/scoring";

const dry = process.argv.includes("--dry-run");
const say = (s: string) => console.log(dry ? `[dry] ${s}` : s);

const textTasks = await prisma.task.findMany({ where: { proof: "TEXT" }, select: { id: true } });
const textIds = new Set(textTasks.map((t) => t.id));
say(`text tasks: ${textIds.size}`);
if (textIds.size === 0) process.exit(0);

// 1 — the proofs. Text proofs carry no image, so there is no file to remove.
const doomed = await prisma.proof.findMany({
  where: { kind: "TEXT", revokedAt: null },
  select: { id: true, cellId: true, teamId: true },
});
say(`live text proofs: ${doomed.length}`);
if (!dry && doomed.length) {
  await prisma.proof.updateMany({
    where: { id: { in: doomed.map((p) => p.id) } },
    data: { revokedAt: new Date(), revokeReason: "text proofs retired" },
  });
}

// 2 — reopen any cell left with no surviving proof.
const cellIds = [...new Set(doomed.map((p) => p.cellId).filter((c): c is string => Boolean(c)))];
let reopened = 0;
for (const cellId of cellIds) {
  const alive = await prisma.proof.count({ where: { cellId, revokedAt: null } });
  if (alive > 0) continue;
  reopened++;
  if (!dry) {
    await prisma.boardCell.update({
      where: { id: cellId },
      data: { closedAt: null, closedById: null },
    });
  }
}
say(`cells reopened: ${reopened}`);

// 3 — swap every text cell for a replacement of the same difficulty that the
// board does not already hold.
const replacements = await prisma.task.findMany({
  where: { active: true, proof: { not: "TEXT" } },
  select: { id: true, difficulty: true },
});
const byDifficulty = new Map<number, number[]>();
for (const t of replacements) {
  byDifficulty.set(t.difficulty, [...(byDifficulty.get(t.difficulty) ?? []), t.id]);
}

const teams = await prisma.team.findMany({ select: { id: true, name: true } });
let swapped = 0;
const stuck: string[] = [];

for (const team of teams) {
  const cells = await prisma.boardCell.findMany({
    where: { teamId: team.id },
    select: { id: true, taskId: true, task: { select: { difficulty: true, proof: true } } },
  });
  const onBoard = new Set(cells.map((c) => c.taskId));

  for (const cell of cells) {
    if (cell.task.proof !== "TEXT") continue;
    const pool = (byDifficulty.get(cell.task.difficulty) ?? []).filter((id) => !onBoard.has(id));
    if (pool.length === 0) {
      stuck.push(`${team.name} (difficulty ${cell.task.difficulty})`);
      continue;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    onBoard.delete(cell.taskId);
    onBoard.add(pick);
    swapped++;
    if (!dry) await prisma.boardCell.update({ where: { id: cell.id }, data: { taskId: pick } });
  }
}
say(`cells re-tasked: ${swapped}`);
if (stuck.length) {
  console.log(`  no replacement left for ${stuck.length} cell(s):`);
  for (const s of [...new Set(stuck)].slice(0, 10)) console.log(`    ${s}`);
}

// 4 — stop dealing them.
if (!dry) {
  await prisma.task.updateMany({ where: { id: { in: [...textIds] } }, data: { active: false } });
}
say(`tasks switched off: ${textIds.size}`);

// 5 — scores, now that cells and proofs have moved.
if (!dry) {
  for (const team of teams) await recomputeTeam(prisma, team.id);
}
say(`teams recomputed: ${teams.length}`);

await prisma.$disconnect();
