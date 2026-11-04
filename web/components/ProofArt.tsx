/**
 * A drawn stand-in for a photo: a cartoon scene built from simple shapes.
 * Both the scene and the palette come from a hash of the proof id, so every
 * proof gets its own picture that stays the same between visits. Nothing is
 * fetched and nothing is generated at runtime.
 */

const OUT = "#15161a";

const PALETTES: { bg: string; far: string; a: string; b: string; c: string }[] = [
  { bg: "#ffd9a8", far: "#ffbf7a", a: "#2258e7", b: "#ff6f5e", c: "#2fcf92" },
  { bg: "#c9e6ff", far: "#9fd0ff", a: "#9b6bf2", b: "#ffc93c", c: "#ff6f5e" },
  { bg: "#d7f5de", far: "#aee8bf", a: "#ff6f5e", b: "#2258e7", c: "#ffc93c" },
  { bg: "#ffd7e6", far: "#ffb8d1", a: "#2fcf92", b: "#9b6bf2", c: "#2258e7" },
  { bg: "#e6dcff", far: "#cfc0ff", a: "#ffc93c", b: "#2fcf92", c: "#ff6f5e" },
  { bg: "#fff0b8", far: "#ffe081", a: "#2258e7", b: "#2fcf92", c: "#9b6bf2" },
];

const SCENES = ["desk", "call", "duo", "studio", "habit", "trio"] as const;
type Scene = (typeof SCENES)[number];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function ProofArt({ seed }: { seed: string }) {
  const h = hash(seed);
  const p = PALETTES[h % PALETTES.length];
  // The scene comes from the hash, so HR never has to fill in another field.
  const scene: Scene = SCENES[h % SCENES.length];
  const dotId = `d${(h % 100000).toString(36)}`;

  return (
    <svg viewBox="0 0 320 200" className="art" role="img" aria-label="Illustration for this proof">
      <defs>
        <pattern id={dotId} width="12" height="12" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.6" fill={OUT} opacity="0.1" />
        </pattern>
      </defs>
      <rect width="320" height="200" fill={p.bg} />
      <rect width="320" height="200" fill={`url(#${dotId})`} />
      {scene === "desk" && <Desk p={p} h={h} />}
      {scene === "call" && <Call p={p} h={h} />}
      {scene === "duo" && <Duo p={p} h={h} />}
      {scene === "studio" && <Studio p={p} h={h} />}
      {scene === "habit" && <Habit p={p} h={h} />}
      {scene === "trio" && <Trio p={p} h={h} />}
    </svg>
  );
}

