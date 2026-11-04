"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { setHRModeAction } from "@/app/actions";
import { LogoMark } from "./Mascots";

const ITEMS = [
  { href: "/", label: "Feed", icon: <><rect x="3" y="5" width="18" height="14" rx="4" /><circle cx="9" cy="11" r="2" /><path d="m4 18 5-4 4 3 3-2 4 3" /></> },
  { href: "/board", label: "Board", icon: <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" /></> },
  { href: "/rank", label: "Leaderboard", icon: <><path d="M5 20V11M12 20V4M19 20v-6" /></> },
];
const HR_ITEM = { href: "/hr", label: "HR", icon: <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></> };

export function TopBar({
  canHR,
  hrActive,
  name,
}: {
  canHR: boolean;
  hrActive: boolean;
  name: string;
}) {
  const path = usePathname();
  const items = hrActive ? [...ITEMS, HR_ITEM] : ITEMS;
  return (
    <header className="topbar">
      <div className="wrap">
        <Link href="/" className="logo">
          <span className="mark"><LogoMark /></span>
          Bingo
        </Link>
        {canHR && <HRSwitch on={hrActive} />}
        <nav className="nav-wide">
          {items.map((i) => (
            <Link key={i.href} href={i.href} aria-current={active(path, i.href) ? "page" : undefined}>
              {i.label}
            </Link>
          ))}
          <Link href="/me" aria-current={path === "/me" ? "page" : undefined}>{name.split(" ")[0]}</Link>
        </nav>
      </div>
    </header>
  );
}

export function TabBar({ hrActive }: { hrActive: boolean }) {
  const path = usePathname();
  const items = [...(hrActive ? [...ITEMS, HR_ITEM] : ITEMS), { href: "/me", label: "Me", icon: <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></> }];
  return (
    <nav className="tabbar" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={active(path, i.href) ? "page" : undefined}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            {i.icon}
          </svg>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

/** Testing switch: turns the HR controls on and off for this browser. */
function HRSwitch({ on }: { on: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      className={`hr-switch ${on ? "on" : ""}`}
      disabled={pending}
      aria-pressed={on}
      title="Testing switch: show or hide the HR controls"
      onClick={() => start(async () => { await setHRModeAction(!on); router.refresh(); })}
    >
      HR mode <span className="dotlight" />
    </button>
  );
}

function active(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}
