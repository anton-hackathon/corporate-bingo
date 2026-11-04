import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getActiveRound, getMyTeam, teamLeaderboard } from "@/lib/game";
import { personalLeaderboard } from "@/lib/scoring";
import { prisma } from "@/lib/prisma";
import { MouseMascot } from "@/components/Mascots";

export default async function RankPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // A finished round still has standings worth showing; otherwise the winner
  // is never announced anywhere in the app.
  const round =
    (await getActiveRound()) ??
    (await prisma.round.findFirst({ where: { status: "FINISHED" }, orderBy: { createdAt: "desc" } }));
  if (!round) {
    return (
      <div className="toon empty" style={{ marginTop: 24 }}>
        <MouseMascot />
        <h2>No leaderboard yet</h2>
        <p>It appears once a round is running.</p>
      </div>
    );
  }

  const { tab } = await searchParams;
  const people = tab === "people";
  const myTeam = await getMyTeam(user.id, round.id);

  const teams = people ? [] : await teamLeaderboard(round.id);
  const persons = people ? await personalLeaderboard(prisma, round.id, 50) : [];

  return (
    <>
      <div className="head">
        <h2>Leaderboard</h2>
        <span className="hint">
          {round.status === "FINISHED" ? "final standings" : "updates the moment a cell is closed"}
        </span>
      </div>

      <div className="inline" style={{ marginBottom: 14 }}>
        <a className={`btn sm ${people ? "ghost" : "primary"}`} href="/rank">Teams</a>
        <a className={`btn sm ${people ? "primary" : "ghost"}`} href="/rank?tab=people">People</a>
      </div>

      <div className="toon rows">
        {people
          ? persons.map((p, i) => (
              <div key={p.userId} className={`row ${medal(i)} ${p.userId === user.id ? "me" : ""}`}>
                <div className="pos">{i < 3 ? MEDALS[i] : i + 1}</div>
                <div className="nm">
                  {p.name}
                  <small>
                    <span className="chip brand tiny">{p.teamName}</span>
                    {p.department ?? "no department set"}
                  </small>
                </div>
                <div className="pts">{p.points}<small>pts</small></div>
              </div>
            ))
          : teams.map((t, i) => (
              <div key={t.id} className={`row ${medal(i)} ${t.id === myTeam?.id ? "me" : ""}`}>
                <div className="pos">{i < 3 ? MEDALS[i] : i + 1}</div>
                <div className="nm">
                  {t.name}
                  <small>{t.cellsDone} {t.cellsDone === 1 ? "cell" : "cells"} · {t.linesDone} {lineWord(t.linesDone)}</small>
                </div>
                <div className="pts">{t.points}<small>pts</small></div>
              </div>
            ))}
      </div>

      <div className="toon pad" style={{ marginTop: 18 }}>
        <h3 style={{ fontSize: 16, marginBottom: 6 }}>How points work</h3>
        <p style={{ margin: 0, fontSize: 14 }}>
          A cell is worth its difficulty: 1, 2 or 3. A completed line adds {round.pointsLine}, the
          first line of the round another {round.pointsFirstLine}, and a fully closed board{" "}
          {round.pointsBlackout} on top. A proof that collects {round.reactionBonusAt} reactions from
          people outside its own team pays {round.reactionBonusPoints} once. Personal points go to
          whoever closed the cell, so an active player still scores on a team that went quiet.
        </p>
      </div>
    </>
  );
}

const MEDALS = ["🥇", "🥈", "🥉"];

/** The whole top three is highlighted, not just first place. */
function medal(i: number): string {
  return ["p1", "p2", "p3"][i] ?? "";
}

function lineWord(n: number) {
  if (n === 1) return "line";
  return "lines";

}
