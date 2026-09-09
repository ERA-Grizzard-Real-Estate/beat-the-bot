// The scoring rubric lives server-side in api/score.js and is the only copy.


// ── Per-pack Rex intro scripts ──────────────────────────────────────────────
export const REX_PACK_INTROS = {
  1: [
    `SELLER OBJECTIONS! The neighbor who sold for more, the Zillow estimate, "let's list it high." Anchor them to today's market without losing the listing. Go!`,
  ],
  2: [
    `BUYER OBJECTIONS! "We'll wait for rates," "the payment's too high," "I'll just call the listing agent." Prove your value can't be Googled. Go!`,
  ],
  3: [
    `LEAD CONVERSION! "Just send me the info." "How's the market?" Turn a casual question into a consultation before the lead goes cold. Go!`,
  ],
  4: [
    `FSBO AND EXPIRED! The yard-sign do-it-yourselfer and the seller the last agent let down. Win them over and prove your worth. Go!`,
  ],
};

// ── Round winner lines ──────────────────────────────────────────────────────
export const REX_ROUND_WINNER_LINES = [
  (name, score) => `${score} points — ${name} takes the round! You pick the next battlefield.`,
  (name, score) => `Round goes to ${name} with ${score}! Your call on the next category.`,
  (name, score) => `${name}, ${score} — that's the round. Choose our next battlefield.`,
  (name, score) => `Winner's ${name} with ${score}! You're up to pick what's next.`,
];

// ── Game over champion lines ─────────────────────────────────────────────────
export const REX_CHAMPION_LINES = [
  (name, score) => `STOP EVERYTHING! Hold ALL calls! After four rounds of the most dramatic objection handling this arena has ever witnessed — your CHAMPION, with ${score} points... is ${name}! SOMEBODY get this person a trophy! Or a commission check! Either way — WELL EARNED!`,
  (name, score) => `The final scores are tallied. The dust has settled. The other contestants are reconsidering their life choices. And standing above it ALL with ${score} points — ${name}! This was not luck. This was not accident. This was CRAFT. Take a bow, Champion. You've EARNED it!`,
  (name, score) => `We came. We competed. We handled objections that would make lesser agents run for the parking lot. And when the smoke cleared — ${name} stood tall with ${score} points! The crown is yours. The bragging rights are yours. The next happy hour is definitely on you — but the GLORY is YOURS!`,
];

// ── Solo lines ───────────────────────────────────────────────────────────────
// With one agent there is no winner and no champion. Rex still lands a beat,
// he just aims it at the rep instead of a rival.
export const REX_SOLO_ROUND_LINES = [
  (name, score) => `${score} on that one, ${name}. Bank it — pick your next battlefield.`,
  (name, score) => `${name}, that's a ${score}. Shake it off, choose the next category.`,
  (name, score) => `${score} points. The objection never stood a chance... mostly. Your pick, ${name}.`,
];

export const REX_SOLO_FINISH_LINES = [
  (name, score) => `That's the set! Three objections, ${score} points, and ${name} is still standing. That is called REPS, folks. Come back tomorrow and beat that number!`,
  (name, score) => `${name} — ${score} points across three rounds. Nobody to beat but yourself, and honestly? That's the toughest opponent in this business. Same time tomorrow!`,
  (name, score) => `And we're done! ${score} points for ${name}. You showed up, you talked to the bot, and you got sharper. That's the whole game. GO SELL SOMETHING!`,
];

// ── Tiebreaker lines ─────────────────────────────────────────────────────────
export const REX_TIEBREAKER_LINES = [
  `LADIES AND GENTLEMEN — I have been doing this for a LONG time and what we have right now... is a TIE! A genuine, honest-to-goodness, nobody-blinked TIE! This next round will decide EVERYTHING. Every point. Every word. Every pause. It all matters NOW. Contestants — do NOT hold back!`,
  `A TIE?! A TIE?! After everything we've been through tonight — a TIE?! I love this competition so much right now I could cry! Next round settles it ALL — highest score takes the championship. No excuses. No do-overs. Just words, wit, and whoever wants it MORE!`,
];

