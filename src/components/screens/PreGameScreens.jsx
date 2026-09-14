import { PHASE } from "../../game/phases";
import { MIN_PLAYERS, MAX_PLAYERS } from "../../game/config";

// Splash, sound check, player count, and name entry.
export default function PreGameScreens({ game }) {
  const {
    phase,
    setPhase,
    playerCount,
    isSolo,
    players,
    setPlayers,
    isSpeaking,
    scSpeakerStatus,
    setScSpeakerStatus,
    scMicStatus,
    setScMicStatus,
    scMicTranscript,
    setScMicTranscript,
    statusMsg,
    handleChoosePlayerCount,
    handleConfirmPlayerCount,
    handleTestSpeaker,
    handleTestMicStart,
    handleTestMicStop,
    handleRetryMic,
    handleStartGame,
  } = game;
  return (
    <>
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
    </>
  );
}
