---
name: run-platform
description: Build, run, typecheck, test, and drive platform/ (the Dokploy fork control-plane UI). Use when asked to start platform, run its dev server, run its tests, take a screenshot of its UI (register/login/dashboard), or verify a UI change actually renders.
---

`platform/` is a pnpm-workspace Next.js app (control-plane UI at `apps/dokploy`, plus
`apps/api`/`apps/schedules`/`apps/monitoring` and shared `packages/server`). It's driven via a
Playwright REPL at `.claude/skills/run-platform/driver.mjs` — no `chromium-cli` binary was
available in this environment, so the driver talks to `playwright` directly. All paths below are
relative to `platform/`.

**On this side-by-side checkout, `:3000` is usually the sibling `site/` (Nuxt) dev server, not
platform.** Both default to `PORT=3000`, so don't trust a bare `curl :3000` to tell you whether
platform is up — a `200` there is very likely the marketing site's SPA (its 404 page shows a Nuxt
logo and 404s on `/register`). The reliable tell for *platform* is `/register` (or `/`, which a
provisioned instance `307`-redirects to `/welcome`). Simplest is to just run platform on its own
port: `PORT=3001 pnpm run dokploy:dev` and drive it with `BASE_URL=http://localhost:3001`.

**`dokploy:setup` is already done on this machine — do not re-run it.** The stack containers
(`dokploy-postgres`, `dokploy-redis`, `dokploy-traefik`) are long-running under the **`default`**
Docker context (`docker ps` shows them; `docker ps` under `desktop-linux` does *not*). `dokploy:setup`
runs `docker swarm init` and publishes host ports `80`/`81`/`443`/`5432`/`6379` — real, shared
Docker state, already provisioned here. If the app 500s with `relation "member" does not exist`, the
DB schema is just un-migrated: run `pnpm run migration:run` (below), **not** the full setup.

## Prerequisites

```bash
# Node 24.4.0 is required (packages/drizzle-kit are pinned to it in engines).
source ~/.nvm/nvm.sh && nvm install 24.4.0 && nvm use 24.4.0
corepack enable && corepack prepare pnpm@10.22.0 --activate

# The dokploy stack here runs under the `default` Docker context (`unix:///var/run/docker.sock`),
# which is readable in this environment — `docker ps` and the app's `localhost:5432` DB both work
# without any override. Only set DOCKER_HOST if you actually need to target a different daemon
# (e.g. Docker Desktop's socket at ~/.docker/desktop/docker.sock) for a from-scratch `dokploy:setup`.
export DOCKER_HOST="unix:///var/run/docker.sock"   # matches where the running stack lives

# Driver dependencies (Playwright), installed once inside the skill dir:
cd .claude/skills/run-platform && npm install && npx playwright install chromium && cd -
```

## Setup / Build

On this machine deps are already installed, `apps/dokploy/.env` exists, `packages/server` is already
switched to `src/` (its `package.json` `main` is `./src/index.ts`), and the stack is provisioned — so
the only setup step that was actually needed this session was running migrations against the empty DB:

```bash
cd apps/dokploy && pnpm run migration:run && cd -   # applies the Drizzle schema to dokploy-postgres
```

Full from-scratch setup, only if starting on a truly clean box (see the swarm/ports warning above):

```bash
pnpm install
cp apps/dokploy/.env.example apps/dokploy/.env
pnpm run dokploy:setup     # docker swarm init + deploys dokploy-postgres/redis/traefik + runs migrations
pnpm run server:script     # switches packages/server to import from src/ for dev
```

Verified working this session (under Node 24.4.0):

```bash
pnpm --filter dokploy run typecheck   # tsc --noEmit — clean
```

## Run (agent path)

Start the dev server on a free port (`:3000` is taken by the sibling `site/` here — see top warning),
wait for it, then drive it with a matching `BASE_URL`. Launch it in the background:

```bash
PORT=3001 DOCKER_HOST=unix:///var/run/docker.sock pnpm run dokploy:dev   # under Node 24.4.0
```

Wait until it answers (first `/` compile takes a few seconds; a provisioned instance returns `307`):

```bash
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001)
  [ "$code" != "000" ] && echo "up → $code" && break; sleep 2
done
```

Then pipe a command script into the driver — **no tmux in this environment**, so use a heredoc rather
than `send-keys`/`capture-pane`; each line runs against a single shared browser/page instance kept
alive for the whole piped script:

```bash
BASE_URL=http://localhost:3001 node .claude/skills/run-platform/driver.mjs <<'EOF'
launch
nav /
url
nav /register
wait-for input[name="email"]
ss 02-register
console --errors
quit
EOF
```

This is a real, verified transcript from this session (against the migrated instance on `:3001`):

```
platform driver — "help" for commands, "launch" to start, then "nav /register"
driver> launched.
driver> nav http://localhost:3001/ → 200
driver> http://localhost:3001/welcome
driver> nav http://localhost:3001/register → 200
driver> found: input[name="email"]
driver> screenshot: /tmp/shots/02-register.png
driver> [0] Refused to execute script from '.../_clientMiddlewareManifest.js' because its MIME type ...
```

The `/register` screen renders the Dokploy "Setup the server" form (First/Last name, Email, Password,
Confirm, Register). The `_clientMiddlewareManifest.js` MIME console error is a benign Next.js
dev-mode artifact — not something to chase. Screenshots land in `/tmp/shots/` (override with
`SCREENSHOT_DIR`). `BASE_URL` defaults to `http://localhost:3000`, so set it explicitly to your port.