// ── Helper functions ─────────────────────────────────────────────────────────
export function getRexPackIntro(packId) {
  const lines = REX_PACK_INTROS[packId];
  if (!lines) return `LADIES AND GENTLEMEN — let the battle begin!`;
  return lines[Math.floor(Math.random() * lines.length)];
}

export function getRexRoundWinner(playerName, score, solo = false) {
  if (solo) {
    const soloLine = REX_SOLO_ROUND_LINES[Math.floor(Math.random() * REX_SOLO_ROUND_LINES.length)];
    return soloLine(playerName, score);
  }
  const line = REX_ROUND_WINNER_LINES[Math.floor(Math.random() * REX_ROUND_WINNER_LINES.length)];
  return line(playerName, score);
}

export function getRexChampion(playerName, score, solo = false) {
  if (solo) {
    const soloLine = REX_SOLO_FINISH_LINES[Math.floor(Math.random() * REX_SOLO_FINISH_LINES.length)];
    return soloLine(playerName, score);
  }
  const line = REX_CHAMPION_LINES[Math.floor(Math.random() * REX_CHAMPION_LINES.length)];
  return line(playerName, score);
}

export function getRexTiebreaker() {
  return REX_TIEBREAKER_LINES[Math.floor(Math.random() * REX_TIEBREAKER_LINES.length)];
}

export function getRexPlayerIntro(players) {
  const names = players.map((p) => p.name);
  let nameList;
  if (names.length === 1) {
    nameList = names[0];
  } else if (names.length === 2) {
    nameList = `${names[0]}, and ${names[1]}`;
  } else {
    nameList = `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  }
  if (names.length === 1) {
    return `Welcome to BEAT THE BOT — in the arena tonight, all by themselves: ${nameList}! Three objections, no teammates, nowhere to hide. Answer it, then we grade it. Let's GO!`;
  }
  return `Welcome to BEAT THE BOT — give it up for tonight's competitors: ${nameList}! ${names.length} agents, one champion. Everyone answers blind, then we grade. Let's GO!`;
}

// ── Quick, non-evaluative handoff quips (collection phase) ───────────────────
// Played right after an agent finishes recording, before the next steps up.
// Deliberately reveals NOTHING about quality — scores are graded later, blind.
const REX_HANDOFF_QUIPS = [
  (prev, next) => `Locked in, ${prev}! ${next}, you're UP — get to that mic!`,
  (prev, next) => `Thank you, ${prev} — pass the mic! ${next}, the arena is YOURS!`,
  (prev, next) => `That's a wrap on ${prev}. ${next}, step on up — let's see what you've got!`,
  (prev, next) => `Sealed and saved, ${prev}. ${next}, you're next in the hot seat!`,
  (prev, next) => `Nice swing, ${prev}! Up next... ${next} — don't keep us waiting!`,
];

export function getRexHandoffQuip(prevName, nextName) {
  const line = REX_HANDOFF_QUIPS[Math.floor(Math.random() * REX_HANDOFF_QUIPS.length)];
  return line(prevName, nextName || "next contestant");
}

// ── Grading-phase kickoff (all responses collected, time to score) ───────────
const REX_GRADING_INTRO_LINES = [
  `Pencils down — every answer's in. Let's grade.`,
  `That's everybody. Time to see who actually brought it. Grading now!`,
  `All locked in, all blind. Let's score these one at a time.`,
];

export function getRexGradingIntro() {
  return REX_GRADING_INTRO_LINES[Math.floor(Math.random() * REX_GRADING_INTRO_LINES.length)];
}

