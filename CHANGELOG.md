# Beat The Bot — Changelog & Ops Notes

## 2026-09-09 (voice moved server-side — Phase 10, partial)

**Rex can speak on the deployed site for the first time.** Requires
`ELEVENLABS_API_KEY` to be set in Vercel.

### The bug this fixes

`index.html` loaded `/config.js`, which set `window.__EL_KEY__`. That file is
git-ignored and had **never been committed**, so no Vercel build ever contained
it. `vercel.json` rewrites every non-`/api/` path to `index.html`, so
`/config.js` returned HTML with a `200`, the browser parsed HTML as JavaScript,
and production threw `SyntaxError: Unexpected token '<'` on every load.
`window.__EL_KEY__` was `undefined`, so the deployed app was silent. It worked
on a laptop only because the file exists there on disk — which is why Refuel ran
from one machine.

### What changed

- Added `api/voice/speak.js` and `api/voice/transcribe.js`. The ElevenLabs key
  is now a server-only env var, `ELEVENLABS_API_KEY`.
- **Voice IDs moved server-side too.** The client sends a role, not an id.
  Accepting a caller-supplied id would have made the endpoint an open proxy to
  any voice on the account. `api/voice/speak.js` is now the only copy of the
  mapping, and `test/voiceProxy.test.js` pins it.
- Removed the `<script src="/config.js">` tag from `index.html`. That alone
  clears the production console error.
- `src/hooks/useElevenLabs.js` no longer contains a key, a voice id, or an
  elevenlabs.io URL. Verified against the built bundle.
- `public/config.js` added to `.vercelignore`. It is obsolete, but a CLI deploy
  from a machine that still has it would publish a real static `/config.js`
  that beats the SPA rewrite and is publicly readable.
- Audio stays transient: read into memory, forwarded, dropped. Never stored.
- The browser Web Speech API fallback is unchanged, so a voice outage degrades
  instead of blocking the game.

### Verified

18 tests pass, including that the key never appears in a response and that
upstream ElevenLabs errors are not forwarded to the browser. The game was
driven from splash through registration, category select, the roulette, and
into the answer phase with the proxy returning 404 the whole way: every phase
advanced, nothing hung, and the failures logged cleanly. That is the
`speakText` skip contract holding.

**Still to verify with a real key:** actual audio playback and a real
transcription. Neither can be exercised without `ELEVENLABS_API_KEY` set.

## 2026-09-09 (build toolchain — vite 8, vitest 5)

Dependency upgrade only. **No application behavior changed**; the game plays
exactly as it did before.

- `vite` 5.4 -> 8.2, `@vitejs/plugin-react` 4.3 -> 6.1, `vitest` 2.1 -> 5.0.
- **All npm advisories are now cleared: `npm audit` reports 0 vulnerabilities.**
  The 5 that Phase 0 deferred all traced to `vite@5` -> `esbuild<=0.24.2`.
- Renamed `vite.config.js` -> `vite.config.mjs` and `vitest.config.js` ->
  `vitest.config.mjs`. Vite 8 warns when it loads ESM config as CommonJS. The
  alternative fix, `"type": "module"` in `package.json`, would also change how
  Node interprets `api/score.js` in production, so the configs were renamed
  instead to keep the change away from the serverless path.
- CI Node bumped 20 -> 24. **Vitest 5 requires Node `^22.12 || ^24 || >=26`**,
  so the old pin could not have run the tests. 24 matches the Vercel project.

### Why this landed now

Dependabot opened PR #5 bumping vitest 2.1.9 -> 5.0.0 on its own. Vitest 5
peers on `vite ^6.4 || ^7 || ^8`, the repo was on vite 5, and the preview
deployment failed with `ERESOLVE` at `npm install`. Bumping vitest alone can
never succeed; vite and the React plugin have to move in the same commit.
That supersedes Dependabot PRs #1, #3, and #5.

Verified: `npm run lint && npm test && npm run build` passes, bundle size
unchanged (240.16 kB vs 240.46 kB), and the app was driven in a browser from
splash through registration to category select with no console errors. The
scoring and voice loop past that point still needs live keys and was not
exercised.

## 2026-09-02 (Phase 0 — repo hygiene)

Housekeeping only. **No application behavior changed**; the game plays exactly
as it did before.

- Deleted 19 dead files — the stale root `App.jsx` and `useElevenLabs.js`, the
  unused `src/BeatTheBot*.jsx` / `Home` / `Result` / `Scoreboard` / `Select` /
  `Setup` screens and their CSS modules, `src/data.js`, `src/voice.js`,
  `src/hooks/App.jsx`, `src/data/gamePacks.backup.js`, and `esbuild.err`. All
  recoverable from git history.
- Moved `files.zip` to the Obsidian vault at `07 Projects/Beat the Bot App/`.
  The two Fireside Chat `.docx` files were already filed under
  `07 Projects/Refuel 2026/` as the "(Confirmed)" copies, so they were dropped
  from the repo rather than duplicated.
