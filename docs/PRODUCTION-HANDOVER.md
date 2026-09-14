# Beat the Bot — Production Handover Spec

**Prepared for:** Claude Code, picking up this repo to take it from event demo
to production application.
**Prepared:** 2026-09-02
**Owner:** Gus Grizzard, ERA Grizzard Real Estate
**Repo:** `github.com/ERA-Grizzard-Real-Estate/beat-the-bot`
**Live:** `https://beat-the-bot-2.vercel.app` (Vercel project `beat-the-bot-2`)

Read `CLAUDE.md` at the repo root first. It carries the stack, commands, file
map, secrets, deploy path, and guardrails. This document is the build plan.

---

## 1. How to use this document

Work the phases in order. Each phase has a goal, the files it touches, the
decisions already made, and acceptance criteria. Do not start a later phase
before an earlier one lands — Phase 1 in particular unblocks everything else,
because today the whole app is one 1686-line file.

Check in with Gus at the three gates marked **GATE**. Those are points where a
wrong assumption costs real rework.

Anything in **Section 21, Open questions for Gus** needs an answer before the phase
that depends on it. Ask rather than guess.

---

## 2. What Beat the Bot is

An AI game-show host named **Rex** reads a real estate objection aloud in
character. An agent answers into a microphone. Claude scores the answer on
three dimensions, Rex delivers a one-line roast, then real coaching.

The tone is the product. Rex is theatrical, a little savage, always punching up,
never cruel, PG. Agents remember a roast; they forget a rubric. Preserve the
voice in everything you build.

It debuted 2026-06-18 as the main-stage segment at Refuel 2026 with 3
contestants on one laptop. That is the app that exists today: a single-device,
single-session, host-driven game show with no accounts and no memory.

What it needs to become: a training tool an agent opens on their own phone
between appointments, that a manager can see the results of, and that still
runs the live game show at an office meeting.

---

## 3. Decisions locked with Gus

These were confirmed 2026-09-02. Build to them; do not relitigate.

