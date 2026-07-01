*Working title for the fork: ComputeBay Platform.*

---

## 1. Product context

This document specifies a custom fork of Dokploy that ships as the software layer of **ComputeBay Uno** — the single-node, turnkey self-hosted cloud appliance targeted at Philippine MSMEs. The fork is the entire reason a non-technical business owner can use the appliance at all; without it, ComputeBay Uno is just a mini PC running Docker.

**This spec is scoped to ComputeBay Uno.** ComputeBay 3.2a (the multi-node cluster) continues to ship with Proxmox + Kubernetes as before, sold to technical SMB buyers who want raw infrastructure rather than a managed control plane. None of the simplification described here applies to 3.2a.

The fork serves two customer paths from a single binary:

- **Managed (default for hardware sold by Avante)** — activated via a brokered Cloudflare Tunnel flow. Avante holds the Cloudflare credential, retains a kill switch, and provides remote support. Billed as Negosyo / Negosyo Pro subscription.
- **Self-host (advanced)** — customer brings their own Cloudflare API token and own domain. No Avante involvement after the hardware sale. No billing. No support contract. No kill switch.

The same UI is presented to both. The only difference is which credential-acquisition path ran during install, and whether Avante's support-access infrastructure is active.

---

## 2. Who the fork is designed for

**Primary user — the MSME owner-operator.**
Owns or runs a small business in the Philippines. Uses Facebook, Gmail, possibly Lazada/Shopee seller tools. Has never SSH'd into anything. Doesn't know what Docker is and doesn't need to. Wants their inventory software, their files, their POS, and a website to "just work" without paying SaaS subscriptions in dollars for software that's intermittently unreachable on PH internet.

**Secondary user — the customer's IT person.**
May not exist. If they do, they're an external freelancer or a relative who "knows computers." They install things, debug network issues, configure routers. They are not a sysadmin.

**Tertiary user — Avante support.**
Operates the managed tier remotely via SSH-over-WARP. Needs full system access, but every action must be auditable from the customer's side.

**Out of scope as a user:** the upstream Dokploy persona (developer self-hosting their side projects on a VPS). This persona is served fine by upstream Dokploy and we are not trying to displace it.

---

## 3. Architectural constraints that drive UX

These are non-negotiable shape constraints. Claude Design should treat them as given.

- **Single-node only.** No multi-server, no cluster mode, no remote agents. Every "where does this run" question has one answer.
- **No inbound ports open on the appliance other than SSH.** All public traffic enters via cloudflared. Traefik is reachable only inside the Docker overlay network.
- **One Cloudflare Tunnel per appliance.** A wildcard DNS rule routes `*.<customer.domain>` to Traefik. Adding an app does not require touching Cloudflare. Only custom-domain apps create per-app ingress rules.
- **Identical binary across managed and self-host.** No feature gating in the codebase. Behavioral differences are driven by config state set at install time.
- **Apps default to running on the local Docker overlay network.** Public exposure is an explicit per-app decision, not a side effect of deployment.

---

## 4. Information architecture

Upstream Dokploy uses a Projects → Applications hierarchy. For an MSME running 3–5 apps, the Project layer is friction without benefit.

**Recommendation: drop Projects from the primary UI.** Replace with a flat "Apps" list at the top level. Projects remain in the schema (for future use, multi-tenant scenarios, and to ease upstream merges) but are hidden by default. A power-user setting can re-enable them. Decision required.

**Top-level navigation (proposed):**

- **Home** — appliance status, recent activity, "what needs attention"
- **Apps** — flat list of installed apps, each with status, exposure mode, quick actions
- **Catalog** — the curated front door for installing new apps
- **Backups** — restore points, schedule, destination configuration
- **Settings** — network, support access, account, advanced

No "Projects", "Servers", "Clusters", or "Swarm" entries.

---

## 5. Feature inventory

### 5.1 Onboarding & first boot

The flow from "customer plugs the appliance in" to "first app running" must be possible in under 15 minutes by someone who has never used a Linux machine. Browser-based, completed on their phone or laptop on the same Wi-Fi.

