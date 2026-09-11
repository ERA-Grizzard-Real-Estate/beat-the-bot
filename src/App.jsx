import { useState, useRef, useCallback } from "react";
import { GAME_PACKS } from "./data/gamePacks";
import { speakText, stopSpeaking, transcribeAudio } from "./hooks/useElevenLabs";
import { scoreResponse, scoreRound, getRexBanter } from "./game/scoring";
import {
  getRexPackIntro,
  getRexPlayerIntro,
  getRexRoundWinner,
  getRexChampion,
  getRexHandoffQuip,
  getRexGradingIntro,
  getRexGradingFiller,
} from "./game/rexScript";

import { PHASE, getRotatedOrder } from "./game/phases";
import Particle from "./components/Particle";
import ScoreBar from "./components/ScoreBar";
import PlayerCard from "./components/PlayerCard";
import RouletteReel from "./components/RouletteReel";
// ─── PLAYER COUNT ────────────────────────────────────────────────────────────
// Chosen on the setup screen at the start of every game, 1 to 4. The constant
// below is only the pre-selected default. 1 player is a valid solo rep: there
// is no head-to-head, so scoring and Rex's lines switch to solo mode.
const MIN_PLAYERS = 1;
const MAX_PLAYERS = 4;
const DEFAULT_PLAYER_COUNT = 3;

const makePlayers = (n) => Array.from({ length: n }, (_, i) => ({ id: i, name: "" }));
const makeScores = (n) => Array.from({ length: n }, () => 0);

