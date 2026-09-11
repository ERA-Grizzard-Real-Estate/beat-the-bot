import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import GameShow from "./routes/GameShow";

// Router and providers only.
//
// Today there is one screen, the live game show, mounted at both / and
// /gameshow. The routes the handover spec plans — /login, /practice,
// /challenge/:token, /admin, /dashboard — get added by the phases that build
// them, so nothing here is a stub for a feature that does not exist yet.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GameShow />} />
        <Route path="/gameshow" element={<GameShow />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
