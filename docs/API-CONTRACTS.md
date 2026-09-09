# API Contracts

Every route lives in `/api` as a Vercel serverless function. Every route except
the auth callbacks requires a valid session cookie. Wrap handlers in
`withAuth(handler, { role })` from `api/_lib/auth.js`.

Conventions:

- JSON in, JSON out. `content-type: application/json`.
- Errors: `{ "error": "<machine code>", "message": "<human sentence>" }` with a
  real HTTP status. Never 200 an error.
- Status codes: 400 bad input, 401 no session, 403 wrong role, 404 not found,
  409 conflict, 429 rate limited, 502 upstream failure, 500 unexpected.
- No endpoint returns another agent's transcript or coaching unless the caller
  is a manager scoped to that agent's office, an admin, or the counterparty in
  a completed challenge.
- Never echo a key, a token, or an upstream error body to the client.

---

## Auth

### `GET /api/auth/me`
Current user. `200 { id, email, displayName, avatarUrl, role, office, consentAt }`
or `401`.

### `POST /api/auth/office`
First-login office selection. Body `{ office }` — must be one of the six.
`200 { office }`. Callable by the user for their own record only.

### `POST /api/auth/consent`
Records the voice and data notice acknowledgment. No body.
`200 { consentAt }`.

### `POST /api/auth/logout`
Clears the session cookie. `204`.

Google OAuth start and callback are handled by the auth library's own routes.
The domain check on the `hd` claim happens in the sign-in callback, server-side.

---

## Scoring — `POST /api/score`

**Existing endpoint. Keep the contract; add auth and rate limiting.** Three
modes, selected by the body shape.

### Single (solo, one answer)

Request:
```json
{
  "mode": "solo",
  "packName": "Seller Objections",
  "persona": "Proud, Confident Seller",
  "objection": "...full spoken text...",
  "objective": "Get seller open to pricing using current market positioning.",
  "benchmark": "...",
  "playerName": "Gus",
  "playerResponse": "...transcript..."
}
```

Response `200`:
```json
{
  "score": 8,
  "scoreLabel": "Strong",
  "subscores": { "objective": 8, "tone": 8, "language": 7 },
  "roast": "One sentence, Rex voice.",
  "scoreLine": "One punchy line for the reveal.",
  "coaching": "1-2 sentences, spoken.",
  "whatWorked": "...",
  "improve": "...",
  "coachingTip": "..."
}
```

`mode: "solo"` is new — it dials Rex's roast from savage to warm without
touching the scoring calibration. Omitting it keeps today's behavior.

### Batch (head-to-head and game show)

Request adds a `responses` array and omits `playerName`/`playerResponse`:
```json
{
  "packName": "...", "persona": "...", "objection": "...",
  "objective": "...", "benchmark": "...",
  "responses": [
    { "playerName": "Gus",  "playerResponse": "..." },
    { "playerName": "Dana", "playerResponse": "..." }
  ]
}
```

Response `200` `{ "results": [ <one single-mode object per contestant, same order> ] }`.

Scores are forced distinct — no ties — anchored at the top and stepping down.

### Banter

Request `{ "mode": "banter", "players": ["Gus","Dana"], "packName": "Seller Objections" }`.
Response `200 { "line": "<spoken text, no quotes, no JSON>" }`.
Temperature 1. Never reveals or hints at a score.

**Change from today:** on upstream failure the client must surface a real
error. Do not fabricate a `score: 0` result and do not persist one.

---

## Voice proxy — BUILT 2026-09-09

`ELEVENLABS_API_KEY` is a server-only environment variable. No key and no voice
id reaches the browser. This replaced `public/config.js`.

### `POST /api/voice/speak`
Body `{ text, voice, packId, speed }`. Returns `audio/mpeg`.

**Takes a role, not a voice id** — a deviation from the original draft of this
contract, made on purpose. `voice` is `"rex" | "coach" | "character"`, and
`packId` selects the challenger when `voice` is `"character"`. The id table
lives in `api/voice/speak.js` and nowhere else. Accepting a caller-supplied
`voiceId` would have made this an open proxy to any voice on the ElevenLabs
account, billed to us, and would have kept the ids in the client bundle.

Unknown role -> `400`. Empty text -> `400`. Text over 5000 chars -> `413`.
Upstream failure -> `502` with no upstream detail forwarded to the browser.

Settings, carried over verbatim from the old client call so Rex sounds
unchanged: model `eleven_turbo_v2`, stability 0.4, similarity_boost 0.8,
style 0.6, speaker boost on, default speed 1.15.

**On streaming:** this buffers the clip rather than streaming it through, which
the earlier draft advised against. Streaming the proxy would not help today —
the client plays via `new Audio(URL.createObjectURL(blob))`, which needs the
whole blob before playback starts, so the wait is identical either way. Revisit
only alongside a client that uses MediaSource.

### `POST /api/voice/transcribe`
**Raw audio as the request body**, not `multipart/form-data`, with the
browser's own mime type in `Content-Type`. Another deliberate deviation: the
browser already knows its recording format, and forwarding the raw bytes means
there is no multipart parser on this side to get wrong. The handler re-wraps
the bytes as multipart for ElevenLabs with filename `recording.webm` and
`model_id: scribe_v1`.

Response `200 { text }`. Empty body -> `400`. Over 4 MB -> `413`, deliberately
under Vercel's 4.5 MB request cap so the failure is a clear message rather than
a dropped connection. Upstream failure -> `502`.

Accepted content types: `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/mpeg`,
`audio/wav`, `audio/x-wav`; anything else is treated as `audio/webm`.

