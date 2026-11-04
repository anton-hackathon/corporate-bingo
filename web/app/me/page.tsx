import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getActiveRound, getMyTeam } from "@/lib/game";
import { personalStats, type Fan, type MyPhoto } from "@/lib/stats";
import { logout } from "@/app/actions";
import { MouseMascot } from "@/components/Mascots";

export default async function MePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const round = await getActiveRound();
  const [team, stats] = await Promise.all([
    round ? getMyTeam(user.id, round.id) : null,
    round ? personalStats(user.id, round.id) : null,
  ]);

  return (
    <>
      <section className="toon banner">
        <MouseMascot className="mascot" size={110} />
        <h1>{user.name}</h1>
        <div className="who">{user.email} · {user.department ?? "no department set"}</div>
      </section>

      {!stats ? (
        <div className="toon pad" style={{ marginTop: 16 }}>
          <p style={{ margin: 0 }}>No round is running, so there is nothing to count yet.</p>
        </div>
      ) : (
        <>
          <div className="tiles" style={{ marginTop: 16 }}>
            <div className="toon tile"><b>{stats.cellsClosed}</b><span>cells closed</span></div>
            <div className="toon tile"><b>{stats.proofs}</b><span>posts</span></div>
            <div className="toon tile"><b>{stats.reactionsReceived}</b><span>reactions got</span></div>
            <div className="toon tile"><b>{stats.reactionsGiven}</b><span>reactions given</span></div>
          </div>

          <div className="head"><h2>Where your photos went</h2></div>
          <div className="toon pad stack" style={{ gap: 14 }}>
            {stats.reactionsReceived === 0 && stats.reactionsGiven === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Nothing to read yet. Post something, or go and press a button on someone else&apos;s
                photo — half of this page is about who you turn up for.
              </p>
            ) : (
              <>
                <Line
                  label="Your biggest fan"
                  fan={stats.topFan}
                  suffix={(f) => `${f.count} ${f.count === 1 ? "reaction" : "reactions"}, usually ${f.emoji}`}
                  empty="Nobody has reacted to you yet."
                />
                <Line
                  label="You turn up for"
                  fan={stats.topCheered}
                  suffix={(f) => `${f.count} ${f.count === 1 ? "reaction" : "reactions"} from you`}
                  empty="You have not reacted to anyone yet."
                />

                <div className="reach">
                  <span className="chip mint">{stats.fans} {stats.fans === 1 ? "person" : "people"} reacted to you</span>
                  <span className="chip brand">{stats.departmentsReached} {stats.departmentsReached === 1 ? "department" : "departments"} reached</span>
                  {stats.myEmoji && <span className="chip sun">your button: {stats.myEmoji.emoji} ×{stats.myEmoji.count}</span>}
                  {stats.bonuses > 0 && <span className="chip coral">{stats.bonuses} reaction {stats.bonuses === 1 ? "bonus" : "bonuses"}</span>}
                </div>

                {stats.bestPhoto && stats.bestPhoto.reactions > 0 && (
                  <p className="muted" style={{ margin: 0 }}>
                    Your best-loved shot is <b>{stats.bestPhoto.task}</b> with{" "}
                    {stats.bestPhoto.reactions} {stats.bestPhoto.reactions === 1 ? "reaction" : "reactions"}.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="head">
            <h2>Your photos</h2>
            {stats.photos.length > 0 && (
              <a className="btn sm ghost" href="/api/my-photos" download>Download all</a>
            )}
          </div>
          {stats.photos.length === 0 ? (
            <div className="toon pad">
              <p className="muted" style={{ margin: 0 }}>
                No photos this round yet. They are yours — whatever you post here you can take
                away again.
              </p>
            </div>
          ) : (
            <div className="photo-row">
              {stats.photos.map((p) => <Shot key={p.id} photo={p} />)}
            </div>
          )}
        </>
      )}

      <div className="head"><h2>Team</h2></div>
      <div className="toon pad">
        {team ? <p style={{ margin: 0 }}>You are on <b>{team.name}</b>.</p> : <p style={{ margin: 0 }}>You are not on a team this round.</p>}
      </div>

      <form action={logout} style={{ marginTop: 22 }}>
        <button className="btn ghost">Sign out</button>
      </form>
    </>
  );
}

function Line({
  label,
  fan,
  suffix,
  empty,
}: {
  label: string;
  fan: Fan | null;
  suffix: (f: Fan) => string;
  empty: string;
}) {
  if (!fan) return <p className="muted" style={{ margin: 0 }}>{empty}</p>;
  return (
    <p style={{ margin: 0 }}>
      {label}: <b>{fan.name}</b>
      {fan.department ? <span className="muted"> · {fan.department}</span> : null}
      <span className="muted"> — {suffix(fan)}</span>
    </p>
  );
}

function Shot({ photo }: { photo: MyPhoto }) {
  return (
    <figure className="toon shot-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/uploads/${photo.imageKey}`} alt={photo.caption ?? photo.task} loading="lazy" decoding="async" />
      <figcaption>
        <span>{photo.task}</span>
        <a
          className="dl"
          href={`/api/uploads/${photo.imageKey}?download=1`}
          download
          aria-label={`Download the photo for ${photo.task}`}
          title="Save this one"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
          </svg>
        </a>
      </figcaption>
    </figure>
  );
}