type P = { bg: string; far: string; a: string; b: string; c: string };
const S = { stroke: OUT, strokeWidth: 4, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

/** A critter head: the shared building block of every scene. */
function Critter({ x, y, r, fill, mood = 0 }: { x: number; y: number; r: number; fill: string; mood?: number }) {
  return (
    <g>
      <circle cx={x - r * 0.72} cy={y - r * 0.74} r={r * 0.38} fill={fill} {...S} strokeWidth={3} />
      <circle cx={x + r * 0.72} cy={y - r * 0.74} r={r * 0.38} fill={fill} {...S} strokeWidth={3} />
      <circle cx={x} cy={y} r={r} fill={fill} {...S} />
      <circle cx={x - r * 0.36} cy={y - r * 0.12} r={r * 0.26} fill="#fff" {...S} strokeWidth={2.5} />
      <circle cx={x + r * 0.36} cy={y - r * 0.12} r={r * 0.26} fill="#fff" {...S} strokeWidth={2.5} />
      <circle cx={x - r * 0.32} cy={y - r * 0.06} r={r * 0.12} fill={OUT} />
      <circle cx={x + r * 0.4} cy={y - r * 0.06} r={r * 0.12} fill={OUT} />
      {mood === 0 ? (
        <path d={`M${x - r * 0.3} ${y + r * 0.36} q${r * 0.3} ${r * 0.28} ${r * 0.6} 0`} fill="none" {...S} strokeWidth={3} />
      ) : (
        <ellipse cx={x} cy={y + r * 0.42} rx={r * 0.24} ry={r * 0.18} fill={OUT} />
      )}
    </g>
  );
}

function Desk({ p, h }: { p: P; h: number }) {
  return (
    <g>
      <rect x="18" y="26" width="86" height="62" rx="8" fill={p.far} {...S} />
      <path d="M26 88h70" {...S} strokeWidth={3} />
      <rect x="0" y="138" width="320" height="62" fill={p.far} {...S} strokeWidth={0} />
      <path d="M0 138h320" {...S} />
      <rect x="150" y="54" width="118" height="78" rx="9" fill="#fff" {...S} />
      <rect x="164" y="68" width="90" height="12" rx="6" fill={p.a} />
      <rect x="164" y="88" width="62" height="10" rx="5" fill={p.c} />
      <rect x="164" y="104" width="76" height="10" rx="5" fill={p.b} />
      <path d="M190 132v12h38v-12" {...S} fill={p.far} />
      <rect x="54" y="104" width="40" height="34" rx="7" fill={p.b} {...S} />
      <path d="M94 112c12 0 12 16 0 16" fill="none" {...S} strokeWidth={3.5} />
      <path d="M62 96c0-8 4-10 4-16M78 96c0-8 4-10 4-16" fill="none" {...S} strokeWidth={3} />
      <rect x="276" y="98" width="34" height="40" rx="6" fill={p.c} {...S} />
      <path d="M284 98c0-24 18-30 18-30M302 98c0-18-16-22-16-22" fill="none" {...S} strokeWidth={3.5} />
      <Critter x={120} y={{ 0: 108, 1: 110, 2: 106 }[h % 3] ?? 108} r={22} fill={p.a} mood={h % 2} />
    </g>
  );
}

function Call({ p, h }: { p: P; h: number }) {
  const tiles = [
    { x: 16, y: 26, fill: p.a },
    { x: 118, y: 26, fill: p.b },
    { x: 220, y: 26, fill: p.c },
    { x: 67, y: 112, fill: p.c },
    { x: 169, y: 112, fill: p.a },
  ];
  return (
    <g>
      {tiles.map((t, i) => (
        <g key={i}>
          <rect x={t.x} y={t.y} width="84" height="62" rx="9" fill="#fff" {...S} />
          <Critter x={t.x + 42} y={t.y + 34} r={16} fill={t.fill} mood={(h + i) % 2} />
          {i === (h % tiles.length) && (
            <rect x={t.x - 3} y={t.y - 3} width="90" height="68" rx="11" fill="none" stroke={p.b} strokeWidth="5" />
          )}
        </g>
      ))}
    </g>
  );
}

function Duo({ p, h }: { p: P; h: number }) {
  return (
    <g>
      <rect x="0" y="152" width="320" height="48" fill={p.far} />
      <path d="M0 152h320" {...S} />
      <Critter x={100} y={118} r={40} fill={p.a} mood={h % 2} />
      <Critter x={216} y={126} r={34} fill={p.b} mood={(h + 1) % 2} />
      <rect x="140" y="30" width="86" height="42" rx="12" fill="#fff" {...S} />
      <path d="M168 72l-8 16 22-16z" fill="#fff" {...S} />
      <circle cx="162" cy="51" r="4.5" fill={OUT} />
      <circle cx="182" cy="51" r="4.5" fill={OUT} />
      <circle cx="202" cy="51" r="4.5" fill={OUT} />
      <path d="M58 146v-18M150 150v-14" {...S} strokeWidth={3} />
    </g>
  );
}

function Studio({ p, h }: { p: P; h: number }) {
  return (
    <g>
      <rect x="0" y="152" width="320" height="48" fill={p.far} />
      <path d="M0 152h320" {...S} />
      <path d="M186 152l28-96M276 152l-28-96" {...S} />
      <rect x="176" y="34" width="110" height="80" rx="7" fill="#fff" {...S} />
      <circle cx="206" cy="66" r="14" fill={p.b} {...S} strokeWidth={3} />
      <path d="M190 100l24-24 18 18 14-12 20 18" fill="none" {...S} strokeWidth={3.5} />
      <Critter x={74} y={114} r={38} fill={p.a} mood={h % 2} />
      <path d="M112 110l40-12" {...S} strokeWidth={5} />
      <circle cx="156" cy="92" r="7" fill={p.c} {...S} strokeWidth={3} />
      <circle cx="40" cy="42" r="11" fill={p.c} {...S} strokeWidth={3} />
      <circle cx="68" cy="26" r="7" fill={p.b} {...S} strokeWidth={3} />
    </g>
  );
}

function Habit({ p, h }: { p: P; h: number }) {
  const done = (h % 3) + 1;
  return (
    <g>
      <rect x="0" y="156" width="320" height="44" fill={p.far} />
      <path d="M0 156h320" {...S} />
      <rect x="150" y="24" width="140" height="124" rx="10" fill="#fff" {...S} />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={166} y={44 + i * 26} width="20" height="20" rx="5" fill={i < done ? p.c : "#fff"} {...S} strokeWidth={3} />
          {i < done && <path d={`M170 ${54 + i * 26}l5 5 9-10`} fill="none" stroke={OUT} strokeWidth="3.5" strokeLinecap="round" />}
          <rect x={196} y={50 + i * 26} width={i % 2 ? 54 : 74} height="8" rx="4" fill={p.far} />
        </g>
      ))}
      <Critter x={70} y={112} r={40} fill={p.a} mood={h % 2} />
      <path d="M112 106l30 2" {...S} strokeWidth={5} />
    </g>
  );
}

function Trio({ p, h }: { p: P; h: number }) {
  return (
    <g>
      <rect x="0" y="156" width="320" height="44" fill={p.far} />
      <path d="M0 156h320" {...S} />
      <Critter x={68} y={124} r={34} fill={p.a} mood={h % 2} />
      <Critter x={160} y={112} r={38} fill={p.b} mood={(h + 1) % 2} />
      <Critter x={252} y={126} r={32} fill={p.c} mood={h % 2} />
      <path d="M44 56l10 16 16-6-6 18" fill="none" {...S} strokeWidth={3.5} />
      <path d="M276 52l-10 16-16-6 6 18" fill="none" {...S} strokeWidth={3.5} />
      <path d="M150 34l6 14 14 2-10 10 3 15-13-8-13 8 3-15-10-10 14-2z" fill={p.bg === "#fff0b8" ? "#ffc93c" : "#ffc93c"} {...S} strokeWidth={3} />
    </g>
  );
}
