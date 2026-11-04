# Corporate Bingo — requirements

What the system has to do, written so that it can be checked against the running app.
Scoring is deliberately not here: the numbers and the reasons behind them live in
[scoring.md](scoring.md). How it is built and run is in [README.md](README.md); the rules as
players read them are in [docs/rules.html](docs/rules.html).

Requirements are numbered so they can be referred to in a review. **MUST** is a rule the game
breaks without; **SHOULD** is a decision taken on purpose that could be revisited.

Status: describes the system as deployed on 4 November 2026, ahead of the December round.

---

## 1. Purpose

An internal game for roughly 300 employees, run by HR for two weeks around the New Year.
Each team gets its own 5×5 board of light tasks and tries to complete a line.

It exists for one measurable reason: **to get people talking across departments.** Teams are
drawn at random so that a team is three people who do not normally work together, and the
feed is company-wide so that the people who are not on your team still see what you did.

### 1.1 Success criteria

| | Target | Where it is measured |
|---|---|---|
| S-1 | A majority of players post or react at least once | `/hr/analytics` → participation |
| S-2 | A substantial share of reactions cross a department boundary | `/hr/analytics` → cross-department share |
| S-3 | No team runs away with it: leader ≈ median × 2 or less | `/hr/analytics` → leader against median |
| S-4 | Few silent teams | `/hr/analytics` → teams that closed nothing |
| S-5 | Something is scoreable on day one, before anybody organises anything | retro cells, FR-F5 |

The thresholds are HR's to set before the round; the app reports the numbers, it does not judge them.

### 1.2 Non-goals

Performance review, workload tracking, anything that feeds into an appraisal. Nothing in the
system is a measure of how well somebody does their job, and nothing exported from it should be
presented as one.

---

## 2. Scope

**In scope.** Sign-in, the employee list, the task pool, one round at a time, team formation,
boards, revealing and closing cells, photo proofs, the feed, reactions, leaderboards, a personal
page, HR moderation and analytics, transactional email.

**Out of scope.** Several rounds running at once, a mobile app, Teams/Slack integration, video
proofs, a scheduler for digest mail, comments on posts, direct messages.

---

## 3. Actors

| | Who | What they can do |
|---|---|---|
| A-1 | **Player** | Everyone on the employee list with a corporate address. Signs in, opts into a round, reveals and closes cells on their own team's board, posts photos, reacts, reads the feed and the leaderboards. |
| A-2 | **HR** | A player plus the HR area: the task pool, round settings, team rosters, moderation, analytics, the employee list. One role, no finer grades. |
| A-3 | **Operator** | Whoever runs the server. Not a role in the app: reaches the database and the environment directly. |

HR has a per-browser switch that hides the HR controls, so an HR account can see the app exactly
as a player does. It hides only; every server action re-checks the role.

---

## 4. Glossary

**Round** — one run of the game, with its own teams, boards and leaderboard.
**Board** — a team's 5×5 grid of 25 cells.
**Cell** — one task on one board. Face down, then revealed, then closed.
**Reveal** — turning a cell face up so the team can read the task.
**Close** — posting a proof and marking the cell done.
**Proof** — a photo or screenshot attached to a cell.
**Free post** — a photo that belongs to no cell. Looks like a proof in the feed.
**Line** — five closed cells in a row, column or diagonal. 12 lines exist on a board.
**Blackout** — all 25 cells closed.
**Retro cell** — a cell whose task is satisfied by something that already happened.

---

## 5. Round lifecycle

```
DRAFT ──► SIGNUP ──► ACTIVE ──► FINISHED
            └──► DRAFT
```

| | Requirement |
|---|---|
| L-1 | Status MUST move forward only, with one exception: SIGNUP may return to DRAFT. An ACTIVE round MUST NOT return to SIGNUP — rebuilding teams deletes every team and cascades away its proofs. |
| L-2 | **DRAFT** — HR prepares the pool and the settings. Nothing is visible to players. |
| L-3 | **SIGNUP** — players opt in. The feed is open and free posts are allowed, so that the feed is already warm on the morning the round starts. No boards exist yet. |
| L-4 | **ACTIVE** — reached by building the teams, not by a status button. Boards exist; revealing, closing and scoring are live. |
| L-5 | **FINISHED** — the leaderboard still opens and still shows the standings, so the winner is announced somewhere. Reactions are refused. |
| L-6 | Exactly one round MUST be in SIGNUP or ACTIVE at a time. The app reads "the current round" as the most recent such round. |
| L-7 | Opting in MUST be required. A team of people who never heard about the game goes quiet and spoils the round for the two others in it. |

