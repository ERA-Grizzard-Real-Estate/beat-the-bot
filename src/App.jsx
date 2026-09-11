import GameShow from "./routes/GameShow";

// Router and providers only. Everything the game does lives under routes/ and
// game/; this file exists to choose between them.
export default function App() {
  return <GameShow />;
}
