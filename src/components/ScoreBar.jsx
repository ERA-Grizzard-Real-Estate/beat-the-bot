import { useState, useEffect } from "react";

// Animated 0-10 score bar shown on the reveal.
export default function ScoreBar({ score, animated = false }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (animated) {
      setTimeout(() => setWidth((score / 10) * 100), 300);
    } else {
      setWidth((score / 10) * 100);
    }
  }, [score, animated]);

  const color = score >= 8 ? "#FFD700" : score >= 6 ? "#4ECDC4" : score >= 4 ? "#F97316" : "#FF6B6B";

  return (
    <div className="score-bar-wrap">
      <div className="score-bar-track">
        <div
          className="score-bar-fill"
          style={{ width: `${width}%`, background: color, transition: animated ? "width 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none" }}
        />
      </div>
      <span className="score-bar-label" style={{ color }}>{score}/10</span>
    </div>
  );
}
