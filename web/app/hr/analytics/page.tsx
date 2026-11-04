import Link from "next/link";
import { redirect } from "next/navigation";
import { canOpenHR, getSessionUser } from "@/lib/auth";
import { roundAnalytics, type DayCount, type TaskRow } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";
import { ClerkMascot } from "@/components/Mascots";

export default async function HRAnalyticsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canOpenHR(user)) redirect("/");

  const round = await prisma.round.findFirst({ orderBy: { createdAt: "desc" } });

  return (
    <>
      <Link href="/hr" className="backlink">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 6-6 6 6 6" />
        </svg>
        HR area
      </Link>

      <section className="toon banner">
        <ClerkMascot className="mascot" size={112} />
        <h1>Analytics</h1>
        <div className="who">{round ? round.title : "No round yet"}</div>
      </section>

      {!round ? (
        <div className="toon pad" style={{ marginTop: 16 }}>
          <p style={{ margin: 0 }}>Create a round first and the numbers will appear here.</p>
        </div>
      ) : (
        <Report roundId={round.id} />
      )}
    </>
  );
}

async function Report({ roundId }: { roundId: string }) {
  const a = await roundAnalytics(roundId);
  const share = (n: number, of: number) => (of > 0 ? Math.min(100, Math.round((n / of) * 100)) : 0);
  const bridge = share(a.crossed, a.crossTotal);

  return (
    <>
      <div className="tiles" style={{ marginTop: 16 }}>
        <div className="toon tile"><b>{a.players}</b><span>on a team</span></div>
        <div className="toon tile"><b>{share(a.touched, a.audience)}%</b><span>did anything</span></div>
        <div className="toon tile"><b>{a.proofs}</b><span>posts</span></div>
        <div className="toon tile"><b>{a.reactions}</b><span>reactions</span></div>
      </div>

      {/* ── who is actually playing ── */}
      <div className="head"><h2>Taking part</h2></div>
      <div className="toon pad stack">
        <Meter label="Posted at least once" n={a.posted} of={a.audience} />
        <Meter label="Reacted to someone" n={a.reacted} of={a.audience} tone="mint" />
        <Meter label="Teams that have closed a cell" n={a.teams - a.silentTeams} of={a.teams} tone="sun" />
        <p className="muted" style={{ margin: 0 }}>
          Out of {a.audience} people who can sign in, {a.players} are on a team this round.
          {" "}{a.freePosts} of the {a.proofs} posts are photos off the board.
          {a.silentTeams > 0 && ` ${a.silentTeams} ${a.silentTeams === 1 ? "team has" : "teams have"} not closed anything yet.`}
        </p>
      </div>

      {/* ── the question the simulation was about ── */}
      <div className="head"><h2>Is anyone running away with it?</h2></div>
      <div className="toon pad stack">
        <div className="tiles plain">
          <div className="toon tile"><b>{a.leader}</b><span>leader</span></div>
          <div className="toon tile"><b>{a.median}</b><span>median team</span></div>
          <div className="toon tile"><b>{a.ratio ? a.ratio.toFixed(2) : "—"}×</b><span>leader ÷ median</span></div>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {a.ratio === 0
            ? "Not enough scores yet to say."
            : a.ratio < 2.2
              ? "Healthy: the leader is ahead but the middle of the table is still in the game."
              : a.ratio < 3
                ? "Getting wide. Worth a nudge in the digest, or the pace change on day five."
                : "The leader has broken away. Consider lifting the daily reveal limit so the middle can catch up."}
        </p>
      </div>

      {/* ── the point of the whole exercise ── */}
      <div className="head"><h2>Across departments</h2></div>
      <div className="toon pad stack">
        <Meter label="Reactions that crossed a department" n={a.crossed} of={a.crossTotal} tone="grape" />
        <p className="muted" style={{ margin: 0 }}>
          {a.crossTotal === 0
            ? "No reactions between different people yet."
            : `${bridge}% of reactions went to someone outside the sender's own department. This is the number the game exists to move.`}
        </p>
        {a.pairs.length > 0 && (
          <div className="pairs">
            {a.pairs.map((p) => (
              <span key={`${p.a}|${p.b}`} className="chip">
                {p.a} ↔ {p.b} <b>{p.n}</b>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── rhythm ── */}
      <div className="head"><h2>Day by day</h2></div>
      <div className="toon pad stack" style={{ gap: 18 }}>
        <Bars days={a.days} pick={(d) => d.proofs} label="Posts" tone="var(--brand)" />
        <Bars days={a.days} pick={(d) => d.reactions} label="Reactions" tone="var(--mint)" />
        <p className="muted" style={{ margin: 0 }}>
          Each row is scaled to its own busiest day. Reactions are counted against the day of the
          post they landed on, not the moment they were pressed.
        </p>
      </div>

      {/* ── content ── */}
      <div className="head"><h2>Which tasks work</h2></div>
      <div className="two-col">
        <div className="toon pad">
          <h3 className="sub">People just do these</h3>
          <Tasks rows={a.easiest} />
        </div>
        <div className="toon pad">
          <h3 className="sub">These sit untouched</h3>
          <Tasks rows={a.hardest} />
          <p className="muted" style={{ marginBottom: 0 }}>
            A task nobody closes is either too hard, too vague or not funny. Edit it rather than
            waiting for the round to end.
          </p>
        </div>
      </div>

      {/* ── who to nudge ── */}
      <div className="head">
        <h2>Nobody has heard from</h2>
        <span className="hint">{a.quietTotal} {a.quietTotal === 1 ? "person" : "people"}</span>
      </div>
      <div className="toon pad">
        {a.quietTotal === 0 ? (
          <p style={{ margin: 0 }}>Everyone on a team has posted or reacted at least once.</p>
        ) : (
          <>
            <div className="pairs">
              {a.quiet.map((p) => (
                <span key={p.id} className="chip">
                  {p.name} <span className="muted">· {p.department ?? "—"} · {p.team}</span>
                </span>
              ))}
            </div>
            {a.quietTotal > a.quiet.length && (
              <p className="muted" style={{ marginBottom: 0 }}>…and {a.quietTotal - a.quiet.length} more.</p>
            )}
          </>
        )}
      </div>
    </>
  );
}

function Meter({ label, n, of, tone = "brand" }: { label: string; n: number; of: number; tone?: string }) {
  const pct = of > 0 ? Math.min(100, Math.round((n / of) * 100)) : 0;
  return (
    <div>
      <div className="mlbl">
        <span>{label}</span>
        <span>{n} of {of} · {pct}%</span>
      </div>
      <div className="track">
        <div className="fill" style={{ width: `${pct}%`, background: `var(--${tone})` }} />
      </div>
    </div>
  );
}

function Bars({
  days,
  pick,
  label,
  tone,
}: {
  days: DayCount[];
  pick: (d: DayCount) => number;
  label: string;
  tone: string;
}) {
  const max = Math.max(1, ...days.map(pick));
  return (
    <div>
      <div className="mlbl"><span>{label}</span><span>peak {max}</span></div>
      {days.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>Nothing yet.</p>
      ) : (
        <div className="bars">
          {days.map((d) => (
            <div key={d.day} className="bars-col" title={`${d.day}: ${pick(d)}`}>
              <div className="bars-slot">
                <div className="bars-bar" style={{ height: `${(pick(d) / max) * 100}%`, background: tone }} />
              </div>
              <small>{d.day.slice(8)}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Tasks({ rows }: { rows: TaskRow[] }) {
  if (rows.length === 0) return <p className="muted" style={{ margin: 0 }}>No boards yet.</p>;
  return (
    <ul className="tasklist">
      {rows.map((t) => (
        <li key={t.short}>
          <span>{t.short}</span>
          <b>{Math.round(t.rate * 100)}%</b>
          <small>{t.closed}/{t.onBoards}</small>
        </li>
      ))}
    </ul>
  );
}
