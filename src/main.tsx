import { createRoot } from "react-dom/client";
import { enforceSessionOnlyAuth } from "./lib/session-auth";
import App from "./App.tsx";
import "./index.css";

// Clear stale auth tokens on fresh browser sessions BEFORE React renders
enforceSessionOnlyAuth();

createRoot(document.getElementById("root")!).render(<App />);
