"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { freePostAction, reactAction, revokeProofAction, setUserActiveAction, setWatchAction, type ActionResult } from "@/app/actions";
import { avaColor, initials } from "@/lib/avatar";
import { keepFirstFile } from "@/lib/files";
import { ProofArt } from "./ProofArt";
import { CrittersMascot } from "./Mascots";

type Item = {
  id: string;
  author: string;
  authorId: string;
  department: string | null;
  team: string | null;
  teamId: string | null;
  task: string;
  kind: "PHOTO" | "SCREEN" | "TEXT";
  text: string | null;
  caption: string | null;
  imageKey: string | null;
  createdAt: string;
  bonused: boolean;
  bingo: { lines: number; blackout: boolean } | null;
  reactions: { emoji: string; userId: string }[];
};

type Team = { id: string; name: string };
type Person = { id: string; name: string; department: string | null; team: string };

const EMOJIS = ["👏", "😂", "🔥"];

export function FeedList({
  items,
  meId,
  isHR,
  total,
  canPost,
  freePostsPerDay,
  bonusAt,
  bonusPoints,
  watchTeamIds,
  watchUserIds,
  teams,
  people,
}: {
  items: Item[];
  meId: string;
  isHR: boolean;
  total: number;
  canPost: boolean;
  freePostsPerDay: number;
  bonusAt: number;
  bonusPoints: number;
  watchTeamIds: string[];
  watchUserIds: string[];
  teams: Team[];
  people: Person[];
}) {
  // The key makes the same message twice count as a new toast, so the timer
  // below restarts instead of the second one inheriting the first one's.
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const [composing, setComposing] = useState(false);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const visible = items.filter((i) => !removed.has(i.id));

  const showToast = useCallback((text: string) => setToast({ text, key: Date.now() }), []);

  // Nothing used to take a toast down again: the one after a post sat over the
  // feed for the rest of the session.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <>
      <div className="head">
        <h2>Feed</h2>
        <span className="hint">{total} {total === 1 ? "proof" : "proofs"} · bonus at {bonusAt} reactions</span>
      </div>

      {canPost && <Composer onOpen={() => setComposing(true)} />}

      {teams.length > 0 && (
        <WatchBar
          teams={teams}
          people={people}
          watchTeamIds={watchTeamIds}
          watchUserIds={watchUserIds}
        />
      )}

      {visible.length === 0 ? (
        <div className="toon empty">
          <CrittersMascot />
          <h2>It&apos;s quiet in here</h2>
          <p>Either nothing has been closed yet, or your filter is too narrow.</p>
        </div>
      ) : (
        <div className="feed">
          {visible.map((p) => (
            <Post
              key={p.id}
              p={p}
              meId={meId}
              isHR={isHR}
              bonusPoints={bonusPoints}
              authorBlocked={blocked.has(p.authorId)}
              onToast={showToast}
              onRemoved={() => setRemoved((r) => new Set(r).add(p.id))}
              onBlocked={() => setBlocked((b) => new Set(b).add(p.authorId))}
            />
          ))}
        </div>
      )}
      {composing && (
        <ComposeSheet
          perDay={freePostsPerDay}
          onClose={() => setComposing(false)}
          onDone={(m) => { setComposing(false); showToast(m); }}
        />
      )}
      {toast && (
        <div className="toast" role="status" onClick={() => setToast(null)}>{toast.text}</div>
      )}
    </>
  );
}

/** The way in for a photo that has no task behind it. */
function Composer({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="toon composer" onClick={onOpen}>
      <span className="composer-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="15" rx="4" />
          <circle cx="12" cy="12.5" r="3.4" />
          <path d="M8 5l1.4-2h5.2L16 5" />
        </svg>
      </span>
      <span className="composer-text">
        <b>Post a photo</b>
        <small>No task needed. It joins the feed like everything else.</small>
      </span>
    </button>
  );
}

