/**
 * Fills the local database with a plausible round: employees, sign-ups, teams,
 * boards, closed cells and reactions. Development only.
 */
import { PrismaClient, ProofKind, RoundStatus } from "@prisma/client";
import { buildTeamsForRound } from "../lib/game";
import { recomputeTeam, maybeAwardReactionBonus } from "../lib/scoring";

const prisma = new PrismaClient();

const DEPTS = ["Backend", "Frontend", "QA", "DevOps", "Design", "PM", "Presales", "Analytics", "Mobile", "HR"];
// An international pool: the company has people in several countries, and
// surnames that do not inflect keep every random pairing valid.
const FIRST = ["Anton", "Marina", "Dmitry", "Olga", "Anna", "Pavel", "Kirill", "Julia",
  "Maxim", "Irina", "Sergey", "Catherine", "Natalia", "Polina", "Roman", "Victoria",
  "Daria", "Nikita", "Denis", "Alina", "Mayela", "Carlos", "Lucia", "Diego", "Sofia",
  "Miguel", "Elena", "Tomas", "Laura", "Andres", "Nadia", "Rafael", "Ines", "Martin",
  "Clara", "Felipe", "Marta", "Hugo", "Paula", "Oscar"];

const LAST = ["Ramirez", "Vargas", "Mendez", "Castro", "Rojas", "Navarro", "Herrera",
  "Delgado", "Bermudez", "Quesada", "Moreno", "Solano", "Araya", "Chaves", "Jimenez",
  "Fonseca", "Alvarado", "Brenes", "Calderon", "Esquivel", "Novik", "Zhuk", "Moroz",
  "Karpovich", "Naumenko", "Shevchenko", "Sidorenko", "Solovey", "Litvin", "Bondar",
  "Hrytsenko", "Melnyk", "Kovach", "Dudek", "Nowak", "Varga", "Horvat", "Marek"];

function rnd(n: number) { return Math.floor(Math.random() * n); }
function pick<T>(a: T[]): T { return a[rnd(a.length)]; }

/**
 * Captions in the register the whole product is written in: deadpan,
 * understated, a little self-deprecating. Two pools — one keyed to the task,
 * which lands better, and a generic one for everything else.
 */
const BY_TASK: Record<number, string[]> = {
  1: ["She sat still for exactly one second. This is that second.",
      "He heard the word 'meeting' and arrived immediately."],
  2: ["Half the call went on discussing the hat. The daily still took four minutes.",
      "In hindsight, the hat was optional."],
  5: ["The wind in the microphone was louder than me, but the cell counts.",
      "A dog walker stopped to listen to our standup."],
  9: ["It took begging, but every camera is on.",
      "Nine cameras. One of them is a ceiling."],
  11: ["I considered tidying first. I decided honesty was braver.",
       "Four mugs. I can explain two of them."],
  13: ["Meet Steven. He is in charge of morale.",
       "Named him Gary. Gary is thriving."],
  14: ["It says 'World's Okayest Engineer'. It was a gift.",
       "The handle broke in 2021. We carry on."],
  16: ["I looked out of a window for twenty minutes. It was fine.",
       "Ate lunch like a person from before the internet."],
  18: ["She said nobody writes on paper any more. She kept it.",
       "Left it on his keyboard. He has not mentioned it, but it is still there."],
  25: ["We had nothing in common. We talked for an hour.",
       "Picked a name at random and got the one person who also hates cilantro."],
  31: ["Fifteen seconds was generous. It is mostly sighing.",
       "The sequel will be about merge conflicts."],
  34: ["It only happens on Thursdays. Nobody knows why.",
       "The error message is longer than the function."],
  37: ["He says it looks nothing like him. He is right.",
       "Thirty seconds was plenty. That is the worrying part."],
  41: ["Four years. I have waited four years for this.",
       "Inbox zero. I give it until Thursday."],
  42: ["I closed forty tabs. I will regret this by lunch.",
       "Five tabs. I feel lighter and slightly lost."],
  43: ["Walked fifteen minutes, thought about work for twelve.",
       "Found a street I have never seen. It was two minutes away."],
  47: ["It took eleven minutes. It waited three weeks.",
       "Turns out it was easy. That is the annoying bit."],
  50: ["Opened in March. Nobody remembers why.",
       "Closed it as 'will not fix' and felt nothing but peace."],
  51: ["Three calendars, one gap, forty minutes of coffee.",
       "We found a slot. It took more planning than the task."],
  54: ["Took eight attempts. Someone always blinked.",
       "Nailed the pose, lost all dignity."],
};

