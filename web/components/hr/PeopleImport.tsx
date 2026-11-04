"use client";

import { useActionState } from "react";
import { importPeopleAction, type ActionResult } from "@/app/actions";

export function PeopleImport() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(importPeopleAction, null);

  return (
    <form action={action} className="toon pad stack">
      <div>
        <label htmlFor="csv">Import a list</label>
        <p className="muted" style={{ margin: "3px 0 7px" }}>
          One person per line: email, name, department, office or remote. Commas, semicolons and
          tabs all work as separators, so you can paste straight from a spreadsheet. Existing
          records are updated rather than duplicated.
        </p>
        <textarea
          id="csv"
          name="csv"
          required
          style={{ minHeight: 140, fontFamily: "ui-monospace, monospace", fontSize: 13 }}
          placeholder={"john.smith@effective-soft.com, John Smith, Backend, office\nmaria.lopez@effective-soft.com, Maria Lopez, QA, remote"}
        />
      </div>
      <div className="inline">
        <button className="btn primary" disabled={pending}>{pending ? "Importing…" : "Import"}</button>
        {state && !state.ok && <span style={{ color: "var(--coral)", fontWeight: 700 }}>{state.error}</span>}
        {state?.ok && <span style={{ fontWeight: 700 }}>{state.message}</span>}
      </div>
    </form>
  );
}