If you need iterative back-and-forth (not just a fixed script), install tmux and wrap the same
launch command with `send-keys`/`capture-pane`, polling for `driver>` between commands — the
driver itself doesn't care which way it's fed lines.

### Commands

| command | what it does |
|---|---|
| `launch` | start headless Chromium |
| `nav <path-or-url>` | navigate (bare path is resolved against `BASE_URL`) |
| `ss [name]` | full-page screenshot → `/tmp/shots/<name>.png` |
| `screenshot-element <sel> [name]` | screenshot one element |
| `click <sel>` | click, via Playwright's real click pipeline |
| `fill <sel> <value>` | fill a (React-)controlled input — goes through the real input pipeline, unlike `eval el.value=` |
| `type <text>` / `press <key>` | keyboard input |
| `wait-for <sel>` or `wait-for text=<text>` | wait up to 15s |
| `eval <js>` | evaluate in page, prints JSON |
| `text [sel]` | print innerText |
| `url` | print current URL |
| `console --errors` | list captured console/page errors |
| `quit` | close browser |

## Run (human path)

```bash
PORT=3001 pnpm run dokploy:dev   # → http://localhost:3001, Ctrl-C to stop (avoid :3000, see below)
```

A provisioned-but-unregistered instance `307`-redirects `/` → `/welcome` (a ComputeBay activation
screen); `/register` reaches the "Setup the server" form directly to create the first admin account.

## Test

```bash
pnpm --filter dokploy run test   # vitest
```

Verified this session: **526 passed, 3 failed, 1 skipped (of 530)**, all 3 failures isolated to
`__test__/deploy/application.real.test.ts` (the other 53 test files pass clean). That suite does
*real* `git clone` against GitHub and *real* nixpacks/Docker builds — it needs outbound network and a
working build toolchain against a writable Docker socket. The exact failure is environment-dependent
(this session the nixpacks build step failed; an earlier run hit `connect EACCES /var/run/docker.sock`
instead). Don't treat those 3 as a regression signal unless your environment can actually run real
clones and image builds. Run with `DOCKER_HOST=unix:///var/run/docker.sock` so the suite targets the
`default`-context daemon where the stack lives.

## Gotchas

- **`:3000` is the sibling `site/` marketing app, not platform.** Both dev servers default to
  `PORT=3000` on this side-by-side checkout. A `200` on `:3000` with a Nuxt-logo 404 page (and
  `/register` 404ing) is `site/`. Run platform on `PORT=3001` and drive with a matching `BASE_URL`.
- **The stack is on the `default` Docker context, not `desktop-linux`.** `docker ps` under
  `desktop-linux` shows nothing; the running `dokploy-postgres`/`redis`/`traefik` (up for days)
  appear under `default` (`/var/run/docker.sock`). Don't conclude the stack is down from an empty
  `desktop-linux` listing.
- **`relation "member" does not exist` (app 500s on `/`) = un-migrated DB, not broken setup.** The
  Postgres container can be up with an empty schema. Fix is `cd apps/dokploy && pnpm run
  migration:run` — do *not* re-run `dokploy:setup`.
- **`dokploy:setup` is already applied here — and is not scoped to this repo.** The swarm + stack
  containers are already up (see above), so you should not need it. If you ever do run it fresh, it
  runs `docker swarm init` on the real daemon and binds host ports `80/81/443/5432/6379`. Reversible
  (`docker swarm leave --force`) but disruptive to whatever else uses those ports — confirm with
  whoever owns the machine first.
- **No `tmux` in this environment.** The heredoc-into-stdin pattern above is the verified path;
  the driver's readline loop serializes commands via an internal promise queue specifically so a
  fast-piped heredoc doesn't race ahead of `launch`/`nav` before they resolve.
- **`fill` vs `eval el.value = …`** — the driver's `fill` command uses Playwright's `page.fill()`,
  which fires real input events; a raw DOM `eval` set won't trigger React's controlled-input
  `onChange` and the app won't see the typed value.
- **Node version matters for build tooling, not for the driver.** The driver itself runs fine
  under whatever Node runs `chromium-cli`-equivalent Playwright calls (verified under Node 22); only
  `pnpm install`/`typecheck`/`dokploy:setup` need the pinned Node 24.4.0 from `engines`.

## Troubleshooting

- **`__test__/deploy/application.real.test.ts` failures** (3 of 530 this session): this is the only
  suite that does real git clones + real image builds. It fails whenever the environment can't do
  that — a build-toolchain/network failure (this session) or `connect EACCES /var/run/docker.sock` if
  the user can't write the socket (an earlier session). Not a bug to chase; the other 526 tests
  passing is the signal that matters.
- **App 500s with `relation "member" does not exist`**: the DB schema isn't migrated. `cd
  apps/dokploy && pnpm run migration:run` (needs Node 24.4.0), then reload. Not a setup failure.
- **Driver commands print nothing / hang until timeout when piped via heredoc**: make sure you're
  on a driver.mjs version whose `rl.on('close', ...)` awaits the internal command queue before
  quitting — otherwise EOF-on-heredoc fires `close` (and exits) before `launch`/`nav` finish.
