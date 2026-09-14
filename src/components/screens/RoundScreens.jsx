import { PHASE } from "../../game/phases";
import PlayerCard from "../PlayerCard";
import RouletteReel from "../RouletteReel";
import { GAME_PACKS } from "../../data/gamePacks";

// Category pick, roulette, Rex reading the objection, handoff, and recording.
export default function RoundScreens({ game }) {
  const {
    phase,
    isSolo,
    players,
    currentRound,
    selectedRoundIndex,
    usedRounds,
    currentPlayerOrder,
    currentPlayerIndex,
    isRecording,
    isSpeaking,
    transcript,
    isTranscribing,
    statusMsg,
    liveTranscript,
    handleSkip,
    startRecording,
    handleSelectPack,
    handleStopRecording,
    handleConfirmResponse,
    handleReRecord,
    handleHandoffReady,
    currentPack,
    currentRoundData,
    activePlayer,
    sortedPlayers,
  } = game;
  return (
    <>
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
    </>
  );
}