---

## 6. Functional requirements

### A. Access and identity

| | Requirement |
|---|---|
| A-1 | Sign-in MUST be by emailed link only. No passwords, no VPN, no app install — people play from a sofa on a phone. |
| A-2 | Only an address on a configured corporate domain, belonging to somebody already on the employee list and still active, gets a link. |
| A-3 | The login page MUST answer identically whether or not the address exists, is on the right domain, or has hit its rate limit. Otherwise the page is a staff-list enumerator. |
| A-4 | A link MUST be single use and expire in 15 minutes. Spending it MUST be a single conditional update, so two requests carrying the same link cannot both get a session. |
| A-5 | At most 5 links per person per 15 minutes. |
| A-6 | **Opening the link MUST NOT spend it.** The link opens a page with a button; only submitting that form signs the person in. This is not politeness — on a corporate mailbox something follows these links ahead of the recipient. A request with no User-Agent took a token 1.4 seconds before the owner's browser, kept the session, and left them on "this link has expired" every time. Scanners follow links; they do not submit forms. |
| A-7 | A session MUST be long (90 days by default), or every visit from a phone costs another email. |
| A-8 | The session cookie MUST be marked `Secure` according to the host the request actually arrived on, not according to configuration. The app answers on a public HTTPS name and on a plain-http address inside the network; marking it `Secure` on the latter made the browser silently discard it after the token had already been spent. |
| A-9 | HR MUST be able to disable an employee: sessions dropped, unused links deleted, no further sign-in. Their posts stay up and are removed one at a time, so HR decides deliberately what leaves the feed. |
| A-10 | Nobody may disable their own account or another HR account from the UI. |
| A-11 | `DEBUG_OPEN_HR` opens the HR area to anyone signed in. It MUST be false in production. |

### B. Employee directory

| | Requirement |
|---|---|
| B-1 | HR MUST be able to import a list by pasting CSV: email, name, department, office/remote. Comma, semicolon or tab separated; a header row is skipped; a bad line is reported and does not stop the rest. |
| B-2 | Import MUST be idempotent — re-importing updates rather than duplicates, and re-enables a disabled person. |
| B-3 | Department drives team formation; office/remote decides whether office-only tasks can land on a board. Both MAY be blank. |
| B-4 | The feed is open to the whole company, not only to players, so participation is measured against everyone who can sign in. |

### C. Task pool

| | Requirement |
|---|---|
| C-1 | A task has: a short name (3–28 characters — what fits in a cell), a full description (10+ characters), a difficulty of 1, 2 or 3, a proof type, and two flags: office-only and retro. |
| C-2 | Proof types are photo and screenshot. **Text-only proofs MUST NOT be offered**: a paragraph of prose in a feed of photographs reads as a broken image. The engine still understands the type; nothing creates one. |
| C-3 | `active` is what takes a task in and out of the deal. Editing a task MUST NOT change it — the switch lives in the list. |
| C-4 | **Office-only** keeps a task off the board of an all-remote team. It is the only one of the original four "requirements" that survives, because one impossible cell blocks up to three lines. |
| C-5 | **Retro** marks a task satisfiable from memory — see FR-F5. |
| C-6 | A task MAY be marked client-facing; a round decides whether those are dealt. Default off: the game runs on internal meetings only. No task in the pool is currently marked, so the filter removes nothing. |
| C-7 | The pool MUST hold at least 25 eligible tasks, and enough hard ones (8+) for the generator to balance lines. HR SHOULD be warned when it does not. |
| C-8 | The pool ships as `tasks.json` and is seeded from there. HR edits tasks in the app; `tasks.json` is the source for a fresh install, and reseeding is an upsert by id. |
| C-9 | Current pool: 56 tasks — 18 easy / 23 medium / 15 hard, 36 photo / 20 screenshot, 11 retro, 2 office-only, 0 client-facing. |

### D. Round configuration

| | Requirement |
|---|---|
| D-1 | HR MUST be able to set, in the round panel: the round name and team size (draft only), reveals per person per day, whether photos off the board are allowed and how many per day, what each achievement is worth, and the reaction bonus threshold and payout. |
| D-2 | Team size MUST NOT change once boards exist. |
| D-3 | Changing what an achievement is worth MUST recompute every team in the round immediately. Scores are stored, not derived on read, so without this the leaderboard quietly disagrees with the rules page. |
| D-4 | A save MUST write only the fields its form carries. Reading an absent field as `Number(get("x") ?? 3)` turns every save into a silent reset — this was a live bug. An unchecked checkbox sends nothing at all, so `get("active") !== "off"` is always true — also a live bug. |
| D-5 | Settings with no field — the per-team daily closing limit, client-facing tasks, the pinned centre task — are real and honoured, and are changed in the database deliberately. They are the balance the simulation was run against. |
| D-6 | The number of controls SHOULD stay small. Three switches that did nothing visible were removed rather than explained. |