- **Local discovery.** On first boot, the appliance advertises itself on the LAN (mDNS / Bonjour: `computebay.local`) so the owner can reach the setup page without knowing an IP.
- **Activation step.** Two paths, presented as a single choice:
  - *"I have an activation code from Avante"* → enters code, broker exchange happens, managed tier configured.
  - *"I want to use my own Cloudflare account"* → enters CF API token + own domain, local provisioning happens via `cloudflared` CLI.
- **Admin account creation.** Email + password. No "create organization" or "create team" step — that's developer-tool framing the MSME doesn't need.
- **Time zone + business name.** Used for backup scheduling, app naming defaults, and personalizing the dashboard.
- **Optional: install a starter app.** Surface the catalog at the end of setup with a "Skip for now" option. Don't force it.

### 5.2 App Catalog (curated front door)

The Catalog is the primary install surface and a strategic asset — it's how Avante endorses third-party developers' applications and curates the FOSS landscape for MSMEs. **FOSS apps appear under their real names, unmodified.** Avante does not white-label or wrap third-party software.

**Two sections, clearly visually distinct:**

- **Curated** — small, vetted list maintained by Avante. Each app has a one-paragraph description in plain language ("Keep track of your inventory and sales"), a screenshot, and a single "Install" button that uses sensible defaults with no configuration questions. Docker concepts (image tags, ports, volumes) are not visible.
- **Template marketplace** — the broader Dokploy template ecosystem, exposed as-is for users who want it. Surfaces configuration UI similar to upstream. Labeled clearly as "Advanced — for technical users."

The catalog should also accommodate **partner-endorsed apps** — software from Philippine or regional dev shops that Avante has agreed to feature. Mark these visibly (a partner badge or similar) without obscuring that they're independent products.

**Initial curated catalog (suggested launch set, finalize in Obsidian):**
- Nextcloud (files, calendar, contacts)
- WordPress (websites)
- Invoice Ninja (invoicing)
- N8n (automation)
- Syncthing (file sync to staff devices)
- Checkmate (does my website work?)
- Dolibarr

Each catalog entry needs metadata: estimated resource use (so the dashboard can warn if installing it would over-allocate), required disk, dependent services it spins up, whether it bundles its own database.

**Database services.** Upstream Dokploy treats "deploy a Postgres" as a first-class action. For the MSME path, this is hidden — catalog apps bring their own bundled databases via compose. The "add a standalone database" action remains available but lives in the Advanced section, not the main flow.

### 5.3 App installation flow

Once an app is selected from the curated catalog, the install flow asks exactly one question that matters to a non-technical user:

> **Who should be able to use this app?**
>
> ○ **Just people in this office** (this Wi-Fi network)
> ○ **Anyone with the link** (available on the internet)
>
> *You can change this later.*

That's it. No port selection, no domain config, no environment variable forms, no Docker network choice. The system picks a subdomain under the appliance's wildcard (or asks for one if "available on the internet" is chosen and the customer wants a custom name), provisions Traefik labels, and the app comes up.

Behind the scenes:
- "Just people in this office" → Traefik binds to LAN interface only, no cloudflared route.
- "Anyone with the link" → standard wildcard tunnel path, app reachable at `<app-name>.<customer-slug>.computebay.app`.

Template marketplace installs retain upstream Dokploy's full config UI — those users have opted into complexity.

### 5.4 Apps list / per-app management

A flat list of installed apps. Each row shows:
- App name and icon
- One-word status (Running / Stopped / Updating / Error)
- Exposure mode (a small icon: Wi-Fi for LAN-only, globe for public)
- Last accessed (optional, helps owner notice unused apps)
- Quick actions: Open, Restart, Stop

Clicking into an app reveals a per-app page with sections that fold complexity by user type:

- **Always visible (everyone):** Open app, exposure mode toggle, restart, stop, uninstall, current address(es), basic stats (memory used, last started)
- **Visible behind "Advanced":** logs viewer, environment variables, restart policy, custom domains, raw Docker labels, volumes
- **Visible only in self-host or to power users:** the underlying compose file, image tag pinning, manual redeploy

