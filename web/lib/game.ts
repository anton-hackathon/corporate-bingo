import { type Prisma, ProofKind, RoundStatus } from "@prisma/client";
import { BOARD_SIZE, CELL_COUNT, LINES, completedLines, eligibleTasks, generateBoard } from "./board";
import { env } from "./env";
import { deleteImage } from "./storage";
import { prisma } from "./prisma";
import { maybeAwardReactionBonus, recomputeTeam } from "./scoring";
import { makeTeams, teamNames } from "./teams";
import { startOfDayInTz } from "./time";

export class GameError extends Error {}

export async function getActiveRound() {
  return prisma.round.findFirst({
    where: { status: { in: [RoundStatus.SIGNUP, RoundStatus.ACTIVE] } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getMyTeam(userId: string, roundId: string) {
  const membership = await prisma.teamMember.findFirst({
    where: { userId, team: { roundId } },
    include: { team: true },
  });
  return membership?.team ?? null;
}

/** How many cells the team has closed since midnight: the daily limit boundary. */
export async function closedToday(teamId: string): Promise<number> {
  const since = startOfDayInTz(new Date(), env.timezone);
  return prisma.boardCell.count({ where: { teamId, closedAt: { gte: since } } });
}

/** How many cells this person revealed today. The limit is per person, not per team. */
export async function revealsToday(userId: string, teamId: string): Promise<number> {
  const since = startOfDayInTz(new Date(), env.timezone);
  return prisma.boardCell.count({ where: { teamId, revealedById: userId, revealedAt: { gte: since } } });
}

/**
 * Reveals a cell; until then only its difficulty is visible. Each member may
 * reveal a limited number of cells a day, which is what paces the round.
 * A revealed task is visible to the whole team, and anyone in it may close the cell.
 */
export async function revealCell(userId: string, cellId: string) {
  return prisma.$transaction(async (tx) => {
    const cell = await tx.boardCell.findUnique({
      where: { id: cellId },
      include: { team: { include: { round: true, members: true } }, task: true },
    });
    if (!cell) throw new GameError("Cell not found");
    if (cell.team.round.status !== RoundStatus.ACTIVE) throw new GameError("The round is not running");
    if (!cell.team.members.some((m) => m.userId === userId)) throw new GameError("That board belongs to another team");
    if (cell.revealedAt) return { already: true, task: cell.task };

    const limit = cell.team.round.revealsPerDay;
    if (limit > 0) {
      const since = startOfDayInTz(new Date(), env.timezone);
      const mine = await tx.boardCell.count({
        where: { teamId: cell.teamId, revealedById: userId, revealedAt: { gte: since } },
      });
      if (mine >= limit) {
        throw new GameError(
          limit === 1
            ? "You have already revealed a task today. The next one is tomorrow."
            : `You have revealed ${mine} tasks today, which is your daily limit.`,
        );
      }
    }

    await tx.boardCell.update({
      where: { id: cellId },
      data: { revealedAt: new Date(), revealedById: userId },
    });
    return { already: false, task: cell.task };
  });
}

export async function getBoardView(teamId: string, viewerId: string) {
  const team = await prisma.team.findUniqueOrThrow({
    where: { id: teamId },
    include: {
      round: true,
      members: { include: { user: { select: { id: true, name: true, department: true } } } },
    },
  });

  const cells = await prisma.boardCell.findMany({
    where: { teamId },
    orderBy: { pos: "asc" },
    include: {
      task: true,
      closedBy: { select: { id: true, name: true } },
      revealedBy: { select: { id: true, name: true } },
    },
  });

  const closed = new Set(cells.filter((c) => c.closedAt).map((c) => c.pos));
  const winning = new Set(completedLines(closed).flat());

  // Cells missing from the nearest line: the main hook for the digest email.
  const toLine = Math.min(
    ...LINES.map((line) => line.filter((i) => !closed.has(i)).length),
  );

  return {
    team,
    size: BOARD_SIZE,
    cells: cells.map((c) => ({
      id: c.id,
      pos: c.pos,
      // The text of a hidden task never reaches the client, or it would show in the page source.
      task: c.revealedAt ? c.task : null,
      difficulty: c.task.difficulty,
      // Two things about a hidden task do reach the client: how hard it is and
      // whether it can be closed from memory. Neither gives the task away, and
      // without the second a retro cell is invisible until somebody turns it
      // over by luck — which is the one thing it exists to prevent.
      retro: c.task.retro,
      revealedAt: c.revealedAt,
      revealedBy: c.revealedBy,
      closedAt: c.closedAt,
      closedBy: c.closedBy,
      inLine: winning.has(c.pos),
    })),
    toLine: closed.size === CELL_COUNT ? 0 : toLine,
    closedToday: await closedToday(teamId),
    dailyLimit: team.round.dailyLimit,
    revealsPerDay: team.round.revealsPerDay,
    revealsToday: await revealsToday(viewerId, teamId),
    hiddenLeft: cells.filter((c) => !c.revealedAt).length,
  };
}

/**
 * The same checks closeCell runs, without the write. The action calls this
 * before it spends disk on an upload; closeCell still re-checks inside its
 * transaction, so this is a cheap filter, not the security boundary.
 */
export async function assertCanClose(userId: string, cellId: string): Promise<void> {
  const cell = await prisma.boardCell.findUnique({
    where: { id: cellId },
    include: { team: { include: { round: true, members: true } } },
  });
  if (!cell) throw new GameError("Cell not found");
  if (cell.team.round.status !== RoundStatus.ACTIVE) throw new GameError("The round is not running");
  if (!cell.team.members.some((m) => m.userId === userId)) {
    throw new GameError("That board belongs to another team");
  }
  if (!cell.revealedAt) throw new GameError("Reveal the task first");
  if (cell.closedAt) throw new GameError("This cell is already closed");
}

export type CloseCellInput = {
  userId: string;
  cellId: string;
  kind: ProofKind;
  text?: string | null;
  imageKey?: string | null;
  caption?: string | null;
};

/**
 * Closes a cell and publishes the proof at once. The cell counts immediately and
 * HR can revoke the proof later, so the game never waits on a moderation queue.
 */
export async function closeCell(input: CloseCellInput) {
  return prisma.$transaction(async (tx) => {
    const cell = await tx.boardCell.findUnique({
      where: { id: input.cellId },
      include: { team: { include: { round: true, members: true } }, task: true },
    });
    if (!cell) throw new GameError("Cell not found");

    const { team } = cell;
    if (team.round.status !== RoundStatus.ACTIVE) throw new GameError("The round is not running");
    if (!team.members.some((m) => m.userId === input.userId)) {
      throw new GameError("That board belongs to another team");
    }
    if (!cell.revealedAt) throw new GameError("Reveal the task first");
    if (cell.closedAt) throw new GameError("This cell is already closed");

    if (team.round.dailyLimit > 0) {
      const since = startOfDayInTz(new Date(), env.timezone);
      const today = await tx.boardCell.count({
        where: { teamId: team.id, closedAt: { gte: since } },
      });
      if (today >= team.round.dailyLimit) {
        throw new GameError(`Your team has already closed ${today} ${today === 1 ? "cell" : "cells"} today, which is the limit`);
      }
    }

    if (input.kind === ProofKind.TEXT && !input.text?.trim()) {
      throw new GameError("A text proof needs some text");
    }
    if (input.kind !== ProofKind.TEXT && !input.imageKey) {
      throw new GameError("Attach a photo or a screenshot");
    }

    const linesBefore = team.linesDone;

    const proof = await tx.proof.create({
      data: {
        roundId: team.roundId,
        cellId: cell.id,
        teamId: team.id,
        userId: input.userId,
        kind: input.kind,
        text: input.text?.trim() || null,
        imageKey: input.imageKey ?? null,
        caption: input.caption?.trim() || null,
      },
    });

    await tx.boardCell.update({
      where: { id: cell.id },
      data: { closedAt: new Date(), closedById: input.userId },
    });

    const score = await recomputeTeam(tx, team.id);

    // What this proof finished off. linesDone on the team row is kept current
    // by recomputeTeam, so the value read before the write is an honest "before".
    const newLines = Math.max(0, score.linesDone - linesBefore);
    const bingo =
      newLines > 0 || score.blackout
        ? {
            lines: newLines,
            totalLines: score.linesDone,
            firstLine: linesBefore === 0 && score.firstLineBonus > 0,
            blackout: score.blackout,
            team: team.name,
            linePoints: newLines * team.round.pointsLine,
            firstLinePoints: linesBefore === 0 && score.firstLineBonus > 0 ? team.round.pointsFirstLine : 0,
            blackoutPoints: score.blackout ? team.round.pointsBlackout : 0,
          }
        : null;

    if (bingo) {
      await tx.proof.update({
        where: { id: proof.id },
        data: { bingoLines: newLines, bingoBlackout: score.blackout },
      });
    }

    return { proof, score, gained: cell.task.difficulty, bingo };
  });
}

/** Revoking a proof reopens the cell and recomputes the score. */
export async function revokeProof(hrUserId: string, proofId: string, reason?: string) {
  let removedKey: string | null = null;
  const result = await prisma.$transaction(async (tx) => {
    const proof = await tx.proof.findUnique({ where: { id: proofId } });
    if (!proof) throw new GameError("Proof not found");
    if (proof.revokedAt) return { ok: true };

    await tx.proof.update({
      where: { id: proofId },
      data: { revokedAt: new Date(), revokedById: hrUserId, revokeReason: reason ?? null },
    });

    // The photo goes too: leaving it served from /api/uploads would defeat the
    // point of taking the proof down.
    if (proof.imageKey) removedKey = proof.imageKey;

    // With no surviving proof left on the cell, the cell is open again.
    // A free post has no cell and no score to undo: taking it down is the whole job.
    if (proof.cellId) {
      const alive = await tx.proof.count({ where: { cellId: proof.cellId, revokedAt: null } });
      if (alive === 0) {
        await tx.boardCell.update({
          where: { id: proof.cellId },
          data: { closedAt: null, closedById: null },
        });
      }
    }

    if (proof.teamId) await recomputeTeam(tx, proof.teamId);
    return { ok: true };
  });

  if (removedKey) await deleteImage(removedKey);
  return result;
}

/**
 * One reaction per person per proof. Tapping the emoji you already picked clears
 * it; tapping a different one swaps it. Without this the bonus threshold would
 * mean three different things depending on how many emoji people tapped.
 */
export async function toggleReaction(userId: string, proofId: string, emoji: string) {
  // One transaction for the whole thing, including the bonus award. Running
  // recomputeTeam outside a transaction let two concurrent reactions read the
  // same team score and overwrite each other's increment.
  return prisma.$transaction(async (tx) => {
    const proof = await tx.proof.findUnique({
      where: { id: proofId },
      select: { revokedAt: true, round: { select: { status: true } } },
    });
    if (!proof) throw new GameError("Proof not found");
    if (proof.revokedAt) throw new GameError("That proof has been removed");
    if (proof.round.status !== RoundStatus.ACTIVE && proof.round.status !== RoundStatus.SIGNUP) {
      throw new GameError("The round is over");
    }

    const existing = await tx.reaction.findFirst({ where: { proofId, userId } });

    if (existing?.emoji === emoji) {
      await tx.reaction.delete({
        where: { proofId_userId_emoji: { proofId, userId, emoji } },
      });
      return { on: false, awarded: false };
    }

    await tx.reaction.deleteMany({ where: { proofId, userId } });
    await tx.reaction.create({ data: { proofId, userId, emoji } });

    const awarded = await maybeAwardReactionBonus(tx, proofId);
    return { on: true, awarded };
  });
}

export async function getFeed(
  roundId: string,
  opts: { teamIds?: string[]; userIds?: string[]; cursor?: string; take?: number } = {},
) {
  const take = opts.take ?? 20;
  const teamIds = opts.teamIds ?? [];
  const userIds = opts.userIds ?? [];
  // Following at least one team or person narrows the feed down to them.
  const watched =
    teamIds.length || userIds.length
      ? { OR: [...(teamIds.length ? [{ teamId: { in: teamIds } }] : []), ...(userIds.length ? [{ userId: { in: userIds } }] : [])] }
      : {};

  const proofs = await prisma.proof.findMany({
    where: {
      revokedAt: null,
      roundId,
      ...watched,
    },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: {
      user: { select: { id: true, name: true, department: true } },
      team: { select: { id: true, name: true } },
      cell: { include: { task: { select: { short: true, difficulty: true } } } },
      reactions: { select: { emoji: true, userId: true } },
    },
  });

  const hasMore = proofs.length > take;
  return { items: proofs.slice(0, take), nextCursor: hasMore ? proofs[take - 1].id : null };
}

/**
 * A photo that belongs to no task. It lands in the feed looking exactly like a
 * proof, which does two things: the feed is already alive on the morning the
 * round opens, and nobody can read a team's board off its posts, because a
 * picture tagged with a task no longer means that task was done.
 *
 * The label is drawn server-side from the live pool. Letting people pick would
 * hand every player the full list of tasks, which is the one thing the
 * face-down board exists to withhold.
 */
/** Fallback only: the live value is Round.freePostsPerDay, set by HR. */
export const FREE_POSTS_PER_DAY = 2;

async function randomTaskLabel(tx: Prisma.TransactionClient, allowClientTasks: boolean): Promise<string> {
  const where = { active: true, ...(allowClientTasks ? {} : { clientFacing: false }) };
  const n = await tx.task.count({ where });
  if (n === 0) return "Just because";
  const [task] = await tx.task.findMany({
    where,
    skip: Math.floor(Math.random() * n),
    take: 1,
    select: { short: true },
  });
  return task?.short ?? "Just because";
}

export async function createFreePost(input: {
  userId: string;
  roundId: string;
  imageKey: string;
  caption?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const round = await tx.round.findUnique({
      where: { id: input.roundId },
      select: { id: true, status: true, allowClientTasks: true, allowFreePosts: true, freePostsPerDay: true },
    });
    if (!round) throw new GameError("Round not found");
    if (round.status !== RoundStatus.SIGNUP && round.status !== RoundStatus.ACTIVE) {
      throw new GameError("The feed is closed right now");
    }
    if (!round.allowFreePosts) {
      throw new GameError("Photos off the board are switched off for this round");
    }

    const since = startOfDayInTz(new Date(), env.timezone);
    const mine = await tx.proof.count({
      where: {
        userId: input.userId,
        roundId: round.id,
        cellId: null,
        revokedAt: null,
        createdAt: { gte: since },
      },
    });
    const cap = round.freePostsPerDay;
    if (mine >= cap) {
      throw new GameError(
        `${cap} ${cap === 1 ? "photo" : "photos"} off the board a day is the limit. The next one is tomorrow.`,
      );
    }

    // Before teams are built there is nobody to attribute it to, and that is
    // fine: a warm-up post is a photo, not a move in the game.
    const membership = await tx.teamMember.findFirst({
      where: { userId: input.userId, team: { roundId: round.id } },
      select: { teamId: true },
    });

    return tx.proof.create({
      data: {
        roundId: round.id,
        teamId: membership?.teamId ?? null,
        userId: input.userId,
        kind: ProofKind.PHOTO,
        imageKey: input.imageKey,
        caption: input.caption?.trim() || null,
        label: await randomTaskLabel(tx, round.allowClientTasks),
      },
      select: { id: true },
    });
  });
}

export async function teamLeaderboard(roundId: string) {
  return prisma.team.findMany({
    where: { roundId },
    orderBy: [{ points: "desc" }, { firstLineAt: "asc" }, { name: "asc" }],
    select: { id: true, name: true, points: true, cellsDone: true, linesDone: true },
  });
}

/** The task pool available to a round. */
async function roundTaskPool(round: { allowClientTasks: boolean }) {
  return prisma.task.findMany({
    where: { active: true, ...(round.allowClientTasks ? {} : { clientFacing: false }) },
  });
}

/** Creates a team together with its board, for when HR adds one by hand. */
export async function createTeamWithBoard(roundId: string, name: string, seed = Date.now() % 2_000_000_000) {
  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    include: { centerTask: true },
  });
  const clean = name.trim();
  if (clean.length < 2) throw new GameError("That team name is too short");

  const exists = await prisma.team.findFirst({ where: { roundId, name: clean } });
  if (exists) throw new GameError("A team with that name already exists");

  const pool = await roundTaskPool(round);
  const usable = eligibleTasks(
    pool.map((t) => ({ id: t.id, difficulty: t.difficulty, tags: t.tags, retro: t.retro })),
    { hasOfficeMember: true },
  );
  const board = generateBoard(usable, {
    centerTask: round.centerTask
      ? { id: round.centerTask.id, difficulty: round.centerTask.difficulty, tags: round.centerTask.tags, retro: round.centerTask.retro }
      : null,
    seed,
  });

  return prisma.team.create({
    data: {
      roundId,
      name: clean,
      cells: { create: board.cells.map((t, pos) => ({ pos, taskId: t.id })) },
    },
    select: { id: true, name: true },
  });
}

/**
 * Moves a person to another team in the round, or out of every team.
 * Team scores do not depend on the roster, so nothing is recomputed. Personal
 * points are counted against the current team, though, so cells closed in the
 * previous team no longer count towards them.
 */
export async function moveMember(roundId: string, userId: string, toTeamId: string | null) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, active: true } });
  if (!user) throw new GameError("Employee not found");

  if (toTeamId) {
    const team = await prisma.team.findUnique({ where: { id: toTeamId }, select: { roundId: true } });
    if (!team || team.roundId !== roundId) throw new GameError("That team belongs to a different round");
  }

  await prisma.$transaction(async (tx) => {
    // Within a round a person belongs to exactly one team.
    await tx.teamMember.deleteMany({ where: { userId, team: { roundId } } });
    if (toTeamId) await tx.teamMember.create({ data: { userId, teamId: toTeamId } });
  });
}

