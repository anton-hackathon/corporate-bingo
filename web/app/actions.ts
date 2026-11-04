"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ProofKind, RoundStatus } from "@prisma/client";
import { AuthError, NotSent, canOpenHR, consumeLoginToken, createLoginLink, createSession, destroySession, requireHR, requireUser, setHRMode } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  assertCanClose,
  buildTeamsForRound,
  closeCell,
  createFreePost,
  createTeamWithBoard,
  deleteTeam,
  GameError,
  getActiveRound,
  moveMember,
  revealCell,
  revokeProof,
  toggleReaction,
} from "@/lib/game";
import { prisma } from "@/lib/prisma";
import { recomputeTeam } from "@/lib/scoring";
import { deleteImage, normalizeImage, putImage } from "@/lib/storage";

/** What a single proof finished off, for the celebration the player gets. */
export type Bingo = {
  lines: number;
  totalLines: number;
  firstLine: boolean;
  blackout: boolean;
  team: string;
  linePoints: number;
  firstLinePoints: number;
  blackoutPoints: number;
};

export type ActionResult =
  | { ok: true; message?: string; devLink?: string; bingo?: Bingo | null }
  | { ok: false; error: string };

function fail(e: unknown): ActionResult {
  if (e instanceof AuthError || e instanceof GameError) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: "Something broke. Please try again." };
}

/** Showing the link in the UI is only safe in development without SMTP. */
const devLinksVisible = process.env.NODE_ENV !== "production" && !env.smtp.host;

/**
 * Spends a sign-in token. Reached only by submitting the form on the callback
 * page, never by opening its URL.
 *
 * Something on the way to the mailbox follows these links before the person
 * does: a request with no User-Agent at all took one 1.4 seconds ahead of the
 * recipient's browser, got the session, and left them staring at "this link
 * has expired" on every attempt. Whatever it is — a scanner, a prefetcher, an
 * endpoint agent — it follows links; it does not fill in forms. So opening the
 * link now costs nothing and a POST does the work.
 */
export async function completeLoginAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  let ok = false;
  try {
    const userId = await consumeLoginToken(token);
    await createSession(userId);
    ok = true;
  } catch {
    ok = false;
  }
  // Relative on purpose: it keeps whoever signed in on the address they came
  // in on, whether that is the public name or the one inside the network.
  redirect(ok ? "/" : "/login?error=expired");
}

