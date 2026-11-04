"use client";

import { useActionState, useState, useTransition } from "react";
import { RoundStatus } from "@prisma/client";
import { buildTeamsAction, saveRoundAction, setRoundStatusAction, type ActionResult } from "@/app/actions";

// Only what HR can actually set. The pacing and scoring dials (cells per day,
// the reaction bonus, client-facing tasks) are real and still honoured — they
// just sit at their defaults rather than in front of someone who would have to
// guess what moving them does.
type Round = {
  id: string;
  title: string;
  status: RoundStatus;
  teamSize: number;
  revealsPerDay: number;
  allowFreePosts: boolean;
  freePostsPerDay: number;
  pointsLine: number;
  pointsFirstLine: number;
  pointsBlackout: number;
  reactionBonusAt: number;
  reactionBonusPoints: number;
};

export function RoundPanel({ round, signups }: { round: Round | null; signups: number }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveRoundAction, null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, start] = useTransition();

  // Before the boards are dealt there is still a decision to make about the
  // name and the team size; afterwards there is not.
  const draft = !round || round.status === RoundStatus.DRAFT;

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const res = await fn();
      setNote(res.ok ? (res.message ?? "Done") : res.error);
    });

  return (
    <>
      <div className="head"><h2>Round</h2></div>

      {round && (
        <div className="toon pad stack" style={{ marginBottom: 14 }}>
          <div className="inline">
            {round.status === "DRAFT" && (
              <button className="btn primary sm" disabled={busy} onClick={() => run(() => setRoundStatusAction(round.id, RoundStatus.SIGNUP))}>
                Open sign-ups
              </button>
            )}
            {round.status === "SIGNUP" && (
              <button className="btn primary sm" disabled={busy} onClick={() => run(() => buildTeamsAction(round.id))}>
                Build teams from {signups} {signups === 1 ? "person" : "people"}
              </button>
            )}
            {round.status === "ACTIVE" && (
              <button className="btn danger sm" disabled={busy} onClick={() => run(() => setRoundStatusAction(round.id, RoundStatus.FINISHED))}>
                Finish the round
              </button>
            )}
            {round.status === "FINISHED" && <span className="chip">Round finished</span>}
          </div>
          {note && <div className="toon pad" style={{ background: "var(--sun)", color: "var(--on-sun)", fontWeight: 700, boxShadow: "none" }}>{note}</div>}
          <p className="muted" style={{ margin: 0 }}>
            Teams are built once from everyone who signed up. Rebuilding wipes the current boards.
          </p>
        </div>
      )}

      <form action={action} className="toon pad">
        {round && <input type="hidden" name="id" value={round.id} />}

        {/* Both of these are settled before a round starts: the name goes on the
            sign-up screen, and the team size decides the board layout, which is
            why the server refuses to move it once boards exist. Showing them on
            a running round is offering a lever that does nothing. */}
        {draft && (
          <>
            <div className="field">
              <div style={{ flex: 1 }}>
                <label htmlFor="title">Round name</label>
                <p>Players see this on the sign-up screen.</p>
              </div>
              <div className="ctl"><input id="title" name="title" defaultValue={round?.title ?? "Bingo, round 1"} /></div>
            </div>

            <div className="field">
              <div style={{ flex: 1 }}>
                <label htmlFor="teamSize">Team size</label>
                <p>Anyone left over joins the smallest teams. Fixed once the boards are dealt.</p>
              </div>
              <div className="ctl"><input id="teamSize" name="teamSize" type="number" min={2} max={6} defaultValue={round?.teamSize ?? 3} /></div>
            </div>
          </>
        )}

        <div className="field">
          <div style={{ flex: 1 }}>
            <label htmlFor="revealsPerDay">Cells each person turns over per day</label>
            <p>
              The pace of the whole game. A team of three uncovers this many new tasks a day
              between them. 0 lets everyone turn over as many as they like.
            </p>
          </div>
          <div className="ctl">
            <input id="revealsPerDay" name="revealsPerDay" type="number" min={0} max={25} defaultValue={round?.revealsPerDay ?? 1} />
          </div>
        </div>

        <div className="field">
          <div style={{ flex: 1 }}>
            <label htmlFor="allowFreePosts">Photos off the board</label>
            <p>
              Anyone may post a photo with no task behind it. It scores nothing and
              goes up under a task name picked at random, so the feed is alive before the first
              cell is closed and nobody can read a team&apos;s board off its posts.
            </p>
          </div>
          <div className="ctl" style={{ width: "auto" }}>
            <input id="allowFreePosts" name="allowFreePosts" type="checkbox" defaultChecked={round?.allowFreePosts ?? true} style={{ width: 22, height: 22 }} />
          </div>
        </div>

        <div className="field">
          <div style={{ flex: 1 }}>
            <label htmlFor="freePostsPerDay">How many of those per person per day</label>
            <p>Only applies while the switch above is on.</p>
          </div>
          <div className="ctl">
            <input id="freePostsPerDay" name="freePostsPerDay" type="number" min={1} max={20} defaultValue={round?.freePostsPerDay ?? 2} />
          </div>
        </div>

        <p className="muted" style={{ margin: "18px 0 0", fontWeight: 700, color: "var(--ink)" }}>
          What each achievement is worth
        </p>
        <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
          A cell always pays its own difficulty, 1 to 3. Moving anything below changes what every
          team&apos;s score already means, so the leaderboard is recalculated when you save.
        </p>

        <div className="field">
          <div style={{ flex: 1 }}>
            <label htmlFor="pointsLine">A completed line</label>
            <p>Five cells in a row, a column or a diagonal.</p>
          </div>
          <div className="ctl">
            <input id="pointsLine" name="pointsLine" type="number" min={0} max={200} defaultValue={round?.pointsLine ?? 5} />
          </div>
        </div>

        <div className="field">
          <div style={{ flex: 1 }}>
            <label htmlFor="pointsFirstLine">The first line of the round</label>
            <p>Paid once, to whichever team gets there first.</p>
          </div>
          <div className="ctl">
            <input id="pointsFirstLine" name="pointsFirstLine" type="number" min={0} max={200} defaultValue={round?.pointsFirstLine ?? 10} />
          </div>
        </div>

        <div className="field">
          <div style={{ flex: 1 }}>
            <label htmlFor="pointsBlackout">The whole board</label>
            <p>All twenty-five cells closed.</p>
          </div>
          <div className="ctl">
            <input id="pointsBlackout" name="pointsBlackout" type="number" min={0} max={500} defaultValue={round?.pointsBlackout ?? 25} />
          </div>
        </div>

        <div className="field">
          <div style={{ flex: 1 }}>
            <label htmlFor="reactionBonusAt">Reactions a photo needs for a bonus</label>
            <p>Counted from people outside the poster&apos;s own team.</p>
          </div>
          <div className="ctl">
            <input id="reactionBonusAt" name="reactionBonusAt" type="number" min={1} max={200} defaultValue={round?.reactionBonusAt ?? 10} />
          </div>
        </div>

        <div className="field">
          <div style={{ flex: 1 }}>
            <label htmlFor="reactionBonusPoints">What that bonus pays</label>
            <p>Once per photo, however many more reactions it collects.</p>
          </div>
          <div className="ctl">
            <input id="reactionBonusPoints" name="reactionBonusPoints" type="number" min={0} max={50} defaultValue={round?.reactionBonusPoints ?? 2} />
          </div>
        </div>

        <div className="inline" style={{ marginTop: 14 }}>
          <button className="btn primary" disabled={pending}>{pending ? "Saving…" : round ? "Save" : "Create round"}</button>
          {state && !state.ok && <span style={{ color: "var(--coral)", fontWeight: 700 }}>{state.error}</span>}
          {state?.ok && <span style={{ fontWeight: 700 }}>{state.message}</span>}
        </div>
      </form>
    </>
  );
}
