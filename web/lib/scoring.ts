import type { Prisma, PrismaClient } from "@prisma/client";
import { CELL_COUNT, completedLines } from "./board";

/**
 * The defaults a new round starts with. The live values are on the round
 * itself (pointsLine, pointsFirstLine, pointsBlackout) because HR can move
 * them; read them from there, not from here.
 */
export const POINTS = {
  /** for every completed line */
  line: 5,
  /** to the first team in the round to complete a line */
  firstLine: 10,
  /** for closing the entire board */
  blackout: 25,
};

type Tx = PrismaClient | Prisma.TransactionClient;

export type TeamScore = {
  points: number;
  cellsDone: number;
  linesDone: number;
  blackout: boolean;
  cellPoints: number;
  linePoints: number;
  firstLineBonus: number;
  reactionBonus: number;
};

/**
 * Recomputes a team's score from scratch against the current board.
 * Called after any change: a cell closed, a proof revoked, a reaction
 * bonus awarded.
 */
export async function recomputeTeam(tx: Tx, teamId: string): Promise<TeamScore> {
  const team = await tx.team.findUniqueOrThrow({
    where: { id: teamId },
    include: { round: true },
  });

  const cells = await tx.boardCell.findMany({
    where: { teamId },
    select: { pos: true, closedAt: true, task: { select: { difficulty: true } } },
  });

  const closed = new Set(cells.filter((c) => c.closedAt).map((c) => c.pos));
  const lines = completedLines(closed);

  const cellPoints = cells
    .filter((c) => c.closedAt)
    .reduce((sum, c) => sum + c.task.difficulty, 0);
  const linePoints = lines.length * team.round.pointsLine;
  const blackout = closed.size === CELL_COUNT;

  // Reaction bonus: each proof that reaches the threshold pays out once.
  const bonusProofs = await tx.proof.count({
    where: { teamId, revokedAt: null, bonusAwardedAt: { not: null } },
  });
  const reactionBonus = bonusProofs * team.round.reactionBonusPoints;

  const firstLineAt = lines.length > 0 ? (team.firstLineAt ?? new Date()) : null;

  // The first-line bonus goes to a single team in the round.
  // updateMany guarded by firstLineTeamId: null makes the claim atomic.
  if (lines.length > 0 && !team.round.firstLineTeamId) {
    await tx.round.updateMany({
      where: { id: team.roundId, firstLineTeamId: null },
      data: { firstLineTeamId: teamId },
    });
  }
  // ...and it is released again when the holder's line is broken by a revoked
  // proof. Without this the claim stays parked on a team that no longer has a
  // line, and nobody else can ever take it.
  if (lines.length === 0 && team.round.firstLineTeamId === teamId) {
    await tx.round.updateMany({
      where: { id: team.roundId, firstLineTeamId: teamId },
      data: { firstLineTeamId: null },
    });
  }
  const round = await tx.round.findUniqueOrThrow({
    where: { id: team.roundId },
    select: { firstLineTeamId: true },
  });
  const firstLineBonus =
    round.firstLineTeamId === teamId && lines.length > 0 ? team.round.pointsFirstLine : 0;

  const points =
    cellPoints +
    linePoints +
    firstLineBonus +
    reactionBonus +
    (blackout ? team.round.pointsBlackout : 0);

  await tx.team.update({
    where: { id: teamId },
    data: { points, cellsDone: closed.size, linesDone: lines.length, firstLineAt },
  });

  return {
    points,
    cellsDone: closed.size,
    linesDone: lines.length,
    blackout,
    cellPoints,
    linePoints,
    firstLineBonus,
    reactionBonus,
  };
}

/**
 * Personal points: the difficulty of the cells someone closed themselves plus
 * the bonuses on their own proofs. They exist so an active person still scores
 * even on a team that went quiet.
 */
export async function personalLeaderboard(tx: Tx, roundId: string, limit = 50) {
  const rows = await tx.$queryRaw<
    { userId: string; name: string; department: string | null; teamName: string; points: bigint }[]
  >`
    SELECT u.id                           AS "userId",
           u.name                         AS "name",
           u.department                   AS "department",
           t.name                         AS "teamName",
           COALESCE(cells.pts, 0) + COALESCE(bonus.pts, 0) AS "points"
    FROM "User" u
    JOIN "TeamMember" tm ON tm."userId" = u.id
    JOIN "Team" t        ON t.id = tm."teamId" AND t."roundId" = ${roundId}
    LEFT JOIN LATERAL (
      SELECT SUM(task.difficulty)::int AS pts
      FROM "BoardCell" bc
      JOIN "Task" task ON task.id = bc."taskId"
      WHERE bc."closedById" = u.id AND bc."teamId" = t.id
    ) cells ON TRUE
    LEFT JOIN LATERAL (
      SELECT (COUNT(*) * r."reactionBonusPoints")::int AS pts
      FROM "Proof" p
      JOIN "Round" r ON r.id = ${roundId}
      WHERE p."userId" = u.id
        AND p."teamId" = t.id
        AND p."revokedAt" IS NULL
        AND p."bonusAwardedAt" IS NOT NULL
      GROUP BY r."reactionBonusPoints"
    ) bonus ON TRUE
    ORDER BY "points" DESC, u.name ASC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({ ...r, points: Number(r.points) }));
}

/**
 * Checks whether a proof has reached the reaction bonus and awards it once.
 * Only reactions from outside the author's team count, otherwise a team
 * would simply like its own way to the bonus.
 */
export async function maybeAwardReactionBonus(tx: Tx, proofId: string): Promise<boolean> {
  const proof = await tx.proof.findUnique({
    where: { id: proofId },
    select: {
      id: true,
      teamId: true,
      revokedAt: true,
      bonusAwardedAt: true,
      round: { select: { reactionBonusAt: true } },
    },
  });
  if (!proof || proof.revokedAt || proof.bonusAwardedAt) return false;
  // A free post has no team to pay. It still collects reactions; it just does
  // not turn them into points, or posting cat pictures would outscore the game.
  const { teamId } = proof;
  if (!teamId) return false;

  const outsiders = await tx.reaction.count({
    where: {
      proofId,
      user: { memberships: { none: { teamId } } },
    },
  });
  if (outsiders < proof.round.reactionBonusAt) return false;

  await tx.proof.update({
    where: { id: proofId },
    data: { bonusAwardedAt: new Date() },
  });
  await recomputeTeam(tx, teamId);
  return true;
}
