# Corporate Bingo

An internal game: every team gets its own board of light-hearted tasks and tries to complete a line.
Teams of three are drawn at random, so departments get mixed up.

```
spec.md        what the system has to do — the requirements
scoring.md     where points come from, and what the simulation says about them
index.html     clickable prototype for demos (no backend)
tasks.json     the pool of 56 tasks — the seed source, edited by HR
docs/          rules document, balance study and meeting notes
web/           the application
```

This file is how to build and run it. [spec.md](spec.md) is what it has to do, numbered so it can
be checked against the running app, and [scoring.md](scoring.md) is the points — kept apart
because they are the part most likely to change without a line of code moving.

## Running it

You need Node 20+ and any container runtime. This machine uses colima.

```bash
colima start --cpu 2 --memory 4
cd web
npm install
cp .env.example .env            # set AUTH_SECRET: openssl rand -hex 32
npm run db:up                   # Postgres 16 on port 5433
npx prisma migrate dev
npm run db:seed                 # 56 tasks plus the HR accounts from HR_EMAILS
DEMO_OWNER=you@effective-soft.com npm run demo   # optional: 142 employees, teams, proofs, reactions
npm run dev
```

If your docker has the compose plugin, `docker compose up -d db` replaces `npm run db:up`.

A cell stays face-up once it is turned, and reveals are capped per person per day, so
after a few minutes of poking at the board there is nothing left to flip. To try the
animation again, turn the unclosed cells back over and lift the cap for the round:

```bash
npx tsx scripts/flip-test.mts you@effective-soft.com 12   # 12 reveals a day
npx tsx scripts/flip-test.mts you@effective-soft.com 1    # put the cap back
```

Without SMTP configured no mail is sent: the sign-in link is printed to the console and shown
on the sign-in page itself. Fill in the `SMTP_*` variables in production and that mode switches
itself off.

**Signing in takes two steps on purpose.** The emailed link opens a page with a "Sign me in"
button, and only submitting that form spends the token. Opening the link costs nothing. This is
not politeness: on a corporate mailbox something follows these links before the recipient does.
In the access log a request with no User-Agent at all took a token 1.4 seconds ahead of the
owner's browser, collected the session, and left them on "this link has expired" every single
time — three live sessions in the database and a person who could not get in. Scanners and
prefetchers follow links; they do not submit forms. If you ever collapse this back into a plain
GET handler, that failure returns, and it looks like a mail problem rather than a sign-in one.

A plain `next build` overwrites `.next` underneath a running dev server and it starts returning
500s until you restart it. To check a build without touching the dev server, send it elsewhere:

```bash
NEXT_DIST_DIR=.next-check npx next build
```

After any `prisma generate` — which `prisma migrate` runs for you — **restart the dev server**.
The running process keeps the client it loaded at startup, so until you do, every query against a
new column fails with `Unknown argument`.

## Stack

Next.js 15 (App Router, server actions), TypeScript, Postgres 16, Prisma 6, nodemailer,
sharp for images, S3-compatible storage in production and a local folder in development.
Prisma is deliberately pinned to the 6.x line: version 8 reworked the CLI and the migration model.

## How the game works

**Face-down cells.** The board is not handed over all at once. At first each cell shows only its
difficulty — one to three stars on a striped card back, which turns over with a flip when
somebody reveals it. The card then carries the initials of whoever turned it over. Revealing only
adds a class, so a cell a teammate turns over flips by itself on your next refresh. Any team member can reveal a cell, but no more
than `revealsPerDay` a day each (one by default). A revealed task is visible to the whole team and
anyone can be the one to do it. This is the main pacing control: a trio uncovers three new tasks a
day. HR sets this one. The older per-team closing limit (`dailyLimit`) is off by default: it is
still honoured if set, but has no field — see **What HR can actually set** below. The
text of a hidden task never reaches the client, or it would be visible in the page source.

