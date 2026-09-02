-- Beat the Bot — initial Neon Postgres schema
-- Run as migration 0001. Forward-only; never edit after it has run in prod.
--
-- Design notes:
--   * No audio is ever stored. Transcripts and scores only.
--   * Objection text is SNAPSHOT onto each attempt so editing an objection
--     later does not invalidate past coaching.
--   * Soft-retire content, never hard-delete anything with attempts.
--   * Leaderboards are out of scope but the indexes here would support them.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- ─────────────────────────────────────────────────────────────────────────────
-- Users
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('agent', 'manager', 'admin');

CREATE TYPE era_office AS ENUM (
  'Mount Dora',
  'Leesburg',
  'Clermont',
  'The Villages',
  'Downtown Orlando',
  'Daytona'
);

CREATE TABLE users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email              TEXT NOT NULL UNIQUE,          -- always @eragrizzard.com
  google_sub         TEXT UNIQUE,                   -- Google 'sub' claim
  display_name       TEXT NOT NULL,
  avatar_url         TEXT,
  role               user_role NOT NULL DEFAULT 'agent',
  office             era_office,                    -- asked at first login
  consent_at         TIMESTAMPTZ,                   -- voice/data notice ack
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at       TIMESTAMPTZ,
  CONSTRAINT users_email_domain CHECK (email LIKE '%@eragrizzard.com')
);

CREATE INDEX users_office_idx ON users (office) WHERE is_active;
CREATE INDEX users_role_idx   ON users (role);

