// Calls to /api/score. Thin fetch wrappers — the rubric lives server-side in
// api/score.js and is never duplicated on the client.
//
// Three modes: single (scoreResponse), batch/comparative (scoreRound), and
// improv banter (getRexBanter).

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