export async function requestLogin(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  // The same answer whether or not the address exists, so the login page
  // cannot be used to enumerate employees — and the same answer when the
  // per-person rate limit refuses to send. That second case used to read as
  // plain success and left people waiting for mail that was never sent, so
  // the wording now covers it without saying which case it is.
  const sent =
    "If that address is on the employee list, a sign-in link is on its way — it expires in 15 minutes. " +
    "Asked a few times already? Only a handful go out per quarter hour, so use the newest email you have.";
  try {
    const email = String(formData.get("email") ?? "");
    const { url, user } = await createLoginLink(email);
    const { sendMagicLink } = await import("@/lib/mail");
    await sendMagicLink(user.email, user.name, url);
    return { ok: true, message: sent, devLink: devLinksVisible ? url : undefined };
  } catch (e) {
    if (e instanceof NotSent) return { ok: true, message: sent };
    return fail(e);
  }
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function closeCellAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const cellId = String(formData.get("cellId") ?? "");
    const kind = String(formData.get("kind") ?? "TEXT") as ProofKind;
    const caption = String(formData.get("caption") ?? "");
    const text = String(formData.get("text") ?? "");

    // Authorize before spending disk: otherwise a loop of failing calls with a
    // junk cellId fills the uploads volume.
    await assertCanClose(user.id, cellId);

    let imageKey: string | null = null;
    const file = formData.get("file");
    if (file instanceof File && file.size > 0) {
      // Keep in step with serverActions.bodySizeLimit in next.config.ts and
      // with the proxy limit in deploy/Caddyfile.
      if (file.size > 12 * 1024 * 1024) {
        return { ok: false, error: "That photo is larger than 12 MB. Try again from your phone's camera roll rather than the original file." };
      }
      const buf = Buffer.from(await file.arrayBuffer());
      imageKey = await putImage(await normalizeImage(buf));
    }

    // The photo is on disk by this point. Anything that rejects the proof now
    // — the daily limit, a teammate having closed the cell a second earlier —
    // must take the bytes with it, or the volume fills with files no row
    // points at.
    let closed;
    try {
      closed = await closeCell({ userId: user.id, cellId, kind, text, imageKey, caption });
    } catch (e) {
      if (imageKey) await deleteImage(imageKey);
      throw e;
    }
    const { gained, score, bingo } = closed;
    revalidatePath("/board");
    revalidatePath("/");
    revalidatePath("/rank");
    return {
      ok: true,
      bingo,
      // A completed line gets its own celebration, so the toast underneath it
      // stays plain rather than competing with it.
      message:
        score.linesDone > 0 && score.cellPoints + score.linePoints > 0
          ? `Cell closed, +${gained}. Lines completed: ${score.linesDone}.`
          : `Cell closed, +${gained}.`,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function revealCellAction(cellId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const res = await revealCell(user.id, cellId);
    revalidatePath("/board");
    return {
      ok: true,
      message: res.already ? undefined : `Task revealed: ${res.task.short}`,
    };
  } catch (e) {
    return fail(e);
  }
}

/**
 * A photo with no task behind it. Same upload path and the same 12 MB ceiling
 * as a proof, because in the feed it is meant to be the same thing.
 */
export async function freePostAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const round = await getActiveRound();
    if (!round) return { ok: false, error: "No round is running" };

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pick a photo first" };
    if (file.size > 12 * 1024 * 1024) {
      return { ok: false, error: "That photo is larger than 12 MB. Try again from your phone's camera roll rather than the original file." };
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const imageKey = await putImage(await normalizeImage(buf));
    // Same as closing a cell: the upload happens before the rules are checked,
    // so a refusal has to clean up after itself. Two a day is a rule most
    // people will meet, and each refusal used to cost a stored photo.
    try {
      await createFreePost({
        userId: user.id,
        roundId: round.id,
        imageKey,
        caption: String(formData.get("caption") ?? ""),
      });
    } catch (e) {
      await deleteImage(imageKey);
      throw e;
    }

    revalidatePath("/");
    revalidatePath("/me");
    return { ok: true, message: "Posted. It reads like any other proof — nobody can tell." };
  } catch (e) {
    return fail(e);
  }
}

/** Feed subscriptions: which teams and people this user follows. */
export async function setWatchAction(teamIds: string[], userIds: string[]): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { watchTeamIds: teamIds.slice(0, 50), watchUserIds: userIds.slice(0, 50) },
    });
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Testing switch: hides or shows the HR controls for this browser. */
export async function setHRModeAction(on: boolean): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!canOpenHR(user)) return { ok: false, error: "HR access only" };
    await setHRMode(on);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function reactAction(proofId: string, emoji: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const res = await toggleReaction(user.id, proofId, emoji);
    // No revalidatePath("/") here: the feed already updated optimistically, and
    // re-rendering the whole home page per tap cost ~20 queries for nothing.
    if (res.awarded) {
      revalidatePath("/rank");
      revalidatePath("/board");
      return { ok: true, message: "That proof hit the bonus — points for the team!" };
    }
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function joinRoundAction(roundId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const round = await prisma.round.findUnique({ where: { id: roundId }, select: { status: true } });
    if (round?.status !== RoundStatus.SIGNUP) return { ok: false, error: "Sign-ups are not open" };

    await prisma.roundSignup.upsert({
      where: { roundId_userId: { roundId, userId: user.id } },
      update: {},
      create: { roundId, userId: user.id },
    });
    revalidatePath("/");
    revalidatePath("/board");
    return { ok: true, message: "You are on the list. We will email you once teams are built." };
  } catch (e) {
    return fail(e);
  }
}