const CAPTIONS = [
  "Took three takes.",
  "Nobody suspected a thing.",
  "I had to explain myself to building security.",
  "The team is appalled. I am delighted.",
  "My colleagues said this was going too far. So it counts.",
  "Harder than it looks. Please do not ask.",
  "One colleague asked if I was feeling all right.",
  "First try, which nobody believes.",
  "I am told this is not what the task meant.",
  "Regret is setting in, but the cell is closed.",
  "Three people watched. Two of them left.",
  "This took longer to set up than to do.",
  "Peer reviewed by someone who did not want to be.",
  "I now understand why nobody picks this one.",
  "Had to move furniture. Worth it.",
  "We have agreed never to speak of this again.",
  "Second attempt. We do not discuss the first.",
  "I committed to the bit.",
  "Mild chaos, no casualties.",
  "Our tech lead has questions.",
  "Did this instead of the thing I was supposed to do.",
  "Not my finest work, but it is work.",
  "I was promised this would be easy.",
  "Took a photo, deleted it, took it again.",
  "Apparently I am that person now.",
  "Done. Please do not zoom in.",
  "This is the edited version.",
  "Someone said 'you are really doing this'. I was.",
  "The office plant witnessed everything.",
  "Four attempts and one minor argument.",
  "My reputation did not survive. The cell did.",
  "I checked. It is technically allowed.",
  "Phone battery died twice.",
  "I asked for help. I did not get help.",
  "This made more sense in my head.",
  "Nobody warned me there would be effort.",
  "Had to do it twice because I blinked.",
  "I would like the record to show that I tried.",
  "Nothing about this was convenient.",
  "Finished it during a meeting. Sorry.",
  "My neighbour now thinks I work in a circus.",
  "One take. I am as surprised as you are.",
  "Mission accomplished, dignity not included.",
  "Somebody is going to screenshot this.",
  "I have been informed that it was 'a lot'.",
  "The hardest part was keeping a straight face.",
  "This is what two weeks of bingo does to a person.",
  "Crossed off. Pretending it was effortless.",
  "Lost a colleague's respect, gained a point.",
  "I was told to stop. I did not stop.",
  "The coffee machine was involved.",
  "Took three tries and one apology.",
  "I am not proud. I am, however, finished.",
  "The whole floor knows now.",
  "Worth it. Ask me again tomorrow.",
  "Briefly questioned my career.",
  "My camera roll is a crime scene.",
  "Everything is fine and I am normal.",
];

/** Text proofs read better when they answer the actual task. */
const BY_TASK_TEXT: Record<number, string[]> = {
  4: ["Stood for the whole thing. Marina can confirm, she kept looking.",
      "Stayed on my feet. My knees filed a complaint."],
  6: ["Said 'holistic approach' out loud and nobody even blinked.",
      "Worked 'proactively' into a sentence about a broken build. Zero reaction."],
  22: ["Our sysadmin rowed competitively for nine years and still takes a kayak out.",
       "The quietest person in Design used to be a wedding DJ."],
  24: ["She makes sure the numbers we show clients are the numbers that are true. Took two minutes, should have asked a year ago.",
       "He keeps the build from falling over. Apparently that is most of the job."],
  28: ["Marta, Diego, Priya. I have written them down so I cannot pretend otherwise.",
       "Learned three names and immediately used one incorrectly."],
  29: ["Eleven years here: 'ask the dumb question on day one, it gets more expensive later.'",
       "'Nothing is as urgent as it is described in the subject line.'"],
  32: ["Once upon a time there was a monolith. It had three services, and the youngest was redundant...",
       "In a kingdom with no documentation, a single README was king..."],
  35: ["We help shops know what people want to buy before the shops do.",
       "It is a very big calculator that tells banks when something looks wrong."],
  40: ["The form only broke on Thursdays, and only for users in one city. It was a timezone.",
       "Two years of a bug nobody could reproduce. It was a trailing space."],
  45: ["Whole call, no phone. I now know how long an hour is.",
       "Did not touch it once. Looked at it fourteen times."],
  46: ["No mail before eleven. Got more done than I did all Tuesday.",
       "Skipped the inbox. The world did not end, which is suspicious."],
  53: ["Motto: 'we will get to it.' Took us twenty minutes to agree on that.",
       "Our motto is 'nobody asked us to', and we are sticking with it."],
  56: ["All three of us cannot stand cilantro. Bonded instantly.",
       "Turns out we have all broken production in the same week of the year."],
  57: ["Asked everyone what they would do with a free Tuesday. Two said sleep, one said woodwork.",
       "'What is the worst meal you have ever paid for?' The answers took forty minutes."],
  59: ["'Calm, decisive, allergic to meetings.' They guessed in four seconds.",
       "'Loud, kind, always eating.' Everyone knew immediately."],
};

