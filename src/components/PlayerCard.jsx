// Scoreboard tile for one agent.
export default function PlayerCard({ player, score, isActive, isWinner, rank }) {
  const rankColors = ["#c9a84c", "#f5f0e8", "#C8102E", "#2d6a4f", "#7b2d8b"];
  return (
    <div className={`player-card ${isActive ? "active" : ""} ${isWinner ? "winner" : ""}`}>
      {isWinner && <div className="winner-crown">👑</div>}
      {rank !== undefined && (
        <div className="player-rank" style={{ color: rankColors[rank] || "#fff" }}>
          #{rank + 1}
        </div>
      )}
      <div className="player-avatar">{player.name.charAt(0).toUpperCase()}</div>
      <div className="player-name">{player.name}</div>
      <div className="player-total">{score} pts</div>
    </div>
  );
}