-- ─────────────────────────────────────────────────────────────────────────────
-- Content: categories and objections
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE categories (
  id                 SERIAL PRIMARY KEY,
  code               TEXT NOT NULL UNIQUE,          -- 'SELLER', 'BUYER', ...
  name               TEXT NOT NULL,                 -- 'Seller Objections'
  emoji              TEXT,
  color              TEXT,                          -- hex, e.g. '#4ECDC4'
  description        TEXT,
  challenger_voice_id TEXT,                         -- ElevenLabs voice id
  rex_intro          TEXT,                          -- the REX_PACK_INTROS line
  sort_order         INTEGER NOT NULL DEFAULT 0,
  is_retired         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE objections (
  id                 SERIAL PRIMARY KEY,
  category_id        INTEGER NOT NULL REFERENCES categories (id),
  code               TEXT NOT NULL UNIQUE,          -- 'SELLER-1' — seed key
  persona            TEXT NOT NULL,                 -- 'Proud, Confident Seller'
  short_label        TEXT NOT NULL,                 -- reel label
  objection_text     TEXT NOT NULL,                 -- full spoken, in character
  objective          TEXT NOT NULL,
  benchmark          TEXT NOT NULL,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  is_retired         BOOLEAN NOT NULL DEFAULT FALSE,
  created_by         UUID REFERENCES users (id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX objections_category_idx ON objections (category_id) WHERE NOT is_retired;

-- ─────────────────────────────────────────────────────────────────────────────
-- Game sessions (live multiplayer) and challenges (async head-to-head)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE game_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id       UUID NOT NULL REFERENCES users (id),
  player_count       SMALLINT NOT NULL,
  round_count        SMALLINT NOT NULL,
  -- Contestants as given at the register screen. Entries may be typed guest
  -- names with no account: [{slot, name, user_id|null}]
  contestants        JSONB NOT NULL DEFAULT '[]'::jsonb,
  winner_name        TEXT,
  started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ
);

CREATE INDEX game_sessions_host_idx ON game_sessions (host_user_id, started_at DESC);

CREATE TYPE challenge_status AS ENUM ('pending', 'complete', 'expired');

CREATE TABLE challenges (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token              TEXT NOT NULL UNIQUE,          -- opaque random, in the URL
  objection_id       INTEGER NOT NULL REFERENCES objections (id),
  challenger_user_id UUID NOT NULL REFERENCES users (id),
  opponent_user_id   UUID REFERENCES users (id),    -- set when B answers
  status             challenge_status NOT NULL DEFAULT 'pending',
  winner_user_id     UUID REFERENCES users (id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

CREATE INDEX challenges_challenger_idx ON challenges (challenger_user_id, created_at DESC);
CREATE INDEX challenges_open_idx       ON challenges (status) WHERE status = 'pending';

-- ─────────────────────────────────────────────────────────────────────────────
-- Attempts — the core fact table. One row per answer scored.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE play_mode AS ENUM ('solo', 'challenge', 'gameshow');

CREATE TABLE attempts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who. NULL user_id = a typed guest contestant in a live game show.
  user_id            UUID REFERENCES users (id),
  guest_name         TEXT,
  office             era_office,                    -- denormalized for reporting

  mode               play_mode NOT NULL,
  game_session_id    UUID REFERENCES game_sessions (id),
  challenge_id       UUID REFERENCES challenges (id),

  -- What they answered
  objection_id       INTEGER NOT NULL REFERENCES objections (id),
  category_id        INTEGER NOT NULL REFERENCES categories (id),
  transcript         TEXT NOT NULL,                 -- audio itself is discarded

  -- Snapshot of the content as it read at scoring time, so a later edit to the
  -- objection never makes past coaching incoherent.
  objection_snapshot JSONB NOT NULL,                -- {persona, objection, objective, benchmark}

  -- Scores. 1-9; 9 is the ceiling by design, never a 10.
  score              SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 9),
  score_label        TEXT,                          -- Needs Work .. Elite
  sub_objective      SMALLINT CHECK (sub_objective BETWEEN 0 AND 9),
  sub_tone           SMALLINT CHECK (sub_tone       BETWEEN 0 AND 9),
  sub_language       SMALLINT CHECK (sub_language   BETWEEN 0 AND 9),

  -- Rex's output
  roast              TEXT,
  score_line         TEXT,
  coaching           TEXT,
  what_worked        TEXT,
  improve            TEXT,
  coaching_tip       TEXT,

  scoring_model      TEXT,                          -- e.g. 'claude-sonnet-4-6'
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Either a real user or a named guest, never neither.
  CONSTRAINT attempts_actor CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL)
);

-- An agent's own history and progress view
CREATE INDEX attempts_user_time_idx     ON attempts (user_id, created_at DESC);
-- Per-agent, per-category averages (progress + weakest categories)
CREATE INDEX attempts_user_category_idx ON attempts (user_id, category_id);
-- Manager dashboard aggregates by office and week
CREATE INDEX attempts_office_time_idx   ON attempts (office, created_at DESC);
-- Serving unseen objections first in solo mode
CREATE INDEX attempts_user_objection_idx ON attempts (user_id, objection_id);
-- Challenge result lookup
CREATE INDEX attempts_challenge_idx     ON attempts (challenge_id);
CREATE INDEX attempts_session_idx       ON attempts (game_session_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Rate limiting — per user, per endpoint, fixed window
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE rate_limits (
  user_id            UUID NOT NULL REFERENCES users (id),
  endpoint           TEXT NOT NULL,
  window_start       TIMESTAMPTZ NOT NULL,
  call_count         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, endpoint, window_start)
);

CREATE INDEX rate_limits_sweep_idx ON rate_limits (window_start);

-- ─────────────────────────────────────────────────────────────────────────────
-- Convenience views
-- ─────────────────────────────────────────────────────────────────────────────

-- Per-agent, per-category averages. Backs the progress view and the
-- "weakest categories" panel on the manager dashboard.
CREATE VIEW agent_category_stats AS
SELECT
  a.user_id,
  a.category_id,
  c.name                              AS category_name,
  COUNT(*)                            AS attempts,
  ROUND(AVG(a.score)::numeric, 2)     AS avg_score,
  ROUND(AVG(a.sub_objective)::numeric, 2) AS avg_objective,
  ROUND(AVG(a.sub_tone)::numeric, 2)      AS avg_tone,
  ROUND(AVG(a.sub_language)::numeric, 2)  AS avg_language,
  MAX(a.created_at)                   AS last_attempt_at
FROM attempts a
JOIN categories c ON c.id = a.category_id
WHERE a.user_id IS NOT NULL
  AND a.score > 0
GROUP BY a.user_id, a.category_id, c.name;

-- Office rollup for the manager dashboard.
CREATE VIEW office_stats AS
SELECT
  a.office,
  COUNT(*)                                        AS attempts,
  COUNT(DISTINCT a.user_id)                       AS active_agents,
  ROUND(AVG(a.score)::numeric, 2)                 AS avg_score,
  COUNT(*) FILTER (WHERE a.created_at > now() - INTERVAL '7 days') AS attempts_7d
FROM attempts a
WHERE a.user_id IS NOT NULL
  AND a.score > 0
GROUP BY a.office;
