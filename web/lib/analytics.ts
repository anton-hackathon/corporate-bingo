import { env } from "./env";
import { prisma } from "./prisma";

export type DayCount = { day: string; proofs: number; reactions: number };
export type Pair = { a: string; b: string; n: number };
export type TaskRow = { short: string; difficulty: number; closed: number; onBoards: number; rate: number };
export type QuietPerson = { id: string; name: string; department: string | null; team: string };

export type RoundAnalytics = {
  audience: number;
  players: number;
  posted: number;
  reacted: number;
  touched: number;
  teams: number;
  silentTeams: number;
  proofs: number;
  freePosts: number;
  reactions: number;
  leader: number;
  median: number;
  ratio: number;
  days: DayCount[];
  crossed: number;
  crossTotal: number;
  pairs: Pair[];
  easiest: TaskRow[];
  hardest: TaskRow[];
  quiet: QuietPerson[];
  quietTotal: number;
};

/**
 * Everything the HR page reads, in one pass. The numbers are chosen to answer
 * the three questions that actually come up mid-round: is anyone running away
 * with it, is anyone being left out, and is the thing doing what it was for —
 * getting people to talk across departments.
 */
export async function roundAnalytics(roundId: string): Promise<RoundAnalytics> {
  const tz = env.timezone;

  const [
    audience,
    players,
    postedRows,
    reactedRows,
    teamRows,
    proofs,
    freePosts,
    reactions,
    dayRows,
    bridgeRows,
    pairRows,
    taskRows,
    quietRows,
  ] = await Promise.all([
    // Everyone who can sign in — the feed is open to the whole company, so
    // reactions come from people who never joined a team, and counting
    // participation against the roster alone puts it over 100%.
    prisma.user.count({ where: { active: true } }),
    prisma.teamMember.count({ where: { team: { roundId } } }),
    prisma.proof.findMany({
      where: { roundId, revokedAt: null },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.reaction.findMany({
      where: { proof: { roundId, revokedAt: null } },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.team.findMany({ where: { roundId }, select: { points: true, cellsDone: true } }),
    prisma.proof.count({ where: { roundId, revokedAt: null } }),
    prisma.proof.count({ where: { roundId, revokedAt: null, cellId: null } }),
    prisma.reaction.count({ where: { proof: { roundId, revokedAt: null } } }),

    prisma.$queryRaw<{ day: Date; proofs: bigint; reactions: bigint }[]>`
      SELECT d.day,
             COALESCE(p.n, 0) AS "proofs",
             COALESCE(r.n, 0) AS "reactions"
      FROM (
        SELECT (p."createdAt" AT TIME ZONE ${tz})::date AS day
        FROM "Proof" p WHERE p."roundId" = ${roundId} AND p."revokedAt" IS NULL
        UNION
        SELECT (p2."createdAt" AT TIME ZONE ${tz})::date
        FROM "Reaction" rr
        JOIN "Proof" p2 ON p2.id = rr."proofId"
        WHERE p2."roundId" = ${roundId} AND p2."revokedAt" IS NULL
      ) d
      LEFT JOIN (
        SELECT (p."createdAt" AT TIME ZONE ${tz})::date AS day, COUNT(*) AS n
        FROM "Proof" p WHERE p."roundId" = ${roundId} AND p."revokedAt" IS NULL
        GROUP BY 1
      ) p ON p.day = d.day
      LEFT JOIN (
        -- A reaction has no timestamp of its own, so it is counted on the day
        -- of the post it landed on. Close enough for a shape, and honest about it.
        SELECT (p2."createdAt" AT TIME ZONE ${tz})::date AS day, COUNT(*) AS n
        FROM "Reaction" rr
        JOIN "Proof" p2 ON p2.id = rr."proofId"
        WHERE p2."roundId" = ${roundId} AND p2."revokedAt" IS NULL
        GROUP BY 1
      ) r ON r.day = d.day
      ORDER BY d.day
    `,

    prisma.$queryRaw<{ crossed: bigint; total: bigint }[]>`
      SELECT COUNT(*) FILTER (WHERE ru.department IS DISTINCT FROM au.department) AS "crossed",
             COUNT(*) AS "total"
      FROM "Reaction" r
      JOIN "Proof" p ON p.id = r."proofId"
      JOIN "User" ru ON ru.id = r."userId"
      JOIN "User" au ON au.id = p."userId"
      WHERE p."roundId" = ${roundId} AND p."revokedAt" IS NULL AND r."userId" <> p."userId"
    `,

    prisma.$queryRaw<{ a: string; b: string; n: bigint }[]>`
      SELECT LEAST(ru.department, au.department)    AS "a",
             GREATEST(ru.department, au.department) AS "b",
             COUNT(*)                               AS "n"
      FROM "Reaction" r
      JOIN "Proof" p ON p.id = r."proofId"
      JOIN "User" ru ON ru.id = r."userId"
      JOIN "User" au ON au.id = p."userId"
      WHERE p."roundId" = ${roundId} AND p."revokedAt" IS NULL
        AND ru.department IS NOT NULL AND au.department IS NOT NULL
        AND ru.department <> au.department
      GROUP BY 1, 2
      ORDER BY "n" DESC, "a" ASC
      LIMIT 6
    `,

    prisma.$queryRaw<{ short: string; difficulty: number; closed: bigint; onboards: bigint }[]>`
      SELECT t.short, t.difficulty,
             COUNT(*) FILTER (WHERE bc."closedAt" IS NOT NULL) AS "closed",
             COUNT(*)                                          AS "onboards"
      FROM "BoardCell" bc
      JOIN "Task" t ON t.id = bc."taskId"
      JOIN "Team" tm ON tm.id = bc."teamId"
      WHERE tm."roundId" = ${roundId}
      GROUP BY t.id, t.short, t.difficulty
      HAVING COUNT(*) >= 3
    `,

    prisma.$queryRaw<{ id: string; name: string; department: string | null; team: string }[]>`
      SELECT u.id, u.name, u.department, t.name AS "team"
      FROM "User" u
      JOIN "TeamMember" tm ON tm."userId" = u.id
      JOIN "Team" t ON t.id = tm."teamId"
      WHERE t."roundId" = ${roundId}
        AND NOT EXISTS (
          SELECT 1 FROM "Proof" p
          WHERE p."userId" = u.id AND p."roundId" = ${roundId} AND p."revokedAt" IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM "Reaction" r
          JOIN "Proof" p2 ON p2.id = r."proofId"
          WHERE r."userId" = u.id AND p2."roundId" = ${roundId}
        )
      ORDER BY u.name
    `,
  ]);

  const posted = new Set(postedRows.map((r) => r.userId));
  const reacted = new Set(reactedRows.map((r) => r.userId));
  const points = teamRows.map((t) => t.points).sort((a, b) => b - a);
  const mid = points.length
    ? points.length % 2
      ? points[(points.length - 1) / 2]
      : Math.round((points[points.length / 2 - 1] + points[points.length / 2]) / 2)
    : 0;

  const tasks: TaskRow[] = taskRows.map((t) => ({
    short: t.short,
    difficulty: t.difficulty,
    closed: Number(t.closed),
    onBoards: Number(t.onboards),
    rate: Number(t.closed) / Number(t.onboards),
  }));
  const byRate = [...tasks].sort((a, b) => b.rate - a.rate || b.onBoards - a.onBoards);

  return {
    audience,
    players,
    posted: posted.size,
    reacted: reacted.size,
    touched: new Set([...posted, ...reacted]).size,
    teams: teamRows.length,
    silentTeams: teamRows.filter((t) => t.cellsDone === 0).length,
    proofs,
    freePosts,
    reactions,
    leader: points[0] ?? 0,
    median: mid,
    ratio: mid > 0 ? (points[0] ?? 0) / mid : 0,
    days: dayRows.map((d) => ({
      day: d.day.toISOString().slice(0, 10),
      proofs: Number(d.proofs),
      reactions: Number(d.reactions),
    })),
    crossed: Number(bridgeRows[0]?.crossed ?? 0),
    crossTotal: Number(bridgeRows[0]?.total ?? 0),
    pairs: pairRows.map((p) => ({ a: p.a, b: p.b, n: Number(p.n) })),
    easiest: byRate.slice(0, 5),
    hardest: byRate.slice(-5).reverse(),
    quiet: quietRows.slice(0, 24),
    quietTotal: quietRows.length,
  };
}
