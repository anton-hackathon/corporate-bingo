/**
 * Brings every board back up to MIN_RETRO retro cells.
 *
 * Needed once, after text-only tasks were retired: seven of the ten retro
 * tasks went with them, so boards dealt before that are short. Generation
 * already guarantees the minimum for new boards.
 *
 * Only face-down cells are touched. A revealed cell is something a teammate
 * has already read, and a closed one is history; swapping either would rewrite
 * what people saw. The replacement keeps the cell's difficulty, so the board's
 * 8/10/7 mix and its line constraints are untouched and it is worth exactly
 * what it was worth.
 *
 *   npx tsx scripts/top-up-retro.mts [--dry-run]
 */
import { prisma } from "../lib/prisma";
import { MIN_RETRO } from "../lib/board";

const dry = process.argv.includes("--dry-run");

const retroTasks = await prisma.task.findMany({
  where: { active: true, retro: true },
  select: { id: true, difficulty: true },
});
const retroByDifficulty = new Map<number, number[]>();
for (const t of retroTasks) {
  retroByDifficulty.set(t.difficulty, [...(retroByDifficulty.get(t.difficulty) ?? []), t.id]);
}
console.log(`retro tasks available: ${retroTasks.length}`);

const teams = await prisma.team.findMany({ select: { id: true, name: true } });
let added = 0;
const short: string[] = [];

for (const team of teams) {
  const cells = await prisma.boardCell.findMany({
    where: { teamId: team.id },
    select: {
      id: true,
      taskId: true,
      revealedAt: true,
      closedAt: true,
      task: { select: { difficulty: true, retro: true } },
    },
  });

  let have = cells.filter((c) => c.task.retro).length;
  if (have >= MIN_RETRO) continue;

  const onBoard = new Set(cells.map((c) => c.taskId));
  // Face down only, and hardest first: a hard cell has the fewest candidates,
  // so spending the easy ones first would leave it stranded.
  const swappable = cells
    .filter((c) => !c.revealedAt && !c.closedAt && !c.task.retro)
    .sort((a, b) => b.task.difficulty - a.task.difficulty);

  for (const cell of swappable) {
    if (have >= MIN_RETRO) break;
    const pool = (retroByDifficulty.get(cell.task.difficulty) ?? []).filter((id) => !onBoard.has(id));
    if (pool.length === 0) continue;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    onBoard.delete(cell.taskId);
    onBoard.add(pick);
    have++;
    added++;
    if (!dry) await prisma.boardCell.update({ where: { id: cell.id }, data: { taskId: pick } });
  }

  if (have < MIN_RETRO) short.push(`${team.name} (${have})`);
}

console.log(`${dry ? "[dry] " : ""}cells turned into retro cells: ${added}`);
if (short.length) {
  console.log(`still short of ${MIN_RETRO}: ${short.length}`);
  for (const s of short.slice(0, 8)) console.log(`  ${s}`);
}

await prisma.$disconnect();
