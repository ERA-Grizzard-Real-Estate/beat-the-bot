# CLAUDE.md — Beat the Bot

Context for Claude Code working in this repo. Read this first, then the
handover docs:

- `docs/PRODUCTION-HANDOVER.md` — the build plan. Current-state audit, target
  architecture, 11 phases with acceptance criteria, open questions, risks.
- `docs/schema.sql` — Neon Postgres schema, run as migration 0001.
- `docs/API-CONTRACTS.md` — every endpoint's request and response shape.

**Vault mirror.** These four docs are also saved as readable notes in Gus's
Obsidian vault at:

```
/Users/2018mac/Documents/Grizzard 🧠/07 Projects/Beat the Bot App/
```

That folder is this project's own vault project folder — file anything that
belongs to Beat the Bot there, not under `07 Projects/Refuel 2026/`, which is a
past event. The `Beat the Bot App — Project Hub.md` note in that folder is the
plain-English project overview. **The repo copies are authoritative** — edit here, then tell
Gus so the vault mirror can be re-synced. Never treat a vault note as the spec
of record, and never write to the iCloud vault `ERA Grizzard 🧠`, which is
being disconnected.

## What this is

Beat the Bot is a voice-driven objection-handling trainer for ERA Grizzard Real
Estate agents. An AI game-show host named **Rex** reads a real estate objection
aloud, the agent answers into a microphone, and Claude scores the answer 1-9
with a roast plus coaching.

It debuted 2026-06-18 as a main-stage segment at the Refuel 2026 event and now
needs to become a real production application that agents use on their own.

Mission framing for any copy you write: ERA Grizzard exists to make agents
happier, healthier, and wealthier. Six Central Florida offices — Mount Dora,
Leesburg, Clermont, The Villages, Downtown Orlando, Daytona.

## Stack

- React 18 + Vite 8, no router, no state library, no TypeScript
- Styling: one giant template-literal CSS string at the bottom of `src/App.jsx`
  (the `CSS` const, ~550 lines) injected into a `<style>` tag
- Serverless: Vercel functions in `/api` (Node, ESM `export default handler`)
- Voice: ElevenLabs TTS + STT (`scribe_v1`) **behind `/api/voice/*`**, browser Web Speech API fallback
- Scoring: Anthropic Messages API, model `claude-sonnet-4-6`
- Host: Vercel project `beat-the-bot-2`, `https://beat-the-bot-2.vercel.app`
- Repo: `github.com/ERA-Grizzard-Real-Estate/beat-the-bot`, deploys on push to `main`

## Commands

```bash
npm install
npm run dev        # Vite dev server. /api routes do NOT run — use `vercel dev` for those
npm run build      # production build to dist/
npm run preview    # serve the build
vercel dev         # dev server WITH /api serverless functions

npm run lint       # ESLint 9, flat config in eslint.config.js
npm run lint:fix   # ESLint with --fix
npm run format     # Prettier write
npm test           # Vitest, single run
npm run test:watch # Vitest, watch mode
```

Lint, test, and build also run in CI on every pull request to `main`
(`.github/workflows/ci.yml`), on **Node 24** — Vitest 5 requires Node
`^22.12 || ^24 || >=26`, and 24 matches the Vercel project. `npm run lint` currently exits clean with **3
deliberate warnings** from the React Compiler rules in `src/App.jsx`; they are
deferred to Phase 1 because fixing them changes runtime behavior. Do not
silence them.

## File map — current state

Active:

| Path | What it is |
|---|---|
| `src/main.jsx` | React root, renders `App` in StrictMode |
| `src/App.jsx` | **The entire application.** 1686 lines. Phase machine, all 14 screens, all game logic, all CSS |
| `src/hooks/useElevenLabs.js` | `speakText`, `stopSpeaking`, `transcribeAudio`, voice IDs |
| `src/hooks/useScoring.js` | Rex script lines + `scoreResponse`, `scoreRound`, `getRexBanter` (thin fetch wrappers over `/api/score`) |
| `src/data/gamePacks.js` | `GAME_PACKS` — 4 categories, 30 objections. Generated from the JSON library, not hand-authored |
| `api/score.js` | Serverless scorer. Holds the live rubric. Three modes: single, batch, banter |
| `api/voice/speak.js` | ElevenLabs TTS proxy. **Holds the only copy of the voice IDs** and resolves a role to one |
| `api/voice/transcribe.js` | ElevenLabs STT proxy. Raw audio in, transcript out, audio discarded |
| `index.html` | Loads `/src/main.jsx`. Google Fonts: DM Sans, DM Mono, Space Grotesk |
| `.env.example` | Names the three env vars. Copy to `.env.local` for `vercel dev` |
| `vercel.json` | SPA rewrite, everything but `/api/*` to `index.html` |
| `vite.config.mjs` | Vite config. `.mjs` so Vite 8 loads it as ESM |

Also active:

| Path | What it is |
|---|---|
| `eslint.config.js` | ESLint 9 flat config. Separate blocks for `src/` (browser), `api/` (Node), configs and tests |
| `vitest.config.mjs` | Vitest, jsdom environment. `.mjs` so Vite 8 loads it as ESM |
| `test/gamePacks.test.js` | Smoke test guarding the objection library's shape |
| `.github/workflows/ci.yml` | Lint, test, build on pull requests to `main` |

