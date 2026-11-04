import Link from "next/link";
import { redirect } from "next/navigation";
import { canOpenHR, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TaskList } from "@/components/hr/TaskList";

export default async function HRTasksPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canOpenHR(user)) redirect("/");

  const tasks = await prisma.task.findMany({ orderBy: { id: "asc" } });
  const byDifficulty = [1, 2, 3].map((d) => tasks.filter((t) => t.active && t.difficulty === d).length);
  const retroCount = tasks.filter((t) => t.active && t.retro).length;

  return (
    <>
      <Link href="/hr" className="backlink">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 6-6 6 6 6" />
        </svg>
        HR area
      </Link>
      <div className="head">
        <h2>Task pool</h2>
        <span className="hint">
          {tasks.filter((t) => t.active).length} active of {tasks.length} · {byDifficulty[0]} easy,{" "}
          {byDifficulty[1]} medium, {byDifficulty[2]} hard · {retroCount} retro
        </span>
      </div>

      {byDifficulty[2] < 8 && (
        <div className="toon pad err" style={{ marginBottom: 14 }}>
          Fewer than eight hard tasks. The generator needs at least one hard task in every line,
          so with a pool this small the boards come out unbalanced and lines fall far too quickly.
        </div>
      )}

      <TaskList
        tasks={tasks.map((t) => ({
          id: t.id,
          short: t.short,
          full: t.full,
          difficulty: t.difficulty,
          proof: t.proof,
          tags: t.tags,
          active: t.active,
          clientFacing: t.clientFacing,
          retro: t.retro,
        }))}
      />
    </>
  );
}