- Removed the dead `REX_SYSTEM_PROMPT` copy from `src/hooks/useScoring.js`.
  **`api/score.js` is now the only rubric in the repo.**
- Removed dead symbols from `src/App.jsx`: the unused `getRexTiebreaker`
  import, the vestigial `API_KEY` const (scoring moved server-side long ago),
  and the unused `abbreviateCoaching` helper. `roundHistory` and `pendingBlob`
  are write-only state — the setters still run, so the state was kept and the
  unread binding renamed to `_roundHistory` / `_pendingBlob` rather than
  deleted, which would have removed a `setState` call and changed rendering.
- Added ESLint 9 (flat config), Prettier, and Vitest. New scripts: `npm run
  lint`, `npm run format`, `npm test`.
- Added `.github/workflows/ci.yml` — runs lint, test, and build on pull
  requests to `main`.
- Added `test/gamePacks.test.js`, guarding the objection library's shape:
  4 categories, 30 objections, required fields present, ids unique.

### Known issues left open

- **3 ESLint warnings** in `src/App.jsx` from the React Compiler rules
  (`set-state-in-effect` at the `ScoreBar` width animation,
  `preserve-manual-memoization` at `handleSkip`, `purity` for the `Math.random`
  objection pick during render). Each is a real observation, but every fix
  changes runtime behavior, which Phase 0 forbids. Address in Phase 1 when
  `src/App.jsx` is split up.
- **5 npm advisories remain** (3 moderate, 1 high, 1 critical), all in the dev
  build toolchain, none shipped to users. `npm audit fix` cleared the
  pre-existing `browserslist`, `nanoid`, and `postcss` advisories. The rest all
  trace to `vite@5` -> `esbuild<=0.24.2`, and the only fix is `vite@8` plus
  `vitest@4` — three majors on the app's build tool. Per the Phase 0
  instruction, noted rather than forced. The `critical` is Vitest's UI server
  (`@vitest/ui` is not installed and `--ui` is never run) and the `esbuild`
  advisory affects the dev server only, so neither is reachable in production.

## 2026-06-17 (scoring calibration)

- Recalibrated the live rubric in `api/score.js` — these are judged as **live,
  spoken** answers. Removed the "benchmark is a 9-10 most won't clear" framing
  that was capping scores at ~6-7.
- New bands: **7-8 = solid (normal landing), 8-9 = excellent.** Strong answers
  are no longer capped at 7.
- **Hard ceiling of 9 — never award a 10** (overall or any sub-dimension).
- Head-to-head pass anchors at the TOP and steps down (e.g., 9/7/5) so it spreads
  for a clear winner without dragging everyone into the low end.
- Tune scoring ONLY in `api/score.js` (`REX_SYSTEM_PROMPT` + COMPETITION-MODE
  addendum); the `src/hooks/useScoring.js` copy is unused.

## 2026-06-17 (event config) — 5 contestants, 3 rounds

- `PLAYER_COUNT = 5` in `src/App.jsx`.
- Game runs **3 rounds**: `endRound` ends at `nextRound >= 3`; "Round X of 3"
  sub and the NEXT ROUND button guard (`currentRound < 3`) updated to match.
- Rex now announces each contestant **by name** before the roast/score/coaching
  (`${resp.playerName}...` prefix in `gradeOne`).

## 2026-06-17 (later) — scoring live + game polish

### Scoring is live
- The 401s were a stale/bad key value; the 404 was a bad model id. This account
  does **not** have `claude-sonnet-4-20250514`. Working model: **`claude-sonnet-4-6`**
  (now the code default in `api/score.js`; `SCORING_MODEL` still overrides).
- Set the key cleanly from the terminal to avoid paste errors:
  `printf %s "$KEY" | vercel env add ANTHROPIC_API_KEY production` → `vercel --prod`.
- Verify: `curl .../api/score` → JSON with a real `score`. `401` = bad key,
  `404`/not_found = bad model (`GET /v1/models` lists what the account can use).

### Comparative (head-to-head) scoring — fixes score clustering
- A round's answers are now graded **together in one `/api/score` call**: send
  `{responses:[{playerName, playerResponse}, ...], objection, persona, objective, benchmark, packName}`,
  get back `{results:[...]}` in the same order. The model is required to give
  distinct, spread-out scores with a clear winner (no ties).
- Client: `scoreRound()` in `src/hooks/useScoring.js`; called once from
  `startGrading` in `App.jsx`, then `gradeOne` reveals from the precomputed
  array. Falls back to per-answer `scoreResponse` if the batch call fails.

### Game-flow polish
- **Shorter Rex transitions** — player intro, the four pack intros, grading
  intro, and round-winner lines trimmed to one line each (keeps a 5-contestant
  game moving). The roast / score line / coaching judgment is unchanged.
- **Full coaching read aloud** — removed the `abbreviateCoaching` cap so Rex
  reads the entire `coaching` paragraph (not the on-screen emoji bullets).
