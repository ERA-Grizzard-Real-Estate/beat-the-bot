import { useRef, useEffect } from "react";

// ─── OBJECTION ROULETTE REEL ────────────────────────────────────────────────
// Slot-machine reel that spins the chosen pack's objections and decelerates onto
// the already-selected round (targetIndex). Visual only — no logic depends on it.
export default function RouletteReel({ pack, targetIndex, color }) {
  const ITEM_H = 60;
  const LOOPS = 6;
  const rounds = pack.rounds;
  const n = rounds.length;
  const stripRef = useRef(null);
  const strip = [];
  for (let l = 0; l < LOOPS; l++) for (let i = 0; i < n; i++) strip.push(rounds[i]);
  const safeTarget = Math.max(0, Math.min(targetIndex ?? 0, n - 1));
  const k = (LOOPS - 1) * n + safeTarget;
  const finalY = -((k - 1) * ITEM_H);
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    el.style.transition = "none";
    el.style.transform = "translateY(0px)";
    el.style.filter = "blur(1.4px)";
    void el.offsetHeight;
    requestAnimationFrame(() => {
      el.style.transition = "transform 3s cubic-bezier(0.12, 0.7, 0.16, 1)";
      el.style.transform = `translateY(${finalY}px)`;
    });
    const t = setTimeout(() => {
      if (stripRef.current) stripRef.current.style.filter = "none";
    }, 2100);
    return () => clearTimeout(t);
  }, [finalY]);
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 460, margin: "1.5rem auto 0" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: ITEM_H, height: ITEM_H, border: `2px solid ${color}`, borderRadius: 8, background: "rgba(255,255,255,0.05)", pointerEvents: "none", zIndex: 2 }} />
      <div style={{ height: ITEM_H * 3, overflow: "hidden", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(11,50,121,0.22)" }}>
        <div ref={stripRef} style={{ willChange: "transform" }}>
          {strip.map((r, idx) => (
            <div key={idx} style={{ height: ITEM_H, boxSizing: "border-box", padding: "0 18px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 2 }}>
              <div style={{ color: color, fontSize: 11, opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.persona}</div>
              <div style={{ color: "#f5f0e8", fontWeight: 700, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.short || r.objection}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