// ───────────────────────── HR ─────────────────────────

export async function saveTaskAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    await requireHR();
    const id = formData.get("id") ? Number(formData.get("id")) : null;
    const short = String(formData.get("short") ?? "").trim();
    const full = String(formData.get("full") ?? "").trim();
    const difficulty = Number(formData.get("difficulty") ?? 2);
    const proof = String(formData.get("proof") ?? "PHOTO") as ProofKind;
    // One of the four original requirements survives, the only one that changes
    // anything: an office task stays off the board of an all-remote team.
    const tags = formData.get("officeOnly") === "on" ? ["office"] : [];
    const retro = formData.get("retro") === "on";

    if (short.length < 3) return { ok: false, error: "A short name is required" };
    if (short.length > 28) return { ok: false, error: "Short names are capped at 28 characters so they fit in a cell" };
    if (full.length < 10) return { ok: false, error: "Describe the task in more detail" };
    if (![1, 2, 3].includes(difficulty)) return { ok: false, error: "Difficulty must be 1, 2 or 3" };

    // `active` is deliberately absent: editing a task must not reach over and
    // switch it on or off behind the On/Off button in the list. A new task is
    // active by the schema default.
    const data = { short, full, difficulty, proof, tags, retro };
    if (id) await prisma.task.update({ where: { id }, data });
    else await prisma.task.create({ data: { ...data, category: "General" } });

    revalidatePath("/hr/tasks");
    return { ok: true, message: id ? "Task updated" : "Task added" };
  } catch (e) {
    return fail(e);
  }
}

export async function toggleTaskAction(id: number, active: boolean): Promise<ActionResult> {
  try {
    await requireHR();
    await prisma.task.update({ where: { id }, data: { active } });
    revalidatePath("/hr/tasks");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeProofAction(proofId: string, reason: string): Promise<ActionResult> {
  try {
    const hr = await requireHR();
    await revokeProof(hr.id, proofId, reason);
    revalidatePath("/hr");
    revalidatePath("/");
    revalidatePath("/board");
    revalidatePath("/rank");
    return { ok: true, message: "Proof removed — the cell is free again" };
  } catch (e) {
    return fail(e);
  }
}

export async function saveRoundAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    await requireHR();
    const id = String(formData.get("id") ?? "");
    let scoringMoved = false;
    // Only the fields the form actually carries. Anything else the round has
    // — dailyLimit, the reaction bonus, allowClientTasks — is left out on
    // purpose so it keeps its stored value; reading an absent field as
    // `Number(null ?? 3)` would quietly reset it on every save.
    const data = {
      revealsPerDay: Number(formData.get("revealsPerDay") ?? 1),
      allowFreePosts: formData.get("allowFreePosts") === "on",
      freePostsPerDay: Number(formData.get("freePostsPerDay") ?? 2),
      pointsLine: Number(formData.get("pointsLine") ?? 5),
      pointsFirstLine: Number(formData.get("pointsFirstLine") ?? 10),
      pointsBlackout: Number(formData.get("pointsBlackout") ?? 25),
      reactionBonusAt: Number(formData.get("reactionBonusAt") ?? 10),
      reactionBonusPoints: Number(formData.get("reactionBonusPoints") ?? 2),
    };

    // The name and the team size are only on the form while the round is a
    // draft. Reading them unconditionally would rewrite the title to "Round"
    // and the team size to 3 every time a running round is saved.
    const title = formData.has("title") ? String(formData.get("title") ?? "Round").trim() : undefined;
    const teamSize = formData.has("teamSize") ? Number(formData.get("teamSize") ?? 3) : undefined;
    if (id) {
      // Team size decides the board layout at build time, so it cannot move
      // once the boards exist.
      const current = await prisma.round.findUnique({
        where: { id },
        select: { status: true, teamSize: true, pointsLine: true, pointsFirstLine: true, pointsBlackout: true, reactionBonusPoints: true },
      });
      if (current && current.status !== RoundStatus.DRAFT && teamSize !== undefined && current.teamSize !== teamSize) {
        return { ok: false, error: "Team size can only change while the round is a draft" };
      }
      scoringMoved = Boolean(
        current &&
          (current.pointsLine !== data.pointsLine ||
            current.pointsFirstLine !== data.pointsFirstLine ||
            current.pointsBlackout !== data.pointsBlackout ||
            current.reactionBonusPoints !== data.reactionBonusPoints),
      );
    }
    if (id) {
      await prisma.round.update({
        where: { id },
        data: { ...data, ...(title !== undefined && { title }), ...(teamSize !== undefined && { teamSize }) },
      });
    } else {
      await prisma.round.create({
        data: { ...data, title: title ?? "Round", teamSize: teamSize ?? 3, status: RoundStatus.DRAFT },
      });
    }

    // Scores are stored, not derived on read, so moving what a line is worth
    // leaves every team showing the old total until something else happens to
    // touch it. Recompute the lot once, here, rather than let the leaderboard
    // disagree with the rules page.
    if (scoringMoved && id) {
      const teams = await prisma.team.findMany({ where: { roundId: id }, select: { id: true } });
      for (const t of teams) await recomputeTeam(prisma, t.id);
      revalidatePath("/rank");
      revalidatePath("/board");
    }

    revalidatePath("/hr");
    // The feed reads allowFreePosts to decide whether to offer the composer,
    // so a saved setting that only lands on the HR page is half a setting.
    revalidatePath("/");
    return { ok: true, message: "Settings saved" };
  } catch (e) {
    return fail(e);
  }
}

