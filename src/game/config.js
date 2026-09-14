// Roster bounds for the game show.
//
// The count is chosen on the setup screen at the start of every game, 1 to 4.
// DEFAULT_PLAYER_COUNT is only the pre-selection. 1 player is a valid solo rep:
// there is no head-to-head, so scoring and Rex's lines switch to solo mode.
export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 4;
export const DEFAULT_PLAYER_COUNT = 3;

export const makePlayers = (n) => Array.from({ length: n }, (_, i) => ({ id: i, name: "" }));
export const makeScores = (n) => Array.from({ length: n }, () => 0);