- **Grading-time banter → live improv** — `getRexBanter()` calls `/api/score`
  with `mode:"banter"` (temperature 1, sends contestant names + category) so Rex
  **improvises a fresh stall line every scoring break** — never the same twice,
  with occasional ERA Grizzard / Gus shout-outs. Generated in the background
  during the grading intro so it overlaps the wait. `getRexGradingFiller()`
  (canned lines) is the fallback if the improv call fails. To constrain it
  (always mention Gus, cap length, ban a topic), edit `banterSystem` in
  `api/score.js`. An earlier "game-show music" idea was removed in favor of this.

## 2026-06-17 — pre-Refuel overhaul (commit 5bde5c7)

### Gameplay & content
- **Categories: 5 packs → 4.** Now Seller Objections (10), Buyer Objections (7),
  Lead Conversion (6), FSBO & Expired (7). Defined in `src/data/gamePacks.js`,
  generated from the canonical library at
  `~/Documents/Claude/Projects/Beat the Bot (1)/beat-the-bot-objection-library.json` (v3.1).
- **All 30 objections elaborated.** Each round now carries both:
  - `short` — a quick reel hook shown while the roulette spins, and
  - `objection` — the full, in-character spoken objection Rex/the challenger voice reads.
- **Objection roulette.** Flow is now: tap category → Rex announces the category
  (`REX_INTRO`) → slot reel spins and lands on the chosen objection (`ROULETTE`) →
  objection read (`OBJECTION`). The reel is visual only — the round is already
  chosen in `handleSelectPack`. Component: `RouletteReel` in `src/App.jsx`.
- **Winner picks next battlefield.** In `endRound`, the round's top scorer is placed
  first in `currentPlayerOrder`, so they pick the next category and lead off. Category
  screen reads "🏆 {name} WON — PICK YOUR BATTLEFIELD". Ties → whoever answered first.
- **Rex host fixes (`src/hooks/useScoring.js`):** announces BOTH player names in the
  intro (leads with them so neither is clipped); names the NEXT contestant on handoff
  (`getRexHandoffQuip(prev, next)`); `REX_PACK_INTROS` rewritten for the 4 categories.

### Scoring — moved server-side (security + reliability)
- New Vercel serverless function `api/score.js` calls Claude. The Anthropic key lives
  ONLY in the `ANTHROPIC_API_KEY` env var (server-side) — never shipped to the browser.
- `src/hooks/useScoring.js` → `scoreResponse()` now POSTs to `/api/score`.
- `public/config.js` no longer contains the Anthropic key (ElevenLabs voice key remains,
  still client-side).
- `vercel.json` rewrite excludes `/api` so the function isn't swallowed by the SPA rewrite.
- Rubric tightened to spread scores (anchored 1–10 bands; benchmark = 9–10; short answers
  cap ~3–4). Optional `SCORING_MODEL` env overrides the model (default
  `claude-sonnet-4-20250514`).
- Failure is now explicit: if scoring can't be reached the card shows
  "Not Scored / Technical Timeout" (score 0) instead of a misleading fake 5.

## Deploy / ops

**Deploy:** push to `main` (GitHub→Vercel auto-build) or `vercel --prod` from this folder.

**Set / rotate the scoring key:**
1. Create a funded key at console.anthropic.com.
2. Vercel → Project → Settings → Environment Variables → `ANTHROPIC_API_KEY`
   (Production, mark Sensitive). No quotes/spaces.
3. **Redeploy** — env changes only apply to new deployments.

**Verify scoring is live:**
```
curl -s https://beat-the-bot-2.vercel.app/api/score \
  -H "content-type: application/json" \
  -d '{"playerName":"Test","persona":"Optimistic Seller","objection":"list high","objective":"Prevent overpricing","benchmark":"price to today","playerResponse":"I get wanting to start high, but the first two weeks draw the most buyers, so let us price to today and create competition.","packName":"Seller Objections"}'
```
JSON with a real `score` = working. `Anthropic 401` = bad key. `Server is missing ANTHROPIC_API_KEY` = not set on Production / not redeployed.

**Local note:** `npm run dev` (Vite) does NOT run `/api/score`, so scoring always falls
back locally. Use `vercel dev` (with `ANTHROPIC_API_KEY` in `.env.local`) or test on the
live URL.

## Open items before the event
- [ ] **Scoring key blocker:** the current `ANTHROPIC_API_KEY` returns 401 — replace with
      a valid, funded key and redeploy.
- [ ] **`PLAYER_COUNT`** in `src/App.jsx` is `2` for testing — bump to the real roster.
- [ ] Decide 3 vs 4 rounds (currently hardwired to 4; ends when `nextRound >= 4`).
- [ ] Cap/restrict the ElevenLabs key in its dashboard (still client-side); proxy post-event.
- [ ] Full practice game on the event laptop — real scores + clean stage-mic → laptop audio.
