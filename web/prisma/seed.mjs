// Plain JavaScript on purpose: the production image then needs neither tsx nor
// a TypeScript toolchain to seed itself.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PROOF = { photo: "PHOTO", screen: "SCREEN", text: "TEXT" };

async function main() {
  // The task pool lives in the repository root: HR edits it, not a developer.
  // TASKS_FILE overrides the location, which is how the container finds it.
  const file = process.env.TASKS_FILE
    ? path.resolve(process.env.TASKS_FILE)
    : path.resolve(process.cwd(), "..", "tasks.json");
  if (!existsSync(file)) {
    // The build-stage image has web/ at /app and no tasks.json above it, so a
    // bare ENOENT here usually means this was run in the wrong container.
    throw new Error(
      `No task pool at ${file}. Set TASKS_FILE, or run this where tasks.json sits next to the app ` +
        `(in the Docker stack that is the app container: docker compose exec app node prisma/seed.mjs).`,
    );
  }
  const { tasks } = JSON.parse(readFileSync(file, "utf8"));

  for (const t of tasks) {
    const fields = {
      short: t.short,
      full: t.full,
      difficulty: t.difficulty,
      proof: PROOF[t.proof],
      tags: t.tags,
      category: t.category,
      retro: Boolean(t.retro),
      // Dropping this silently defeats the round switch: a task written as
      // client-facing would come in as an ordinary one and land on boards
      // even with "Tasks for client calls" turned off.
      clientFacing: Boolean(t.clientFacing),
    };
    await prisma.task.upsert({
      where: { id: t.id },
      update: fields,
      create: { id: t.id, ...fields },
    });
  }

  // The next autoincrement must start after the explicitly numbered tasks,
  // otherwise the first task HR creates collides on the primary key.
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"Task"', 'id'), (SELECT COALESCE(MAX(id), 1) FROM "Task"))`,
  );
  console.log(`Tasks in the pool: ${await prisma.task.count()}`);

  const hrEmails = (process.env.HR_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  for (const email of hrEmails) {
    // "jane.smith@…" → "Jane Smith". The local part on its own ends up on
    // the team roster and in the feed, where a lowercase address reads as a bug.
    const name = email
      .split("@")[0]
      .split(/[._-]/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" ");
    await prisma.user.upsert({
      where: { email },
      update: { role: "HR" },
      create: { email, name, role: "HR", department: "HR" },
    });
  }
  if (hrEmails.length) console.log(`HR accounts: ${hrEmails.length} (${hrEmails.join(", ")})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