function ComposeSheet({ perDay, onClose, onDone }: { perDay: number; onClose: () => void; onDone: (m: string) => void }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(freePostAction, null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onDone(state.message ?? "Posted");
    }
  }, [state, onDone, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Post a photo">
        <h3 style={{ fontSize: 21 }}>A photo off the board</h3>
        <p style={{ marginTop: 8, color: "var(--body)" }}>
          Anything at all — the dog, the view, the third coffee. It scores nothing, and that is
          the point: your post goes up under a task name picked at random, so no one reading the
          feed can work out what is on your board.
        </p>

        <form action={action} className="stack" style={{ marginTop: 14 }}>
          <input
            ref={inputRef}
            type="file"
            name="file"
            accept="image/*"
            multiple={false}
            required
            hidden
            onChange={(e) => setFileName(keepFirstFile(e.currentTarget))}
          />
          <button type="button" className="dropzone" onClick={() => inputRef.current?.click()}>
            <b>{fileName ?? "Choose a photo"}</b>
            <span>A phone snap is perfect. Up to 12 MB.</span>
          </button>

          <div>
            <label htmlFor="free-caption">Caption, optional</label>
            <input id="free-caption" name="caption" maxLength={200} placeholder="What are we looking at?" style={{ marginTop: 6 }} />
          </div>

          <button className="btn primary block" disabled={pending}>
            {pending ? "Posting…" : "Post it"}
          </button>

          {state && !state.ok && <div className="toon err pad">{state.error}</div>}

          <p className="muted" style={{ margin: 0 }}>
            {perDay} a day. Keep code, client data, and anyone who has not agreed to appear out of the shot.
          </p>
          <button type="button" className="btn ghost block" onClick={onClose}>Cancel</button>
        </form>
      </div>
    </div>
  );
}