/** A team can only be deleted while it has done nothing. */
export async function deleteTeam(teamId: string) {
  const proofs = await prisma.proof.count({ where: { teamId, revokedAt: null } });
  if (proofs > 0) {
    throw new GameError(
      `This team has ${proofs} ${proofs === 1 ? "proof" : "proofs"}; deleting it would erase them along with the board. Move the members out first.`,
    );
  }
  await prisma.team.delete({ where: { id: teamId } });
}

/**
 * Builds teams out of everyone who signed up and gives each one its board.
 * Opting in matters: a team of people who have never heard of the game is all
 * but certain to go quiet and spoil the round for everyone else.
 */
export async function buildTeamsForRound(roundId: string, seed = Date.now() % 2_000_000_000) {
  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    include: { centerTask: true },
  });
  if (round.status !== RoundStatus.SIGNUP) {
    throw new GameError("Teams are built while sign-ups are open");
  }

  const signups = await prisma.roundSignup.findMany({
    where: { roundId },
    include: { user: { select: { id: true, department: true, office: true } } },
  });
  if (signups.length < round.teamSize) {
    throw new GameError(
      `Only ${signups.length} ${signups.length === 1 ? "person has" : "people have"} signed up; a team needs at least ${round.teamSize}.`,
    );
  }

  const pool = await roundTaskPool(round);

  const groups = makeTeams(
    signups.map((s) => ({ id: s.user.id, department: s.user.department })),
    round.teamSize,
    seed,
  );
  const names = teamNames(groups.length, seed);
  const officeById = new Map(signups.map((s) => [s.user.id, s.user.office]));

  const warnings: string[] = [];

  // The default interactive-transaction timeout is 5s; 100 teams take longer
  // than that, and a timeout here would leave the round with no teams at all,
  // because deleteMany has already run.
  await prisma.$transaction(async (tx) => {
    await tx.team.deleteMany({ where: { roundId } });

    for (const [i, group] of groups.entries()) {
      const hasOfficeMember = group.some((u) => officeById.get(u.id) !== "remote");
      const usable = eligibleTasks(
        pool.map((t) => ({ id: t.id, difficulty: t.difficulty, tags: t.tags, retro: t.retro })),
        { hasOfficeMember },
      );

      const board = generateBoard(usable, {
        centerTask: round.centerTask
          ? {
              id: round.centerTask.id,
              difficulty: round.centerTask.difficulty,
              tags: round.centerTask.tags,
              retro: round.centerTask.retro,
            }
          : null,
        seed: seed + i * 7919,
      });
      if (!board.balanced) warnings.push(names[i]);

      const team = await tx.team.create({
        data: {
          roundId,
          name: names[i],
          members: { create: group.map((u) => ({ userId: u.id })) },
        },
        select: { id: true },
      });
      // createMany is one statement instead of 25 — at 100 teams that is
      // 2500 round-trips saved inside the transaction.
      await tx.boardCell.createMany({
        data: board.cells.map((t, pos) => ({ teamId: team.id, pos, taskId: t.id })),
      });
    }

    await tx.round.update({
      where: { id: roundId },
      data: { status: RoundStatus.ACTIVE, startsAt: new Date(), firstLineTeamId: null },
    });
  }, { timeout: 120_000, maxWait: 15_000 });

  return { teams: groups.length, players: signups.length, unbalanced: warnings };
}
