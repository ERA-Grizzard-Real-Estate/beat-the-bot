import { useState, useCallback } from "react";
import { GAME_PACKS } from "../data/gamePacks";
import { speakText, stopSpeaking, transcribeAudio } from "../hooks/useElevenLabs";
import { getRexPackIntro, getRexPlayerIntro, getRexHandoffQuip } from "./rexScript";

import { PHASE, getRotatedOrder } from "./phases";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useSoundCheck } from "./useSoundCheck";
import { useGrading } from "./useGrading";
import { DEFAULT_PLAYER_COUNT, makePlayers, makeScores, MIN_PLAYERS, MAX_PLAYERS } from "./config";

// ─── MAIN APP ──────────────────────────────────────────────────────────────────

// The game show's entire phase machine and state, lifted out of App.jsx
// unchanged. routes/GameShow.jsx renders screens from what this returns.
export function useGameShow() {
  const [phase, setPhase] = useState(PHASE.SPLASH);
  const [playerCount, setPlayerCount] = useState(DEFAULT_PLAYER_COUNT);
  // One agent means no head-to-head: no rival to out-score, no champion.
  const isSolo = playerCount === 1;
  const [players, setPlayers] = useState(() => makePlayers(DEFAULT_PLAYER_COUNT));
  const [scores, setScores] = useState(() => makeScores(DEFAULT_PLAYER_COUNT));
  const [_roundHistory, setRoundHistory] = useState([]); // [{packId, roundId, results:[{playerId,score,roast,coaching}]}]
  const [currentRound, setCurrentRound] = useState(0); // 0-3
  const [selectedPackId, setSelectedPackId] = useState(null);
  const [selectedRoundIndex, setSelectedRoundIndex] = useState(null);
  const [usedRounds, setUsedRounds] = useState(new Set());
  const [currentPlayerOrder, setCurrentPlayerOrder] = useState([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [currentRoundResponses, setCurrentRoundResponses] = useState([]); // collected blind: [{playerId,playerName,transcript}]
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [_pendingBlob, setPendingBlob] = useState(null); // blob waiting for confirm

  const [statusMsg, setStatusMsg] = useState("");
  const [winnerIndex, setWinnerIndex] = useState(null);
  const [particles, setParticles] = useState([]);


  // Generate celebration particles
  const { isRecording, liveTranscript, setLiveTranscript, startRecording, stopRecording } =
    useAudioRecorder({ onError: setStatusMsg });

  const spawnParticles = useCallback(() => {
    const p = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      animationDelay: `${Math.random() * 1.5}s`,
      background: ["#C8102E", "#c9a84c", "#0B3279", "#f5f0e8", "#e8c97a"][Math.floor(Math.random() * 5)],
      width: `${6 + Math.random() * 10}px`,
      height: `${6 + Math.random() * 10}px`,
    }));
    setParticles(p);
    setTimeout(() => setParticles([]), 3000);
  }, []);

  // ── TTS helper ──
  // voice: "rex" | "coach" | "character"
  // packId optional — pass explicitly when selectedPackId may not be set yet
  const speak = useCallback(async (text, voice = "rex", packId = null) => {
    setIsSpeaking(true);
    const resolvedPackId = packId ?? selectedPackId;
    // Coach is calm and measured, the character speaks naturally, Rex is
    // theatrical and slightly faster. The voice ID itself is resolved from the
    // role server-side in api/voice/speak.js.
    const speed = voice === "coach" || voice === "character" ? 1.0 : 1.15;
    await speakText(text, voice, resolvedPackId, speed);
    setIsSpeaking(false);
  }, [selectedPackId]);

  const soundCheck = useSoundCheck({ speak, startRecording, stopRecording });

  const grading = useGrading({
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
  });
  const { startGrading, gradingIndex, setGradingIndex, setCurrentRoundResults, setScoreData } = grading;

  // ── Player count ──
  // Picking a count resizes the roster in place, so names already typed for the
  // first N players survive a change of mind.
  const handleChoosePlayerCount = (count) => {
    const next = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, count));
    setPlayerCount(next);
    setPlayers((prev) =>
      Array.from({ length: next }, (_, i) => prev[i] || { id: i, name: "" })
    );
    setScores(makeScores(next));
  };

  const handleConfirmPlayerCount = () => {
    handleChoosePlayerCount(playerCount);
    setPhase(PHASE.REGISTER);
  };

  // ── Skip current TTS ──
  const handleSkip = useCallback(() => {
    stopSpeaking();
    setIsSpeaking(false);
  }, []);

  // ── Recording + Live Transcription ──
  // ── GAME FLOW ──

  // Start game after registration
  const handleStartGame = async () => {
    if (players.some((p) => !p.name.trim())) {
      setStatusMsg(`All ${players.length} players need a name!`);
      return;
    }
    setPhase(PHASE.CATEGORY_SELECT);
    setCurrentPlayerOrder(getRotatedOrder(players, 0));
    await speak(getRexPlayerIntro(players), "rex");
  };

  // Category selected
  const handleSelectPack = async (packId) => {
    const pack = GAME_PACKS.find((p) => p.id === packId);
    if (!pack) return;

    // Pick a random unused round from this pack
    const availableRounds = pack.rounds.filter((r) => !usedRounds.has(r.id));
    if (availableRounds.length === 0) {
      setStatusMsg("All rounds from this pack have been used!");
      return;
    }
    const round = availableRounds[Math.floor(Math.random() * availableRounds.length)];

    setSelectedPackId(packId);
    setSelectedRoundIndex(pack.rounds.indexOf(round));
    setCurrentRoundResponses([]);
    setCurrentRoundResults([]);
    setGradingIndex(0);
    setCurrentPlayerIndex(0);
    setUsedRounds((prev) => new Set([...prev, round.id]));

    // Rex announces the category first, THEN the roulette spins to land on the
    // specific objection (visual only — the round is already chosen above).
    setPhase(PHASE.REX_INTRO);
    const introText = getRexPackIntro(packId);
    await speak(introText, "rex");

    setPhase(PHASE.ROULETTE);
    await new Promise((r) => setTimeout(r, 3300));

    setPhase(PHASE.OBJECTION);
    await speak(round.objection, "character", packId);
    setPhase(PHASE.PLAYER_RESPONSE);
  };

  // Step 1 — stop recording, then transcribe properly.
  // The live Web Speech text shown while speaking is only a real-time preview —
  // it has NO punctuation or capitalization. For the committed answer (shown on
  // screen and sent to Rex for scoring) we always run ElevenLabs Scribe, which
  // returns properly punctuated, capitalized text. We only fall back to the raw
  // live preview if Scribe returns nothing usable.
  const handleStopRecording = async () => {
    const blob = await stopRecording();
    if (!blob) {
      setStatusMsg("Recording failed — check microphone permissions.");
      return;
    }
    setPendingBlob(blob);

    setIsTranscribing(true);
    setStatusMsg("Transcribing your response...");
    const text = await transcribeAudio(blob);
    const cleaned = (text || "").trim();

    if (cleaned && !cleaned.startsWith("[")) {
      // Good punctuated transcript from Scribe
      setTranscript(cleaned);
    } else if (liveTranscript.trim().length > 0) {
      // Last-resort fallback to the live preview if Scribe returned nothing
      setTranscript(liveTranscript.trim());
    } else {
      setTranscript("[Nothing detected — try speaking louder or check mic]");
    }

    setIsTranscribing(false);
    setStatusMsg("");
  };

  // Step 2 — confirmed. STORE the response blind (no scoring yet) so that
  // every agent answers without hearing anyone else's feedback. Once all
  // agents have recorded, we move into the grading phase.
  const handleConfirmResponse = async () => {
    const text = transcript;
    if (!text) return;
    setPendingBlob(null);

    const player = currentPlayerOrder[currentPlayerIndex];

    const updatedResponses = [
      ...currentRoundResponses,
      { playerId: player.id, playerName: player.name, transcript: text },
    ];
    setCurrentRoundResponses(updatedResponses);
    setTranscript("");
    setLiveTranscript("");

    // More agents still to record this round?
    if (currentPlayerIndex + 1 < currentPlayerOrder.length) {
      const nextPlayer = currentPlayerOrder[currentPlayerIndex + 1];
      setCurrentPlayerIndex((i) => i + 1);
      setPhase(PHASE.PLAYER_HANDOFF);
      // Quick, non-evaluative Rex quip — thanks the agent who just went AND
      // calls the next contestant up by name. Reveals nothing about scores.
      await speak(getRexHandoffQuip(player.name, nextPlayer?.name), "rex");
    } else {
      // Everyone has answered — time to grade, one at a time.
      await startGrading(updatedResponses);
    }
  };

  // Re-record — discard transcript and start over
  const handleReRecord = () => {
    setTranscript("");
    setLiveTranscript("");
    setPendingBlob(null);
    setIsTranscribing(false);
  };

  const handleHandoffReady = () => {
    // Cut off any in-progress Rex quip and go straight to recording. The
    // objection stays visible on the response screen, so no need to re-read it.
    stopSpeaking();
    setIsSpeaking(false);
    setPhase(PHASE.PLAYER_RESPONSE);
  };

  const handleContinueToNextCategory = () => {
    setPhase(PHASE.CATEGORY_SELECT);
    setScoreData(null);
    setTranscript("");
    setPendingBlob(null);
  };

  const handlePlayAgain = () => {
    setPhase(PHASE.SPLASH);
    setPlayerCount(DEFAULT_PLAYER_COUNT);
    setPlayers(makePlayers(DEFAULT_PLAYER_COUNT));
    setScores(makeScores(DEFAULT_PLAYER_COUNT));
    setRoundHistory([]);
    setCurrentRound(0);
    setSelectedPackId(null);
    setSelectedRoundIndex(null);
    setUsedRounds(new Set());
    setCurrentRoundResponses([]);
    setGradingIndex(0);
    setCurrentRoundResults([]);
    setWinnerIndex(null);
    setScoreData(null);
    setTranscript("");
  };

  // ── DERIVED ──
  const currentPack = GAME_PACKS.find((p) => p.id === selectedPackId);
  const currentRoundData = currentPack?.rounds[selectedRoundIndex];
  const activePlayer = currentPlayerOrder[currentPlayerIndex];
  const revealPlayer = currentRoundResponses[gradingIndex]; // {playerId, playerName, transcript}
  const sortedPlayers = [...players].map((p, i) => ({ ...p, score: scores[i] })).sort((a, b) => b.score - a.score);

  // ── RENDER ──

  return {
    ...soundCheck,
    ...grading,
    phase,
    setPhase,
    playerCount,
    setPlayerCount,
    isSolo,
    players,
    setPlayers,
    scores,
    setScores,
    setRoundHistory,
    currentRound,
    setCurrentRound,
    selectedPackId,
    setSelectedPackId,
    selectedRoundIndex,
    setSelectedRoundIndex,
    usedRounds,
    setUsedRounds,
    currentPlayerOrder,
    setCurrentPlayerOrder,
    currentPlayerIndex,
    setCurrentPlayerIndex,
    currentRoundResponses,
    setCurrentRoundResponses,
    isRecording,
    isSpeaking,
    setIsSpeaking,
    transcript,
    setTranscript,
    isTranscribing,
    setIsTranscribing,
    setPendingBlob,
    statusMsg,
    setStatusMsg,
    winnerIndex,
    setWinnerIndex,
    particles,
    setParticles,
    liveTranscript,
    setLiveTranscript,
    spawnParticles,
    speak,
    handleChoosePlayerCount,
    handleConfirmPlayerCount,
    handleSkip,
    startRecording,
    stopRecording,
    handleStartGame,
    handleSelectPack,
    handleStopRecording,
    handleConfirmResponse,
    handleReRecord,
    handleHandoffReady,
    handleContinueToNextCategory,
    handlePlayAgain,
    currentPack,
    currentRoundData,
    activePlayer,
    revealPlayer,
    sortedPlayers,
  };
}