### E. Team formation

| | Requirement |
|---|---|
| E-1 | Teams MUST be built only from people who opted in. |
| E-2 | Each team SHOULD be assembled from different departments wherever the sign-up list allows — this is the whole point of the exercise. |
| E-3 | Default team size is 3. Fewer sign-ups than one team's worth MUST be refused with the count. |
| E-4 | The remainder MUST be spread across the smallest teams rather than left as one short team. |
| E-5 | Team names are generated ("Grumpy capybaras"): two shuffled 48-word lists walked by coprime strides, so 2304 names come out before a repeat. |
| E-6 | Building teams MUST be atomic, and MUST tolerate 100 teams — it deletes the existing teams first, so a timeout halfway leaves a round with none. |
| E-7 | HR MUST be able to afterwards: move someone between teams, take them off, add a latecomer, rename a team, create a team (which gets its board at once), delete a team. |
| E-8 | A team with surviving proofs MUST NOT be deletable — it would erase them with the board. |
| E-9 | A person belongs to exactly one team per round. |
| E-10 | A roster change MUST NOT rebuild the board or change the team's score. Personal points follow the current team, so cells closed in a previous team stop counting towards the person. |

### F. Board generation

| | Requirement |
|---|---|
| F-1 | The board is always 5×5. A bigger board does not make the game longer — a line is always one side — it only offers more ways to finish one. |
| F-2 | Every board in a round MUST hold the same difficulty mix, so that two boards are worth the same. With no pinned centre that is 8 easy / 10 medium / 7 hard. |
| F-3 | Every one of the 12 lines MUST contain at least one hard task and total at least 9 difficulty points. Without this constraint a board almost always contains a line of five easy cells and the game is over on the first evening. |
| F-4 | The generator MUST reshuffle until the constraint holds (up to 4000 attempts) and MUST report the teams whose boards it could not balance rather than failing silently. |
| F-5 | Every board MUST carry at least 3 retro cells, each swapped in for a task of the **same difficulty**, so a day-one head start costs nothing. |
| F-6 | A round MAY pin one task to the centre cell, the same for every team. |
| F-7 | Office-only tasks MUST be excluded from a board whose team is entirely remote. |
| F-8 | Generation is seeded, so a board can be reproduced. |

### G. Playing a board

| | Requirement |
|---|---|
| G-1 | A cell starts face down showing its difficulty only. **The text of a hidden task MUST NOT reach the client** — it would be in the page source. |
| G-2 | A face-down retro cell MUST carry a visible "start here" badge. A hint nobody can see is not a hint. This badge and the difficulty stars are the only two things a hidden cell gives away. |
| G-3 | Any team member may reveal a cell; each person may reveal at most `revealsPerDay` a day on their team's board. This is the pace control for the whole game: a trio uncovers three new tasks a day at the default of one each. Currently set to 3. |
| G-4 | A revealed task MUST be visible to the whole team, and anyone in the team may be the one to close it. |
| G-5 | Revealing MUST be visible as a flip animation, and a cell a teammate turned over MUST flip on the next refresh rather than appear already open. |
| G-6 | Closing a cell MUST require a photo or screenshot and MAY carry a caption. |
| G-7 | A cell MUST NOT be closed before it is revealed, twice, by somebody outside the team, or while the round is not ACTIVE. |
| G-8 | An optional per-team daily closing limit exists and is honoured. Off by default: revealing already paces the game. |
| G-9 | Closing MUST be immediate — no moderation queue. Pre-moderation across 300 people becomes a queue on day one. |
| G-10 | Completing a line MUST be celebrated full-screen with the points it earned, and the proof that did it MUST carry a banner in the company feed. A closed board says FULL BOARD instead. |
| G-11 | What a proof finished off MUST be recorded on the proof at the moment it lands, and MUST stay true in the feed even if a later revoke breaks the line again. It is history, not a derived value. |

### H. Feed and reactions

