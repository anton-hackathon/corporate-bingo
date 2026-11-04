"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createTeamAction,
  deleteTeamAction,
  moveMemberAction,
  renameTeamAction,
  type ActionResult,
} from "@/app/actions";

type Member = { id: string; name: string; department: string | null; office: string | null; active: boolean };
type Team = { id: string; name: string; points: number; cellsDone: number; members: Member[] };
type Free = { id: string; name: string; department: string | null };

export function TeamsEditor({
  roundId,
  roundTitle,
  teamSize,
  teams,
  free,
}: {
  roundId: string;
  roundTitle: string;
  teamSize: number;
  teams: Team[];
  free: Free[];
}) {
  const [note, setNote] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, start] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const res = await fn();
      setNote(res.ok ? (res.message ?? "Done") : res.error);
      router.refresh();
    });

  return (
    <>
      <div className="head">
        <h2>Team rosters</h2>
        <span className="hint">{roundTitle} · {teams.length} {teams.length === 1 ? "team" : "teams"} · {teamSize} per team</span>
      </div>

      {note && (
        <div className="toon pad" style={{ background: "var(--sun)", color: "var(--on-sun)", fontWeight: 700, marginBottom: 12 }}>
          {note}
        </div>
      )}

      <div className="toon pad inline" style={{ marginBottom: 14 }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Name for the new team"
          style={{ flex: 1, minWidth: 180 }}
        />
        <button
          className="btn primary sm"
          disabled={busy || newName.trim().length < 2}
          onClick={() => run(async () => { const r = await createTeamAction(roundId, newName); setNewName(""); return r; })}
        >
          Create team + board
        </button>
      </div>

      {free.length > 0 && (
        <div className="toon pad" style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 800, color: "var(--ink)", marginBottom: 4 }}>No team · {free.length}</div>
          <p className="muted" style={{ margin: "0 0 10px" }}>
            These employees are not on any team this round — someone who signed up late, for instance.
          </p>
          <div className="freelist">
            {free.map((p) => (
              <div key={p.id} className="freerow">
                <span className="nm">
                  {p.name}
                  <small>{p.department ?? "no department set"}</small>
                </span>
                <select
                  defaultValue=""
                  disabled={busy}
                  aria-label={`Add ${p.name} to a team`}
                  onChange={(e) => {
                    const to = e.target.value;
                    if (to) run(() => moveMemberAction(roundId, p.id, to));
                  }}
                >
                  <option value="">add to…</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.members.length})
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="teamgrid">
        {teams.map((t) => (
          <TeamCard key={t.id} team={t} teams={teams} roundId={roundId} teamSize={teamSize} busy={busy} run={run} />
        ))}
      </div>

      <p className="muted" style={{ marginTop: 14 }}>
        A team&apos;s score does not depend on its roster; it is based on the cells already closed. Personal
        points do follow the current team, so once someone moves, the cells they closed on their old
        team stop counting towards them. The board is not rebuilt when the roster changes: if nobody
        from an office is left on the team, an office task on its board can become impossible, and the
        simplest fix is to switch that task off in the pool.
      </p>
    </>
  );
}

/**
 * Renaming used to be a bare input that saved on blur, which nobody found and
 * which said nothing when it worked. Now it is a button, Enter saves and
 * Escape puts the old name back.
 */
function TeamName({
  team,
  busy,
  run,
}: {
  team: Team;
  busy: boolean;
  run: (fn: () => Promise<ActionResult>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  const ref = useRef<HTMLInputElement>(null);

  // The card is re-rendered from the server after a save or a rejection, so the
  // field follows whatever the database actually holds.
  useEffect(() => setName(team.name), [team.name]);
  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);

  const cancel = () => { setName(team.name); setEditing(false); };
  const save = () => {
    const clean = name.trim();
    setEditing(false);
    if (clean === team.name) return;
    if (clean.length < 2) { setName(team.name); return; }
    run(() => renameTeamAction(team.id, clean));
  };

  if (!editing) {
    return (
      <>
        <b className="teamname">{team.name}</b>
        <button
          type="button"
          className="iconbtn"
          disabled={busy}
          title="Rename this team"
          aria-label={`Rename ${team.name}`}
          onClick={() => setEditing(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
            <path d="m14.5 6.5 3 3" />
          </svg>
        </button>
      </>
    );
  }

  return (
    <>
      <input
        ref={ref}
        className="teamname-input"
        value={name}
        maxLength={40}
        aria-label="Team name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); save(); }
          if (e.key === "Escape") { e.preventDefault(); cancel(); }
        }}
      />
      <button type="button" className="btn primary sm" disabled={busy} onClick={save}>Save</button>
      <button type="button" className="btn ghost sm" onClick={cancel}>Cancel</button>
    </>
  );
}

function TeamCard({
  team,
  teams,
  roundId,
  teamSize,
  busy,
  run,
}: {
  team: Team;
  teams: Team[];
  roundId: string;
  teamSize: number;
  busy: boolean;
  run: (fn: () => Promise<ActionResult>) => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const short = team.members.length < teamSize;

  return (
    <div className="toon teamcard">
      <div className="teamcard-head">
        <TeamName team={team} busy={busy} run={run} />
        <span className="chip">{team.points} pts</span>
      </div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
        {team.cellsDone} {team.cellsDone === 1 ? "cell" : "cells"} · {team.members.length} of {teamSize}
        {short && <span className="chip coral tiny" style={{ marginLeft: 7 }}>short-staffed</span>}
      </div>

      {team.members.length === 0 && <p className="muted" style={{ margin: "0 0 8px" }}>This team is empty.</p>}

      {team.members.map((m) => (
        <div key={m.id} className="memberrow">
          <span className="nm">
            {m.name}
            {!m.active && <span className="chip coral tiny" style={{ marginLeft: 6 }}>disabled</span>}
            <small>{m.department ?? "no department set"} · {m.office === "remote" ? "remote" : "office"}</small>
          </span>
          <select
            defaultValue=""
            disabled={busy}
            aria-label={`Move ${m.name}`}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              run(() => moveMemberAction(roundId, m.id, v === "none" ? null : v));
            }}
          >
            <option value="">move to…</option>
            {teams.filter((x) => x.id !== team.id).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} ({x.members.length})
              </option>
            ))}
            <option value="none">remove from the team</option>
          </select>
        </div>
      ))}

      {team.members.length === 0 && team.cellsDone === 0 && (
        <div className="inline" style={{ marginTop: 8 }}>
          {confirmDel ? (
            <>
              <button className="btn danger sm" disabled={busy} onClick={() => run(() => deleteTeamAction(team.id))}>
                Yes, delete
              </button>
              <button className="btn ghost sm" onClick={() => setConfirmDel(false)}>Cancel</button>
            </>
          ) : (
            <button className="btn ghost sm" onClick={() => setConfirmDel(true)}>Delete team</button>
          )}
        </div>
      )}
    </div>
  );
}
