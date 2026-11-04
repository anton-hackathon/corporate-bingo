"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeCellAction, revealCellAction, type ActionResult, type Bingo } from "@/app/actions";
import { avaColor, initials } from "@/lib/avatar";
import { keepFirstFile } from "@/lib/files";

export type Cell = {
  id: string;
  pos: number;
  difficulty: number;
  revealed: boolean;
  revealedBy: string | null;
  revealedById: string | null;
  short: string | null;
  full: string | null;
  proof: "PHOTO" | "SCREEN" | "TEXT" | null;
  retro: boolean;
  tags: string[];
  closed: boolean;
  closedBy: string | null;
  inLine: boolean;
};

const DIFF = ["", "easy", "medium", "hard"];
const PROOF = { PHOTO: "photo", SCREEN: "screenshot", TEXT: "text" } as const;

const STAR = "M12 2.3l2.93 5.94 6.57.95-4.75 4.63 1.12 6.53L12 17.27l-5.87 3.08 1.12-6.53L2.5 9.19l6.57-.95z";

/** Three stars: the difficulty is all a face-down card gives away. */
function Stars({ n, size }: { n: number; size?: "lg" }) {
  return (
    <span className={`stars ${size ?? ""}`} aria-label={`difficulty ${n} of 3`}>
      {[1, 2, 3].map((i) => (
        <svg key={i} className={i <= n ? "on" : ""} viewBox="0 0 24 24" aria-hidden="true">
          <path d={STAR} />
        </svg>
      ))}
    </span>
  );
}

/** Who turned this card over. The board is a shared object; authorship shows. */
function Opener({ name, id }: { name: string; id: string | null }) {
  return (
    <span className="opener" style={{ background: avaColor(id ?? name) }} title={`Revealed by ${name}`}>
      {initials(name)}
    </span>
  );
}