const NEXT_STATUS: Record<RoundStatus, RoundStatus[]> = {
  DRAFT: [RoundStatus.SIGNUP],
  SIGNUP: [RoundStatus.ACTIVE, RoundStatus.DRAFT],
  ACTIVE: [RoundStatus.FINISHED],
  FINISHED: [],
};

export async function setRoundStatusAction(id: string, status: RoundStatus): Promise<ActionResult> {
  try {
    await requireHR();
    // Only forward. Sending an ACTIVE round back to SIGNUP re-arms the team
    // rebuild, which deletes every team and cascades away all the proofs.
    const current = await prisma.round.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (!NEXT_STATUS[current.status].includes(status)) {
      return { ok: false, error: `A ${current.status.toLowerCase()} round cannot move to ${status.toLowerCase()}` };
    }
    await prisma.round.update({ where: { id }, data: { status } });
    revalidatePath("/hr");
    revalidatePath("/");
    revalidatePath("/board");
    return { ok: true, message: "Round status changed" };
  } catch (e) {
    return fail(e);
  }
}

export async function buildTeamsAction(roundId: string): Promise<ActionResult> {
  try {
    await requireHR();
    const res = await buildTeamsForRound(roundId);
    revalidatePath("/hr");
    revalidatePath("/");
    revalidatePath("/board");
    revalidatePath("/rank");
    return {
      ok: true,
      message:
        `Built ${res.teams} teams from ${res.players} people.` +
        (res.unbalanced.length
          ? ` ${res.unbalanced.length} of them ended up with an unbalanced board. Enable more hard tasks.`
          : " Every board is balanced."),
    };
  } catch (e) {
    return fail(e);
  }
}

// ───────── team rosters ─────────

function revalidateTeams() {
  revalidatePath("/hr/teams");
  revalidatePath("/hr");
  revalidatePath("/");
  revalidatePath("/board");
  revalidatePath("/rank");
}

export async function moveMemberAction(
  roundId: string,
  userId: string,
  toTeamId: string | null,
): Promise<ActionResult> {
  try {
    await requireHR();
    await moveMember(roundId, userId, toTeamId);
    revalidateTeams();
    return { ok: true, message: toTeamId ? "Moved" : "Removed from the team" };
  } catch (e) {
    return fail(e);
  }
}

