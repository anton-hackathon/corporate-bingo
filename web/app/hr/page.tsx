import Link from "next/link";
import { redirect } from "next/navigation";
import { RoundStatus } from "@prisma/client";
import { canOpenHR, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RoundPanel } from "@/components/hr/RoundPanel";
import { ClerkMascot } from "@/components/Mascots";

export default async function HRPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canOpenHR(user)) redirect("/");

  const round = await prisma.round.findFirst({ orderBy: { createdAt: "desc" } });
  const [people, tasksTotal] = await Promise.all([
    prisma.user.count({ where: { active: true } }),
    prisma.task.count(),
  ]);

  const teams = round ? await prisma.team.count({ where: { roundId: round.id } }) : 0;
  const signups = round ? await prisma.roundSignup.count({ where: { roundId: round.id } }) : 0;
  const proofs = round
    ? await prisma.proof.count({ where: { revokedAt: null, roundId: round.id } })
    : 0;
  const liveTeams = round
    ? await prisma.team.count({ where: { roundId: round.id, cellsDone: { gt: 0 } } })
    : 0;

  return (
    <>
      <section className="toon banner">
        <ClerkMascot className="mascot" size={112} />
        <h1>HR area</h1>
        <div className="who">{round ? `${round.title} · ${statusLabel(round.status)}` : "No round yet"}</div>
      </section>

      <div className="tiles" style={{ marginTop: 16 }}>
        <div className="toon tile"><b>{people}</b><span>employees</span></div>
        <div className="toon tile"><b>{round?.status === "SIGNUP" ? signups : teams}</b><span>{round?.status === "SIGNUP" ? "signed up" : "teams"}</span></div>
        <div className="toon tile"><b>{liveTeams}</b><span>active teams</span></div>
        <div className="toon tile"><b>{proofs}</b><span>proofs</span></div>
      </div>

      <div className="inline" style={{ marginTop: 16 }}>
        <Link className="btn sm ghost" href="/hr/analytics">Analytics</Link>
        <Link className="btn sm ghost" href="/hr/tasks">Tasks: {tasksTotal}</Link>
        <Link className="btn sm ghost" href="/hr/teams">Team rosters</Link>
        <Link className="btn sm ghost" href="/hr/people">Employees</Link>
      </div>

      <RoundPanel
        round={
          round
            ? {
                id: round.id,
                title: round.title,
                status: round.status,
                teamSize: round.teamSize,
                revealsPerDay: round.revealsPerDay,
                allowFreePosts: round.allowFreePosts,
                freePostsPerDay: round.freePostsPerDay,
                pointsLine: round.pointsLine,
                pointsFirstLine: round.pointsFirstLine,
                pointsBlackout: round.pointsBlackout,
                reactionBonusAt: round.reactionBonusAt,
                reactionBonusPoints: round.reactionBonusPoints,
              }
            : null
        }
        signups={signups}
      />

      <p className="muted" style={{ marginTop: 18 }}>
        Proofs are moderated in the feed itself: with the HR switch on, every post carries Remove
        and Disable the author.
      </p>
    </>
  );
}

function statusLabel(s: RoundStatus) {
  return { DRAFT: "draft", SIGNUP: "sign-ups open", ACTIVE: "running", FINISHED: "finished" }[s];
}
