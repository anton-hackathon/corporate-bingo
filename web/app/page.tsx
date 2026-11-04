import Link from "next/link";
import { redirect } from "next/navigation";
import { RoundStatus } from "@prisma/client";
import { getSessionUser, hrControlsVisible } from "@/lib/auth";
import { CELL_COUNT, LINES, completedLines } from "@/lib/board";
import { getActiveRound, getFeed, getMyTeam, teamLeaderboard } from "@/lib/game";
import { prisma } from "@/lib/prisma";
import { FeedList } from "@/components/FeedList";
import { JoinRound } from "@/components/JoinRound";
import { CrittersMascot } from "@/components/Mascots";

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const round = await getActiveRound();
  if (!round) {
    return (
      <div className="toon empty" style={{ marginTop: 24 }}>
        <CrittersMascot />
        <h2>No round is running</h2>
        <p>You will get an email as soon as HR starts the next one.</p>
      </div>
    );
  }

  const signup = round.status === RoundStatus.SIGNUP;

  // While sign-ups are open there are no teams and no proofs yet, but the feed
  // is open for photos off the board — so the round does not start on an empty
  // page, and so the first real proofs land among posts that already look alike.
  if (signup) {
    const [joined, count] = await Promise.all([
      prisma.roundSignup.findUnique({
        where: { roundId_userId: { roundId: round.id, userId: user.id } },
      }),
      prisma.roundSignup.count({ where: { roundId: round.id } }),
    ]);
    return (
      <>
        <JoinRound roundId={round.id} title={round.title} joined={Boolean(joined)} count={count} />
        <Feed round={round} user={user} />
      </>
    );
  }

  const myTeam = await getMyTeam(user.id, round.id);
  return (
    <>
      {myTeam && <TeamStrip teamId={myTeam.id} roundId={round.id} />}
      <Feed round={round} user={user} />
    </>
  );
}

type FeedRound = {
  id: string;
  status: RoundStatus;
  allowFreePosts: boolean;
  freePostsPerDay: number;
  reactionBonusAt: number;
  reactionBonusPoints: number;
};

async function Feed({
  round,
  user,
}: {
  round: FeedRound;
  user: { id: string; role: "PLAYER" | "HR" };
}) {
  const me = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { watchTeamIds: true, watchUserIds: true },
  });

  const [teams, people, total, isHR] = await Promise.all([
    prisma.team.findMany({ where: { roundId: round.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({
      where: { active: true, memberships: { some: { team: { roundId: round.id } } } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        department: true,
        memberships: { where: { team: { roundId: round.id } }, select: { team: { select: { name: true } } } },
      },
    }),
    prisma.proof.count({ where: { revokedAt: null, roundId: round.id } }),
    hrControlsVisible(user),
  ]);

  const { items } = await getFeed(round.id, {
    teamIds: me.watchTeamIds,
    userIds: me.watchUserIds,
    take: 40,
  });

  return (
    <FeedList
      meId={user.id}
      isHR={isHR}
      total={total}
      canPost={round.allowFreePosts}
      freePostsPerDay={round.freePostsPerDay}
      bonusAt={round.reactionBonusAt}
      bonusPoints={round.reactionBonusPoints}
      watchTeamIds={me.watchTeamIds}
      watchUserIds={me.watchUserIds}
      teams={teams}
      people={people.map((p) => ({
        id: p.id,
        name: p.name,
        department: p.department,
        team: p.memberships[0]?.team.name ?? "",
      }))}
      items={items.map((p) => ({
        id: p.id,
        author: p.user.name,
        authorId: p.user.id,
        department: p.user.department,
        team: p.team?.name ?? null,
        teamId: p.team?.id ?? null,
        // A free post wears a task name drawn from the pool, which is the whole
        // point: from the outside the two are the same post.
        task: p.cell?.task.short ?? p.label ?? "Off the board",
        kind: p.kind,
        text: p.text,
        caption: p.caption,
        imageKey: p.imageKey,
        createdAt: p.createdAt.toISOString(),
        // The per-post countdown to the bonus is gone on purpose: a free post can
        // never earn it, so the counter would either lie or give the decoy away.
        bonused: Boolean(p.bonusAwardedAt),
        // What this proof finished off, if anything. Everyone in the feed sees it.
        bingo: p.bingoLines > 0 || p.bingoBlackout
          ? { lines: p.bingoLines, blackout: p.bingoBlackout }
          : null,
        reactions: p.reactions.map((r) => ({ emoji: r.emoji, userId: r.userId })),
      }))}
    />
  );
}

/** A thin strip above the feed: your own board stays one tap away, not buried in a tab. */
async function TeamStrip({ teamId, roundId }: { teamId: string; roundId: string }) {
  const [team, standings, cells] = await Promise.all([
    prisma.team.findUniqueOrThrow({
      where: { id: teamId },
      select: { name: true, points: true, cellsDone: true, linesDone: true },
    }),
    teamLeaderboard(roundId),
    prisma.boardCell.findMany({ where: { teamId }, select: { pos: true, closedAt: true, revealedAt: true } }),
  ]);

  const place = standings.findIndex((t) => t.id === teamId) + 1;
  const closed = new Set(cells.filter((c) => c.closedAt).map((c) => c.pos));
  const full = closed.size === CELL_COUNT;
  const toLine = full ? 0 : Math.min(...LINES.map((l) => l.filter((i) => !closed.has(i)).length));
  const hidden = cells.filter((c) => !c.revealedAt).length;
  const lines = completedLines(closed).length;

  return (
    <Link href="/board" className="toon strip">
      <div className="strip-main">
        <b>{team.name}</b>
        <span>
          {lines > 0 ? `${lines} ${lines === 1 ? "line" : "lines"} completed` : cellsToLine(toLine)}
          {hidden > 0 ? ` · ${hidden} face down` : ""}
        </span>
      </div>
      <div className="strip-nums">
        <span><b>{team.points}</b> pts</span>
        <span><b>{place}{ordinal(place)}</b> place</span>
      </div>
      <span className="strip-go" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </span>
    </Link>
  );
}

/** 1st, 2nd, 3rd, 4th. */
function ordinal(n: number): string {
  const two = n % 100;
  if (two >= 11 && two <= 13) return "th";
  return { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
}

/** "One cell to go" reads better than "1 cell to go". */
function cellsToLine(n: number): string {
  if (n === 0) return "The board is complete";
  return n === 1 ? "One cell to go for a full line" : `${n} cells to go for a full line`;
}