The exposure-mode toggle must include a confirmation when going from LAN-only to public ("This app will be accessible from anywhere on the internet. Make sure it has a strong password.") — this is the moment where a non-technical user can accidentally expose something they didn't mean to.

### 5.5 Network exposure & domain handling

Most users never touch this directly — the install-time choice handles 95% of cases. What's exposed in UI:

- The exposure toggle on each app (described above)
- A read-only view of "your appliance's address" (the wildcard root)
- An "Add a custom domain" advanced action for managed-tier users who want their own brand domain in front of an app — this triggers a CNAME instruction and updates the tunnel's ingress rules. Self-host users handle this themselves in their Cloudflare dashboard.

**Notably absent compared to upstream:** the entire SSL/TLS configuration surface. Cloudflare terminates TLS at the edge; there is no Let's Encrypt prompt, no certificate management UI, no HTTPS toggle per app. This is one of the largest simplifications and should be aggressively defended against creeping back in.

### 5.6 Dashboard / Home

The Home page answers three questions a non-technical owner actually asks:

1. **Is everything working?** — overall health badge (green/yellow/red), tunnel connection status, list of any apps with errors. Tunnel health should be queried from Cloudflare's API, not just inferred from local container status. A green local cloudflared container with a dead control-plane connection still reads as "down" from the user's perspective.
2. **What's been happening?** — recent activity feed (app installs, restarts, failed backups, Avante support sessions, app updates available).
3. **Am I running out of space/memory?** — single resource indicator showing disk and RAM headroom in plain language ("Plenty of room" / "Getting full — consider freeing space").

No CPU graphs. No network throughput charts. No container counts. If a power user wants those, they go to Advanced.

### 5.7 Updates

Three things can update independently. The UI should be honest about which is which.

- **Curated catalog apps** — Avante publishes new versions. Customer sees "Update available" on the app row, clicks to update. Avante can mark an update as "critical" (security) which triggers a more prominent notification.
- **The Dokploy fork itself (control plane)** — updates pushed by Avante in managed tier. In self-host, customer triggers manually.
- **Template marketplace apps** — customer's own responsibility, same model as upstream Dokploy. Updates surface in the per-app advanced section, not in the main update flow.

**No automatic updates by default.** PH internet reliability and the appliance's role as production infrastructure for the business means a surprise restart at the wrong time is worse than a delayed update. Surface updates, let the owner click.

### 5.8 Backups

PH MSME context drives this section. Many customers will not have an S3 account, won't trust cloud storage at all, or won't be able to pay in USD. Backup destinations must include local options.

**Supported backup destinations (proposed):**

- **USB drive plugged into the appliance** — simplest, most familiar. Detected on plug-in, backup destination configurable per-volume.
- **Network share on the LAN** (SMB/NFS to a NAS or another PC). Many customers already have a "shared drive" on the office network.
- **Google Drive** — most owners already have a Gmail. OAuth flow, no API key handling.
- **S3-compatible** (R2, B2, AWS S3, Wasabi, etc.) — retained from upstream for power users.
- **Avante-managed cloud backup** — managed-tier add-on, additional fee, stored in Avante-controlled bucket. Decision required: is this part of Negosyo Pro, a separate add-on, or out of scope for MVP?

Per-app backup schedule (daily/weekly), retention policy ("keep last 7 daily, last 4 weekly"), and a clear restore flow. Restore must work even if the app has been completely uninstalled — backups are not coupled to their original app's lifecycle.

### 5.9 Avante support access (managed tier only)

This is the feature most affected by the Q5 decision: **Avante has full SSH access to the host via cloudflared WARP.** The UX needs to make that consent-respecting and auditable rather than ambient.

**Required behavior:**

- A **support access status indicator** visible from Home — currently "Allowed" or "Paused", with last-changed timestamp.
- A **pause toggle** in Settings — disables the SSH-over-WARP path while keeping app traffic flowing. Customer can use this during sensitive periods (audits, sale of business, owner travel) without breaking their apps.
- A **support session audit log** — every Avante SSH login is recorded with timestamp, duration, and (if Avante side annotates) the support ticket or reason. Customer can review this any time.
- An **optional email notification** to the owner when an Avante session begins. Off by default; opt-in in Settings. Some customers will want it, some will find it noisy after the third support call.
- **Self-host appliances have none of this UI** — the entire support-access section is hidden, since there's no WARP setup and no support contract.

