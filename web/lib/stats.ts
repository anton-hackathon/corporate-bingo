import { prisma } from "./prisma";

export type Fan = { id: string; name: string; department: string | null; count: number; emoji: string };
export type MyPhoto = { id: string; imageKey: string; caption: string | null; task: string; reactions: number; createdAt: Date };

export type PersonalStats = {
  cellsClosed: number;
  proofs: number;
  bonuses: number;
  reactionsReceived: number;
  reactionsGiven: number;
  fans: number;
  departmentsReached: number;
  topFan: Fan | null;
  topCheered: Fan | null;
  myEmoji: { emoji: string; count: number } | null;
  bestPhoto: MyPhoto | null;
  photos: MyPhoto[];
};

type Row = { id: string; name: string; department: string | null; count: bigint; emoji: string };

/**
 * The numbers behind "your round". Most of them are a single grouped count;
 * the ones worth the page are the two that name a person, because in a company
 * of this size the answer is usually someone you have never worked with.
 */
export async function personalStats(userId: string, roundId: string): Promise<PersonalStats> {
  const [
    cellsClosed,
    proofs,
    bonuses,
    reactionsReceived,
    reactionsGiven,
    reach,
    topFanRows,
    topCheeredRows,
    emojiRows,
    photoRows,
  ] = await Promise.all([
    prisma.boardCell.count({ where: { closedById: userId, team: { roundId } } }),
    prisma.proof.count({ where: { userId, roundId, revokedAt: null } }),
    prisma.proof.count({ where: { userId, roundId, revokedAt: null, bonusAwardedAt: { not: null } } }),
    prisma.reaction.count({ where: { proof: { userId, roundId, revokedAt: null } } }),
    prisma.reaction.count({ where: { userId, proof: { roundId, revokedAt: null } } }),

    // How far your photos travelled: distinct people, and distinct departments.
    prisma.$queryRaw<{ fans: bigint; departments: bigint }[]>`
      SELECT COUNT(DISTINCT r."userId")   AS "fans",
             COUNT(DISTINCT u.department) AS "departments"
      FROM "Reaction" r
      JOIN "Proof" p ON p.id = r."proofId"
      JOIN "User"  u ON u.id = r."userId"
      WHERE p."userId" = ${userId} AND p."roundId" = ${roundId}
        AND p."revokedAt" IS NULL AND r."userId" <> ${userId}
    `,

    // Who reacts to you most, and what they tend to press.
    prisma.$queryRaw<Row[]>`
      SELECT u.id, u.name, u.department, COUNT(*) AS "count",
             MODE() WITHIN GROUP (ORDER BY r.emoji) AS "emoji"
      FROM "Reaction" r
      JOIN "Proof" p ON p.id = r."proofId"
      JOIN "User"  u ON u.id = r."userId"
      WHERE p."userId" = ${userId} AND p."roundId" = ${roundId}
        AND p."revokedAt" IS NULL AND r."userId" <> ${userId}
      GROUP BY u.id, u.name, u.department
      ORDER BY "count" DESC, u.name ASC
      LIMIT 1
    `,

    // ...and the same the other way round: whose posts you turn up for.
    prisma.$queryRaw<Row[]>`
      SELECT u.id, u.name, u.department, COUNT(*) AS "count",
             MODE() WITHIN GROUP (ORDER BY r.emoji) AS "emoji"
      FROM "Reaction" r
      JOIN "Proof" p ON p.id = r."proofId"
      JOIN "User"  u ON u.id = p."userId"
      WHERE r."userId" = ${userId} AND p."roundId" = ${roundId}
        AND p."revokedAt" IS NULL AND p."userId" <> ${userId}
      GROUP BY u.id, u.name, u.department
      ORDER BY "count" DESC, u.name ASC
      LIMIT 1
    `,

    prisma.reaction.groupBy({
      by: ["emoji"],
      where: { userId, proof: { roundId, revokedAt: null } },
      _count: { emoji: true },
      orderBy: { _count: { emoji: "desc" } },
      take: 1,
    }),

    prisma.proof.findMany({
      where: { userId, roundId, revokedAt: null, imageKey: { not: null } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        imageKey: true,
        caption: true,
        label: true,
        createdAt: true,
        cell: { select: { task: { select: { short: true } } } },
        _count: { select: { reactions: true } },
      },
    }),
  ]);

  const photos: MyPhoto[] = photoRows.map((p) => ({
    id: p.id,
    imageKey: p.imageKey as string,
    caption: p.caption,
    task: p.cell?.task.short ?? p.label ?? "Off the board",
    reactions: p._count.reactions,
    createdAt: p.createdAt,
  }));

  const toFan = (rows: Row[]): Fan | null =>
    rows[0] ? { ...rows[0], count: Number(rows[0].count) } : null;

  return {
    cellsClosed,
    proofs,
    bonuses,
    reactionsReceived,
    reactionsGiven,
    fans: Number(reach[0]?.fans ?? 0),
    departmentsReached: Number(reach[0]?.departments ?? 0),
    topFan: toFan(topFanRows),
    topCheered: toFan(topCheeredRows),
    myEmoji: emojiRows[0] ? { emoji: emojiRows[0].emoji, count: emojiRows[0]._count.emoji } : null,
    bestPhoto: [...photos].sort((a, b) => b.reactions - a.reactions)[0] ?? null,
    photos,
  };
}