// ─── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
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
  const [gradingIndex, setGradingIndex] = useState(0); // which collected response is being graded/revealed
  const [currentRoundResults, setCurrentRoundResults] = useState([]);
  const [roundScored, setRoundScored] = useState(null); // precomputed comparative results for the round
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [_pendingBlob, setPendingBlob] = useState(null); // blob waiting for confirm

  // ── Sound check state ──
  const [scSpeakerStatus, setScSpeakerStatus] = useState("idle"); // idle | playing | pass | fail
  const [scMicStatus, setScMicStatus] = useState("idle");         // idle | recording | transcribing | pass | fail
  const [scMicTranscript, setScMicTranscript] = useState("");
  const [scoreData, setScoreData] = useState(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [winnerIndex, setWinnerIndex] = useState(null);
  const [particles, setParticles] = useState([]);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const [liveTranscript, setLiveTranscript] = useState(""); // words appearing in real-time

  // Generate celebration particles
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

  // ── Sound check handlers ──
  const handleTestSpeaker = async () => {
    setScSpeakerStatus("playing");
    await speak("Testing! Testing! One, two, three — if you can hear Rex loud and clear, your speakers are READY for the arena!", "rex");
    setScSpeakerStatus("pass");
  };

  const handleTestMicStart = async () => {
    setScMicStatus("recording");
    setScMicTranscript("");
    await startRecording();
  };

  const handleTestMicStop = async () => {
    const blob = await stopRecording();
    if (!blob) { setScMicStatus("fail"); return; }
    setScMicStatus("transcribing");
    const text = await transcribeAudio(blob);
    if (text && text.trim().length > 0) {
      setScMicTranscript(text);
      setScMicStatus("pass");
    } else {
      setScMicTranscript("");
      setScMicStatus("fail");
    }
  };

  const handleRetryMic = () => {
    setScMicStatus("idle");
    setScMicTranscript("");
  };

  // ── Skip current TTS ──
  const handleSkip = useCallback(() => {
    stopSpeaking();
    setIsSpeaking(false);
  }, []);

  // ── Recording + Live Transcription ──
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      // MediaRecorder — captures audio blob for ElevenLabs fallback
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;

      // Web Speech API — live transcription shown on screen as they speak
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        let finalText = "";
        recognition.onresult = (e) => {
          let interim = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
              finalText += e.results[i][0].transcript + " ";
            } else {
              interim += e.results[i][0].transcript;
            }
          }
          setLiveTranscript(finalText + interim);
        };
        recognition.onerror = (e) => console.warn("Live STT error:", e.error);
        recognition.start();
        recognitionRef.current = recognition;
      }

      setLiveTranscript("");
      setIsRecording(true);
    } catch {
      setStatusMsg("Microphone access denied. Please allow mic access.");
    }
  };

  const stopRecording = () => {
    // Stop Web Speech recognition
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current) return resolve(null);
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        resolve(blob);
      };
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      setIsRecording(false);
    });
  };

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

  // Re-record — discard transcript and start over
  const handleReRecord = () => {
    setTranscript("");
    setLiveTranscript("");
    setPendingBlob(null);
    setIsTranscribing(false);
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
  return (
    <div className="app">


      {/* Particles */}
      {particles.map((p) => (
        <Particle key={p.id} style={{ left: p.left, animationDelay: p.animationDelay, background: p.background, width: p.width, height: p.height }} />
      ))}

      {/* ── SPLASH ── */}
      {phase === PHASE.SPLASH && (
        <div className="screen splash-screen">
          <div className="splash-bg" />
          <div className="splash-content">
            <img src="/Era_Logo_White_Transparent.png" alt="ERA Grizzard Real Estate" className="era-logo" />
            <div className="logo-wrap">
              <div className="logo-beat">BEAT</div>
              <div className="logo-the">THE</div>
              <div className="logo-bot">BOT</div>
              <div className="logo-sub">AGENT OBJECTION TRAINING CHAMPIONSHIP</div>
            </div>
            <div className="rex-intro-card">
              <div className="rex-icon">🎭</div>
              <div className="rex-name">Hosted by REX</div>
              <div className="rex-tagline">"The most theatrical host in real estate training history"</div>
            </div>
            <div className="splash-buttons">
              <button className="btn-primary" onClick={() => setPhase(PHASE.PLAYER_SETUP)}>
                ENTER THE ARENA
              </button>
              <button className="btn-sound-check" onClick={() => {
                setScSpeakerStatus("idle");
                setScMicStatus("idle");
                setScMicTranscript("");
                setPhase(PHASE.SOUND_CHECK);
              }}>
                🔊 SOUND CHECK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SOUND CHECK ── */}
      {phase === PHASE.SOUND_CHECK && (
        <div className="screen sound-check-screen">
          <h1 className="screen-title">SOUND CHECK</h1>
          <p className="screen-sub">Test speakers and mic before the game</p>

          {/* Speaker test */}
          <div className="sc-card">
            <div className="sc-card-header">
              <div className="sc-icon">🔊</div>
              <div>
                <div className="sc-title">SPEAKER TEST</div>
                <div className="sc-desc">Rex will say a test phrase — make sure you can hear him clearly</div>
              </div>
              {scSpeakerStatus === "pass" && <div className="sc-badge pass">✓ PASS</div>}
              {scSpeakerStatus === "fail" && <div className="sc-badge fail">✗ FAIL</div>}
            </div>
            {scSpeakerStatus === "playing" && (
              <div className="sc-status playing">
                <div className="speaking-wave small"><span /><span /><span /><span /><span /></div>
                <span>Rex is speaking...</span>
              </div>
            )}
            {scSpeakerStatus === "pass" && (
              <div className="sc-status pass">✓ If you heard Rex clearly, speakers are good to go!</div>
            )}
            <div className="sc-actions">
              <button
                className="btn-sc-test"
                onClick={handleTestSpeaker}
                disabled={scSpeakerStatus === "playing" || isSpeaking}
              >
                {scSpeakerStatus === "pass" ? "🔊 TEST AGAIN" : "▶ PLAY TEST"}
              </button>
            </div>
          </div>

          {/* Mic test */}
          <div className="sc-card">
            <div className="sc-card-header">
              <div className="sc-icon">🎤</div>
              <div>
                <div className="sc-title">MICROPHONE TEST</div>
                <div className="sc-desc">Record a few words — we'll transcribe them so you can confirm the mic is working</div>
              </div>
              {scMicStatus === "pass" && <div className="sc-badge pass">✓ PASS</div>}
              {scMicStatus === "fail" && <div className="sc-badge fail">✗ FAIL</div>}
            </div>

            {scMicStatus === "recording" && (
              <div className="sc-status recording">
                <span className="recording-pulse">⏺</span> Recording — say something, then hit STOP
              </div>
            )}
            {scMicStatus === "transcribing" && (
              <div className="sc-status playing">
                <div className="transcribing-dots"><span /><span /><span /></div>
                <span>Transcribing...</span>
              </div>
            )}
            {scMicStatus === "pass" && scMicTranscript && (
              <div className="sc-transcript">
                <div className="sc-transcript-label">WE HEARD:</div>
                <div className="sc-transcript-text">"{scMicTranscript}"</div>
              </div>
            )}
            {scMicStatus === "fail" && (
              <div className="sc-status fail">✗ Nothing was picked up — check mic permissions and try again</div>
            )}

            <div className="sc-actions">
              {scMicStatus === "idle" && (
                <button className="btn-sc-test" onClick={handleTestMicStart}>
                  🎤 START RECORDING
                </button>
              )}
              {scMicStatus === "recording" && (
                <button className="btn-sc-test recording" onClick={handleTestMicStop}>
                  ⏹ STOP RECORDING
                </button>
              )}
              {(scMicStatus === "pass" || scMicStatus === "fail") && (
                <button className="btn-sc-test" onClick={handleRetryMic}>
                  🔄 TRY AGAIN
                </button>
              )}
            </div>
          </div>

          <button className="btn-primary" onClick={() => setPhase(PHASE.PLAYER_SETUP)}>
            ENTER THE ARENA →
          </button>
        </div>
      )}


      {phase === PHASE.PLAYER_SETUP && (
        <div className="screen register-screen">
          <h1 className="screen-title">HOW MANY PLAYING?</h1>
          <p className="screen-sub">
            Pick 1 to {MAX_PLAYERS}. One agent is a solo rep — no rivals, just you and the bot.
          </p>
          <div className="count-grid">
            {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS).map(
              (count) => (
                <button
                  key={count}
                  className={`count-tile ${playerCount === count ? "selected" : ""}`}
                  onClick={() => handleChoosePlayerCount(count)}
                  aria-pressed={playerCount === count}
                >
                  <span className="count-number">{count}</span>
                  <span className="count-label">{count === 1 ? "solo" : "agents"}</span>
                </button>
              )
            )}
          </div>
          <button className="btn-primary" onClick={handleConfirmPlayerCount}>
            CONTINUE
          </button>
        </div>
      )}

      {phase === PHASE.REGISTER && (
        <div className="screen register-screen">
          <h1 className="screen-title">{isSolo ? "WHO'S STEPPING UP?" : "WHO'S COMPETING TODAY?"}</h1>
          <p className="screen-sub">
            {isSolo
              ? "One agent. Three objections. Zero mercy."
              : `${players.length} agents. One winner. Zero mercy.`}
          </p>
          <div className="player-inputs">
            {players.map((player, i) => (
              <div key={i} className="player-input-row">
                <div className="player-number" style={{ background: ["#C8102E", "#0B3279", "#c9a84c", "#2d6a4f", "#7b2d8b"][i] }}>
                  P{i + 1}
                </div>
                <input
                  className="name-input"
                  placeholder={`Player ${i + 1} name...`}
                  value={player.name}
                  onChange={(e) => {
                    const updated = [...players];
                    updated[i] = { ...updated[i], name: e.target.value };
                    setPlayers(updated);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleStartGame()}
                />
              </div>
            ))}
          </div>
          {statusMsg && <div className="status-msg">{statusMsg}</div>}
          <button className="btn-primary" onClick={handleStartGame}>
            LET'S GO 🎯
          </button>
          {/* Miscounting the room is easy at a live event. Names already typed
              survive the trip back. */}
          <button className="btn-link" onClick={() => setPhase(PHASE.PLAYER_SETUP)}>
            ← Change player count
          </button>
        </div>
      )}

      {/* ── CATEGORY SELECT ── */}
      {phase === PHASE.CATEGORY_SELECT && (
        <div className="screen category-screen">
          <div className="scoreboard-mini">
            {sortedPlayers.map((p, i) => (
              <PlayerCard key={p.id} player={p} score={p.score} rank={i} isWinner={false} />
            ))}
          </div>
          <h2 className="screen-title">
            {currentRound === 0 || isSolo
              ? "PICK YOUR BATTLEFIELD"
              : `🏆 ${players[currentPlayerOrder[0]?.id]?.name || ""} WON — PICK YOUR BATTLEFIELD`}
          </h2>
          <p className="screen-sub">Round {currentRound + 1} of 3</p>
          <div className="pack-grid">
            {GAME_PACKS.map((pack) => {
              const allUsed = pack.rounds.every((r) => usedRounds.has(r.id));
              return (
                <button
                  key={pack.id}
                  className={`pack-tile ${allUsed ? "used" : ""}`}
                  style={{ "--pack-color": pack.color }}
                  onClick={() => !allUsed && handleSelectPack(pack.id)}
                  disabled={allUsed || isSpeaking}
                >
                  <div className="pack-emoji">{pack.emoji}</div>
                  <div className="pack-tile-name">{pack.name}</div>
                  {allUsed && <div className="pack-used-badge">USED</div>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── OBJECTION ROULETTE ── */}
      {phase === PHASE.ROULETTE && currentPack && (
        <div className="screen speaking-screen">
          <div className="speaking-icon">🎰</div>
          <div className="speaking-label">SPINNING THE OBJECTION...</div>
          <div className="pack-badge" style={{ background: currentPack.color }}>{currentPack.emoji} {currentPack.name}</div>
          <RouletteReel pack={currentPack} targetIndex={selectedRoundIndex} color={currentPack.color} />
        </div>
      )}

      {/* ── REX INTRO / OBJECTION ── */}
      {(phase === PHASE.REX_INTRO || phase === PHASE.OBJECTION) && (
        <div className="screen speaking-screen">
          <div className="speaking-icon">{phase === PHASE.REX_INTRO ? "🎭" : "🏠"}</div>
          <div className="speaking-label">{phase === PHASE.REX_INTRO ? "REX IS INTRODUCING..." : "THE OBJECTION..."}</div>
          {currentPack && <div className="pack-badge" style={{ background: currentPack.color }}>{currentPack.emoji} {currentPack.name}</div>}
          {currentRoundData && phase === PHASE.OBJECTION && (
            <div className="objection-bubble">
              <div className="persona-tag">"{currentRoundData.persona}"</div>
              <div className="objection-text">"{currentRoundData.objection}"</div>
            </div>
          )}
          <div className="speaking-wave">
            <span /><span /><span /><span /><span />
          </div>
          <button className="btn-skip" onClick={handleSkip}>⏭ SKIP</button>
        </div>
      )}

      {/* ── PLAYER HANDOFF ── */}
      {phase === PHASE.PLAYER_HANDOFF && activePlayer && (
        <div className="screen handoff-screen">
          <div className="handoff-thanks">
            <div className="handoff-thanks-label">GREAT EFFORT</div>
            <div className="handoff-thanks-name">{currentPlayerOrder[currentPlayerIndex - 1]?.name || ""}!</div>
            <div className="handoff-thanks-sub">Pass the mic and step aside — your answer is locked in. Scores come after everyone's up.</div>
          </div>

          <div className="handoff-divider">
            <div className="handoff-arrow">▼</div>
          </div>

          <div className="handoff-next">
            <div className="handoff-next-label">NEXT UP</div>
            <div className="handoff-next-avatar">{activePlayer.name.charAt(0).toUpperCase()}</div>
            <div className="handoff-next-name">{activePlayer.name}</div>
            <div className="handoff-next-sub">Step up to the mic — same objection, fresh start.</div>
          </div>

          <button className="btn-primary" onClick={handleHandoffReady}>
            I'M READY 🎤
          </button>
        </div>
      )}

      {/* ── PLAYER RESPONSE ── */}
      {phase === PHASE.PLAYER_RESPONSE && activePlayer && (
        <div className="screen response-screen">
          <div className="scoreboard-mini">
            {currentPlayerOrder.map((p, i) => (
              <div key={p.id} className={`mini-player ${i === currentPlayerIndex ? "current" : i < currentPlayerIndex ? "done" : ""}`}>
                <div className="mini-avatar">{p.name.charAt(0)}</div>
                <div className="mini-name">{p.name}</div>
                {i < currentPlayerIndex && <div className="mini-check">✓</div>}
                {i === currentPlayerIndex && <div className="mini-arrow">▶</div>}
              </div>
            ))}
          </div>

          <div className="pack-badge" style={{ background: currentPack?.color }}>
            {currentPack?.emoji} {currentPack?.name}
          </div>

          <div className="objection-bubble small">
            <div className="persona-tag">"{currentRoundData?.persona}"</div>
            <div className="objection-text">"{currentRoundData?.objection}"</div>
          </div>

          <div className="active-player-banner">
            <div className="active-avatar">{activePlayer.name.charAt(0)}</div>
            <div>
              <div className="active-name">{activePlayer.name}</div>
              <div className="active-prompt">Your turn — handle that objection!</div>
            </div>
          </div>

          {/* Live transcript — appears word by word while recording */}
          {isRecording && (
            <div className="transcript-box live">
              <div className="transcript-label">🎙️ LISTENING LIVE...</div>
              <div className="transcript-text">
                {liveTranscript || <span className="transcript-placeholder">Start speaking — your words will appear here...</span>}
              </div>
            </div>
          )}

          {/* Final transcript after stop — for review */}
          {(isTranscribing || (transcript && !isRecording)) && (
            <div className="transcript-box">
              <div className="transcript-label">
                {isTranscribing ? "⏳ TRANSCRIBING..." : "📝 REVIEW YOUR RESPONSE BEFORE SUBMITTING"}
              </div>
              {isTranscribing && (
                <div className="transcribing-dots"><span /><span /><span /></div>
              )}
              {transcript && !isTranscribing && (
                <div className="transcript-text">{transcript}</div>
              )}
            </div>
          )}

          <div className="mic-section">
            {/* State 1: Ready to record */}
            {!isRecording && !isTranscribing && !transcript && (
              <button className="btn-mic" onClick={startRecording} disabled={isSpeaking}>
                <span className="mic-icon">🎤</span>
                <span>START RECORDING</span>
              </button>
            )}

            {/* State 2: Currently recording */}
            {isRecording && (
              <button className="btn-mic recording" onClick={handleStopRecording}>
                <span className="mic-icon recording-pulse">⏺</span>
                <span>STOP RECORDING</span>
              </button>
            )}

            {/* State 3: Transcribing */}
            {isTranscribing && (
              <button className="btn-mic" disabled>
                <span className="mic-icon">⏳</span>
                <span>TRANSCRIBING...</span>
              </button>
            )}

            {/* State 4: Review — confirm or re-record */}
            {!isRecording && !isTranscribing && transcript && (
              <div className="review-actions">
                <button className="btn-rerecord" onClick={handleReRecord}>
                  🔄 RE-RECORD
                </button>
                <button className="btn-submit" onClick={handleConfirmResponse}>
                  ✅ LOCK IN ANSWER
                </button>
              </div>
            )}

            {statusMsg && <div className="status-msg">{statusMsg}</div>}
          </div>
        </div>
      )}

      {/* ── GRADING INTRO ── */}
      {phase === PHASE.GRADING_INTRO && (
        <div className="screen speaking-screen">
          <div className="speaking-icon">⚖️</div>
          <div className="speaking-label">ALL ANSWERS ARE IN — GRADING TIME</div>
          <div className="grading-roster">
            {currentRoundResponses.map((r) => (
              <div key={r.playerId} className="grading-chip">
                <div className="mini-avatar">{r.playerName.charAt(0).toUpperCase()}</div>
                <div className="mini-name">{r.playerName}</div>
                <div className="mini-check">🔒</div>
              </div>
            ))}
          </div>
          <div className="speaking-wave"><span /><span /><span /><span /><span /></div>
          <button className="btn-skip" onClick={handleSkip}>⏭ SKIP</button>
        </div>
      )}

      {/* ── SCORING ── */}
      {phase === PHASE.SCORING && (
        <div className="screen scoring-screen">
          <div className="scoring-anim">
            <div className="scoring-icon">🎭</div>
            <div className="scoring-text">REX IS DELIBERATING...</div>
            {revealPlayer && <div className="scoring-subject">Grading {revealPlayer.playerName}</div>}
            <div className="scoring-dots"><span /><span /><span /></div>
          </div>
        </div>
      )}

      {/* ── SCORE REVEAL ── */}
      {phase === PHASE.SCORE_REVEAL && scoreData && revealPlayer && (
        <div className="screen reveal-screen">
          <div className="reveal-progress">
            AGENT {gradingIndex + 1} OF {currentRoundResponses.length}
          </div>
          <div className="reveal-player">
            <div className="reveal-avatar">{revealPlayer.playerName.charAt(0)}</div>
            <div className="reveal-name">{revealPlayer.playerName}</div>
          </div>

          <div className="rex-says roast">
            <div className="rex-badge">🎭 REX SAYS</div>
            <div className="rex-text">{scoreData.roast}</div>
          </div>

          <div className="score-reveal-number">
            <div className="score-line">{scoreData.scoreLine}</div>
            <ScoreBar score={scoreData.score} animated />
            {scoreData.scoreLabel && (
              <div className="score-label-chip">{scoreData.scoreLabel}</div>
            )}
          </div>

          {scoreData.subscores && (
            <div className="subscores">
              <div className="subscore-row">
                <span className="subscore-name">Objective <em>40%</em></span>
                <ScoreBar score={scoreData.subscores.objective} />
              </div>
              <div className="subscore-row">
                <span className="subscore-name">Tone <em>30%</em></span>
                <ScoreBar score={scoreData.subscores.tone} />
              </div>
              <div className="subscore-row">
                <span className="subscore-name">Strategic Language <em>30%</em></span>
                <ScoreBar score={scoreData.subscores.language} />
              </div>
            </div>
          )}

          <div className="rex-says coaching">
            <div className="rex-badge coaching-badge">💡 COACHING</div>
            <div className="rex-text">{scoreData.coaching}</div>
            {(scoreData.whatWorked || scoreData.improve || scoreData.coachingTip) && (
              <div className="coaching-breakdown">
                {scoreData.whatWorked && (
                  <p><strong>✅ What worked:</strong> {scoreData.whatWorked}</p>
                )}
                {scoreData.improve && (
                  <p><strong>🎯 Fix next:</strong> {scoreData.improve}</p>
                )}
                {scoreData.coachingTip && (
                  <p><strong>🗣 Try saying:</strong> {scoreData.coachingTip}</p>
                )}
              </div>
            )}
          </div>

          {isSpeaking ? (
            <>
              <div className="speaking-wave small">
                <span /><span /><span /><span /><span />
              </div>
              <button className="btn-skip" onClick={handleSkip}>⏭ SKIP</button>
            </>
          ) : (
            <button className="btn-primary" onClick={handleRevealNext}>
              {gradingIndex + 1 < currentRoundResponses.length ? "REVEAL NEXT SCORE →" : "SEE ROUND RESULTS →"}
            </button>
          )}
        </div>
      )}

      {/* ── ROUND SUMMARY ── */}
      {phase === PHASE.ROUND_SUMMARY && (
        <div className="screen summary-screen">
          <h2 className="screen-title">ROUND {currentRound} RESULTS</h2>
          <div className="round-results">
            {currentRoundResults
              .sort((a, b) => b.score - a.score)
              .map((r, i) => (
                <div key={r.playerId} className="result-row" style={{ animationDelay: `${i * 0.15}s` }}>
                  <div className="result-rank">{["🥇", "🥈", "🥉", "4️⃣", "5️⃣"][i]}</div>
                  <div className="result-name">{r.playerName}</div>
                  <ScoreBar score={r.score} animated />
                </div>
              ))}
          </div>

          <div className="cumulative-scores">
            <div className="cumulative-title">TOTAL SCORES</div>
            {sortedPlayers.map((p, i) => (
              <div key={p.id} className="cumulative-row">
                <span className="cumulative-name">{p.name}</span>
                <span className="cumulative-score" style={{ color: ["#c9a84c", "#f5f0e8", "#C8102E", "#2d6a4f", "#7b2d8b"][i] }}>{p.score} pts</span>
              </div>
            ))}
          </div>

          {currentRound < 3 && (
            <button className="btn-primary" onClick={handleContinueToNextCategory} disabled={isSpeaking}>
              NEXT ROUND →
            </button>
          )}
        </div>
      )}

      {/* ── GAME OVER ── */}
      {phase === PHASE.GAME_OVER && winnerIndex !== null && (
        <div className="screen gameover-screen">
          <div className="champion-wrap">
            <div className="champion-crown">👑</div>
            <div className="champion-label">CHAMPION</div>
            <div className="champion-name">{players[winnerIndex].name}</div>
            <div className="champion-score">{scores[winnerIndex]} POINTS</div>
          </div>

          <div className="final-leaderboard">
            {sortedPlayers.map((p, i) => (
              <div key={p.id} className="final-row" style={{ animationDelay: `${i * 0.2}s` }}>
                <div className="final-rank" style={{ color: ["#c9a84c", "#f5f0e8", "#C8102E", "#2d6a4f", "#7b2d8b"][i] }}>
                  {["1ST", "2ND", "3RD", "4TH", "5TH"][i]}
                </div>
                <div className="final-name">{p.name}</div>
                <div className="final-score">{p.score} pts</div>
              </div>
            ))}
          </div>

          <button className="btn-primary" onClick={handlePlayAgain}>
            PLAY AGAIN 🔁
          </button>
        </div>
      )}
    </div>
  );
}