**The board.** Board size does not change the length of a line, which always equals the side of the
board. Difficulty comes from the layout instead: the generator (`lib/board.ts`) keeps reshuffling
until every one of the 12 lines holds at least one hard task and totals at least nine difficulty
points. There is no cheap line of five easy cells to be found. The center cell is the same task for
every team in the round.

**The BINGO moment.** A line closing is the thing the game is for, so it is not a line in a toast.
The player who closed it gets a full-screen **BINGO!** with the points it earned, and the proof
that did it carries a banner in the shared feed, so the whole company sees which team finished a
line and on what photo. A closed board says **FULL BOARD** instead. What a proof finished off is
recorded on the proof itself (`bingoLines`, `bingoBlackout`) at the moment it lands: it is an
event, and it stays true in the feed even if a later revoke breaks the line again.

**Retro cells.** A task can be marked `retro`: satisfied by something that already happened
rather than something arranged this week — the oldest photo you have from working here, a team
photo with bad lighting, the tab you have had open since spring. They exist for the first
morning: a board of "go and do this" tasks scores nothing until somebody organises something,
and a game where nothing happens on day one tends not to have a day two. A face-down retro cell
is the only one that carries a marker — a small **start here** badge — because a hint nobody can
see is not a hint. That badge is the one extra bit a hidden cell gives away, next to its
difficulty stars; the task itself still never reaches the client. The generator puts at least three on every board
(`MIN_RETRO` in `lib/board.ts`), swapping each one in for a task of the same difficulty so every
board keeps the identical 8 easy / 10 medium / 7 hard mix and is worth exactly as much as any
other. They exist so day one is not a cold start: you can score by remembering.

**Points.** HR sets these in the round panel; the numbers below are the defaults the balance was
simulated against. A cell is worth its difficulty (1–3), a line adds 5, the first line of the round another
10, and a fully closed board 25. A proof that collects enough reactions from people outside its own
team pays a bonus once — otherwise a trio would simply like its own way to the points. Personal
points go to whoever closed the cell, so an active player still scores in a trio that went quiet.

**Photos off the board.** Anyone can post a photo that belongs to no task at all, two a day. It
appears in the feed exactly like a proof, under a task name the server draws at random from the
live pool — which is the point twice over: the feed is already alive on the morning the round
opens, because posting is open from the sign-up phase onward, and nobody can read a team's board
off its posts, because a picture tagged with a task no longer means that task was done. A free
post scores nothing, and the per-post countdown to the reaction bonus was removed from the feed
so that a decoy is never given away by a promise it cannot keep. HR can switch the whole thing off
for a round; the check is in `createFreePost`, not only in the UI.

**Optimistic moderation.** The cell closes at once and the proof goes to the feed; HR can remove it
later, which reopens the cell and recomputes the score. Pre-moderation across 150 people would have
turned into a queue on day one.

**The feed is the home page.** The whole point is that everyone sees what everyone else got up to,
so `/` opens the feed and the team board lives at `/board`. A thin strip above the feed shows your
own team's score and place, keeping the board one tap away. While sign-ups are open the feed has
nothing to show, so the home page carries the invitation instead. The feed is a single column with
subscriptions: follow several teams and people and it narrows down to them. Until a photo exists,
a proof is shown as a drawn scene assembled from simple shapes; the scene and palette come from a
hash of the proof id, so it is stable between visits and nothing is fetched at runtime.

**Your own round.** `/me` is not an account page. It counts the cells you closed and the posts
you made, but mostly it reads the feed back at you: who reacts to your photos most and what they
usually press, whose posts you turn up for, how many people and how many departments your photos
reached. Underneath sits every photo you posted this round, each one downloadable, with a
"download all" that streams a zip (`lib/zip.ts`, store method — the webp files are already
compressed). They are your pictures; you can take them away again.

**Opting in matters.** A round runs draft → sign-ups → active → finished, and teams are built only
from people who pressed "I am in". A trio of people who never heard about the game will go quiet
and spoil the round for everyone else.