// ── Grading-time banter (fills the deliberation while the AI scores) ─────────
const REX_GRADING_FILLER_LINES = [
  `While the judges crunch the numbers — can we just acknowledge how LUCKY you all are to hang your license at ERA Grizzard? A leader like Gus in your corner? Agents would trade their best listing for that. Okay... scores incoming!`,
  `Scores are cooking! Quick reminder while we wait: not every shop hands you a captain like Gus Grizzard and a culture like ERA Grizzard. You hit the jackpot, folks. Alright — let's see those numbers!`,
  `Give the machine a second to think. Meanwhile — a round of applause for being part of ERA Grizzard, because a bench this deep with Gus steering the ship? That is RARE air. Here come the scores!`,
  `Tallying... tallying... You know what's NOT up for debate? How good you've got it at ERA Grizzard with Gus leading the charge. Spoiled — that's what you are! Okay, results time!`,
];

export function getRexGradingFiller() {
  return REX_GRADING_FILLER_LINES[Math.floor(Math.random() * REX_GRADING_FILLER_LINES.length)];
}

// Live improv — asks the model for a fresh Rex stall line during the scoring
// break. Throws on failure so the caller can fall back to a canned filler.
export async function getRexBanter({ players = [], packName = "" } = {}) {
  const response = await fetch("/api/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "banter", players, packName }),
  });
  if (!response.ok) throw new Error(`Banter API ${response.status}`);
  const data = await response.json();
  const line = (data && data.line ? String(data.line) : "").trim();
  if (!line) throw new Error("Empty banter line");
  return line;
}

// ── Scoring engine ───────────────────────────────────────────────────────────
export async function scoreResponse({
  playerName,
  objection,
  persona,
  objective,
  benchmark,
  playerResponse,
  packName,
}) {
  // Scoring runs through our own serverless function (/api/score), which holds
  // the Anthropic key server-side. The key is NEVER shipped to the browser.
  try {
    const response = await fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerName, objection, persona, objective, benchmark, playerResponse, packName }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("Scoring API error:", response.status, detail);
      throw new Error(`Scoring API ${response.status}`);
    }

    const result = await response.json();
    if (typeof result?.score !== "number") {
      console.error("Scoring API returned unexpected shape:", result);
      throw new Error("Bad scoring payload");
    }
    return result;

  } catch (err) {
    console.error("Scoring error:", err);
    // Clearly-flagged technical fallback so a real outage is never mistaken for
    // a genuine score. The game can still continue if this ever fires.
    return {
      score: 0,
      scoreLabel: "Not Scored",
      subscores: { objective: 0, tone: 0, language: 0 },
      roast: "TECHNICAL TIMEOUT, folks — the judges' scorecards just jammed! That's on the machine, not the contestant.",
      scoreLine: "No score this round — Rex's scoring booth hit a snag. Try that one again!",
      coaching: "Scoring is temporarily unavailable (the AI judge couldn't be reached). Check the scoring service and re-run this round — your answer was not graded.",
      whatWorked: "Not evaluated — scoring service was unreachable.",
      improve: "Not evaluated — re-run once scoring is restored.",
      coachingTip: "If this keeps happening, confirm the ANTHROPIC_API_KEY is set on the server.",
    };
  }
}

// Comparative scoring — grade an entire round's answers in ONE pass so the
// model spreads the scores and produces a clear winner (no ties). Returns an
// array of result objects in the same order as `responses`. Throws on failure
// so the caller can fall back to per-answer scoring.
export async function scoreRound({ responses, objection, persona, objective, benchmark, packName }) {
  const response = await fetch("/api/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ responses, objection, persona, objective, benchmark, packName }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Round scoring API ${response.status} ${detail}`);
  }
  const data = await response.json();
  const results = Array.isArray(data) ? data : data?.results;
  if (!Array.isArray(results) || results.length !== responses.length) {
    throw new Error("Round scoring returned wrong shape");
  }
  if (!results.every((r) => r && typeof r.score === "number")) {
    throw new Error("Round scoring missing numeric scores");
  }
  return results;
}
