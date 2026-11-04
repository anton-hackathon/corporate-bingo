import Link from "next/link";
import { redirect } from "next/navigation";
import { canOpenHR, getSessionUser } from "@/lib/auth";
import { getActiveRound } from "@/lib/game";
import { prisma } from "@/lib/prisma";
import { TeamsEditor } from "@/components/hr/TeamsEditor";
import { ClerkMascot } from "@/components/Mascots";

export default async function HRTeamsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canOpenHR(user)) redirect("/");

  const round = (await getActiveRound()) ?? (await prisma.round.findFirst({ orderBy: { createdAt: "desc" } }));
  if (!round) {
    return (
      <div className="toon empty" style={{ marginTop: 24 }}>
        <ClerkMascot />
        <h2>No round yet</h2>
        <p>Create a round and build the teams, then you can edit the rosters here.</p>
      </div>
    );
  }

  const teams = await prisma.team.findMany({
    where: { roundId: round.id },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      points: true,
      cellsDone: true,
      members: {
        select: { user: { select: { id: true, name: true, department: true, office: true, active: true } } },
      },
    },
  });

  // Who can be added: active employees not currently on any team in this round.
  const free = await prisma.user.findMany({
    where: { active: true, memberships: { none: { team: { roundId: round.id } } } },
    orderBy: [{ department: "asc" }, { name: "asc" }],
    select: { id: true, name: true, department: true },
  });

  return (
    <>
      <Link href="/hr" className="backlink">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 6-6 6 6 6" />
        </svg>
        HR area
      </Link>
      <TeamsEditor
      roundId={round.id}
      roundTitle={round.title}
      teamSize={round.teamSize}
      teams={teams.map((t) => ({
        id: t.id,
        name: t.name,
        points: t.points,
        cellsDone: t.cellsDone,
        members: t.members.map((m) => m.user),
      }))}
        free={free}
      />
    </>
  );
}