| | Requirement |
|---|---|
| H-1 | The feed MUST be the home page. The point is that everyone sees what everyone else got up to; the team board is one tap away. |
| H-2 | The feed is a single column, newest first, 40 at a time, company-wide. |
| H-3 | A player MAY follow teams and people, which narrows the feed to them. |
| H-4 | Anyone MAY post a photo belonging to no task, up to a daily cap (2 by default), from the sign-up phase onwards. |
| H-5 | A free post MUST appear under a task name **drawn at random by the server from the live pool**. This does two jobs: the feed is alive before any cell is closed, and nobody can read a team's board off its posts, because a photo tagged with a task no longer means that task was done. |
| H-6 | Letting people pick that label MUST NOT be offered — it would hand every player the full task list, the one thing the face-down board exists to withhold. |
| H-7 | A free post MUST score nothing, and MUST NOT display a countdown to the reaction bonus: a decoy must not be given away by a promise it cannot keep. |
| H-8 | HR MAY switch free posts off for a round; the check MUST be server-side, not only in the UI. |
| H-9 | One reaction per person per proof, enforced by the database. Tapping the same emoji clears it; a different one swaps it. |
| H-10 | A reaction MUST survive the page: the optimistic state has to be replaced by real state, or the button springs back. |
| H-11 | Until a photo exists, a proof is drawn as a scene assembled from simple shapes, derived from a hash of its id — stable between visits, nothing fetched at runtime. |

### I. Moderation

| | Requirement |
|---|---|
| I-1 | HR MUST be able to remove a proof with a reason. The cell reopens if nothing else closed it, and the team's score is recomputed. |
| I-2 | Removing a proof MUST delete the stored image. A record going away is not enough while the file is still served from its URL. |
| I-3 | A removed proof MUST leave the feed, the board and the leaderboard consistently. |
| I-4 | "Disable the author" MUST sit next to Remove, behind a confirmation, for outright vandalism. |
| I-5 | The card shown to HR MUST show the picture, the task and the reaction count — enough to judge without opening anything. |

### J. Leaderboards

| | Requirement |
|---|---|
| J-1 | A team leaderboard ordered by points, then by who completed a line first, then by name. |
| J-2 | A personal leaderboard, so an active player still scores in a team that went quiet. |
| J-3 | A strip above the feed MUST show your own team's score and place. |
| J-4 | Standings MUST remain visible after the round finishes. |

The numbers themselves: [scoring.md](scoring.md).

### K. Your own round (`/me`)

| | Requirement |
|---|---|
| K-1 | Not an account page. It counts what you did, and then reads the feed back at you: who reacts to your photos most and what they usually press, whose posts you turn up for, how many people and how many departments your photos reached. |
| K-2 | Every photo you posted this round MUST be downloadable, individually and as one zip. They are your pictures. |
| K-3 | It MUST show only your own data — the queries are pinned to the session, not to a parameter. |

### L. HR analytics

One page, answering the three questions that come up mid-round.

| | Requirement |
|---|---|
| L-1 | Is anyone running away with it: leader against median. |
| L-2 | Is anyone being left out: teams that closed nothing, people nobody has heard from, how many posted or reacted at all. |
| L-3 | Is it doing its job: the share of reactions that crossed a department boundary, and the busiest department pairs. |
| L-4 | Posts and reactions per day. |
| L-5 | Which tasks everybody closes and which sit untouched, so a dud can be edited mid-round rather than after it. |

### M. Email

| | Requirement |
|---|---|
| M-1 | Sign-in link. MUST carry the time it was requested — people ask twice when mail is slow, and otherwise click the one nearest the top of the inbox and are told it expired. |
| M-2 | Sign-up invitation for a round. |
| M-3 | A progress digest exists as a function; nothing schedules it yet. |
| M-4 | With no SMTP host configured, mail MUST be printed to the console instead, and the link shown on the sign-in page — development only, and only when not in production. |

---

## 7. Non-functional requirements

### N-1 Scale
300 employees, up to ~100 teams, two weeks. Everything is sized from that: team building runs in
one transaction with a 120-second budget, and the board insert is one statement per team rather
than 25.

### N-2 Resources
Measured, not estimated: the whole stack runs in about 1 GB of RAM and a few GB of disk. A proof
is ~240 KB after conversion; 300 people × 20 photos ≈ 1.5 GB including the database. One small VM.

### N-3 Mobile first
The app is used on a phone, in the evening, outside the office network. No VPN, no install. The
layout is a single column; the board fits a phone screen without horizontal scrolling.

### N-4 Images
Uploads are capped at 12 MB, converted to webp at most 1080px on the long side, and stripped of
metadata — **which takes the capture coordinates with it**. The feed card is 540px wide, so
anything larger is bandwidth for nothing: a real upload was 752 KB at 1600px against 238 KB at
1080. The limit must stay consistent across the action, the framework body limit and the proxy.

### N-5 Privacy
- Photos of employees MUST be served through the app to signed-in users only, never straight from
  a bucket.
