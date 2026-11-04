import { redirect } from "next/navigation";
import { RoundStatus } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { getActiveRound, getBoardView, getMyTeam, teamLeaderboard } from "@/lib/game";
import { prisma } from "@/lib/prisma";
import { daysBetween } from "@/lib/time";
import { Board } from "@/components/Board";
import { JoinRound } from "@/components/JoinRound";
import { CatMascot, CrittersMascot } from "@/components/Mascots";

/** "One cell to go" reads better than "1 cell to go". */
function cellsToLine(n: number): string {
  if (n === 0) return "The board is complete";
  return n === 1 ? "One cell to go for a full line" : `${n} cells to go for a full line`;
}

export default async function BoardPage() {
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

  if (round.status === RoundStatus.SIGNUP) {
    const joined = await prisma.roundSignup.findUnique({
      where: { roundId_userId: { roundId: round.id, userId: user.id } },
    });
    const count = await prisma.roundSignup.count({ where: { roundId: round.id } });
    return <JoinRound roundId={round.id} title={round.title} joined={Boolean(joined)} count={count} />;
  }

  const team = await getMyTeam(user.id, round.id);
  if (!team) {
    return (
      <div className="toon empty" style={{ marginTop: 24 }}>
        <CrittersMascot />
        <h2>You are not on a team this round</h2>
        <p>The feed and the leaderboard are still open to you. Sign up early next time.</p>
      </div>
    );
  }

  const view = await getBoardView(team.id, user.id);
  const standings = await teamLeaderboard(round.id);
  const place = standings.findIndex((t) => t.id === team.id) + 1;
  const daysLeft = round.endsAt ? daysBetween(new Date(), round.endsAt) : null;

  return (
    <>
      <section className="toon banner">
        <CatMascot className="mascot" size={118} />
        <h1>{team.name}</h1>
        {/* one pill per member: run together with spaces, a department read as part of the next name */}
        <ul className="roster">
          {view.team.members.map((m) => (
            <li key={m.user.id}>
              <b>{m.user.name}</b>
              <span>{m.user.department ?? "no department set"}</span>
            </li>
          ))}
        </ul>
        <div className="stats">
          <div className="stat">
            <b>{team.points}</b>
            <span>points</span>
          </div>
          <div className="stat">
            <b>{place}</b>
            <span>of {standings.length}</span>
          </div>
          <div className="stat">
            <b>
              {team.cellsDone}
              <small style={{ fontSize: 13, opacity: 0.5 }}>/{view.size * view.size}</small>
            </b>
            <span>cells</span>
          </div>
        </div>
        {daysLeft !== null && round.endsAt && (
          <div className="bar">
            <div className="lbl">
              <span>
                {team.linesDone > 0
                  ? `${team.linesDone} ${team.linesDone === 1 ? "line" : "lines"} completed`
                  : cellsToLine(view.toLine)}
              </span>
              <span>{daysLeft === 1 ? "1 day left" : `${daysLeft} days left`}</span>
            </div>
            <div className="track">
              <div className="fill" style={{ width: `${Math.round((team.cellsDone / (view.size * view.size)) * 100)}%` }} />
            </div>
          </div>
        )}
      </section>

      <div className="head">
        <h2>Team board</h2>
        <span className="hint">
          {view.revealsPerDay > 0
            ? view.revealsToday >= view.revealsPerDay
              ? "You have used all your reveals for today"
              : `You can reveal ${view.revealsPerDay - view.revealsToday} more today`
            : "Reveal as many as you like"}
        </span>
      </div>

      <Board
        size={view.size}
        cells={view.cells.map((c) => ({
          id: c.id,
          pos: c.pos,
          difficulty: c.difficulty,
          revealed: Boolean(c.revealedAt),
          revealedBy: c.revealedBy?.name ?? null,
          revealedById: c.revealedBy?.id ?? null,
          short: c.task?.short ?? null,
          full: c.task?.full ?? null,
          proof: c.task?.proof ?? null,
          retro: c.retro,
          tags: c.task?.tags ?? [],
          closed: Boolean(c.closedAt),
          closedBy: c.closedBy?.name ?? null,
          inLine: c.inLine,
        }))}
        limitReached={view.dailyLimit > 0 && view.closedToday >= view.dailyLimit}
        revealsLeft={view.revealsPerDay > 0 ? Math.max(0, view.revealsPerDay - view.revealsToday) : 99}
        hiddenLeft={view.hiddenLeft}
      />
    </>
  );
}
