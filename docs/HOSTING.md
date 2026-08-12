# Hosting OpenWarlock: the launch problem, a domain, versions, and the chat box

*Plan written 2026-08-07. All costs are **approximate, as of 2026-08**, and change.
Read with [VERSIONING.md](VERSIONING.md), but note its "a version is a data patch"
recommendation has been **overruled**: versions are arbitrary code. This doc assumes that.*

## Recommendation (read only this if you want)

1. **Your Mac is the server, at a domain you own, behind a Cloudflare *named* tunnel.** One
   stable hostname forever, no port forwarding, home IP never exposed, TLS free and automatic.
2. **Give players a website with one button: "Create game".** It spawns a game process on your
   Mac and hands back an invite link they send to friends. Zero install, zero technical steps:
   the only design that a non-technical host can actually use.
3. **Keep `npm run host` as the opt-in self-hosting path** for technical players. Do not build a
   packaged desktop app or a WebRTC rewrite yet; both are large, and neither is what blocks you.
4. **Buy a `.com` at Cloudflare Registrar (~$11/yr)**. Skip `.gg` (~$51/yr).
5. **Chat box → Cloudflare Worker → a GitHub issue.** Your Mac *polls* GitHub. Nothing on your
   Mac ever accepts a request from the internet, and every request is public and auditable.