- Where the photos are stored is a company decision, not a deployment detail. They currently do
  not leave the company perimeter.
- Opting out MUST need no explanation.
- The task card MUST remind players not to post code, client data, or anyone who has not agreed
  to be in the shot.
- Nothing here is a performance measure (§1.2).

### N-6 Security
- Corporate domain allowlist, uniform answers on the login page, rate-limited links, single-use
  tokens, HMAC-hashed tokens at rest, HTTPS with HSTS and a strict set of headers.
- Every server action MUST re-check the role. Hiding a control is not authorisation.
- A file key from a URL MUST be validated against a fixed shape and resolved inside the storage
  root, both drivers.
- An upload that is then rejected MUST have its bytes deleted, or the volume fills with files no
  row points at.

### N-7 Availability
Best effort. A two-week game; a restart in the middle is acceptable, data loss is not. The
database volume is the thing to back up.

### N-8 Language
The interface and the task pool are in English, as the company's working language.

### N-9 Browsers
Current mobile Safari and Chrome. No IE, no AMP, no native app.

---

## 8. Data model

Entities and the one thing each exists for.

| | |
|---|---|
| **User** | An employee. Carries role, active flag, department, office/remote, and the teams and people they follow. |
| **LoginToken** | A single-use sign-in link, hashed. |
| **Session** | A signed-in browser, hashed. |
| **Task** | A pool entry. |
| **Round** | One run: status, pacing, scoring values, the first-line claim. |
| **RoundSignup** | Who opted in. |
| **Team** | A team with its denormalized score, so the leaderboard stays one query. |
| **TeamMember** | Membership. One per person per round. |
| **BoardCell** | A task at a position on a board, with who revealed it and who closed it. |
| **Proof** | A post. Belongs to the round always, to a cell and team only when it closes one — a free post can exist before teams do. Records what it finished off and whether its bonus has been paid. |
| **Reaction** | One per person per proof, enforced by a unique constraint rather than by a delete-then-insert two quick taps can both slip past. |

Scores are **stored, not derived on read**, and recomputed from scratch after anything that
touches them. That is what makes D-3 a requirement rather than a nicety.

---

## 9. Configuration

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | Postgres. |
| `APP_URL` | The address people actually reach the app on. Sign-in links, the post-login redirect and the link preview are built from it; behind a proxy the app cannot work it out for itself. |
| `AUTH_SECRET` | Signs and hashes tokens. Rotating it invalidates every session and link. |
| `ALLOWED_EMAIL_DOMAINS` | Who may sign in at all. |
| `HR_EMAILS` | Who gets the HR role when seeded. Afterwards the role lives in the database. |
| `SESSION_DAYS` | Session lifetime, 90 by default. |
| `SMTP_*` | Corporate mail. Without it nobody can sign in in production. |
| `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR`, `S3_*` | A folder on disk, or any S3-compatible bucket. |
| `ROUND_TIMEZONE` | The zone the daily limits are measured in. Midnight here is when a new reveal is available. |
| `TASKS_FILE` | Where the seed reads the pool from. |
| `DEBUG_OPEN_HR` | MUST be false in production (A-11). |

Deployment: app, Postgres and a reverse proxy that obtains its own certificate, on one host.
See [deploy/README.md](deploy/README.md).

---

## 10. Decisions worth not re-litigating

Each of these was tried the other way or costed out, and the reason is the requirement.

| | |
|---|---|
| Optimistic moderation (G-9) | A queue across 300 people is a queue on day one. |
| Face-down cells (G-1) | The board hands itself over slowly; this is the pacing, and it is why task text must never reach the client. |
| Retro cells (F-5, G-2) | A board of "go and do this" scores nothing until somebody organises something, and a game with no day one tends not to have a day two. |
| Random labels on free posts (H-5) | Both the warm feed and the camouflage come from the same mechanism. |
| Two-step sign-in (A-6) | Found in an access log, not in a review. Collapsing it back into a GET brings back a failure that looks like a mail problem. |
| Few HR controls (D-6) | Every switch has to be explicable to whoever runs the round at 9pm. |
| No text proofs (C-2) | Prose in a feed of photographs reads as a broken image. |
| 5×5 (F-1) | Board size changes the number of ways to finish a line, not the length of the game. |

---

## 11. Not built

- A scheduler for the digest email — the function exists, nothing calls it.
- A results screen for a finished round.
- A player renaming their own team (HR can).
- Reposting a photo for a cell a teammate already closed.
- Video proofs.
- Automated tests.
- Infinite scroll — the latest 40 proofs are served.
