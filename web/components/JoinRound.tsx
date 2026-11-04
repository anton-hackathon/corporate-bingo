"use client";

import { useState, useTransition } from "react";
import { joinRoundAction } from "@/app/actions";
import { CrittersMascot } from "./Mascots";

export function JoinRound({
  roundId,
  title,
  joined,
  count,
}: {
  roundId: string;
  title: string;
  joined: boolean;
  count: number;
}) {
  const [done, setDone] = useState(joined);
  const [pending, start] = useTransition();

  return (
    <div className="toon empty" style={{ marginTop: 24 }}>
      <CrittersMascot />
      <h2>{title}</h2>
      {done ? (
        <>
          <p>You are on the list. Once teams are built we will email you your board.</p>
          <p className="muted" style={{ marginTop: 4 }}>{count} people have signed up so far</p>
        </>
      ) : (
        <>
          <p>
            We are gathering players. Teams of three, picked at random, so the departments get mixed together.
            Taking part is entirely up to you.
          </p>
          <p className="muted" style={{ marginTop: 8 }}>
            Nothing gets checked here. A cell closes the moment you post a proof, and that only
            works because we take it as read that the points came from something that actually
            happened — not from a picture a model made in ten seconds.
          </p>
          <p className="muted" style={{ marginTop: 4 }}>{count} people have signed up so far</p>
          <button
            className="btn primary"
            style={{ marginTop: 14 }}
            disabled={pending}
            onClick={() => start(async () => { await joinRoundAction(roundId); setDone(true); })}
          >
            {pending ? "Signing you up…" : "I’m in"}
          </button>
        </>
      )}
    </div>
  );
}
