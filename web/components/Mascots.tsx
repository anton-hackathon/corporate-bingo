/**
 * Original cartoon mascots: heavy outline, flat fill, oversized eyes. Each one
 * sits on a light disc so it reads the same on the blue banner and in dark
 * mode.
 */

const OUT = "#15161a";

type Props = { className?: string; size?: number };

/** The sly cat: the face of the board. */
export function CatMascot({ className, size = 120 }: Props) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="#fff6e0" stroke={OUT} strokeWidth="4" />
      <path d="M30 46 32 24l19 13z" fill="#ff9a3c" stroke={OUT} strokeWidth="4" strokeLinejoin="round" />
      <path d="M90 46 88 24 69 37z" fill="#ff9a3c" stroke={OUT} strokeWidth="4" strokeLinejoin="round" />
      <ellipse cx="60" cy="64" rx="34" ry="31" fill="#ffb155" stroke={OUT} strokeWidth="4" />
      <path d="M44 40c3 5 3 9 2 13M76 40c-3 5-3 9-2 13" stroke={OUT} strokeWidth="3.5" strokeLinecap="round" />
      <ellipse cx="48" cy="60" rx="9" ry="10" fill="#fff" stroke={OUT} strokeWidth="3.5" />
      <ellipse cx="72" cy="60" rx="9" ry="10" fill="#fff" stroke={OUT} strokeWidth="3.5" />
      <ellipse cx="50" cy="62" rx="4" ry="5.5" fill={OUT} />
      <ellipse cx="74" cy="62" rx="4" ry="5.5" fill={OUT} />
      <circle cx="51.5" cy="59" r="1.6" fill="#fff" />
      <circle cx="75.5" cy="59" r="1.6" fill="#fff" />
      <path d="M56 74h8l-4 4z" fill="#ff6f5e" stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
      <path d="M60 79c0 4 4 6 8 4M60 79c0 4-4 6-8 4" stroke={OUT} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M26 70h12M26 78h12M94 70H82M94 78H82" stroke={OUT} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** The quick mouse: looks after the leaderboard. */
export function MouseMascot({ className, size = 120 }: Props) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="#fff6e0" stroke={OUT} strokeWidth="4" />
      <circle cx="36" cy="40" r="16" fill="#cdd6e6" stroke={OUT} strokeWidth="4" />
      <circle cx="84" cy="40" r="16" fill="#cdd6e6" stroke={OUT} strokeWidth="4" />
      <circle cx="36" cy="40" r="8" fill="#ffb3c7" />
      <circle cx="84" cy="40" r="8" fill="#ffb3c7" />
      <ellipse cx="60" cy="66" rx="30" ry="28" fill="#aab6cc" stroke={OUT} strokeWidth="4" />
      <ellipse cx="50" cy="62" rx="7" ry="8" fill="#fff" stroke={OUT} strokeWidth="3" />
      <ellipse cx="70" cy="62" rx="7" ry="8" fill="#fff" stroke={OUT} strokeWidth="3" />
      <circle cx="51" cy="64" r="3.4" fill={OUT} />
      <circle cx="71" cy="64" r="3.4" fill={OUT} />
      <ellipse cx="60" cy="76" rx="5" ry="4" fill="#ff6f5e" stroke={OUT} strokeWidth="3" />
      <path d="M52 84c4 3 12 3 16 0" stroke={OUT} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M36 80c-6 2-10 7-10 13" stroke={OUT} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** Two goofy critters: empty states and anything that should feel fun. */
export function CrittersMascot({ className, size = 150 }: Props) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 150 120" fill="none" aria-hidden="true">
      <ellipse cx="48" cy="72" rx="34" ry="36" fill="#9ad7b0" stroke={OUT} strokeWidth="4" />
      <ellipse cx="104" cy="78" rx="29" ry="31" fill="#f5b7d4" stroke={OUT} strokeWidth="4" />
      <path d="M26 44c-4-10 2-18 10-14M70 44c4-10-2-18-10-14" fill="none" stroke={OUT} strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="37" cy="66" rx="9" ry="11" fill="#fff" stroke={OUT} strokeWidth="3.5" />
      <ellipse cx="60" cy="66" rx="9" ry="11" fill="#fff" stroke={OUT} strokeWidth="3.5" />
      <circle cx="39" cy="69" r="4.4" fill={OUT} />
      <circle cx="58" cy="69" r="4.4" fill={OUT} />
      <path d="M40 86c6 6 14 6 20 0" stroke={OUT} strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="95" cy="72" rx="8" ry="9" fill="#fff" stroke={OUT} strokeWidth="3.5" />
      <ellipse cx="114" cy="72" rx="8" ry="9" fill="#fff" stroke={OUT} strokeWidth="3.5" />
      <circle cx="96" cy="74" r="3.8" fill={OUT} />
      <circle cx="115" cy="74" r="3.8" fill={OUT} />
      <ellipse cx="104" cy="90" rx="8" ry="6" fill={OUT} />
      <path d="M86 50c-3-9 3-15 9-11M122 50c3-9-3-15-9-11" stroke={OUT} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** The stern bird with a clipboard: the HR area. */
export function ClerkMascot({ className, size = 120 }: Props) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="#fff6e0" stroke={OUT} strokeWidth="4" />
      <ellipse cx="60" cy="62" rx="32" ry="34" fill="#9b6bf2" stroke={OUT} strokeWidth="4" />
      <circle cx="49" cy="54" r="12" fill="#fff" stroke={OUT} strokeWidth="3.5" />
      <circle cx="73" cy="54" r="12" fill="#fff" stroke={OUT} strokeWidth="3.5" />
      <circle cx="51" cy="56" r="5" fill={OUT} />
      <circle cx="71" cy="56" r="5" fill={OUT} />
      <path d="M54 70h12l-6 8z" fill="#ffc93c" stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
      <rect x="66" y="78" width="30" height="34" rx="4" fill="#fff" stroke={OUT} strokeWidth="4" transform="rotate(-8 66 78)" />
      <path d="M70 90h18M69 98h18M68 106h12" stroke={OUT} strokeWidth="3" strokeLinecap="round" transform="rotate(-8 66 78)" />
      <path d="M38 30c-6-6-4-14 4-14M82 30c6-6 4-14-4-14" stroke={OUT} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** The mark in the header. */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="35" height="35" rx="9" fill="#2258e7" stroke={OUT} strokeWidth="3.5" />
      <rect x="9" y="9" width="8.5" height="8.5" rx="2.5" fill="#ffc93c" stroke={OUT} strokeWidth="2.5" />
      <rect x="22.5" y="9" width="8.5" height="8.5" rx="2.5" fill="#fff" stroke={OUT} strokeWidth="2.5" />
      <rect x="9" y="22.5" width="8.5" height="8.5" rx="2.5" fill="#fff" stroke={OUT} strokeWidth="2.5" />
      <rect x="22.5" y="22.5" width="8.5" height="8.5" rx="2.5" fill="#ffc93c" stroke={OUT} strokeWidth="2.5" />
    </svg>
  );
}