The audio is held in memory, forwarded, and dropped when the request ends.
Never written to disk or storage. Only the transcript comes back.

The client still falls back to the browser Web Speech API if this endpoint
fails, so a voice outage degrades rather than blocking the game.

---

## Content

### `GET /api/content/categories`
`200 { categories: [ { id, code, name, emoji, color, description, challengerVoiceId, objectionCount } ] }`.
Retired categories excluded. Any signed-in user.

### `GET /api/content/categories/:id/objections`
`200 { objections: [ { id, code, persona, shortLabel, objectionText, objective, benchmark } ] }`.
Retired excluded. Any signed-in user.

### `GET /api/content/next?categoryId=&userId=self`
Serves the next unseen objection for the caller in that category. Falls back to
least-recently-seen once all are done, and returns `cycleComplete: true` so the
UI can say so. Omit `categoryId` for "surprise me".
`200 { objection: {...}, cycleComplete: false }`.

### Admin writes — role `admin`

- `POST   /api/content/categories` — create
- `PATCH  /api/content/categories/:id` — update, including `isRetired`
- `POST   /api/content/objections` — create
- `PATCH  /api/content/objections/:id` — update, including `isRetired`

No hard deletes. Anything with attempts against it keeps its row.

---

## Attempts

### `POST /api/attempts`
Records one scored answer. Body:
```json
{
  "mode": "solo",
  "objectionId": 3,
  "transcript": "...",
  "score": 8, "scoreLabel": "Strong",
  "subscores": { "objective": 8, "tone": 8, "language": 7 },
  "roast": "...", "scoreLine": "...", "coaching": "...",
  "whatWorked": "...", "improve": "...", "coachingTip": "...",
  "gameSessionId": null, "challengeId": null,
  "guestName": null
}
```
The server sets `user_id` from the session, `office` from the user, snapshots
the objection into `objection_snapshot`, and records `scoring_model`. It does
**not** trust a client-supplied `userId`.

`201 { id }`. Reject `score: 0` — an unscored attempt is not an attempt.

### `GET /api/attempts/mine?limit=&cursor=`
The caller's own attempts, newest first, with transcript and coaching.

### `GET /api/attempts/progress`
`200`:
```json
{
  "totalAttempts": 42,
  "attempts7d": 6,
  "streakDays": 3,
  "avgScore": 7.4,
  "avgSubscores": { "objective": 7.6, "tone": 7.8, "language": 6.9 },
  "byCategory": [ { "categoryId": 1, "name": "Seller Objections", "attempts": 12, "avgScore": 7.8 } ],
  "weakest": [ { "categoryId": 3, "name": "Lead Conversion", "avgScore": 6.1 } ]
}
```

---

## Challenges

### `POST /api/challenges`
Body `{ objectionId, transcript, score, subscores, ... }` — agent A's answer,
same shape as an attempt. Creates the challenge, stores A's attempt linked to
it, returns `201 { token, url, expiresAt }`.

### `GET /api/challenges/:token`
For agent B before answering:
```json
{
  "status": "pending",
  "challengerName": "Gus",
  "objection": { "id": 3, "persona": "...", "objectionText": "...", "objective": "..." },
  "expiresAt": "..."
}
```
**A's transcript and score are omitted while `status` is `pending`.** Do not
include them and hide them client-side — omit them from the payload.

For a completed challenge, returns both sides in full to either participant.

### `POST /api/challenges/:token/answer`
Body is B's answer. The server scores **both** answers in one batch call,
writes B's attempt, sets `opponent_user_id`, `winner_user_id`, `status`, and
`completed_at`. Returns both results.

`409` if already answered. `410` if expired. B cannot be A.

### `GET /api/challenges/mine`
The caller's challenges, both sent and received, with status.

---

## Game sessions

### `POST /api/game-sessions`
Body `{ playerCount, roundCount, contestants: [ { slot, name, userId|null } ] }`.
`201 { id }`. Host is the session user.

### `PATCH /api/game-sessions/:id`
Body `{ winnerName, completedAt }`. Host only.

Attempts during a game show post to `/api/attempts` with `gameSessionId` set,
and with `guestName` instead of a user for typed-name contestants.

---

## Reports — roles `manager`, `admin`

### `GET /api/reports/summary?office=&days=30`
`200 { office, activeAgents, totalAttempts, avgScore, priorPeriodAvgScore, weakestCategories: [...] }`.

### `GET /api/reports/agents?office=&days=30`
`200 { agents: [ { userId, displayName, office, attempts, attempts7d, avgScore, avgSubscores, lastActiveAt } ] }`.

### `GET /api/reports/agents/:id?days=90`
One agent's detail: the same shape as `/api/attempts/progress`, plus recent
attempts with transcript and coaching.

**Scoping is server-side.** A `manager` is silently constrained to their own
office regardless of the `office` parameter; only an `admin` may pass an
arbitrary office or omit it for all six. No export endpoints in this phase.

---

## Health

### `GET /api/health`
Unauthenticated. `200 { ok: true, db: "up", env: { anthropic: true, elevenlabs: true } }`.
Booleans only — reports whether a var is set, never its value.

---

## Rate limits (Phase 10)

Per user, per endpoint, fixed window. Suggested starting points, to be tuned
against the budget number Gus provides:

| Endpoint | Limit |
|---|---|
| `POST /api/score` (solo) | 40 / hour, 150 / day |
| `POST /api/score` (batch) | 20 / hour |
| `POST /api/voice/speak` | 200 / hour |
| `POST /api/voice/transcribe` | 60 / hour |
| `POST /api/challenges` | 20 / day |

`429` with `Retry-After` and a Rex-voiced message, not a raw error code.
