# Deploying to your own host

One machine runs everything: the app, Postgres, and Caddy, which obtains and renews
the HTTPS certificate by itself. No cloud account involved.

## What the host needs

- Docker with the compose plugin.
- A DNS name pointing at the host, and **ports 80 and 443 reachable from the internet**.
  Caddy proves control of the domain over port 80 to get the certificate, so an
  office-only or VPN-only host will not work without a DNS-01 setup.
- Outbound SMTP. Without it nobody can sign in, because the sign-in link never arrives.
- Roughly 2 GB of RAM and 10 GB of disk. Photos are stored on a Docker volume;
  a 150-person round produces something like 1–2 GB.

## Inside an unprivileged LXC container

Running the stack in a Proxmox LXC works, but **the default builder does not**. With
Docker 29 the build dies partway through `npm ci` with:

```
npm error Exit handler never called!
```

and the daemon log shows the real cause — BuildKit cannot see the cgroup of its own
build container:

```
failed to read oom_kill event ... /sys/fs/cgroup/system.slice:docker:<id>/memory.events: no such file or directory
```

It is not memory and not npm: the same commands run by hand in the same image finish in
seconds. Build through a BuildKit that runs in its own container instead, once per host:

```bash
docker buildx create --name lxcbuilder --driver docker-container --bootstrap
docker buildx use lxcbuilder
```

After that `docker compose build` works normally. The container also needs
`features: nesting=1,keyctl=1` in its Proxmox config, as any Docker-in-LXC does.

## First run

```bash
git clone <this repo> bingo && cd bingo/deploy
cp .env.example .env
$EDITOR .env                       # DOMAIN, APP_URL, AUTH_SECRET, POSTGRES_PASSWORD, SMTP_*
docker compose up -d --build       # the migrate service runs first, then the app starts
docker compose exec app node prisma/seed.mjs  # 56 tasks + the HR accounts
```

Then open `https://your-domain`, sign in with an address from `HR_EMAILS`, import the
employee list on the Employees page, and open sign-ups from the HR area.

## Updating

```bash
git pull && docker compose up -d --build
```

The `migrate` service runs to completion before the app starts, so a deploy never needs a separate step.

## Backups

Everything that matters lives in two volumes: `pgdata` and `uploads`.

```bash
docker compose exec db pg_dump -U bingo bingo | gzip > bingo-$(date +%F).sql.gz
docker run --rm -v deploy_uploads:/u -v "$PWD":/out alpine \
  tar czf /out/uploads-$(date +%F).tar.gz -C /u .
```

## Before you let real people in

- `DEBUG_OPEN_HR` must be `false`, otherwise everyone who signs in gets the HR area.
- `AUTH_SECRET` must be a fresh random value, not the one from the example file.
- Decide who owns the photos on this host and for how long they are kept.
