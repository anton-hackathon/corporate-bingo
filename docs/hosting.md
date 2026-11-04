# Where to host it

Checked October 2026. Free-tier terms change often — verify on the provider's own pricing and
terms pages before committing.

## The catch with "free"

Most developer free tiers are written for personal projects. **Vercel's Hobby plan is explicitly
non-commercial**, and the definition is broad enough to cover a tool written by paid employees even
if only staff use it. An internal company tool on Hobby is a terms violation waiting to be noticed.
Render, Fly.io, Koyeb and Cloudflare do not state the commercial question as plainly, which means
it has to be read in their terms rather than assumed.

Second consideration, raised on the call with Anna: the app stores **photographs of employees**.
Putting those on a third-party free tier outside the company perimeter is a decision for someone
other than the person deploying it.

## Options, best first

### 1. Inside the company — recommended
EffectiveSoft already runs infrastructure, and Misha was named on the call for exactly this reason.
One small VM with Docker runs the whole stack: the Next.js app, Postgres, and MinIO for photos.
Corporate SMTP is already available for the magic links.

- No vendor terms to argue about, no commercial-use question.
- Employee photos never leave the perimeter.
- Needs a hostname reachable from phones outside the office, which is the one thing to check:
  people will use this from the sofa in the evening, not over VPN.

### 2. Oracle Cloud Always Free — the real free option
The Always Free tier gives 2 ARM OCPUs and 12 GB of RAM (halved from 4/24 in 2026, enforced from
18 August), 200 GB of block storage and 10 TB of monthly egress. That comfortably runs app,
database and object storage on a single machine, and it does not expire.

- Genuinely free, indefinitely.
- Verify the commercial-use terms: none of the sources state them clearly.
- Oracle has reclaimed idle Always Free resources in the past, and has just cut the ARM allowance.
  Treat it as free, not as guaranteed.

### 3. Vercel Pro plus managed pieces — the lazy option
About $20 a month: Vercel Pro for the app, Neon free for Postgres (1 GB per project, scales to
zero), Cloudflare R2 free for photos, Resend free for mail.

- Zero operations work, deploys from git, scales without thought.
- For a two-week December round, cancel afterwards and the whole thing costs one month.
- Paid, so it needs a budget line however small.

### 4. Render free — demo only
Free web services sleep after 15 minutes idle and take roughly a minute to wake. Fine for showing
the prototype to HR, wrong for 150 people opening it on their phones.

## Not recommended

- **Supabase free** for the database: projects pause after a week of inactivity. The game runs in
  bursts with long gaps between rounds, which is exactly the pattern that trips this.
- **Fly.io** and **Koyeb**: free plans for new accounts are gone or effectively gone.

## What to decide

1. Do employee photos leave the company perimeter? That answer picks option 1 or the rest.
2. Is there a budget line, even $20? If yes, option 3 removes all operational work.
3. If neither, option 2 and someone to own the VM.