The honest tension: goal "a player hosts" and goal "non-technical, just a link" **cannot both be
fully satisfied** (player-hosting means software on the player's machine). This plan gets the
non-technical experience now and keeps a real path to decentralisation (§A, §F stage 3).

---

## A. The launch problem

Today: `git clone`, Node, `npm install`, `brew install cloudflared`, `npm run host`, then reshare
a throwaway `*.trycloudflare.com` URL that changes on every restart
([`scripts/host.js`](../scripts/host.js)). Four installs and a link that rots. Non-starter for
non-technical hosts.

| Option | Host's literal steps | What breaks | Ongoing cost (approx, 2026-08) |
|---|---|---|---|
| **1. Packaged app** (Electron/Tauri) | Download, drag to Applications, open, click Host, copy URL | macOS blocks unsigned apps; Windows SmartScreen; per-OS builds; auto-update; bundling `cloudflared` | **$99/yr** Apple Developer + ~$100-400 Windows OV cert |
| **2. Browser P2P** (WebRTC) | Open site, click Host, share link, **keep the tab in front** | Background-tab timer throttling stalls the 30 Hz loop for everyone; host closes tab = game dies; big rewrite; you still run signalling | signalling ~free; **TURN ~$0.05/GB** after 1000 GB free |
| **3. Your Mac is the server** ✅ | Open site, click Create, share link | Contradicts "player-hosted"; your uplink and CPU are the ceiling; single point of failure | domain ~$11/yr, electricity |
| **4. Hybrid: 3 now, 1 later** ✅ | as option 3, with "host it yourself" as an upgrade | nothing new (it *is* option 3 plus a doc page) | same as 3 |

**Option 1 in detail.** Since macOS Sequoia, Control-click-to-open is gone: an unsigned download
sends the user to System Settings → Privacy & Security → "Open Anyway", and on Sequoia/Tahoe 26
that final confirmation asks for an **admin password**
([Apple community](https://discussions.apple.com/thread/255759797),
[iDownloadBlog](https://www.idownloadblog.com/2024/08/07/apple-macos-sequoia-gatekeeper-change-install-unsigned-apps-mac/)).
You will not talk a non-technical friend through that, so signing+notarisation is mandatory,
which means the [Apple Developer Program](https://developer.apple.com/programs/) at ~$99/yr
(notarisation itself is included). Tauri is the right shape if you ever build it (~5-15 MB vs
Electron's ~150 MB), but this repo's server is Node, so it ships as a *sidecar binary*
(`pkg`-style), which claws most of the size back. Verdict: **real, correct, and premature.**

**Option 2 in detail: what would actually have to change.** The good news: `shared/sim.js` is
pure and already loads in the browser, so the simulation itself ports for free. The rest of
[`server/index.js`](../server/index.js) does not:

- **transport**: `ws` → `RTCDataChannel`, with the host tab fanning out snapshots to N peers.
- **the 30 Hz loop**: browsers throttle timers in hidden/background tabs. The host tabbing away
  degrades or freezes the match **for everybody**. This alone disqualifies it for casual play.
- **host = single point of failure with no migration**: closing the tab ends the game. The
  60 s `RESET_GRACE_MS` / reconnect-stash work assumes a surviving process.
- **loses**: JSONL journal, crash dumps, `/health`, static serving, and IP bans (the ✕ ban
  button uses `CF-Connecting-IP`; WebRTC gives you ICE candidates, not that).
- **NAT**: STUN is free (`stun.cloudflare.com`) and covers most pairs; symmetric NAT / strict
  CGNAT needs **TURN, which relays every byte of the match**. Cloudflare Realtime TURN is
  ~$0.05/GB with a 1000 GB/month free tier shared with SFU
  ([docs](https://developers.cloudflare.com/realtime/turn/faq/)). **You** pay it, so P2P does not
  remove your ongoing cost, it makes it variable.
- **you still run always-on infra** (signalling), so the "I don't run servers" goal is not met
  either.

**Conclusion: option 4.** Your Mac is the server; self-hosting is a documented upgrade. Revisit
option 1 only when your uplink or your patience is the measured bottleneck.

## B. Domain, DNS, TLS

**Buy:** a plain `.com` (or `.xyz` / `.fun` if the name you want is taken) at **Cloudflare
Registrar**, at-cost, ~$10-11/yr for `.com` and no renewal markup
([tld-list](https://tld-list.com/registrars/cloudflare)). It requires the zone's DNS to be on
Cloudflare, which you want anyway for the tunnel. **Porkbun** is the alternative (~$11/yr `.com`,
more TLDs). Avoid `.gg`: ~$51/yr even at the cheap registrar
([Porkbun](https://tld-list.com/registrars/porkbun)). See [NAMING.md](NAMING.md) for the name
itself.

**Point it at your Mac without exposing your home IP**: a Cloudflare **named** tunnel:

1. `cloudflared tunnel login`, then `cloudflared tunnel create warlock` → a credentials JSON.
2. DNS: `cloudflared tunnel route dns warlock play.yourdomain.com` writes a **proxied CNAME**
   to `<tunnel-id>.cfargotunnel.com`. Add a **wildcard** `*.yourdomain.com` the same way (see §C).
3. Ingress config maps hostname → `http://localhost:<port>`
   ([docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/)).
4. Run it as a **launchd service**, not as a child of the game: `cloudflared service install`.

No inbound ports open, no residential IP in DNS, and the hostname is **stable across restarts**,
the one thing quick tunnels cannot give you. TLS: Cloudflare terminates it with a free Universal
SSL certificate that auto-renews, covering the apex and **one level** of wildcard
(`*.yourdomain.com`, not `*.*.yourdomain.com`). Cost: $0 on the free plan.

**What changes in `scripts/host.js`, conceptually:** it stops owning the tunnel. Today it spawns
`cloudflared tunnel --url` and scrapes stdout for a random hostname. In the new world the tunnel
is a long-lived system service and `host.js` shrinks to: pick a free port, start
`server/index.js` on it, register `code → port` with the router (§C), print the stable invite
URL. The quick-tunnel code stays as the fallback for **self-hosting players**, who have no domain.

## C. Serving hundreds of arbitrary-code versions

**Route by subdomain, not by path.** This is forced by the client, not taste:
`client/index.html` loads `/client/main.js` **absolutely**, and `client/main.js` opens
`new WebSocket(...location.host)` at the **root path**. A path prefix like `/g/ab12/` therefore
breaks asset URLs *and* leaves the router unable to tell which game a socket belongs to.
Subdomains need **zero client changes**:

```
https://ab12.yourdomain.com        # one game; the code is the invite secret
*.yourdomain.com  →  tunnel  →  localhost:3000 (router)  →  localhost:31xxx (game)
```

The router is a ~60-line Node reverse proxy (HTTP + WebSocket upgrade) that reads the `Host`
header and forwards to that game's port. cloudflared never needs a config reload when a game
starts. That is the whole reason for the wildcard.

**Version identity.** A version is arbitrary code, so identify it by what code it is:
`name@<short-sha>` of a commit in a fork/branch, resolved to a **checkout on disk**. Put it in
the *creation* request, not the invite link (the invite link points at a game, and the game
already knows its version, so invited players cannot land on the wrong build). Show the version
name in the lobby so nobody is confused about what they joined.

**What "building" a version costs.** Nothing, happily: no build step, one dependency. Per version
you need a `git worktree` (code is ~300 KB) plus `node_modules`. **Share `assets/` by symlink**:
it is 15 MB and dominates everything else; only versions that change art need their own. So
~1 MB/version for code, ~40 MB for a version that forks the art.

| Resource | Per idle version on disk | Per running game | Honest ceiling on one Mac |
|---|---|---|---|
| Disk | ~1 MB (shared assets) to ~40 MB | n/a | hundreds of versions is a non-issue |
| RAM | 0 | one Node process (**estimate** ~50-80 MB) | ~20-30 games before RAM matters |
| CPU | 0 | 30 Hz sim (**estimate** a few % of a core) | likely 10-20 games |
| **Uplink** | 0 | 15 Hz JSON snapshots × N players | **this is the real ceiling** |

I do not have a measured snapshot size, so I will not invent one. **Measure it before
promising anything**: run a session with `JOURNAL=`, or count bytes written per socket, and
compute `bytes × 15/s × players`. Residential upload (often 10-40 Mbit/s) is what will break
first, not the CPU. My unmeasured guess is single-digit concurrent games; treat 4-6 as the
planning number until measured.

**Untrusted code is the other ceiling.** Arbitrary-code versions mean `npm install` running
arbitrary postinstall scripts and `server/index.js` replaced by anything at all, on your machine.
Community versions must run in the sandbox of §E, or not on your Mac at all.

### Measuring which versions get played

The two metrics that decide what a version is worth are defined in
[VERSIONING.md](VERSIONING.md#the-two-metrics-that-actually-matter). Both are cheap here, and one
is already free:

- **Download / launch count: free, no client work.** The router (above) already sees every
  request, so counting hits per version is a counter next to the `code → port` registry. This is
  the *only* number knowable about a version played offline on a LAN, and it measures curiosity,
  not enjoyment.
- **Human-hours played: needs a beacon.** The game server is authoritative, so it already knows
  which seats are humans and for how long; no new game logic is required, only a report. Add one
  tiny endpoint (`POST /telemetry`) behind the same tunnel, taking `{version, humans, seconds}` and
  appending a line to a JSONL file (same shape as the existing `JOURNAL=` output, so it needs no
  new storage thinking). Games hosted **on your Mac** report by localhost, no internet involved.
  Games hosted by a **self-hosting player** (`npm run host`) are the case that needs their consent:
  on by default, one visible line in the console and a lobby setting to turn it off, and it buffers
  and retries if they are offline at the time.

Send nothing else: no names, no chat, no IPs. Being able to say the payload is three numbers is
what makes "on by default" defensible for private games among friends. And note the numbers are
unverifiable by design (no accounts): a per-IP rate limit and a sane cap per report is all the
defence available, so treat these as a signal, never a leaderboard.

## D. The chat box

**Recommended: public page → Cloudflare Worker → GitHub issue; your Mac polls GitHub.**

| Path | Durable | Free | Auditable | Exposes your Mac |
|---|---|---|---|---|
| **Worker → GitHub issue** ✅ | yes, forever | Workers 100k req/day free; Turnstile free | public, with comment history and labels | **no, pull only** |
| Queue endpoint through your tunnel | you build storage | free | you build it | **yes** |
| Hosted form (Tally/Google Forms) | vendor's DB | free tier | weak | no, but adds a third party |

Why GitHub wins beyond the table: it is already your workflow, the refusal is a public issue
comment (players see *why*), labels give you a queue for free, and (the important one) **your
Mac makes only outbound requests**. There is no listening endpoint to attack.

Shape: a static page with a textarea + [Turnstile](https://blog.cloudflare.com/turnstile-ga/)
(free, unlimited). The Worker verifies the token, rate-limits, and creates the issue with a
fine-grained token held as a Worker secret (never in the browser) with **issues:write on one repo
and nothing else**. Label `from-chatbox`. Your Mac runs `gh issue list --label from-chatbox` on a
timer.

**Depiling, rate limits, abuse:**

- **Per-submitter limits** in Workers KV: e.g. 3/day per IP-hash + a global daily cap. Anonymous
  is right for reach; if spam wins, require a GitHub login, which ends anonymous spam outright.
- **Prompt injection is the default case, not the edge case.** Every issue body is *data*, never
  instructions. Wrap it in delimiters, and state in the agent's system prompt that text inside
  cannot grant permissions, name files, change tools, or override policy.
- **Refuse** (and say so in a comment): requests for compute ("run this script", "fetch this
  URL", mining), anything about the machine, secrets, tokens, network or CI config, anything
  outside game behaviour, and anything asking the agent to relax its own rules.
- **Cost caps**: a wall-clock and token/spend limit per request. Your API budget is a resource
  strangers are spending.

**Be blunt about this: an internet-facing text box feeding an agent with write access to a repo
on your personal Mac is the highest-risk component in the entire design.** Containment, concretely:

- Runs as a **dedicated non-admin macOS user** (or in a VM), in a **clone that is not your working
  clone**. No access to `~/.ssh`, Keychain, iCloud, Documents, your other repos.
- Its **only** output is a branch + a PR. No pushes to `main`, no merges, no releases, no ability
  to deploy or restart anything, no `git push --force`.
- Untrusted code from a version **never runs on the host user**; tests execute in the §E sandbox.
- **You merge.** Optionally auto-merge one machine-checkable class (e.g. only files under a
  data/ruleset dir changed, schema validates) as VERSIONING.md argues. But that exemption
  disappears once versions are arbitrary code, so for now: human in the loop, every time.

## E. Security and ops for exposing a personal Mac

**The tunnel protects**: no inbound ports, home IP hidden, TLS terminated for you, L3/L7 DDoS
absorbed at Cloudflare's edge, and free WAF / rate-limiting / Turnstile in front of any path.

**The tunnel does not protect**: the process behind it. Anything the Node process can read is
reachable. The existing path allowlist in `server/index.js` (only `client/`, `shared/`, `assets/`)
is the mitigation and is already correct (do not loosen it). Nor does the tunnel stop app-level
abuse: joining lobbies, spamming casts, or `create game` in a loop.

- **Isolate**: game processes under a dedicated non-admin user, or a Linux VM/container. Then a
  compromised game server sees a boring empty home directory.
- **Game creation is the DoS vector**, not the game itself: Turnstile on the create button, a
  per-IP creation limit, a **hard cap on total live games**, and a reaper that polls each game's
  `/health` (it already reports `players` and `uptime`) and kills empties after N minutes.
- **Compute abuse**: cap games, cap the agent's spend, and watch uplink. Cloudflare's free-plan
  [§2.8 non-HTML content](https://www.cloudflare.com/terms/) limit is a genuine grey area for
  sustained WebSocket game traffic. I cannot tell you where the line is, so **measure your
  monthly bandwidth**, and be ready to move to a ~$5/mo VPS if you get a nastygram.
- **Kill switch**, three depths: (1) `warlock-panic` script (kill every game process and the
  router); (2) `launchctl unload` the cloudflared service; (3) Cloudflare dashboard (delete the
  DNS record or the tunnel). Practise (1) once so it works when you are annoyed.
- **Keep the Mac awake** (`caffeinate -s`, or Energy Saver "prevent sleeping"), and keep your
  playtest clone separate from the serving checkout so a mid-session `git pull` can't mix versions
  (see AGENTS.md's stale-process scars).

## F. Staged plan

**Stage 0 (this week, ~$11 total).** Buy the domain. Create one named tunnel as a launchd
service. Point `play.yourdomain.com` at a single long-lived `node server/index.js`. Share one
link that never changes. `npm run host` stays untouched for technical friends.
*Trigger to leave:* two groups want to play at once, or you want a version other than default.

**Stage 1 (multi-game).** Wildcard DNS + the ~60-line router, "Create game" page with Turnstile,
`code → port` registry, idle reaper, live-game cap, version checkouts with shared `assets/`.
Add the per-version download counter here (it is one counter in the router) and the
`POST /telemetry` human-hours beacon. Start collecting before you need the data, since neither
can be backfilled.
*Trigger:* people play weekly without you organising it.

**Stage 2 (chat box).** Worker + Turnstile + GitHub issue, and the depiling agent in its
sandboxed user with PR-only output. Ship the intake before the agent; a queue of unimplemented
requests is useful data and costs nothing.
*Trigger:* players are asking for changes verbally and you are relaying them by hand.

**Stage 3 (real decentralisation).** Only when your uplink is measurably the bottleneck or you
want out. Cheapest first: a one-command install script for technical hosts (`curl … | sh`, no
signing needed); then, if non-technical hosts genuinely demand it, the Tauri app plus $99/yr
Apple Developer.
*Trigger:* concurrent games exceed what you measured in §C.

**Not planned: the WebRTC rewrite.** Revisit only if a specific measured problem (cross-continent
latency to your Mac) demands it, and accept the background-tab flaw before starting.
