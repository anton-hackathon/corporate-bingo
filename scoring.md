# Corporate Bingo — scoring

The five places points come from, what they are worth, and what the simulation says about
those numbers. Requirements are in [spec.md](spec.md); the player-facing version is
[docs/rules.html](docs/rules.html).

Two things decide how this document reads:

1. **Scores are stored, not computed on read.** A team row carries its total, and anything that
   touches it recomputes that team from scratch. So changing what a line is worth has to
   recompute every team in the round, and it does.
2. **The numbers below are the defaults.** HR can move the three bonuses and the reaction bonus
   in the round panel. The live values are whatever that panel holds.

---

## 1. Where points come from

| | Earned by | Default | Who gets it |
|---|---|---|---|
| **Cell** | Closing a cell | its difficulty: **1 / 2 / 3** | the team, and the person who closed it |
| **Line** | Five closed cells in a row, column or diagonal | **5** per line | the team |
| **First line** | Being the first team in the round to complete any line | **10**, once in the round | one team |
| **Full board** | All 25 cells closed | **25** | the team |
| **Reaction bonus** | A proof reaching the threshold of reactions from outside its own team | **+2** at **10** reactions, once per proof | the team, and the proof's author |

A team's total is the sum of all five. Nothing else scores: not revealing a cell, not posting,
not reacting, not captions.

### 1.1 What a board is worth

Every board in a round holds the same mix — 8 easy, 10 medium, 7 hard — so that no team is
dealt an easier game.

```
cells      8×1 + 10×2 + 7×3            =  49
lines      12 lines × 5                =  60
full board                             =  25
                                        ────
a completely closed board              = 134
first line of the round                = +10
```

**Every full board is worth exactly the same number.** Two teams that close everything arrive at
the same total, and only the reaction bonus can separate them. That is a design consequence of
the identical mix, not an accident — see §5.2.

### 1.2 Worked example

A team closes 14 cells (5 easy, 6 medium, 3 hard), completing two lines, one of them the first in
the round, and one of its photos collects 11 reactions from other teams.

```
cells          5×1 + 6×2 + 3×3   = 26
lines          2 × 5             = 10
first line                       = 10
reaction bonus 1 × 2             =  2
                                  ───
                                   48
```

---

## 2. The rules behind the numbers

### 2.1 Cells
A cell pays its difficulty once, to the team and to whoever closed it. Difficulty is set by HR on
the task and is the same for every team that gets it.

### 2.2 Lines
A board has 12 lines: 5 rows, 5 columns, 2 diagonals. Every completed line pays, and lines
overlap — one cell can belong to three of them, so a single close can pay three lines at once.

Generation guarantees every line holds at least one hard task and totals at least 9 difficulty
points, so there is no cheap line of five easy cells to find.

### 2.3 First line of the round
Claimed by the first team to complete any line, atomically — two teams finishing at the same
second cannot both hold it.

**It is released if the holder loses its line.** If a revoked proof breaks the line of the team
holding the claim, the claim goes back and the next team to complete one takes it. Without that
it parks on a team that no longer has a line and nobody can ever win it.

### 2.4 Full board
Pays once, on the 25th cell, and goes away again if a proof is revoked and the cell reopens.

### 2.5 Reaction bonus
A proof pays the bonus when it reaches the threshold, with three conditions:

- **Only reactions from outside the proof's own team count.** Otherwise a trio likes its own way
  to the points.
- **It pays once.** Further reactions change nothing, and the payment survives them — it is
  stamped on the proof.
- **A free post never pays.** It has no team to pay, and posting cat pictures would otherwise
  outscore the game. A free post still collects reactions; they just buy nothing.

One reaction per person per proof, enforced by the database. Tapping the same emoji again clears
it; a different one swaps it. So the threshold means the same thing whatever emoji people press.

The countdown to the bonus is deliberately **not** shown on a post: a free post is a decoy, and a
decoy must not be given away by a promise it cannot keep.

### 2.6 Revoking a proof
HR removing a proof reopens the cell if nothing else closed it, and recomputes the team. Cell
points, line points, the full-board bonus and the first-line claim all come back off. The paid
reaction bonus goes with the proof.

What the proof *announced* does not come back off: the BINGO banner is recorded on the proof at
the moment it lands and stays true in the feed as history.

---

## 3. Personal points

A separate leaderboard, so an active player still scores in a team that went quiet.

```
personal = Σ difficulty of the cells you closed yourself
         + (your proofs that earned the reaction bonus) × the bonus
```

Three things follow, and all three are intentional:

- **Line, first-line and full-board bonuses are team points only.** They are not shared out.
- Points follow **the cell you closed**, not the task you did. Whoever posts the proof scores.
- Personal points are counted **against your current team**. If HR moves you, cells you closed in
  the old team stop counting towards you. Team scores are unaffected by roster changes.

