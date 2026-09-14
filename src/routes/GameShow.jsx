import Particle from "../components/Particle";
import PreGameScreens from "../components/screens/PreGameScreens";
import RoundScreens from "../components/screens/RoundScreens";
import GradingScreens from "../components/screens/GradingScreens";
import { useGameShow } from "../game/useGameShow";

// The live multiplayer game show — the experience that ran at Refuel.
// All state and handlers come from useGameShow; this file only lays out screens.
export default function GameShow() {
  const game = useGameShow();
  const { particles } = game;

  return (
    <div className="app">



      {/* Particles */}
      {particles.map((p) => (
        <Particle key={p.id} style={{ left: p.left, animationDelay: p.animationDelay, background: p.background, width: p.width, height: p.height }} />
      ))}

      <PreGameScreens game={game} />
      <RoundScreens game={game} />
      <GradingScreens game={game} />
    </div>
  );
}