export function Board({
  size,
  cells,
  limitReached,
  revealsLeft,
  hiddenLeft,
}: {
  size: number;
  cells: Cell[];
  limitReached: boolean;
  revealsLeft: number;
  hiddenLeft: number;
}) {
  const [open, setOpen] = useState<Cell | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [bingo, setBingo] = useState<Bingo | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3400);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <>
      <div className="board" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
        {cells.map((c) => (
          <button
            key={c.id}
            className={`cell ${c.revealed ? "up" : ""} ${c.closed ? (c.inLine ? "line" : "done") : ""}`}
            onClick={() => setOpen(c)}
            aria-label={
              c.revealed
                ? `${c.short}${c.closed ? ", done" : ""}`
                : `Face-down task, difficulty ${c.difficulty} of 3${c.retro ? ", can be closed from something you have already done" : ""}`
            }
          >
            {/* Two faces on one card. Revealing only flips the class, and the
                transition does the rest — including when a teammate reveals a
                cell and the page refreshes underneath you. */}
            <span className="flip">
              <span className="face front">
                {!c.closed && c.retro && <span className="first">start here</span>}
                <Stars n={c.difficulty} />
              </span>
              <span className="face rear">
                {c.pos === Math.floor((size * size) / 2) && <span className="star">★</span>}
                {c.closed && (
                  <svg className="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m4 13 5 5L20 7" />
                  </svg>
                )}
                <span className="cell-text">{c.short}</span>
                {c.revealedBy && <Opener name={c.revealedBy} id={c.revealedById} />}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="legend">
        <span><i className="sw hid" />{hiddenLeft > 0 ? `face down · ${hiddenLeft}` : "face down"}</span>
        <span><i className="sw" style={{ background: "var(--card)" }} />revealed</span>
        <span><i className="sw" style={{ background: "var(--brand)" }} />done</span>
        <span><i className="sw" style={{ background: "var(--sun)" }} />in a completed line</span>
      </div>

      {open && (
        <CellSheet
          cell={open}
          limitReached={limitReached}
          revealsLeft={revealsLeft}
          onClose={() => setOpen(null)}
          onToast={(m) => setToast(m)}
          onDone={(msg, b) => { setOpen(null); setToast(msg); setBingo(b ?? null); }}
        />
      )}
      {bingo && <BingoBurst bingo={bingo} onClose={() => setBingo(null)} />}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

/**
 * The moment the game is actually for. A line closing used to be a line in a
 * toast, which is a status update; this is the thing you call people over to see.
 */
function BingoBurst({ bingo, onClose }: { bingo: Bingo; onClose: () => void }) {
  const [motion, setMotion] = useState(false);

  useEffect(() => {
    setMotion(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const t = setTimeout(onClose, 7000);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const earned: string[] = [];
  if (bingo.linePoints > 0) {
    earned.push(`+${bingo.linePoints} for the ${bingo.lines === 1 ? "line" : `${bingo.lines} lines`}`);
  }
  if (bingo.firstLinePoints > 0) earned.push(`+${bingo.firstLinePoints} — first line of the whole round`);
  if (bingo.blackoutPoints > 0) earned.push(`+${bingo.blackoutPoints} — the entire board`);

  return (
    <div className="burst" role="alertdialog" aria-label="Bingo" onClick={onClose}>
      {motion && (
        <div className="confetti" aria-hidden="true">
          {CONFETTI.map((c, i) => (
            <i key={i} style={{ left: `${c.x}%`, background: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s` }} />
          ))}
        </div>
      )}
      <div className="burst-card toon">
        <span className="burst-word">{bingo.blackout ? "FULL BOARD!" : "BINGO!"}</span>
        <b>{bingo.team}</b>
        <ul>{earned.map((e) => <li key={e}>{e}</li>)}</ul>
        <p className="muted" style={{ margin: 0 }}>
          {bingo.blackout
            ? "Every cell closed. There is nothing left to do but gloat."
            : bingo.totalLines === 1
              ? "Your first line. The board is open from here."
              : `${bingo.totalLines} lines done.`}
        </p>
        <button type="button" className="btn primary block">Nice</button>
      </div>
    </div>
  );
}

const BURST_COLORS = ["var(--brand)", "var(--sun)", "var(--coral)", "var(--mint)", "var(--grape)"];
/** Fixed, not random: the same burst every time, and no hydration mismatch. */
const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  x: (i * 37) % 100,
  color: BURST_COLORS[i % BURST_COLORS.length],
  delay: ((i * 13) % 20) / 20,
  dur: 1.8 + ((i * 7) % 12) / 10,
}));

function CellSheet({
  cell,
  limitReached,
  revealsLeft,
  onClose,
  onDone,
  onToast,
}: {
  cell: Cell;
  limitReached: boolean;
  revealsLeft: number;
  onClose: () => void;
  onDone: (msg: string, bingo?: Bingo | null) => void;
  onToast: (msg: string) => void;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(closeCellAction, null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [revealing, startReveal] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) onDone(state.message ?? "Cell closed", state.bingo);
  }, [state, onDone]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ─── the cell is still face down ───
  if (!cell.revealed) {
    const canReveal = revealsLeft > 0;
    return (
      <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Face-down task">
          <div className="reveal-art">
            <span className="card-back big"><Stars n={cell.difficulty} size="lg" /></span>
          </div>
          <h3 style={{ fontSize: 21, textAlign: "center" }}>This task is still face down</h3>
          <p style={{ textAlign: "center", color: "var(--body)" }}>
            All you know so far is the difficulty: <b>{DIFF[cell.difficulty]}</b>, worth{" "}
            {cell.difficulty} {cell.difficulty === 1 ? "point" : "points"}. Reveal it and the whole
            team sees the task, and any of you can be the one to do it.
          </p>

          <button
            className="btn primary block"
            disabled={!canReveal || revealing}
            onClick={() =>
              startReveal(async () => {
                const res = await revealCellAction(cell.id);
                if (res.ok) {
                  onClose();
                  router.refresh();
                  if (res.message) onToast(res.message);
                } else setRevealError(res.error);
              })
            }
          >
            {revealing ? "Revealing…" : canReveal ? "Reveal the task" : "Daily limit reached"}
          </button>

          {revealError && <div className="toon err pad" style={{ marginTop: 10 }}>{revealError}</div>}

          <p className="muted" style={{ marginTop: 10 }}>
            {canReveal
              ? `Everyone on the team reveals their own task. ${revealsLeft} left for you today.`
              : "Your next reveal is tomorrow — or wait for a teammate to reveal one."}
          </p>
          <button type="button" className="btn ghost block" style={{ marginTop: 10 }} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  // ─── the task is revealed ───
  const needsFile = cell.proof !== "TEXT";
  return (
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={cell.short ?? ""}>
        <h3 style={{ fontSize: 21 }}>{cell.short}</h3>
        <p style={{ marginTop: 8, color: "var(--body)" }}>{cell.full}</p>

        <div className="inline" style={{ gap: 7, margin: "14px 0" }}>
          <span className="chip sun"><Stars n={cell.difficulty} /> {DIFF[cell.difficulty]} · {cell.difficulty} {cell.difficulty === 1 ? "point" : "points"}</span>
          {cell.proof && <span className="chip">proof: {PROOF[cell.proof]}</span>}
          {cell.retro && <span className="chip mint">retro — something you already did counts</span>}
        </div>

        {cell.closed ? (
          <>
            <div className="toon pad" style={{ background: "var(--brand-soft)", boxShadow: "none" }}>
              Done by <b>{cell.closedBy ?? "someone on the team"}</b>. The proof is in the feed.
            </div>
            <button className="btn ghost block" style={{ marginTop: 12 }} onClick={onClose}>Close</button>
          </>
        ) : (
          <form action={action} className="stack">
            <input type="hidden" name="cellId" value={cell.id} />
            <input type="hidden" name="kind" value={cell.proof ?? "TEXT"} />

            {cell.revealedBy && (
              <p className="muted" style={{ margin: 0 }}>Revealed by {cell.revealedBy}. Anyone on the team can do it.</p>
            )}

            {needsFile ? (
              <>
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
                <button
                  type="button"
                  className="dropzone"
                  onClick={() => inputRef.current?.click()}
                >
                  <b>{fileName ?? (cell.proof === "SCREEN" ? "Choose a screenshot" : "Choose a photo")}</b>
                  <span>A phone snap or a screenshot. Up to 12 MB.</span>
                </button>
                <div>
                  <label htmlFor="caption">Caption, optional</label>
                  <input id="caption" name="caption" maxLength={200} placeholder="How it went" style={{ marginTop: 6 }} />
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="text">How did it go?</label>
                <textarea id="text" name="text" required maxLength={600} placeholder="Keep it short" style={{ marginTop: 6 }} />
              </div>
            )}

            <button className="btn primary block" disabled={pending || limitReached}>
              {limitReached ? "Daily limit reached" : pending ? "Sending…" : "Mark it done"}
            </button>

            {state && !state.ok && <div className="toon err pad">{state.error}</div>}

            <p className="muted" style={{ margin: 0 }}>
              The cell closes right away and the proof goes to the shared feed. HR can remove it later.
              Keep code, client data, and anyone who has not agreed to appear out of the shot.
            </p>
            <button type="button" className="btn ghost block" onClick={onClose}>Cancel</button>
          </form>
        )}
      </div>
    </div>
  );
}
