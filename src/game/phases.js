// The game show's phase machine states, in the order they run.
export const PHASE = {
  SPLASH: "splash",
  SOUND_CHECK: "sound_check",
  PLAYER_SETUP: "player_setup",
  REGISTER: "register",
  CATEGORY_SELECT: "category_select",
  ROULETTE: "roulette",
  REX_INTRO: "rex_intro",
  OBJECTION: "objection",
  PLAYER_HANDOFF: "player_handoff",
  PLAYER_RESPONSE: "player_response",
  GRADING_INTRO: "grading_intro",
  SCORING: "scoring",
  SCORE_REVEAL: "score_reveal",
  ROUND_SUMMARY: "round_summary",
  GAME_OVER: "game_over",
};

// Rotates who leads off a round so the same agent does not always go first.
export function getRotatedOrder(players, roundIndex) {
  const n = players.length;
  return players.map((_, i) => players[(i + roundIndex) % n]);
}