const TEXTS = [
  "Done, and I have the screenshots to prove it.",
  "Harder than expected, finished anyway.",
  "Took two attempts and one bad idea.",
  "Can confirm. Would not repeat.",
  "Logged for posterity.",
];

/** Prefer a caption written for this exact task; fall back to the generic pool. */
function pickCaption(taskId: number): string {
  const own = BY_TASK[taskId];
  if (own && Math.random() < 0.75) return pick(own);
  return pick(CAPTIONS);
}

function pickText(taskId: number): string {
  return pick(BY_TASK_TEXT[taskId] ?? TEXTS);
}

async function main() {
  console.log("Clearing previous demo data…");
  await prisma.round.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { endsWith: "@effective-soft.com" }, role: "PLAYER" } });

  // ---- employees ----
  const users: { id: string }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 141; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const base = `${first}.${last}`.toLowerCase();
    let email = `${base}@effective-soft.com`;
    let n = 2;
    while (seen.has(email)) email = `${base}${n++}@effective-soft.com`;
    seen.add(email);

    users.push(
      await prisma.user.create({
        data: {
          email,
          name: `${first} ${last}`,
          department: pick(DEPTS),
          office: Math.random() < 0.6 ? "office" : "remote",
        },
        select: { id: true },
      }),
    );
  }

  // The project owner's own account, so there is always something to sign in to.
  const me = await prisma.user.upsert({
    where: { email: "anton.karzhavin@effective-soft.com" },
    update: { active: true },
    create: {
      email: "anton.karzhavin@effective-soft.com",
      name: "Anton Karzhavin",
      department: "Presales",
      office: "office",
    },
    select: { id: true },
  });
  users.push(me);

  // Anyone else who will be shown the demo, passed as DEMO_ACCOUNTS (comma
  // separated emails). They are grafted onto the generated population and
  // forced into the sign-up list, so each of them opens the app on a real
  // board with a few days of history behind it rather than on "you are not on
  // a team this round".
  const invited: { id: string }[] = [];
  const extra = (process.env.DEMO_ACCOUNTS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((e) => e && e !== "anton.karzhavin@effective-soft.com");
  for (const [i, email] of extra.entries()) {
    const name = email
      .split("@")[0]
      .split(/[._-]/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" ");
    const u = await prisma.user.upsert({
      where: { email },
      update: { active: true },
      // Spread them across departments: the cross-department numbers on the
      // analytics page are dull when everyone sits in the same one.
      create: { email, name, department: DEPTS[i % DEPTS.length], office: i % 2 ? "remote" : "office" },
      select: { id: true },
    });
    users.push(u);
    invited.push(u);
  }
  if (invited.length) console.log(`Invited accounts: ${invited.length}`);

  console.log(`Employees: ${users.length}`);

  // ---- round ----
  const center = await prisma.task.findFirst({ where: { tags: { has: "team" }, difficulty: 3 } });
  const round = await prisma.round.create({
    data: {
      title: "Bingo, round 1",
      status: RoundStatus.SIGNUP,
      dailyLimit: 0,
      revealsPerDay: 1,
      teamSize: 3,
      centerTaskId: center?.id ?? null,
      endsAt: new Date(Date.now() + 8 * 86_400_000),
      reactionBonusAt: 10,
      reactionBonusPoints: 2,
    },
  });

  // Around 85% sign up, which is what an honest opt-in actually looks like.
  const signedUp = users.filter(() => Math.random() < 0.85);
  for (const u of [me, ...invited]) if (!signedUp.includes(u)) signedUp.push(u);
  await prisma.roundSignup.createMany({
    data: signedUp.map((u) => ({ roundId: round.id, userId: u.id })),
    skipDuplicates: true,
  });
  console.log(`Signed up: ${signedUp.length}`);

  const built = await buildTeamsForRound(round.id, 424242);
  console.log(`Teams: ${built.teams}${built.unbalanced.length ? `, unbalanced boards: ${built.unbalanced.length}` : ", every board balanced"}`);

  // ---- a few days of history ----
  const teams = await prisma.team.findMany({
    where: { roundId: round.id },
    include: { members: true, cells: { include: { task: true } } },
  });

  let proofCount = 0;
  for (const team of teams) {
    // Some teams go quiet, which is what a real round looks like.
    // The owner's team always gets activity, otherwise every reseed risks
    // signing in to a dead board with nothing to look at.
    const isMine = team.members.some((m) => m.userId === me.id);
    const activity = isMine ? 1 : Math.random();
    const howMany = activity < 0.12 ? 0 : activity < 0.3 ? 2 + rnd(3) : 9 + rnd(5);
    const cells = [...team.cells].sort(() => Math.random() - 0.5).slice(0, howMany);

    for (const cell of cells) {
      const member = pick(team.members);
      const kind = cell.task.proof as ProofKind;
      const daysAgo = rnd(6);
      const when = new Date(Date.now() - daysAgo * 86_400_000 - rnd(20) * 3_600_000);

      await prisma.proof.create({
        data: {
          roundId: round.id,
          cellId: cell.id,
          teamId: team.id,
          userId: member.userId,
          kind,
          text: kind === ProofKind.TEXT ? pickText(cell.task.id) : null,
          caption: kind === ProofKind.TEXT ? null : pickCaption(cell.task.id),
          createdAt: when,
        },
      });
      await prisma.boardCell.update({
        where: { id: cell.id },
        data: {
          revealedAt: new Date(when.getTime() - 3_600_000),
          revealedById: member.userId,
          closedAt: when,
          closedById: member.userId,
        },
      });
      proofCount++;
    }

    // Some cells are revealed but not done yet, which is how a board really looks.
    const stillHidden = team.cells.filter((c) => !cells.some((x) => x.id === c.id));
    const openedNotDone = stillHidden.sort(() => Math.random() - 0.5).slice(0, 1 + rnd(4));
    for (const cell of openedNotDone) {
      const member = pick(team.members);
      await prisma.boardCell.update({
        where: { id: cell.id },
        data: { revealedAt: new Date(Date.now() - rnd(4) * 86_400_000), revealedById: member.userId },
      });
    }
    await recomputeTeam(prisma, team.id);
  }
  const revealed = await prisma.boardCell.count({ where: { revealedAt: { not: null } } });
  const hidden = await prisma.boardCell.count({ where: { revealedAt: null } });
  console.log(`Proofs: ${proofCount}; cells revealed ${revealed}, face down ${hidden}`);

  // ---- photos off the board ----
  // They carry a task name drawn at random, exactly as the real ones do, so the
  // demo feed shows what the decoys actually look like next to genuine proofs.
  const pool = await prisma.task.findMany({ where: { active: true }, select: { short: true } });
  const everyone = await prisma.teamMember.findMany({
    where: { team: { roundId: round.id } },
    select: { userId: true, teamId: true },
  });
  let freeCount = 0;
  for (let i = 0; i < 14 && everyone.length > 0; i++) {
    const who = pick(everyone);
    await prisma.proof.create({
      data: {
        roundId: round.id,
        teamId: who.teamId,
        userId: who.userId,
        kind: ProofKind.PHOTO,
        caption: pickCaption(-1),
        label: pick(pool).short,
        createdAt: new Date(Date.now() - rnd(6) * 86_400_000 - rnd(20) * 3_600_000),
      },
    });
    freeCount++;
  }
  console.log(`Photos off the board: ${freeCount}`);

  // ---- reactions ----
  const proofs = await prisma.proof.findMany({ select: { id: true, teamId: true } });
  const allUsers = await prisma.user.findMany({ select: { id: true } });
  let reactions = 0;
  for (const proof of proofs) {
    const n = Math.random() < 0.15 ? 10 + rnd(30) : rnd(9);
    const voters = [...allUsers].sort(() => Math.random() - 0.5).slice(0, n);
    for (const v of voters) {
      await prisma.reaction.upsert({
        where: { proofId_userId_emoji: { proofId: proof.id, userId: v.id, emoji: "👏" } },
        update: {},
        create: { proofId: proof.id, userId: v.id, emoji: "👏" },
      });
      reactions++;
    }
    await maybeAwardReactionBonus(prisma, proof.id);
  }
  const bonused = await prisma.proof.count({ where: { bonusAwardedAt: { not: null } } });
  console.log(`Reactions: ${reactions}, proofs with a bonus: ${bonused}`);

  const top = await prisma.team.findMany({
    where: { roundId: round.id },
    orderBy: { points: "desc" },
    take: 5,
    select: { name: true, points: true, cellsDone: true, linesDone: true },
  });
  console.log("\nTop 5:");
  for (const [i, t] of top.entries()) {
    console.log(`  ${i + 1}. ${t.name} — ${t.points} points, ${t.cellsDone} cells, ${t.linesDone} ${t.linesDone === 1 ? "line" : "lines"}`);
  }
  console.log(`\nSign in as hr@effective-soft.com (HR) or anton.karzhavin@effective-soft.com (player).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
