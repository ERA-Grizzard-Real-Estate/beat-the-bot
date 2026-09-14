import { PHASE } from "../../game/phases";
import ScoreBar from "../ScoreBar";

// Grading, score reveal, round summary, and the champion screen.
export default function GradingScreens({ game }) {
  const {
    phase,
    players,
    scores,
    currentRound,
    currentRoundResponses,
    gradingIndex,
    currentRoundResults,
    isSpeaking,
    scoreData,
    winnerIndex,
    handleSkip,
    handleRevealNext,
    handleContinueToNextCategory,
    handlePlayAgain,
    revealPlayer,
    sortedPlayers,
  } = game;
  return (
    <>
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
    </>
  );
}