---

## 4. Ties

The team leaderboard sorts by: **points**, then **who completed a line first**, then **name**.

The simulation flags this as the wrong second key, and it has not been changed: it is fairer to
rank by who *reached their final score* first — "you both have 59, but you got there on Tuesday
and they got there on Thursday" — than by who completed the first line, which may have happened
long before either total was set.

**Whatever the rule is, announce it before the round.** A tie-break introduced once prizes are in
sight reads as moving the goalposts.

---

## 5. What the simulation found

Two thousand simulated rounds of thirty teams. Full argument, with charts, in
[docs/balance.html](docs/balance.html). Summarised here because it is about these numbers.

### 5.1 The winner pulls away, and the rules are why

- **80% of the work pays 43% of the points.** A team closing 20 of 25 cells has less than half of
  what a team closing all 25 gets.
- The winner takes **more than half their points from bonuses the average team never sees**: 42%
  from lines, 12% from the full board. The average team takes **74% from the tasks themselves**.
- The gap between first place and mid-table comes out at **3.2×**.

The cause is the lines. There are twelve and they overlap, so nothing pays until about the tenth
cell, and then the twentieth cell can finish three lines at once. The whole payoff collects in the
last five cells and goes only to the teams that get there.

### 5.2 Every full board is worth the same

The identical 8/10/7 mix is deliberate — it is what makes two boards comparable — but it means a
closed board is worth exactly 134 to everybody. In the "tasks turned out easy and people got into
it" scenario, **11 teams out of 30 close everything**, hit the ceiling together, and nothing but
reactions separates them. Ties for first place happen in **15%** of those rounds.

### 5.3 What was proposed, and what is actually in the code

**None of this is implemented.** The code runs the first column.

| | Now (live) | Proposed | Why |
|---|---|---|---|
| Task worth | 1 / 2 / 3 | **1 / 3 / 6** | Three hard tasks (18) beat nine easy ones (9). The winner is whoever took on the difficult work, not whoever tapped most often. |
| Line | 5 flat | **4, decaying a third each time** | Kills the snowball at the end. |
| Full board | 25 | **12** | Still a real prize, stops deciding the round on its own. |
| Reaction bonus | +2 at 10 | **1 point per 4 reactions, capped at 5 per photo** | Turns a step into a slope: 9 reactions currently pay nothing and 10 pay the lot. The cap stops one viral photo deciding the round. A funny photo ends up worth about an average task — which is what the whole thing was for. |

Modelled effect: leader-to-median **3.2× → 2.0×**, runaway rounds **36% → 6%**, the average team
**42 → 59 points**, teams still in it on day seven **2.5 → 3.2**. The race stays just as live —
the leader still changes about five times a round. With the fractional reaction bonus, ties for
first drop from **15% to 7%**.

A per-day cell limit was tested separately and is **not** the lever: the gap only fell from 36% to
31%, and the average result got worse.

### 5.4 The part no scoring table can fix

The ceiling only gets crowded when the "hard" tasks are not actually hard. If a third of the
company closes an entire board, seven hard cells turned out no harder than the medium ones.
**Task selection decides more here than any points setting.**

And at the other end: if engagement is low, the gap stays large under any rules, because the
winner is then whichever team happened to contain one enthusiast. That is fixed with reminders —
a daily email, a photo of the day — not with arithmetic.

---

## 6. Changing the numbers

HR can move, in the round panel: what a completed line pays, what the first line of the round
pays, what a full board pays, how many reactions a photo needs, and what that bonus pays.

| | |
|---|---|
| **A change applies to the whole round, retroactively.** | Scores are recomputed for every team the moment it is saved, so totals already on the leaderboard change. |
| **Task difficulty is not in that panel.** | It lives on the task. Changing it changes what that cell is worth on every board that holds it, from the next recompute onwards. |
| **Mid-round changes are visible.** | Teams see their totals move. If the numbers need changing, do it between rounds, or tell everyone. |
| **The difficulty scale itself is fixed in code.** | 1 / 2 / 3 is the stored value on a task; adopting 1 / 3 / 6 (§5.3) is a data change across the pool, not a setting. |

Settings the engine honours but no screen offers — the per-team daily closing limit, client-facing
tasks, the pinned centre cell — are changed in the database deliberately.

---

## 7. To agree before the round

1. **The tie-break**, announced in advance (§4).
2. **Whether to adopt the proposed values** (§5.3), which is a decision about whether the game
   rewards difficulty or volume.
3. **Whether the hard tasks are actually hard** (§5.4) — the one that decides the rest.
