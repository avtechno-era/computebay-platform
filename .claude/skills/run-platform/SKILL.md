---
name: run-platform
description: Build, run, typecheck, test, and drive platform/ (the Dokploy fork control-plane UI). Use when asked to start platform, run its dev server, run its tests, take a screenshot of its UI (register/login/dashboard), or verify a UI change actually renders.
---

`platform/` is a pnpm-workspace Next.js app (control-plane UI at `apps/dokploy`, plus
`apps/api`/`apps/schedules`/`apps/monitoring` and shared `packages/server`). It's driven via a
Playwright REPL at `.claude/skills/run-platform/driver.mjs` — no `chromium-cli` binary was
available in this environment, so the driver talks to `playwright` directly. All paths below are
relative to `platform/`.

**Before doing a fresh `dokploy:setup`, check if the app is already running** (`curl -s -o
/dev/null -w '%{http_code}' http://localhost:3000` — a `307` means it's already up). `dokploy:setup`
runs `docker swarm init` on the real Docker daemon and publishes host ports `80`/`81`/`443`/`5432`/`6379`
— it mutates real, shared Docker state, not something scoped to a container. If an instance is
already live, drive that one instead of tearing it down.

## Prerequisites

```bash
# Node 24.4.0 is required (packages/drizzle-kit are pinned to it in engines).
source ~/.nvm/nvm.sh && nvm install 24.4.0 && nvm use 24.4.0
corepack enable && corepack prepare pnpm@10.22.0 --activate

# If Docker is Docker Desktop (check: `docker context ls` shows `desktop-linux`), the setup
# script's dockerode calls need this or they'll hit the wrong socket:
export DOCKER_HOST="unix://$HOME/.docker/desktop/docker.sock"

# Driver dependencies (Playwright), installed once inside the skill dir:
cd .claude/skills/run-platform && npm install && npx playwright install chromium && cd -
```

## Setup / Build

```bash
pnpm install
cp apps/dokploy/.env.example apps/dokploy/.env
pnpm run dokploy:setup     # docker swarm init + deploys dokploy-postgres/redis/traefik — see warning above
pnpm run server:script     # switches packages/server to import from src/ for dev
```

Verified working this session (under Node 24.4.0):

```bash
pnpm --filter dokploy run typecheck   # tsc --noEmit — clean
```

## Run (agent path)

If nothing's listening on `:3000` yet, start the dev server (`pnpm run dokploy:dev`, see Run
(human path)) and wait for it before driving it. Then pipe a command script into the driver —
**no tmux in this environment**, so use a heredoc rather than `send-keys`/`capture-pane`; each line
runs against a single shared browser/page instance kept alive for the whole piped script:

```bash
node .claude/skills/run-platform/driver.mjs <<'EOF'
launch
nav /register
wait-for input[name="email"]
ss 01-register
console --errors
quit
EOF
```

This is a real, verified transcript from this session:

```
platform driver — "help" for commands, "launch" to start, then "nav /register"
driver> launched.
driver> nav http://localhost:3000/register → 200
driver> found: input[name="email"]
driver> screenshot: /tmp/shots/01-register.png
driver> no console errors
```

Screenshots land in `/tmp/shots/` (override with `SCREENSHOT_DIR`). `BASE_URL` defaults to
`http://localhost:3000` (override for a different port).

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
pnpm run dokploy:dev   # → http://localhost:3000, Ctrl-C to stop
```

A fresh instance redirects `/` → `/register` (`307`) to create the first admin account.

## Test

```bash
pnpm --filter dokploy run test   # vitest
```

Verified this session: **514 passed, 4 failed (of 519)**, all 4 failures in
`__test__/deploy/application.real.test.ts` — that suite does *real* `git clone` against GitHub and
*real* Docker builds. It needs outbound network access and a Docker socket the current user can
write to; in this environment that socket check failed with `connect EACCES /var/run/docker.sock`
(native `default` docker context, not the `desktop-linux` one `docker ps` normally talks to). Don't
treat those 4 as a regression signal unless your environment actually has that access.

## Gotchas

- **Don't assume you need to launch platform from scratch.** It may already be running (see the
  warning at the top) — `docker ps` under the `desktop-linux` context won't show it if it was
  started under a different Docker context/devcontainer; check the port directly instead of
  trusting `docker ps`.
- **`dokploy:setup` is not scoped to this repo.** It runs `docker swarm init` on the real daemon
  and binds host ports `80/81/443/5432/6379`. Reversible (`docker swarm leave --force`) but
  disruptive to whatever else uses those ports — confirm with whoever owns the machine before
  running it against a real dev box.
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

- **`connect EACCES /var/run/docker.sock`** in tests: the current user can't write to the native
  Docker socket (only the Docker Desktop socket at `~/.docker/desktop/docker.sock` is writable).
  Expected in this environment for the 4 `application.real.test.ts` cases — not a bug to chase.
- **Driver commands print nothing / hang until timeout when piped via heredoc**: make sure you're
  on a driver.mjs version whose `rl.on('close', ...)` awaits the internal command queue before
  quitting — otherwise EOF-on-heredoc fires `close` (and exits) before `launch`/`nav` finish.