/** Subscriptions: follow several teams and people at once to keep up with your own. */
function WatchBar({
  teams,
  people,
  watchTeamIds,
  watchUserIds,
}: {
  teams: Team[];
  people: Person[];
  watchTeamIds: string[];
  watchUserIds: string[];
}) {
  const [q, setQ] = useState("");
  const [tIds, setTIds] = useState<string[]>(watchTeamIds);
  const [uIds, setUIds] = useState<string[]>(watchUserIds);
  const [pending, start] = useTransition();
  const router = useRouter();

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 1) return { teams: [], people: [] };
    return {
      teams: teams.filter((t) => !tIds.includes(t.id) && t.name.toLowerCase().includes(s)).slice(0, 5),
      people: people
        .filter((p) => !uIds.includes(p.id) && (p.name.toLowerCase().includes(s) || (p.department ?? "").toLowerCase().includes(s)))
        .slice(0, 5),
    };
  }, [q, teams, people, tIds, uIds]);

  const save = (nextT: string[], nextU: string[]) => {
    setTIds(nextT);
    setUIds(nextU);
    setQ("");
    start(async () => {
      await setWatchAction(nextT, nextU);
      router.refresh();
    });
  };

  const active = tIds.length + uIds.length > 0;

  return (
    <div className="watchbar">
      <div className="watch-input">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a person or a team…"
          aria-label="Find a person or a team"
        />
        {active && (
          <button className="btn sm ghost" disabled={pending} onClick={() => save([], [])}>
            Clear filters
          </button>
        )}
      </div>

      {(matches.teams.length > 0 || matches.people.length > 0) && (
        <div className="toon suggest">
          {matches.teams.map((t) => (
            <button key={t.id} onClick={() => save([...tIds, t.id], uIds)}>
              <span className="chip brand">team</span> {t.name}
            </button>
          ))}
          {matches.people.map((p) => (
            <button key={p.id} onClick={() => save(tIds, [...uIds, p.id])}>
              <span className="chip mint">person</span> {p.name}
              <small> · {p.department ?? "—"} · {p.team}</small>
            </button>
          ))}
        </div>
      )}

      {active && (
        <div className="watch-chips">
          {tIds.map((id) => (
            <button key={id} className="chip brand" onClick={() => save(tIds.filter((x) => x !== id), uIds)}>
              {teamById.get(id)?.name ?? "team"} ✕
            </button>
          ))}
          {uIds.map((id) => (
            <button key={id} className="chip mint" onClick={() => save(tIds, uIds.filter((x) => x !== id))}>
              {personById.get(id)?.name ?? "person"} ✕
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Post({
  p,
  meId,
  isHR,
  bonusPoints,
  authorBlocked,
  onToast,
  onRemoved,
  onBlocked,
}: {
  p: Item;
  meId: string;
  isHR: boolean;
  bonusPoints: number;
  authorBlocked: boolean;
  onToast: (s: string) => void;
  onRemoved: () => void;
  onBlocked: () => void;
}) {
  // One reaction per person: picking another emoji replaces the previous one.
  //
  // Real state, not useOptimistic. An optimistic value only lives as long as
  // the transition that set it; when the action resolves React goes back to
  // the props, and reactAction deliberately does not revalidate the feed
  // (that cost about twenty queries per tap). The two together made the
  // button light up and then snap straight back. Holding it here keeps the
  // tap, and a failed call puts it back explicitly.
  const [reactions, setReactions] = useState(p.reactions);

  // Re-sync only when the server actually sends something different: p.reactions
  // is a fresh array on every parent render and would otherwise wipe the tap.
  const serverKey = p.reactions.map((r) => `${r.userId}:${r.emoji}`).sort().join("|");
  useEffect(() => {
    setReactions(p.reactions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  const setReaction = (action: { emoji: string; on: boolean }) =>
    setReactions((cur) => {
      const others = cur.filter((r) => r.userId !== meId);
      return action.on ? [...others, { emoji: action.emoji, userId: meId }] : others;
    });
  const [, start] = useTransition();
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [busy, startHR] = useTransition();

  const count = (e: string) => reactions.filter((r) => r.emoji === e).length;
  const mine = (e: string) => reactions.some((r) => r.emoji === e && r.userId === meId);

  return (
    <article className="toon post">
      <div className="post-head">
        <div className="ava" style={{ background: avaColor(p.authorId) }}>{initials(p.author)}</div>
        <div style={{ minWidth: 0 }}>
          <div className="who">{p.author}</div>
          <div className="meta">{[p.department, p.team, ago(p.createdAt)].filter(Boolean).join(" · ")}</div>
        </div>
        {authorBlocked && <span className="chip coral" style={{ marginLeft: "auto" }}>author disabled</span>}
        {!authorBlocked && p.bonused && <span className="chip sun" style={{ marginLeft: "auto" }}>+{bonusPoints}</span>}
      </div>

      {p.bingo && (
        <div className="bingo-flag">
          <span aria-hidden="true">🎉</span>
          {p.bingo.blackout
            ? "This one closed the whole board"
            : p.bingo.lines === 1
              ? "This one completed a line"
              : `This one completed ${p.bingo.lines} lines`}
          {p.team ? ` for ${p.team}` : ""}
        </div>
      )}

      {p.kind === "TEXT" ? (
        <div className="bubble">{p.text}</div>
      ) : p.imageKey ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          className="shot"
          src={`/api/uploads/${p.imageKey}`}
          alt={p.task}
          loading="lazy"
          decoding="async"
          // The real ratio is unknown until the file loads; this reserves a
          // sensible box so the feed does not jump as images arrive.
          width={1080}
          height={760}
        />
      ) : (
        <div className="shot-wrap">
          <ProofArt seed={p.id} />
        </div>
      )}

      <div className="post-body">
        <span className="chip brand" style={{ alignSelf: "flex-start" }}>{p.task}</span>
        {p.caption && <div style={{ fontSize: 14.5 }}>{p.caption}</div>}

        <div className="reacts">
          {EMOJIS.map((e) => (
            <button
              key={e}
              className={`react ${mine(e) ? "on" : ""}`}
              onClick={() =>
                start(async () => {
                  const on = !mine(e);
                  const before = reactions;
                  setReaction({ emoji: e, on });
                  const res = await reactAction(p.id, e);
                  if (!res.ok) {
                    setReactions(before);
                    onToast(res.error);
                  } else if (res.message) {
                    onToast(res.message);
                  }
                })
              }
            >
              {e} {count(e)}
            </button>
          ))}
        </div>

        {/* Moderation sits where the proof is, so HR never has to go looking for it. */}
        {isHR && (
          <div className="mod-row">
            <button
              className="btn danger sm"
              disabled={busy}
              onClick={() =>
                startHR(async () => {
                  const res = await revokeProofAction(p.id, "removed by HR");
                  if (res.ok) onRemoved();
                  else onToast(res.error);
                })
              }
            >
              Remove
            </button>
            {!authorBlocked &&
              (confirmBlock ? (
                <>
                  <button
                    className="btn danger sm"
                    disabled={busy}
                    onClick={() =>
                      startHR(async () => {
                        const res = await setUserActiveAction(p.authorId, false);
                        onToast(res.ok ? (res.message ?? "Employee disabled") : res.error);
                        if (res.ok) onBlocked();
                        setConfirmBlock(false);
                      })
                    }
                  >
                    Yes, disable {p.author}
                  </button>
                  <button className="btn ghost sm" onClick={() => setConfirmBlock(false)}>Cancel</button>
                </>
              ) : (
                <button className="btn ghost sm" onClick={() => setConfirmBlock(true)}>Disable the author</button>
              ))}
          </div>
        )}
      </div>
    </article>
  );
}

function ago(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}