export async function createTeamAction(roundId: string, name: string): Promise<ActionResult> {
  try {
    await requireHR();
    const team = await createTeamWithBoard(roundId, name);
    revalidateTeams();
    return { ok: true, message: `Team ${team.name} created, board included` };
  } catch (e) {
    return fail(e);
  }
}

export async function renameTeamAction(teamId: string, name: string): Promise<ActionResult> {
  try {
    await requireHR();
    const clean = name.trim();
    if (clean.length < 2) return { ok: false, error: "That name is too short" };
    if (clean.length > 40) return { ok: false, error: "That name is too long" };

    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { roundId: true, name: true } });
    if (!team) return { ok: false, error: "Team not found" };
    if (team.name === clean) return { ok: true, message: "Nothing changed" };

    // Names are unique within a round, and a collision here is an ordinary
    // mistake, not a crash: say so instead of falling through to "something broke".
    const clash = await prisma.team.findFirst({
      where: { roundId: team.roundId, name: clean, NOT: { id: teamId } },
      select: { id: true },
    });
    if (clash) return { ok: false, error: `Another team in this round is already called ${clean}` };

    await prisma.team.update({ where: { id: teamId }, data: { name: clean } });
    revalidateTeams();
    return { ok: true, message: `Renamed to ${clean}` };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTeamAction(teamId: string): Promise<ActionResult> {
  try {
    await requireHR();
    await deleteTeam(teamId);
    revalidateTeams();
    return { ok: true, message: "Team deleted" };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Disabling an employee: they can no longer sign in or open any page.
 * Needed when someone starts posting things they should not.
 * Their proofs stay up and are removed one by one, so HR decides
 * deliberately what leaves the feed.
 */
export async function setUserActiveAction(userId: string, active: boolean): Promise<ActionResult> {
  try {
    const hr = await requireHR();
    if (userId === hr.id) return { ok: false, error: "You cannot disable your own account" };

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true },
    });
    if (!target) return { ok: false, error: "Employee not found" };
    if (target.role === "HR" && !active) {
      return { ok: false, error: "Another HR account cannot be disabled. Remove the role in the database first." };
    }

    await prisma.user.update({ where: { id: userId }, data: { active } });
    if (!active) {
      // Kill sessions and unused sign-in links, or they stay logged in.
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.loginToken.deleteMany({ where: { userId, usedAt: null } });
    }

    revalidatePath("/hr/people");
    revalidatePath("/hr");
    return {
      ok: true,
      message: active ? `${target.name} can sign in again` : `${target.name} is disabled and cannot sign in`,
    };
  } catch (e) {
    return fail(e);
  }
}

/** Employee import: email, name, department, office or remote. */
export async function importPeopleAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    await requireHR();
    const csv = String(formData.get("csv") ?? "").trim();
    if (!csv) return { ok: false, error: "Paste the list first" };

    let added = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const [n, line] of csv.split("\n").entries()) {
      const row = line.trim();
      if (!row || row.toLowerCase().startsWith("email")) continue;
      const [email, name, department, office] = row.split(/[,;\t]/).map((c) => c?.trim() ?? "");
      if (!email || !email.includes("@")) {
        errors.push(`line ${n + 1}`);
        continue;
      }
      const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      await prisma.user.upsert({
        where: { email: email.toLowerCase() },
        update: { name: name || undefined, department: department || undefined, office: office || undefined, active: true },
        create: {
          email: email.toLowerCase(),
          name: name || email.split("@")[0],
          department: department || null,
          office: office || null,
        },
      });
      if (existing) updated++;
      else added++;
    }

    revalidatePath("/hr/people");
    return {
      ok: true,
      message: `Added ${added}, updated ${updated}.` + (errors.length ? ` Skipped: ${errors.join(", ")}.` : ""),
    };
  } catch (e) {
    return fail(e);
  }
}
