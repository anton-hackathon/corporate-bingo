/**
 * Dev helper: re-arm a board so the flip animation can be tried again.
 *
 * Reveals are capped per person per day, and a cell stays face-up once it is
 * turned, so after a round of testing there is nothing left to flip. This
 * backdates today's reveals (the cells stay as they are — only the daily
 * counter resets), turns any face-up-but-unclosed cell back over, and lifts
 * the per-day cap for the round.
 *
 *   npx tsx scripts/flip-test.mts <email> [revealsPerDay]
 *
 * Put the cap back with the same script: `... <email> 1`.
 */
import { prisma } from "../lib/prisma";

const email = process.argv[2];
const perDay = Number(process.argv[3] ?? 8);
if (!email) throw new Error("usage: tsx scripts/flip-test.mts <email> [revealsPerDay]");

const user = await prisma.user.findFirst({ where: { email } });
if (!user) throw new Error(`no user with email ${email}`);

const member = await prisma.teamMember.findFirst({
  where: { userId: user.id, team: { round: { status: { in: ["SIGNUP", "ACTIVE"] } } } },
  include: { team: { include: { round: true } } },
});
if (!member) throw new Error(`${user.name} is not on a team in a live round`);
const { team } = member;

const since = new Date();
since.setHours(0, 0, 0, 0);
const yesterday = new Date(since.getTime() - 12 * 3600 * 1000);

// Reveals used today → moved to yesterday. The cells keep their state; only
// the "one a day" counter is what we are resetting.
const used = await prisma.boardCell.updateMany({
  where: { teamId: team.id, revealedById: user.id, revealedAt: { gte: since } },
  data: { revealedAt: yesterday },
});

// Face-up but nothing posted on it yet → safe to turn back over.
const reset = await prisma.boardCell.updateMany({
  where: { teamId: team.id, revealedAt: { not: null }, closedAt: null },
  data: { revealedAt: null, revealedById: null },
});

await prisma.round.update({ where: { id: team.roundId }, data: { revealsPerDay: perDay } });

const cells = await prisma.boardCell.findMany({ where: { teamId: team.id } });
console.log(`${user.name} · ${team.name} (${team.round.title})`);
console.log(`  daily counter reset: ${used.count} reveal(s) backdated`);
console.log(`  turned back over:    ${reset.count}`);
console.log(`  face-down to flip:   ${cells.filter((c) => !c.revealedAt).length}`);
console.log(`  reveals per day:     ${perDay}`);

await prisma.$disconnect();