**Few settings per task.** A task has a short name (28 characters, which is what fits in a cell), a
full description, a difficulty, a proof type (a photo or a screenshot — text-only proofs were
dropped, because a paragraph of prose in a feed of photographs reads as a broken image) and two
checkboxes: office-only and retro activity.
Categories and the old set of four "requirements" are gone: they told players nothing, and only one
of them did anything — the office-only flag. That one survives, because a trio of fully remote
colleagues would otherwise be handed a cell they cannot possibly close, and one dead cell blocks up
to three lines.

**Client calls are off.** A task carries a `clientFacing` flag and a round carries
`allowClientTasks`. By default the game runs on internal meetings only, and no task in the pool is
marked client-facing, so the filter currently removes nothing.

## What HR can do

- **Tasks** — create, edit, enable and disable, with a warning when the pool holds fewer than eight
  hard tasks and the generator can no longer balance the lines. A task can be marked as counting
  a retro activity; the header shows how many of those the pool holds.
- **Round settings** — the round name, the team size, how many cells each person turns over per
  day (the pace of the whole game), and photos off the board with their daily cap. That is
  deliberately all of them; see below.
- **Team rosters** — move people between teams, take someone off a team, add whoever asked to join
  late, rename and create teams (a new team gets its board immediately). A team's score does not
  depend on its roster, but personal points follow the current team, so cells someone closed in
  their old trio stop counting towards them. The board is not rebuilt when a roster changes.
- **Latest proofs** — cards showing the proof itself: the picture, the task, the reaction count.
  Remove takes the proof down, reopens the cell and recomputes the score. Next to it sits
  "Disable the author" with a confirmation step, for outright vandalism.
- **Analytics** (`/hr/analytics`) — one page with the numbers that come up mid-round. How many
  people have posted or reacted at all, and how many teams have closed nothing. Leader against
  median score, which is the runaway check the balance simulation was about. The share of
  reactions that crossed a department boundary, with the busiest department pairs — the number
  the whole exercise exists to move. Posts and reactions per day. Which tasks everybody closes and
  which sit untouched, so a dud can be edited mid-round rather than after it. And a list of the
  people nobody has heard from, to nudge.
- **Employees** — import a list, search, disable and re-enable access. A disabled employee loses
  access immediately: sessions are dropped, unused sign-in links are deleted, and they cannot sign
  in again. Their proofs stay in the feed and are removed one at a time. You cannot disable
  yourself or another HR account.

### What HR can actually set

The round form carries five fields — name, team size, reveals per person per day, photos off the
board and how many of those per day — and the task editor two checkboxes. Everything else a round
holds (`dailyLimit`, `reactionBonusAt`, `reactionBonusPoints`, `allowClientTasks`, `centerTaskId`)
is real, honoured by the game, and has no field. That is on purpose: they are the balance the simulation was run against, and moving one
mid-round changes what every team's points are worth. Change them in the database, deliberately.

Two things follow for anyone adding a field back. `saveRoundAction` and `saveTaskAction` write only
the fields their form carries: reading an absent one as `Number(formData.get("x") ?? 3)` turns every
save into a silent reset, and `formData.get("active") !== "off"` is always true for a checkbox,
because an unchecked box sends nothing at all rather than `"off"`. Both of those were live bugs.

`DEBUG_OPEN_HR=true` opens the HR area to everyone signed in and shows the HR tab in the menu.
It is there on purpose and only for debugging: **drop the flag before production** and the role
check comes back on its own (`canOpenHR` in `lib/auth.ts`).

## Privacy

Uploaded pictures are converted to webp no wider than 1080px and stripped of their metadata, which
takes the capture coordinates with it. Proofs are served through the app to signed-in users only,
never straight from the bucket. The task card reminds players not to post code, client data, or
anyone who has not agreed to be in the shot.

## Not built yet

- A scheduler for the digest email: `sendDigest` exists, nothing calls it.
- A results screen for a finished round.
- Editing a team name as a player (HR can already do it, with a pencil on the team card).
- Reposting your own photo for a cell a teammate has already closed.
- Video as a proof type.
- Automated tests.
- Infinite scroll in the feed: the latest 40 proofs are served.