**Decision required:** Should there be a "request support" button that opens a ticket and signals Avante to connect, or is the connection always Avante-initiated based on out-of-band contact (call, email)? Recommend: ticket button in a later phase, out-of-band for MVP.

### 5.10 Settings

Grouped sections, ordered by how often a non-technical user would touch them:

- **Account** — change password, change email, two-factor (deferred? decision required)
- **Notifications** — where do alerts go (email, optionally Discord/Slack for power users)
- **Backups** — destinations, schedule, retention (cross-link from Backups page)
- **Network** — appliance address, custom domain management, exposure defaults
- **Support access** (managed only) — pause toggle, audit log, notification opt-in
- **Subscription** (managed only) — current tier, next billing date, contact Avante to change (no in-app upgrade flow for MVP)
- **Advanced** — every escape hatch (Project mode toggle, raw Docker access, log levels, etc.). Behind a "I know what I'm doing" acknowledgment.

### 5.11 Billing visibility (managed tier)

**Proposed default for MVP:** show subscription tier and next billing date. Do not handle payment in-app. Direct customers to contact Avante for changes. This avoids building a billing UI before there's billing volume to justify it.

Decision required: is this acceptable, or does the MVP need to show invoices / payment status?

### 5.12 Account & multi-user

**Defer.** MVP ships with single-admin model. Per Q4, no SSO. Per the persona analysis, most MSMEs have one owner-operator running the show. Add multi-user with role separation in a later phase when a customer actually asks for it.

### 5.13 Global view toggle (Simple / Advanced)

Rather than exposing Dokploy's full control plane only through scattered per-screen "Advanced" folds, the fork surfaces a single, persistent switch between two complete shells:

- **Simple** — the ComputeBay experience described throughout this spec: Home, Apps, Catalog, Backups, Settings.
- **Advanced** — the unmodified Dokploy control plane: Projects, Monitoring, Templates, Docker, Registry, Git Providers, Notifications, S3 Destinations, raw Settings. This is where the Projects layer (see §4) lives in full.

**Placement.** A two-state segmented control in the top bar, next to the appliance health pill. Switching is instant and swaps the whole shell (sidebar + content) — not a modal, not a separate tab.

**Default visibility, by tier:**
- **Self-host** — the toggle is visible in the header from first login. These customers bought the appliance specifically for full control, and hiding Dokploy from them would be paternalistic.
- **Managed** — the toggle is hidden by default. Simple app management is the entire point of the managed tier. It can be turned on in **Settings → Interface → "Show the Advanced toggle in the header."** Once turned on, it behaves identically to self-host.
- Regardless of the setting above, if a customer is currently in the Advanced view, the toggle stays visible so they can always get back to Simple — no dead ends.

**Settings → Interface** (new subsection, see also §5.10):
- **Default view** — which shell this account opens in (Simple, recommended, or Advanced).
- **Show the Advanced toggle in the header** — Managed tier only; off by default.

**Relationship to per-screen Advanced folds.** The per-screen "Advanced" sections described in §5.4 (per-app logs, environment variables, raw compose) and §5.10 (Settings advanced) are retained, but now read as direct entry points into the Advanced shell rather than self-contained accordions — clicking any of those rows opens the equivalent Dokploy page. This keeps a five-minute technical task from requiring a full context switch away from Simple, while still routing all raw Docker/Dokploy detail through one consistent Advanced surface rather than duplicating it inline.

**Framing note.** Advanced is not an "expert mode" hidden behind a warning wall — it's the literal Dokploy fork with nothing removed. The toggle is the honest acknowledgment that this is a fork: MSME owners get the simplified path, and anyone who wants the tool underneath it always can reach it in one click.

---

## 6. What's removed from upstream Dokploy

Tracked explicitly because the absence of these features is a design decision, and Claude Design needs to know not to design around them. All of the below are removed from the **Simple** shell only — every item remains fully available in the **Advanced** (Dokploy) shell via the toggle in §5.13.