**Dead code: cleared in Phase 0 (2026-09-02).** The stale root `App.jsx` and
`useElevenLabs.js`, `src/BeatTheBot*.jsx`, the unused `Home` / `Result` /
`Scoreboard` / `Select` / `Setup` screens and their `.module.css` files,
`src/data.js`, `src/voice.js`, `src/hooks/App.jsx`,
`src/data/gamePacks.backup.js`, and `esbuild.err` were all deleted. They remain
in git history. `files.zip` and the two `.docx` event leftovers were moved out
to the Obsidian vault. Do not restore any of them.

Note `src/index.css` is **live** — `src/main.jsx` imports it. It was never dead.
`public/Era_Logo_White.png` is unreferenced (only the `_Transparent` variant is
used, at `src/App.jsx:624`) but was left in place pending Gus's call.

## Conventions that matter

- **Voice IDs live server-side, in `api/voice/speak.js`, and nowhere else.** The
  client sends a role — `rex`, `coach`, or `character` plus a `packId` — and the
  server resolves it. Do not add a client-side copy; that is the same trap the
  duplicated rubric was.
- **Rex's voice is the product.** Theatrical, savage but punching up, never
  cruel, PG. One-sentence roast, then real coaching. Never write flat corporate
  copy into a Rex line.
- **Scoring lives in `api/score.js`, and now only there.** The dead
  `REX_SYSTEM_PROMPT` copy in `src/hooks/useScoring.js` was deleted in Phase 0;
  a one-line comment points at the server file. Never reintroduce a client-side
  copy of the rubric.
- **9 is the hard ceiling. Never award a 10.** 7-8 is the normal landing spot
  for a solid answer, 8-9 for excellent. This is deliberate calibration, tuned
  live at the event. Do not "fix" it.
- Scoring weights: objective 40%, tone 30%, language 30%.
- Batch (head-to-head) scoring forces distinct scores with no ties, anchored at
  the top and stepping down (9/7/5, not 6/5/4).
- Phase transitions are `await`ed against TTS completion. `speakText` resolves
  its promise on `onended`, `onerror`, **and** on `stopSpeaking()` — that last
  one is what makes the skip button work. Any new audio path must preserve it or
  the game hangs.
- Every `PLAYER_COUNT`-dependent thing keys off `players.length`. `PLAYER_COUNT`
  in `src/App.jsx` is the single knob for roster size. Currently 3.
- The game runs 3 rounds. `endRound` ends at `nextRound >= 3`. Note line ~65 has
  an unrelated `score >= 4` color threshold — do not confuse the two.

## Secrets

- `ANTHROPIC_API_KEY` — Vercel env var only, read by `/api/score`. Never in the
  client bundle, never in a committed file.
- `SCORING_MODEL` — optional Vercel env var. Defaults to `claude-sonnet-4-6` in
  code. This account does **not** have `claude-sonnet-4-20250514`; a 404 from
  the scorer means a wrong model name.
- `ELEVENLABS_API_KEY` — Vercel env var only, read by `api/voice/speak.js` and
  `api/voice/transcribe.js`. **Never in the client bundle.** Fixed 2026-09-09;
  it used to ship to the browser via `public/config.js`.
- `public/config.js` is **obsolete**. Nothing loads it — the script tag is gone
  from `index.html`. It is git-ignored and also in `.vercelignore`, because a
  real static `/config.js` would win over the SPA rewrite and be publicly
  readable. Delete your local copy once the key is in Vercel. Never recreate it.

Never print a key value into chat, a commit, or a log line.

## Deploy

Push to `main`. Vercel auto-builds in ~10-20 seconds.

```bash
git commit -am "message" && git push
```

The local `vercel` CLI token has been expiring; `vercel --prod` may fail with
"The specified token is not valid" until `vercel login` is run. Prefer the git
push path.

History note: the repo transfer from `ggrizzard/beat-the-bot` to the org broke
the Vercel git link once and pushes silently stopped deploying for two months.
If a push does not produce a deployment, check Vercel Settings -> Git before
assuming the build failed.

Dependency advisories: **none. `npm audit` reports 0 vulnerabilities** as of
2026-09-09, after the vite 8 / vitest 5 upgrade cleared the last 5. See
`CHANGELOG.md` 2026-09-09.

**Dependabot bumps to `vite`, `vitest`, or `@vitejs/plugin-react` must move
together in one commit.** Vitest peers on a narrow vite range, so a solo bump
fails at `npm install` with `ERESOLVE` and the preview deployment errors. A
green Vercel check does not clear a bot PR either — Vercel runs `npm install`,
CI runs `npm ci` against the lockfile, and only CI catches a stale lockfile.

## Guardrails

- This app is agent-facing training material for a licensed real estate
  brokerage. Objection content must stay compliant with Florida license law
  (Ch. 475) and fair housing. Do not generate objection or coaching content
  that steers on a protected class. Flag anything contract-adjacent for broker
  review rather than writing it as settled advice.
- Do not invent market statistics in objection content. Cite Stellar MLS or
  Florida Realtors SunStats when a figure is needed.
- Confirm with Gus before any push to HubSpot (portal 481286), Airtable, Slack,
  or any external system. This app does not currently touch any of them.
- Agent names and scores are personnel-adjacent. Do not add anything that
  emails, posts, or exports individual agent scores without an explicit ask.

## Working style

- Commit messages: imperative, one line, no scope prefix. Match the existing log
  ("Set contestant roster to 3 players", "Cap scores at 9 — never award a 10").
- Update `CHANGELOG.md` for anything a person would notice.
- Prefer editing `src/App.jsx` surgically over rewriting it, until Phase 1 of the
  handover spec splits it up on purpose.
