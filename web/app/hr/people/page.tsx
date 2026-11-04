import Link from "next/link";
import { redirect } from "next/navigation";
import { canOpenHR, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PeopleImport } from "@/components/hr/PeopleImport";
import { PeopleList } from "@/components/hr/PeopleList";

export default async function HRPeoplePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canOpenHR(user)) redirect("/");

  const people = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { department: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, department: true, office: true, role: true, active: true },
  });
  const activeCount = people.filter((p) => p.active).length;
  const depts = new Set(people.filter((p) => p.active).map((p) => p.department ?? "—"));

  return (
    <>
      <Link href="/hr" className="backlink">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 6-6 6 6 6" />
        </svg>
        HR area
      </Link>
      <div className="head">
        <h2>Employees</h2>
        <span className="hint">
          {activeCount} active · {depts.size} {depts.size === 1 ? "department" : "departments"}
          {people.length - activeCount > 0 ? ` · ${people.length - activeCount} disabled` : ""}
        </span>
      </div>

      <PeopleImport />

      <div className="head"><h2>List</h2></div>
      <PeopleList meId={user.id} people={people} />
    </>
  );
}
