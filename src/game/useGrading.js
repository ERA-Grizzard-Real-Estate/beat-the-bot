import { useState } from "react";
import { GAME_PACKS } from "../data/gamePacks";
import { scoreResponse, scoreRound, getRexBanter } from "./scoring";
import { getRexChampion, getRexGradingFiller, getRexGradingIntro, getRexRoundWinner } from "./rexScript";
import { PHASE } from "./phases";

// The grading and reveal stage: score the round, then walk the reveals one at a
// time under operator control, then close the round or the game.
//
// Owns the four pieces of state only this stage touches. Everything else it
// needs is handed in by the phase machine, so there is still one source of
// truth for the roster, the scores, and the current phase.
export function useGrading({
  speak,
  setPhase,
  isSolo,
  selectedPackId,
  selectedRoundIndex,
  players,
  scores,
  setScores,
  currentRound,
  setCurrentRound,
  setWinnerIndex,
  setCurrentPlayerOrder,
  setCurrentPlayerIndex,
  setRoundHistory,
  spawnParticles,
  currentRoundResponses,
}) {
  const [gradingIndex, setGradingIndex] = useState(0); // which collected response is being graded/revealed
  const [currentRoundResults, setCurrentRoundResults] = useState([]);
  const [roundScored, setRoundScored] = useState(null); // precomputed comparative results for the round
  const [scoreData, setScoreData] = useState(null);

  // Kick off the grading phase once all responses are collected.
  const startGrading = async (responses) => {
    setCurrentRoundResults([]);
    setGradingIndex(0);
    setScoreData(null);
    setRoundScored(null);
    setPhase(PHASE.GRADING_INTRO);

    // Kick the comparative scoring off immediately, then fill the wait with Rex
    // banter (grading intro + a fun ERA Grizzard / Gus shout-out) so the
    // deliberation never sits in silence. The scoring runs in the background
    // while Rex talks, so the chatter overlaps the wait instead of adding to it.
    // gradeOne falls back to per-answer scoring if the batch call fails.
    const pack = GAME_PACKS.find((p) => p.id === selectedPackId);
    const round = pack.rounds[selectedRoundIndex];
    // Comparative scoring exists to spread a field and force a clear winner. With
    // one answer there is nothing to compare, and the competition addendum would
    // just anchor it at the top regardless of quality. Score solo answers on
    // their own merits instead — gradeOne already falls back to scoreResponse.
    const batchPromise = isSolo
      ? Promise.resolve(null)
      : scoreRound({
          responses: responses.map((r) => ({
            playerName: r.playerName,
            playerResponse: r.transcript,
          })),
          objection: round.objection,
          persona: round.persona,
          objective: round.objective,
          benchmark: round.benchmark,
          packName: pack.name,
        }).catch((e) => {
          console.error("Comparative scoring failed; falling back to per-answer:", e);
          return null;
        });

    // Improv filler for the scoring break: generate a fresh Rex line in the
    // background (overlaps the wait), fall back to a canned shout-out if it fails.
    const banterPromise = getRexBanter({
      players: responses.map((r) => r.playerName),
      packName: pack.name,
    }).catch(() => null);

    await speak(getRexGradingIntro(), "rex");
    const banter = (await banterPromise) || getRexGradingFiller();
    await speak(banter, "rex");

    const batch = await batchPromise;
    setRoundScored(batch);
    await gradeOne(0, responses, batch);
  };

  // Score + reveal a single stored response. Advancing to the next reveal is
  // operator-controlled (handleRevealNext) so pacing stays in your hands.
  const gradeOne = async (index, responses, batchArg) => {
    const pack = GAME_PACKS.find((p) => p.id === selectedPackId);
    const round = pack.rounds[selectedRoundIndex];
    const resp = responses[index];

    setGradingIndex(index);
    setScoreData(null);
    setPhase(PHASE.SCORING);

    // Use the precomputed comparative result when we have one; otherwise score
    // this single answer on its own (fallback).
    const batch = batchArg !== undefined ? batchArg : roundScored;
    let result = batch && batch[index];
    if (!result || typeof result.score !== "number") {
      result = await scoreResponse({
        playerName: resp.playerName,
        objection: round.objection,
        persona: round.persona,
        objective: round.objective,
        benchmark: round.benchmark,
        playerResponse: resp.transcript,
        packName: pack.name,
      });
    }

    setScoreData(result);
    setPhase(PHASE.SCORE_REVEAL);

    // Record the scored result + cumulative score.
    setCurrentRoundResults((prev) => [
      ...prev,
      { playerId: resp.playerId, playerName: resp.playerName, score: result.score, scoreLabel: result.scoreLabel, subscores: result.subscores, roast: result.roast, coaching: result.coaching, whatWorked: result.whatWorked, improve: result.improve, coachingTip: result.coachingTip },
    ]);
    setScores((prev) => {
      const next = [...prev];
      next[resp.playerId] += result.score;
      return next;
    });

    // Rex announces the contestant BY NAME, then the roast + score line, then
    // reads the FULL coaching paragraph (just `coaching` — not the emoji bullets).
    await speak(`${resp.playerName}... ${result.roast} ${result.scoreLine}`, "rex");
    await speak(result.coaching, "coach");
  };

  // Operator taps to reveal the next agent's score (or wrap the round).
  const handleRevealNext = async () => {
    const next = gradingIndex + 1;
    if (next < currentRoundResponses.length) {
      await gradeOne(next, currentRoundResponses);
    } else {
      await endRound(currentRoundResults);
    }
  };

  const endRound = async (results) => {
    const roundWinner = results.reduce((best, r) => (r.score > best.score ? r : best), results[0]);
    setPhase(PHASE.ROUND_SUMMARY);
    spawnParticles();

    setRoundHistory((prev) => [...prev, { packId: selectedPackId, results }]);
    const nextRound = currentRound + 1;
    setCurrentRound(nextRound);

    if (nextRound >= 3) {
      // Game over
      const maxScore = Math.max(...scores);
      const winnerIdx = scores.indexOf(maxScore);
      setWinnerIndex(winnerIdx);
      await speak(getRexChampion(players[winnerIdx].name, scores[winnerIdx], isSolo), "rex");
      setPhase(PHASE.GAME_OVER);
    } else {
      await speak(getRexRoundWinner(roundWinner.playerName, roundWinner.score, isSolo), "rex");
      // Round winner earns the pick: they choose the next battlefield AND lead
      // off the next round. Put the winner first; everyone else keeps their
      // relative order behind them. (Ties go to whoever answered first.)
      const winnerId = roundWinner.playerId;
      const winnerFirstOrder = [
        players.find((p) => p.id === winnerId),
        ...players.filter((p) => p.id !== winnerId),
      ];
      setCurrentPlayerOrder(winnerFirstOrder);
      setCurrentPlayerIndex(0);
    }
  };

  return {
    gradingIndex,
    currentRoundResults,
    roundScored,
    scoreData,
    startGrading,
    gradeOne,
    handleRevealNext,
    endRound,
    setCurrentRoundResults,
    setGradingIndex,
    setScoreData,
    setRoundScored,
  };
}
