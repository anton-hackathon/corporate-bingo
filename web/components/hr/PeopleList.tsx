"use client";

import { useMemo, useState, useTransition } from "react";
import { setUserActiveAction } from "@/app/actions";

type Person = {
  id: string;
  name: string;
  email: string;
  department: string | null;
  office: string | null;
  role: "PLAYER" | "HR";
  active: boolean;
};

export function PeopleList({ people, meId }: { people: Person[]; meId: string }) {
  const [q, setQ] = useState("");
  const [onlyOff, setOnlyOff] = useState(false);
  const [off, setOff] = useState<Set<string>>(new Set(people.filter((p) => !p.active).map((p) => p.id)));
  const [note, setNote] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return people.filter((p) => {
      if (onlyOff && !off.has(p.id)) return false;
      if (!s) return true;
      return (
        p.name.toLowerCase().includes(s) ||
        p.email.toLowerCase().includes(s) ||
        (p.department ?? "").toLowerCase().includes(s)
      );
    });
  }, [q, people, onlyOff, off]);

  const toggle = (p: Person, next: boolean) =>
    start(async () => {
      const res = await setUserActiveAction(p.id, next);
      if (res.ok) {
        setOff((cur) => {
          const n = new Set(cur);
          if (next) n.delete(p.id);
          else n.add(p.id);
          return n;
        });
        setNote(res.message ?? null);
      } else {
        setNote(res.error);
      }
      setConfirming(null);
    });

  return (
    <>
      <div className="inline" style={{ marginBottom: 12 }}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, email or department…"
          style={{ flex: 1, minWidth: 180 }}
        />
        <button className={`btn sm ${onlyOff ? "primary" : "ghost"}`} onClick={() => setOnlyOff((v) => !v)}>
          Disabled only
        </button>
      </div>

      {note && (
        <div className="toon pad" style={{ background: "var(--sun)", color: "var(--on-sun)", fontWeight: 700, marginBottom: 12 }}>
          {note}
        </div>
      )}

      <div className="toon rows" style={{ maxHeight: 560, overflowY: "auto" }}>
        {list.map((p) => {
          const disabled = off.has(p.id);
          const isMe = p.id === meId;
          return (
            <div
              key={p.id}
              className="row"
              style={{ gridTemplateColumns: "1fr auto", opacity: disabled ? 0.55 : 1 }}
            >
              <div className="nm">
                {p.name}
                {p.role === "HR" && <span className="chip brand tiny" style={{ marginLeft: 7 }}>HR</span>}
                {disabled && <span className="chip coral tiny" style={{ marginLeft: 7 }}>disabled</span>}
                <small>
                  {p.email} · {p.department ?? "no department set"} · {p.office === "remote" ? "remote" : "office"}
                </small>
              </div>

              {isMe ? (
                <span className="muted" style={{ fontSize: 12 }}>this is you</span>
              ) : disabled ? (
                <button className="btn sm" disabled={busy} onClick={() => toggle(p, true)}>
                  Enable
                </button>
              ) : p.role === "HR" ? (
                <span className="muted" style={{ fontSize: 12 }}>not allowed</span>
              ) : confirming === p.id ? (
                <span className="inline" style={{ gap: 6, flexWrap: "nowrap" }}>
                  <button className="btn danger sm" disabled={busy} onClick={() => toggle(p, false)}>
                    Yes
                  </button>
                  <button className="btn ghost sm" onClick={() => setConfirming(null)}>
                    No
                  </button>
                </span>
              ) : (
                <button className="btn ghost sm" onClick={() => setConfirming(p.id)}>
                  Disable
                </button>
              )}
            </div>
          );
        })}
        {!list.length && <div className="row muted" style={{ gridTemplateColumns: "1fr" }}>Nobody matches that</div>}
      </div>

      <p className="muted" style={{ marginTop: 10 }}>
        A disabled employee loses access immediately: their sessions are dropped and they cannot
        sign in again. Their proofs stay in the feed; remove those one by one under Latest proofs,
        so every removal is a deliberate decision.
      </p>
    </>
  );
}
