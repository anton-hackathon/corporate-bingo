"use client";

import { useActionState } from "react";
import { requestLogin, type ActionResult } from "../actions";
import { CatMascot } from "@/components/Mascots";

export function LoginForm({ hint }: { hint: string | null }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(requestLogin, null);

  return (
    <div style={{ maxWidth: 440, margin: "6vh auto 0" }}>
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <CatMascot size={132} />
        <h1 style={{ fontSize: 30, marginTop: 8 }}>Corporate Bingo</h1>
        <p style={{ color: "var(--muted)", fontWeight: 600, marginTop: 6 }}>
          A board of silly tasks, randomly drawn teams and a company-wide leaderboard.
        </p>
      </div>

      <form action={action} className="toon pad stack">
        <div>
          <label htmlFor="email">Work email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="john.smith@effective-soft.com"
            style={{ marginTop: 6 }}
          />
        </div>
        <button className="btn primary block" disabled={pending}>
          {pending ? "Sending…" : "Send me a sign-in link"}
        </button>
        <p className="muted" style={{ margin: 0 }}>
          No password needed. We email you a link that expires in 15 minutes and can only be used once.
        </p>

        {hint && !state && <div className="toon err pad">{hint}</div>}
        {state && !state.ok && <div className="toon err pad">{state.error}</div>}
        {state?.ok && (
          <div className="toon pad" style={{ background: "var(--sun)", color: "var(--on-sun)", fontWeight: 700 }}>
            {state.message}
            {state.devLink && (
              <p style={{ marginBottom: 0, marginTop: 10, fontWeight: 600, fontSize: 13 }}>
                Development mode, no SMTP configured —{" "}
                <a href={state.devLink} style={{ color: "inherit" }}>
                  sign in with this link
                </a>
              </p>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