- **Projects layer** in the primary UI (kept in schema)
- **Multi-server / cluster mode / remote agents**
- **VPS provisioner integrations** (Hetzner, DigitalOcean, etc.) — the customer already has the hardware
- **Let's Encrypt and per-app SSL/TLS configuration** — Cloudflare handles it
- **HTTPS toggle and certificate UI** — same reason
- **Git provider deep integrations** (GitHub apps, etc.) — kept in template marketplace section, removed from curated path
- **Docker registry management UI** — moved to Advanced
- **Built-in monitoring/metrics** dashboards — replaced with the simpler "is everything OK?" indicator
- **Team and RBAC management** — deferred (Q4)

---

## 7. UX principles for Claude Design

The following are the principles Claude Design should treat as binding for the prototype.

**Hide Docker.** A non-technical user should be able to install, run, and back up apps for months without ever encountering the words "container", "image", "volume", or "compose". Docker concepts are visible only behind the Advanced gate.

**Two paths in every UI surface.** The simplification for non-technical users must not bury functionality from power users. Every screen has a default mode (simplified, opinionated) and a path into the full upstream Dokploy capability. Two mechanisms serve this, and neither replaces the other: per-screen "Advanced" folds (logs, environment variables, raw compose — see §5.4, §5.10) give a fast escape hatch for a single task without leaving Simple, while the global Simple/Advanced toggle in the header (§5.13) gives a full working session in the unmodified Dokploy control plane when a task needs it.

**Confirmation, not configuration.** When upstream Dokploy would ask the user to *configure* something (which port, which network, which certificate), the fork should pick a sensible default and *confirm* it ("Your app will be at acme-foods.computebay.app. Is that OK?"). The user can always tweak in Advanced, but the default flow is acknowledgment rather than decision.

**Plain language, not jargon.** "Available on the internet" beats "Public ingress". "Getting full" beats "82% disk utilization". "Pause" beats "Disable". "Just people in this office" beats "LAN-only". Strings should be written by someone who has actually spoken to MSME owners — not by a developer.

**Local language and currency awareness.** Localization itself can be deferred (English-only is acceptable for MVP), but resource indicators in PHP, time zones in Asia/Manila, and dates in the local convention should be defaults, not toggles.

**Honest status, not aspirational status.** If the tunnel is degraded, say so. If a backup failed last night, surface that. Health badges should reflect reality, not marketing. The customer trusts the dashboard with their business — earn it.

**The Avante presence should be tasteful.** In managed-tier UI, Avante branding belongs in the "support access" surface and the activation flow. It should not be plastered across the main app management surfaces. The customer is running their business; the platform should fade into the background most of the time.

---

## 8. Open decisions to resolve in Obsidian

Listed for visibility — these don't block Claude Design starting on the simpler surfaces, but most need to be resolved before the prototype is fully complete.

1. **Fork name** — ComputeBay Platform
2. **Projects layer** — resolved by the global view toggle (§5.13): Projects live entirely inside the Advanced (Dokploy) shell and are never shown in Simple
3. **Avante-managed cloud backup** — This is included as a Value-Added Service it simply uses the already existing feature of Dokploy's per-app backup system, just set by us for managed users..
4. **Support session model** — "request support" button now or later (recommend later).
5. **Two-factor authentication** — Defer
6. **Billing UI depth** — read-only status sufficient, or invoices/payment status needed.
7. **Initial curated catalog roster** — WordPress, NextCloud, Dolibarr, InvoiceNinja, Checkmate, n8n
8. **Update notification model** — in-dashboard only, or also email/Discord/SMS.

---

## 9. Out of scope for this fork (and this spec)

- ComputeBay 3.2a — different product, different audience, different stack
- The fleet management console for IT resellers (longer-term roadmap)
- The local app marketplace as a separate product (the catalog inside the fork *is* the marketplace surface for now)
- Mobile apps — the responsive web UI is the mobile experience for MVP
- Built-in SSO across apps (deferred per Q4)
- Hardware provisioning UI (the hardware exists before the fork is installed)
- Reseller/MSP-tier multi-tenant management (later phase)