| Area | Decision |
|---|---|
| **Login** | Google SSO, restricted to the `@eragrizzard.com` domain. No passwords. Admin and manager rights come from a role on the user record, not from the identity provider. |
| **Play modes** | Three: **Solo practice** (the new default), **Head-to-head challenge** (async, link-based), **Live multiplayer game show** (preserve today's experience). |
| **Persistence** | Neon Postgres. Store agents, attempts, scores, subscores, coaching text, and the objection library. **Do not store audio or raw recordings.** Transcripts of answers are stored (they are what the coaching references); audio is discarded after transcription. |
| **Admin panel** | Web UI to create, edit, and retire categories and objections. Replaces hand-editing `src/data/gamePacks.js`. |
| **Manager dashboard** | Per-office and per-agent view: reps completed, average score, subscore trend, weakest categories. |
| **Mobile** | Mobile-first responsive pass. An agent in a car on a phone is a first-class user, not an afterthought. |

Explicitly **out of scope** for this handover: audio storage and playback,
manager-assigned drills with due dates, leaderboards, HubSpot or Airtable
sync, SMS or email notifications, native mobile apps, multi-brokerage tenancy.

Leaderboards were considered and dropped. The schema in `docs/schema.sql`
leaves room for them without building them.

---

## 4. Current state audit

### 4.1 What works and should be preserved

- **The scoring rubric and its calibration.** `api/score.js` holds
  `REX_SYSTEM_PROMPT` plus a competition-mode addendum. Weights are objective
  40%, tone 30%, language 30%. **9 is the hard ceiling; never a 10.** 7-8 is the
  normal landing spot for a solid answer. This was tuned live at the event and
  is correct. Do not soften or "fix" it.
- **Head-to-head comparative scoring.** A round's answers go to the model in
  one call (`responses` array in, `{results:[...]}` out) so scores spread with
  a clear winner and no ties. Per-answer scoring is the fallback if the batch
  call fails.
- **Live improv banter.** `getRexBanter()` posts `mode:"banter"` to
  `/api/score` at temperature 1 to generate a fresh stall line during each
  scoring break. Four canned lines in `getRexGradingFiller()` are the fallback.
  This is why the game does not feel like it is buffering.
- **The objection library.** 4 categories, 30 objections. Each has a `persona`,
  a `short` reel label, a full in-character spoken `objection`, an `objective`,
  and a `benchmark` answer. This content is good and was written carefully.
- **The roulette reel.** Category tap, Rex announces, reel spins and lands,
  objection is read. It is the beat that makes it feel like a game show.
- **Skip that actually works.** `speakText` resolves its promise on `onended`,
  `onerror`, and on `stopSpeaking()`. That third case is what lets the host skip
  a line without hanging the phase machine. Preserve this in any new audio path.
- **Winner picks the next battlefield.** Round winner chooses the next category
  and leads off. Small mechanic, big engagement.

### 4.2 What is fragile

- **`src/App.jsx` is 1686 lines** holding the phase machine, all 14 screens, all
  game logic, and ~550 lines of CSS in a template literal. Nothing can be tested
  or reused. This is the single biggest obstacle to everything below.
- **No routing.** Phases are a string in `useState`. There are no URLs, so
  there is no way to link to a challenge, deep-link the admin panel, or use the
  browser back button.
- **The ElevenLabs key ships to the browser** in `public/config.js` as
  `window.__EL_KEY__`. Anyone who opens devtools has it. Mitigated today only by
  a dashboard usage cap. This must be proxied before the app is open to the
  whole brokerage.
- **`src/hooks/useScoring.js` contains a full dead copy of the rubric** that is
  never sent anywhere. Two prompts, one live, is a trap for the next person.
- **No error surface.** A scoring failure returns a fabricated result object
  with `score: 0` and "TECHNICAL TIMEOUT" copy. Good instinct for a live stage,
  wrong for production — a real outage should be visible, not scored.
- **No tests, no linter, no CI.** Every change is verified by playing the game.
- **6 Dependabot advisories (2 high)** on `main`, unaddressed.
- **Dead files outnumber live ones.** See the file map in `CLAUDE.md`.

### 4.3 What does not exist at all

No accounts, no persistence, no history, no solo mode, no admin UI, no manager
view, no mobile layout, no rate limiting, no consent notice, no analytics.

---

## 5. Target architecture

```
Browser (React 18 + Vite, react-router)
  |
  |-- /                      Solo practice (default landing after login)
  |-- /login                 Google SSO
  |-- /practice/:categoryId  Solo rep loop
  |-- /challenge/:token      Head-to-head, async
  |-- /gameshow              Live multiplayer, today's experience
  |-- /admin                 Content editor (role: admin)
  |-- /dashboard             Manager view (role: manager | admin)
  |
  v
Vercel serverless /api
  |
  |-- /api/auth/*            Session issue, refresh, logout, /me
  |-- /api/score             Scoring. Unchanged contract, now auth-gated
  |-- /api/voice/speak       NEW. ElevenLabs TTS proxy, key stays server-side
  |-- /api/voice/transcribe  NEW. ElevenLabs STT proxy
  |-- /api/content/*         Categories and objections, read + admin write
  |-- /api/attempts          Record an attempt, read own history
  |-- /api/challenges/*      Create, fetch, answer, resolve
  |-- /api/reports/*         Manager aggregates
  |
  v
Neon Postgres  (see docs/schema.sql)
```

Principles:

1. **No secret reaches the browser.** Anthropic already complies. ElevenLabs
   must be moved. After Phase 10, `public/config.js` should be deletable.
2. **The client never decides authorization.** Role checks happen in the API on
   every request. Hiding a nav link is presentation, not security.
3. **The objection library moves to the database** and is served by the API.
   `src/data/gamePacks.js` becomes a build-time seed, not the runtime source.
4. **Audio is transient.** Recorded, transcribed, discarded. Never written to
   storage, never sent anywhere but the transcription proxy.
5. **The game show keeps working the whole time.** It is used at office
   meetings. Never leave `main` in a state where it cannot run.

---

## 6. Phase 0 — Repo hygiene

**Goal:** a clean tree so later phases are readable in review.

Do:

1. Delete the dead files listed in `CLAUDE.md`. They are in git history if
   anyone ever wants them back.
2. Move `Fireside Chat Questions - For Chris.docx`, `Fireside Chat Talking
   Points - Refined.docx`, and `files.zip` out of the repo. They are event
   leftovers, not code, and belong in the Obsidian vault.

   **Destination corrected 2026-09-02 by Gus.** This project owns its own vault
   project folder at `07 Projects/Beat the Bot App/` — file repo leftovers
   there, not under `07 Projects/Refuel 2026/`. Refuel 2026 was a past event;
   Beat the Bot is now a training application being built for the team and
   possibly for outside subscribers, so it keeps its own project folder.
   The two Fireside Chat documents were already filed under Refuel 2026 as
   `Refuel 2026 - Fireside Chat ... (Confirmed).docx`, so only `files.zip`
   needed a new home.
3. Delete `esbuild.err` and add it to `.gitignore`.
4. Add ESLint and Prettier with a minimal React config. Add `npm run lint`.
5. Add Vitest with one smoke test so the harness exists. Add `npm test`.
6. Add a GitHub Actions workflow running `lint`, `test`, and `build` on pull
   requests to `main`.
7. Run `npm audit` and resolve the 6 Dependabot advisories. If a fix requires a
   major version bump, note it rather than forcing it.
8. Delete the dead `REX_SYSTEM_PROMPT` copy from `src/hooks/useScoring.js` and
   leave a one-line comment pointing at `api/score.js` as the only rubric.

**Acceptance:** `npm run lint && npm test && npm run build` passes clean. The
game still plays start to finish. `git status` is empty. No behavior changed.

---

## 7. Phase 1 — Split `src/App.jsx`

**Goal:** make the codebase workable. Nothing else in this spec is reasonable
until this lands.

This is a **pure refactor. Zero behavior change.** Play the full game before and
after and confirm every beat is identical.

Target structure:

```
src/
  main.jsx
  App.jsx                    router + providers only, under 100 lines
  routes/
    Login.jsx
    Practice.jsx
    Challenge.jsx
    GameShow.jsx             today's phase machine, lifted whole
    Admin.jsx
    Dashboard.jsx
  game/
    phases.js                the PHASE constants
    useGameShow.js           the phase machine + all game state, extracted
    scoring.js               scoreResponse, scoreRound (from useScoring.js)
    rexScript.js             all Rex line banks and getters
  components/
    ScoreBar.jsx
    PlayerCard.jsx
    RouletteReel.jsx
    Particle.jsx
    MicButton.jsx
    ScoreReveal.jsx
    SoundCheck.jsx
  hooks/
    useAudioRecorder.js
    useSpeech.js             wraps the voice proxy
  lib/
    api.js                   single fetch wrapper, auth header, error handling
  styles/
    tokens.css               colors, spacing, type scale, breakpoints
    global.css
    <component>.module.css
```

Sequence that keeps `main` playable at every step:

1. Extract the CSS template literal into `styles/global.css` and
   `styles/tokens.css`. Import them. Verify pixel-identical.
2. Extract the presentational components (`ScoreBar`, `PlayerCard`,
   `RouletteReel`, `Particle`) with their own CSS modules.
3. Extract `PHASE` and `getRotatedOrder` into `game/phases.js`.
4. Extract the Rex line banks from `useScoring.js` into `game/rexScript.js`.
5. Extract the phase machine and game state into `game/useGameShow.js` — the
   hook returns state plus handlers; `routes/GameShow.jsx` renders screens from
   it.
6. Add `react-router-dom`. `App.jsx` becomes routes and providers.
7. Add `lib/api.js` and route every existing `fetch` through it.

Notes on the extraction:

- `PLAYER_COUNT` becomes a prop or config value on the game-show route, not a
  module constant. Roster size becomes a host choice at setup (see Phase 6).
- `abbreviateCoaching` is currently defined and **not applied** to the reveal —
  full coaching is read aloud on purpose. Keep the function only if solo mode
  wants it; otherwise delete it.
- The `API_KEY` const on line 6 of `src/App.jsx` (`VITE_BTB_KEY` /
  `window.__BTB_KEY__`) is a leftover from before the serverless scorer. It is
  unused. Delete it.

**GATE 1 — show Gus the refactored game show running identically before moving
on.** If a beat feels different, it is different.

**Acceptance:** no file over 400 lines. `App.jsx` under 100. Full game show
plays with identical timing, audio, scoring, and visuals. Lint, test, build
clean.

---

## 8. Phase 2 — Authentication

**Goal:** Google SSO restricted to `@eragrizzard.com`, with roles.

**Decision:** Google SSO, domain-restricted. No passwords, no magic links.

Recommended implementation: **Auth.js (NextAuth core) with the Google provider**
on Vercel functions, or Neon Auth if it fits cleanly — Gus's Neon account has
auth tooling available. Either is acceptable. Do not hand-roll OAuth token
exchange.

Requirements:

1. **Domain restriction enforced server-side.** Google's `hd` (hosted domain)
   claim must equal `eragrizzard.com` in the token verification step. Passing
   `hd` as an authorization request parameter is a UI hint only and is trivially
   bypassed — verify the claim, do not trust the hint.
2. **Session as an httpOnly, Secure, SameSite=Lax cookie.** No token in
   `localStorage`. 30-day rolling expiry.
3. **Write a `login_events` row on every successful sign-in.** Gus asked on
   2026-09-14 for a report of who has logged in and how often, and
   `users.last_seen_at` cannot answer it — it holds one timestamp and no
   history. One row per sign-in, no IP and no user agent; see the note in
   `docs/schema.sql`. Keep updating `last_seen_at` as well.
4. **On first successful login, create the user row** with `role = 'agent'`.
   Roles are `agent`, `manager`, `admin`. Only an `admin` can change a role, and
   only through the admin panel.
5. **Seed the first admin** by env var: `BOOTSTRAP_ADMIN_EMAILS`, a
   comma-separated list. Users matching it get `admin` on creation. Gus's
   address `ggrizzard@eragrizzard.com` goes in it.
6. **`office` on the user record** is one of: Mount Dora, Leesburg, Clermont,
   The Villages, Downtown Orlando, Daytona. Google will not supply it. Ask the
   agent once, on a first-login screen, and let an admin correct it. The manager
   dashboard groups by it, so it cannot be null for long.
7. **Every `/api/*` route except the auth callbacks requires a valid session.**
   Add a `withAuth(handler, { role })` wrapper in `api/_lib/auth.js` and use it
   everywhere. `/api/score` included — today it is an open endpoint that spends
   Anthropic credits for anyone who finds it.
8. **A middleware or per-route check gates `/admin` and `/dashboard` by role.**
   The client also hides the nav links, but that is cosmetic.

Login screen design: this is the first thing an agent ever sees. Full-bleed
dark background matching the game aesthetic, the ERA Grizzard white
transparent logo (`public/Era_Logo_White_Transparent.png`), the Beat the Bot
wordmark, one sentence of what it is, and a single "Sign in with Google"
button. No email field, no signup link, no marketing copy. If a non-ERA Google
account tries, show a clear, friendly refusal naming the domain requirement —
not a stack trace.

**Acceptance:** a non-ERA Google account cannot obtain a session, verified by
attempting it. `curl` against `/api/score` without a cookie returns 401. A new
ERA account lands on the office picker, then solo practice. Gus's account has
`admin`.

---

## 9. Phase 3 — Data layer

**Goal:** Neon Postgres holding users, the objection library, and attempts.

Schema is specified in **`docs/schema.sql`** — run it as the initial migration.
API contracts are in **`docs/API-CONTRACTS.md`**.

Do:

1. Create a Neon project (or a dedicated database in the existing Neon account
   — do **not** put this in the MLS or AppFolio database). Set
   `DATABASE_URL` in Vercel for production, preview, and development.
2. Adopt a migration tool. Plain numbered `.sql` files in `db/migrations/` run
   by a small script is enough; Drizzle is fine if you prefer typed queries.
   Whatever you pick, migrations are committed and forward-only.
3. Use `@neondatabase/serverless` for queries from Vercel functions. Pooled
   connection string. Never open a client per request without pooling.
4. **Write a seed script** `db/seed.js` that reads
   `src/data/gamePacks.js` and inserts the 4 categories and 30 objections. This
   is the one-time migration of the content into the database, and it must be
   re-runnable idempotently (upsert on the objection's stable `code`, e.g.
   `SELLER-1`).
5. After seeding, the app reads content from `/api/content/categories`.
   `src/data/gamePacks.js` stays in the repo as the seed source of record and
   as an offline fallback if the content API fails — but it is no longer the
   runtime source.
6. Every query is parameterized. No string interpolation into SQL, ever.

**Acceptance:** migrations run from clean. Seed produces exactly 4 categories
and 30 objections with correct `persona`, `short`, `objection`, `objective`,
and `benchmark` values. Re-running the seed changes nothing. The game show
plays using database content.

---

## 10. Phase 4 — Solo practice mode

**Goal:** the mode that makes this a daily tool. This is the new default route
after login.

Flow:

1. Landing shows the 4 categories as cards with each one's objection count and
   the agent's average score in that category (or "no reps yet").
2. Agent picks a category, or "Surprise me" for any category.
3. Rex gives a short one-line setup — much shorter than the game-show intro.
   Solo mode is about reps per minute, not showmanship. Keep the roulette
   optional and fast, or skip it.
4. The objection is spoken in the challenger voice for that category.
5. Big mic button. Record. Live transcript appears while recording (the game
   show already does this via Web Speech API).
6. Stop. Transcribe. Show the transcript with a "that's my answer" confirm and
   a re-record option — same as the game show, because mis-transcription is
   demoralizing.
7. Score via `/api/score` in single mode. Reveal: overall score, three
   subscores, Rex's roast read aloud, then coaching.
8. Reveal screen offers: **Again** (same category, new objection), **Switch
   category**, **See my progress**.
9. Record the attempt to `attempts` (see schema). Discard the audio blob.

Solo-specific requirements:

- **No repeats until exhausted.** Track which objections the agent has seen and
  serve unseen ones first. Reset the cycle once all 30 are done, and say so.
- **A "streak" counter** for consecutive days with at least one rep. Cheap to
  compute from `attempts`, and it is the single strongest pull-back mechanic.
- **Progress view** (`/practice/progress`): reps total, reps this week, average
  overall, the three subscores as a trend, and the two weakest categories with
  a "drill this" button. Keep it to one screen.
- **Rex must not roast as hard in solo.** In front of a room, a savage line
  lands. Alone on a phone at 9pm, it stings. Pass a `mode: "solo"` flag to
  `/api/score` and add a short addendum to the system prompt: same rubric, same
  9 ceiling, roast dialed to warm and funny rather than savage, coaching
  slightly longer. **Do not change the scoring calibration between modes** — a
  7 must mean the same thing everywhere or the progress view is meaningless.

**GATE 2 — have Gus do ten solo reps on his phone before building anything
else.** Everything downstream depends on this loop feeling good.

**Acceptance:** an agent completes a rep on a phone in under 90 seconds
including scoring. Attempts appear in the database with subscores and coaching.
No audio is persisted anywhere. Objections do not repeat within a cycle.

---

## 11. Phase 5 — Head-to-head challenge

**Goal:** async competition between two agents on the same objection.

Flow:

1. From a solo reveal or a challenge screen, agent A picks "Challenge someone."
2. A picks a category (or the objection they just answered), records their
   answer, and gets a shareable link.
3. The link is `/challenge/:token`. A opaque random token, not a sequential id.
4. Agent B opens the link, must sign in (same ERA Google SSO), hears the same
   objection, records their answer.
5. **Both answers are scored in one batch call** using the existing
   comparative-scoring path — that is exactly what it was built for. Distinct
   scores, no ties, a clear winner.
6. Both agents see the result: both scores, both subscore sets, both
   transcripts, Rex's verdict, and coaching for each.
7. Challenges expire after 7 days unanswered. Show that on the invite.

Requirements:

- **Agent A's answer and score are hidden until B has answered.** Otherwise B
  games it. Enforce server-side; do not include A's transcript in the
  challenge-fetch response before B submits.
- **A cannot re-record after sending.** One shot per side.
- B's identity is whoever signs in on the link. Do not require A to pick a
  named opponent — a link that anyone in the brokerage can take is more fun and
  less awkward. Note whether Gus wants a named-opponent variant later.
- Store both attempts in `attempts` normally, linked by `challenge_id`, so
  challenge reps count toward solo progress.

**Acceptance:** two accounts complete a challenge end to end on two devices.
Scores are distinct with a clear winner. B cannot see A's answer before
submitting, verified by inspecting the network response.

---

## 12. Phase 6 — Live multiplayer game show

**Goal:** preserve today's experience, now signed in and persisted.

This mode already works and is loved. The job is to move it onto the new
foundation without degrading it, not to redesign it.

Changes:

1. Lives at `/gameshow`. Any signed-in agent can host; nothing role-gated.
2. **Roster size becomes a host setting** at setup — 2 to 6 players — replacing
   the `PLAYER_COUNT` constant. Everything already keys off `players.length`,
   so this is a setup input, not a refactor.
3. **Round count becomes a host setting** — 1 to 5, default 3. Today it is
   hardcoded to 3 in `endRound`, the "Round X of 3" label, and the NEXT ROUND
   guard. All three must read the same value.
4. **Contestants can be matched to accounts.** At the register screen, let the
   host either type a free-text name (as today, for guests and for speed) or
   pick an ERA agent from a searchable list. Matched contestants get their
   attempts recorded against their account; typed names do not. Never block the
   game on account matching — at a live event, speed wins.
5. Attempts are written to `attempts` with the `game_session` id.
6. Everything else stays: roulette, blind collection, comparative grading,
   banter during scoring, winner picks the next battlefield, champion reveal.

**Acceptance:** a 3-player, 3-round game plays identically to today. A 5-player,
2-round game plays correctly. Matched contestants' attempts appear in their own
progress view; typed-name contestants produce no orphan rows.

---

## 13. Phase 7 — Admin content panel

**Goal:** Gus and marketing can edit objections without touching code.

Route `/admin`, role `admin`.

Screens:

1. **Categories** — list with objection counts. Create, rename, set emoji,
   set color, set challenger voice id, reorder, retire. Retiring hides a
   category from play without deleting its history.
2. **Objections** — filter by category. Table showing `code`, `short`,
   `persona`, and status. Create and edit with a form covering every field:
   `code`, `persona`, `short` (the reel label), `objection` (the full spoken
   text), `objective`, `benchmark`, and status.
3. **Preview** — a "hear it" button on the editor that speaks the objection
   through the voice proxy in that category's challenger voice. Writing spoken
   copy without hearing it is how you end up with a line that reads fine and
   sounds wrong.
4. **Users** — list ERA accounts with role and office. Change role, correct
   office, deactivate. Guard against an admin removing their own last admin
   role.

Requirements:

- **Objections are versioned, not overwritten.** An `attempts` row references
  the objection version it was scored against, so past coaching stays coherent
  after an edit. Simplest workable approach: soft-version by keeping an
  `objection_versions` table, or store a snapshot of the objection text on the
  attempt row. **The snapshot on the attempt is simpler and sufficient — do
  that** unless Gus asks for full version history.
- **Retire, never hard-delete.** Anything with attempts against it keeps its
  row.
- **Compliance note in the UI.** A short standing line on the objection editor:
  content must stay compliant with Florida license law (Ch. 475) and fair
  housing; no steering on a protected class; no invented market statistics —
  cite Stellar MLS or Florida Realtors SunStats. This is a real brokerage
  obligation, and the editor is where the risk enters.
- Changes take effect on the next content fetch. No deploy required. That is
  the whole point of this phase.

**Acceptance:** Gus adds a new objection through the UI, hears its preview, and
it appears in solo practice without a deploy. An edit to an existing objection
does not change the text shown on a past attempt.

---

## 14. Phase 8 — Manager dashboard

**Goal:** a manager can see who is training and where the team is weak.

Route `/dashboard`, roles `manager` and `admin`.

Content, in priority order:

1. **Team summary** — active agents this week, total reps, average overall
   score, and the trend against the prior week.
2. **Weakest categories across the team** — average score by category, worst
   first. This is the most actionable number on the page: it tells a manager
   what to run at the next office meeting.
3. **Agent table** — name, office, reps (7-day and all-time), average overall,
   the three subscore averages, last active. Sortable. Click through to one
   agent's detail.
4. **Agent detail** — the same progress view the agent sees, plus their recent
   attempts with transcript and coaching.
5. **Office filter.** A manager sees their own office by default; an admin sees
   all six and can filter.
6. **Adoption panel** — **added 2026-09-14 at Gus's request.** Backed by
   `GET /api/reports/usage`. Who has signed in, how many times, first and last
   login, and days active. Most importantly, **the list of agents who have
   never signed in at all** — rollout succeeds or fails on that list, and it is
   invisible in any average. Sign-in counts come from `login_events`, written
   by the auth callback in Phase 2.

   Keep sign-ins and reps as separate columns. Logging in five times in a day
   is one use of the tool, not five; `daysActive` is the honest habit measure.
   Do not blend them into a single "engagement" number.

Requirements:

- **Scope by office server-side.** A manager's queries are filtered to their
  own office in the API, not in the UI. This is agent performance data.
- **No exports in this phase.** Individual agent scores are personnel-adjacent.
  Per the ERA Grizzard data rules, nothing leaves the app — no CSV, no email
  digest, no HubSpot push — without Gus explicitly asking for it.
- Aggregate queries need indexes; see `docs/schema.sql`.
- Show a low-data state honestly. With three agents and nine reps, say so
  rather than drawing a confident trend line.

**Acceptance:** a manager account sees only their office. An admin sees all six
and can filter. Numbers reconcile against a direct SQL count.

---

## 15. Phase 9 — Mobile-first pass

**Goal:** the phone is the primary device for solo and challenge modes.

The current CSS was built for a projector at 1920x1080. It has to work at
390x844 without a horizontal scrollbar.

Do:

1. Establish breakpoints and tokens in `styles/tokens.css`. Mobile base,
   `min-width: 768px` for tablet, `min-width: 1200px` for the stage.
2. **Solo and challenge are mobile-first.** Design at 390px, scale up.
3. **The game show stays desktop-first** — it runs on a laptop into a TV. Give
   it a graceful mobile fallback: a clear "this mode needs a bigger screen"
   message beats a broken layout.
4. **Mic button large and thumb-reachable** in the bottom third of the screen.
   Recording state must be unmistakable at arm's length in a car.
5. Respect safe-area insets. Test with the iOS keyboard open on the office
   picker and any text input.
6. **Test audio on real iOS Safari early.** iOS requires a user gesture before
   audio playback, blocks autoplay, and interrupts `MediaRecorder` on a phone
   call or app switch. `MediaRecorder` webm/opus support on Safari is
   inconsistent — check the actual mime type the browser gives you and pass the
   right filename and content type to the transcription proxy. This is the most
   likely source of a "works on my Mac, silent on my phone" bug.
7. Honor `prefers-reduced-motion` — kill the particles and the reel spin. Some
   agents will get motion sick otherwise.
8. Landscape orientation on a phone should not break the reveal screen.

**Acceptance:** a full solo rep completes on a real iPhone in Safari and a real
Android in Chrome, audio in and out, no horizontal scroll on any screen, mic
button reachable one-handed.

---

## 16. Phase 10 — Production hardening

**Goal:** safe to open to all six offices.

1. **Move the ElevenLabs key server-side.** Add `/api/voice/speak` and
   `/api/voice/transcribe` that proxy to ElevenLabs with the key from
   `ELEVENLABS_API_KEY`. Stream the TTS response through rather than buffering
   the whole clip — latency is the difference between a game show and a loading
   screen. Then delete `window.__EL_KEY__`, delete `public/config.js`, and
   remove it from `.gitignore`. **Rotate the ElevenLabs key after this ships**;
   the old one has been in a public browser bundle.
2. **Rate limit** `/api/score`, `/api/voice/*`, and `/api/challenges` per user.
   These cost money per call. A per-user token bucket in Postgres or Vercel KV
   is enough. Return 429 with a friendly Rex-voiced message.
3. **Replace the fake-score fallback with real error handling.** A scoring
   outage must show "we could not score that — try again," never a `score: 0`
   row in the database. Do not persist unscored attempts as scored ones.
4. **Structured server logging** on every API route: route, user id, latency,
   outcome. Never log a key, a full transcript, or an agent's answer text.
5. **Consent and privacy notice.** One short screen at first login: the app
   records your voice to transcribe it, the audio is discarded immediately, the
   transcript and score are saved, and your manager can see your scores. Say it
   plainly. Get an acknowledgment and store the timestamp on the user row.
6. **Accessibility pass.** Keyboard reachable, focus visible, ARIA live region
   announcing phase changes and scores, 4.5:1 contrast minimum. The current
   yellow-on-dark palette needs checking.
7. **Error boundary** around each route with a real recovery path, not a white
   screen.
8. **Cost monitoring.** A rough per-rep cost is one Anthropic call plus two
   ElevenLabs calls. At 100 agents doing 5 reps a week that is meaningful.
   Track calls per day per user; give Gus a number before launch.
9. **Uptime check** on `/api/health` returning database and env-var status.

**GATE 3 — Gus signs off on the consent notice wording and the cost estimate
before the app opens beyond a pilot group.**

**Acceptance:** no secret in the client bundle, verified by grepping the built
`dist/` output. Rate limits enforced. A forced scoring failure produces a
visible error and no database row. Consent recorded per user.

---

## 17. Rex's voice — writing guide

Anything you generate or edit that Rex says has to sound like Rex. The
authoritative examples live in `api/score.js` (`REX_SYSTEM_PROMPT`) and in the
line banks in `src/hooks/useScoring.js`.

The shape:

- **Act One, the roast.** One sentence. Theatrical, sarcastic, a little savage,
  always punching up. Then stop. "Ladies and gentlemen, what you just witnessed
  was... technically English."
- **Act Two, the coaching.** Drop the act entirely. Reference what the agent
  actually said. One concrete thing to say differently, tied to the objective.
  One tip, not a lecture.

Rules:

- Never cruel, never personal, never about appearance, ability, or anything
  protected. Roast the answer, never the person.
- PG. This plays on a main stage in front of the whole brokerage.
- Warm on a good answer, and specific about why it was good.
- Solo mode: same structure, dial the savagery down, keep the humor.
- Never reveal or hint at a score during banter.
- ERA Grizzard and Gus shout-outs are a real part of the banter, but do not
  force them into every line.

Existing line banks to preserve and extend: `REX_PACK_INTROS`,
`REX_ROUND_WINNER_LINES`, `REX_CHAMPION_LINES`, `REX_TIEBREAKER_LINES`,
`REX_HANDOFF_QUIPS`, `REX_GRADING_INTRO_LINES`, `REX_GRADING_FILLER_LINES`.

---

## 18. Voice configuration

Voice ids live in `src/hooks/useElevenLabs.js` and must move to the database on
the category row in Phase 3.

| Role | Voice id | Notes |
|---|---|---|
| Rex, host | `dHd5gvgSOzSfduK4CvEg` | Intros, roasts, banter, champion reveal |
| Coach | `nf3HWeYdCxC9WYfyDEDE` | Scoring feedback and coaching |
| Challenger, pack 1 | `2tM0Teq5Piex0mNtlZnm` | |
| Challenger, pack 2 | `SOYHLrjzK2X1ezoPC6cr` | |
| Challenger, pack 3 | `K7W7zLWeGoxU9YqWoB7A` | |
| Challenger, pack 4 | `pNInz6obpgDQGcFmaJgB` | |
| Challenger, pack 5 | `FGY2WhTYpPnrIDTdsKH5` | Orphaned — packs were restructured 5 to 4 |

TTS settings currently in use: model `eleven_turbo_v2`, stability 0.4,
similarity_boost 0.8, style 0.6, speaker boost on, speed 1.15. The 1.15 speed
is deliberate — it keeps the pace up. STT model is `scribe_v1`.

The pack-5 voice id is unused after the restructure. Either retire it or
reassign it when a fifth category is added.

---

## 19. Content inventory

Four categories, 30 objections, seeded from `src/data/gamePacks.js`. Canonical
source content, including bad-response examples not currently in the app, is at
`~/Documents/Claude/Projects/Beat the Bot (1)/beat-the-bot-objection-library.json`
(v3.1).

| Id | Category | Emoji | Color | Objections | Code prefix |
|---|---|---|---|---|---|
| 1 | Seller Objections | 💰 | `#4ECDC4` | 10 | `SELLER-` |
| 2 | Buyer Objections | 🔑 | `#F97316` | 7 | `BUYER-` |
| 3 | Lead Conversion | 🎯 | `#FFD700` | 6 | `LEADCONV-` |
| 4 | FSBO & Expired | 🏠 | `#A78BFA` | 7 | `FSBOEXP-` |

Each objection carries: `id` (the stable code), `persona`, `short` (reel
label), `objection` (the full in-character spoken text), `objective`, and
`benchmark`.

The JSON library also holds bad-response examples per scenario. They are not
used today. They would make a good few-shot addition to the scoring prompt if
calibration ever drifts — worth knowing they exist.

---

## 20. Non-goals

Do not build these without an explicit ask from Gus:

- Audio storage or playback of agent answers
- Leaderboards, public rankings, or anything that names the lowest scorer
- Manager-assigned drills with due dates
- HubSpot (portal 481286), Airtable, Slack, or Dotloop integration
- Email or SMS notifications of any kind. If this ever comes up, A2P 10DLC and
  CAN-SPAM apply, opt-out language is required, and consent records must be
  honored.
- Native iOS or Android apps
- Multi-brokerage tenancy or reselling the tool
- Any export of individual agent scores

---

## 21. Open questions for Gus

Ask before building the phase that depends on the answer.

1. **Manager scope (Phase 8).** Should a manager see only their own office, or
   all six? Spec assumes own office only, admin sees all.
2. **Who is a manager?** Names or emails for the initial `manager` role
   assignments, per office.
3. **Challenge opponents (Phase 5).** Open link anyone can take, or must A name
   B? Spec assumes open link.
4. **Guest contestants (Phase 6).** At a live event, should typed-name
   contestants be allowed at all, or must everyone be a matched account? Spec
   allows typed names for speed.
5. **Objection versioning (Phase 7).** Snapshot on the attempt, or full version
   history? Spec assumes snapshot.
6. **Solo roast intensity (Phase 4).** Confirm Rex should be gentler alone than
   on stage.
7. **Custom domain.** Stay on `beat-the-bot-2.vercel.app` or move to something
   like `beatthebot.eragrizzard.com`? A branded domain matters if this goes to
   all six offices.
8. **Pilot group.** Which office or which agents get it first?
9. **Budget ceiling.** A monthly number for Anthropic plus ElevenLabs so rate
   limits can be set against something real.

---

## 22. Definition of done

The app is production-ready when all of these are true:

- [ ] An ERA Grizzard agent signs in with Google on their phone, with no
      account setup, and a non-ERA account cannot get in
- [ ] Solo practice: a full rep in under 90 seconds including scoring
- [ ] Progress view shows reps, average, subscore trend, and weakest categories
- [ ] Head-to-head challenge works end to end across two devices, with agent
      A's answer hidden until B submits
- [ ] The live game show plays exactly as it did at Refuel 2026, with
      configurable roster and round count
- [ ] Gus adds and edits objections through the admin panel with no deploy
- [ ] A manager sees their office's reps, averages, and weakest categories
- [ ] No API key of any kind appears in the built client bundle
- [ ] No audio is stored anywhere; transcripts and scores are
- [ ] Rate limits enforced on every paid endpoint
- [ ] A scoring outage shows a real error and writes no scored row
- [ ] Consent acknowledged and timestamped per user
- [ ] `npm run lint && npm test && npm run build` green in CI on every PR
- [ ] Zero Dependabot advisories on `main`
- [ ] Verified on real iOS Safari and real Android Chrome

---

## 23. Risks and traps

| Risk | Why it bites | Handling |
|---|---|---|
| iOS audio | Gesture-gated playback, autoplay blocks, inconsistent `MediaRecorder` mime types, interruption on app switch | Test on a real iPhone in Phase 4, not Phase 9. Read the actual mime type and pass matching filename and content type to transcription. |
| Scoring cost | One Anthropic call plus two ElevenLabs calls per rep, times 100 agents | Rate limit per user in Phase 10. Give Gus a per-rep cost before launch. |
| Calibration drift | Any prompt edit can quietly move the meaning of a 7 and invalidate every stored score | Only touch the rubric deliberately. Keep a fixed set of sample answers and re-score them after any prompt change. |
| Refactor regression | The game show is a timing-sensitive audio state machine with no tests | Phase 1 is a pure refactor with a full manual playthrough before and after. GATE 1 exists for this. |
| Transcription errors | A misheard answer scores badly and the agent blames the tool | Keep the confirm-and-re-record step in every mode. Never score without confirmation. |
| Exposed ElevenLabs key | Already shipped in a public bundle | Cap it in the dashboard today. Proxy in Phase 10 and rotate the key. |
| Vercel git link | Broke silently once on the org transfer; two months of pushes did not deploy | After any repo or org change, confirm a push actually produced a deployment. |
| Wrong model name | This account lacks `claude-sonnet-4-20250514`; a wrong name 404s the scorer | `claude-sonnet-4-6` is the working default. List account models with `GET https://api.anthropic.com/v1/models` if it ever 404s. |
| Fair housing in content | The admin panel lets a non-developer write objection copy | Standing compliance note in the editor. Broker review for anything contract-adjacent. |
| Personnel data | Agent scores are performance data across six offices | Office-scoped server-side. No exports without an explicit ask. |

---

## 24. Reference

- Repo: `github.com/ERA-Grizzard-Real-Estate/beat-the-bot`
- Live: `https://beat-the-bot-2.vercel.app`
- Local working copy: `~/Downloads/beat-the-bot 2/`
- Canonical objection library:
  `~/Documents/Claude/Projects/Beat the Bot (1)/beat-the-bot-objection-library.json`
- **Vault home for these docs:**
  `/Users/2018mac/Documents/Grizzard 🧠/07 Projects/Beat the Bot App/`
  Contains readable mirrors of all four handover docs plus
  `Beat the Bot App — Project Hub.md`, the plain-English project overview.
  The repo copies are authoritative; the vault notes are the mirror.
  Never write to the iCloud vault `ERA Grizzard 🧠` — it is being disconnected.
- Event wrapper docs: Obsidian vault, `07 Projects/Refuel 2026/`
- This spec's companions: `docs/schema.sql`, `docs/API-CONTRACTS.md`, `CLAUDE.md`
- Changelog: `CHANGELOG.md`
