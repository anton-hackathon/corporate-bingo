"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { saveTaskAction, toggleTaskAction, type ActionResult } from "@/app/actions";

export type TaskRow = {
  id: number;
  short: string;
  full: string;
  difficulty: number;
  proof: "PHOTO" | "SCREEN" | "TEXT";
  tags: string[];
  active: boolean;
  clientFacing: boolean;
  retro: boolean;
};

// TEXT stays in the map for any task still carrying it; it is no longer offered.
const PROOF = { PHOTO: "photo", SCREEN: "screenshot", TEXT: "text" } as const;

export function TaskList({ tasks }: { tasks: TaskRow[] }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<TaskRow | "new" | null>(null);
  const [off, setOff] = useState<Set<number>>(new Set(tasks.filter((t) => !t.active).map((t) => t.id)));
  const [, start] = useTransition();

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return tasks;
    return tasks.filter((t) => t.short.toLowerCase().includes(s) || t.full.toLowerCase().includes(s));
  }, [q, tasks]);

  return (
    <>
      <div className="inline" style={{ marginBottom: 14 }}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tasks…"
          style={{ flex: 1, minWidth: 180 }}
        />
        <button className="btn primary" onClick={() => setEditing("new")}>Add</button>
      </div>

      <div className="toon rows">
        {list.map((t) => (
          <div key={t.id} className="row" style={{ gridTemplateColumns: "1fr auto auto", opacity: off.has(t.id) ? 0.45 : 1 }}>
            <div className="nm">
              {t.short}
              <small>
                {"●".repeat(t.difficulty)}{"○".repeat(3 - t.difficulty)} · {PROOF[t.proof]}
                {t.tags.includes("office") ? " · office only" : ""}
                {t.clientFacing ? " · client-facing" : ""}
                {t.retro ? " · retro" : ""}
              </small>
            </div>
            <button className="btn ghost sm" onClick={() => setEditing(t)}>Edit</button>
            <button
              className={`btn sm ${off.has(t.id) ? "ghost" : ""}`}
              onClick={() =>
                start(async () => {
                  const next = off.has(t.id);
                  setOff((s) => {
                    const n = new Set(s);
                    if (next) n.delete(t.id);
                    else n.add(t.id);
                    return n;
                  });
                  await toggleTaskAction(t.id, next);
                })
              }
            >
              {off.has(t.id) ? "On" : "Off"}
            </button>
          </div>
        ))}
        {!list.length && <div className="row muted" style={{ gridTemplateColumns: "1fr" }}>Nothing matches that</div>}
      </div>

      {editing && (
        <TaskSheet task={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function TaskSheet({ task, onClose }: { task: TaskRow | null; onClose: () => void }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveTaskAction, null);
  const [short, setShort] = useState(task?.short ?? "");

  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form action={action} className="sheet stack" style={{ gap: 12 }}>
        <h3 style={{ fontSize: 20 }}>{task ? "Edit task" : "New task"}</h3>
        {task && <input type="hidden" name="id" value={task.id} />}

        <div>
          <label htmlFor="short">Short name · {short.length}/28</label>
          <p className="muted" style={{ margin: "2px 0 6px" }}>This is the text that sits in the cell. Anything longer gets cut off.</p>
          <input id="short" name="short" required maxLength={28} value={short} onChange={(e) => setShort(e.target.value)} />
        </div>

        <div>
          <label htmlFor="full">Full description</label>
          <textarea id="full" name="full" required defaultValue={task?.full ?? ""} maxLength={500} style={{ marginTop: 6 }} />
        </div>

        <div className="inline" style={{ gap: 10 }}>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label htmlFor="difficulty">Difficulty</label>
            <select id="difficulty" name="difficulty" defaultValue={task?.difficulty ?? 2} style={{ marginTop: 6 }}>
              <option value={1}>1 — easy</option>
              <option value={2}>2 — medium</option>
              <option value={3}>3 — hard</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label htmlFor="proof">Proof type</label>
            <select id="proof" name="proof" defaultValue={task?.proof ?? "PHOTO"} style={{ marginTop: 6 }}>
              <option value="PHOTO">photo</option>
              <option value="SCREEN">screenshot</option>
            </select>
          </div>
        </div>

        <label className="inline" style={{ gap: 8, fontWeight: 600 }}>
          <input
            type="checkbox"
            name="officeOnly"
            defaultChecked={task?.tags.includes("office") ?? false}
            style={{ width: 20, height: 20 }}
          />
          Can only be done in the office
        </label>

        {/* Whether a task is dealt at all is the On/Off button in the list, not
            a checkbox here that quietly disagreed with it. */}
        <div>
          <label className="inline" style={{ gap: 8, fontWeight: 600 }}>
            <input type="checkbox" name="retro" defaultChecked={task?.retro ?? false} style={{ width: 20, height: 20 }} />
            Retro activity
          </label>
          <p className="muted" style={{ margin: "4px 0 0 28px", fontSize: 12 }}>
            Can be closed from something that already happened, with no need to arrange anything.
            Every board is dealt at least three, and they are the only face-down cells marked
            &ldquo;start here&rdquo; — so a team has a way to score on the first morning.
          </p>
        </div>

        {state && !state.ok && <div className="toon err pad">{state.error}</div>}

        <button className="btn primary block" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        <button type="button" className="btn ghost block" onClick={onClose}>Cancel</button>
      </form>
    </div>
  );
}
