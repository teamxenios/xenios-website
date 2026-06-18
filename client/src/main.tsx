import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initAttribution } from "./lib/attribution";
import { initTracking } from "./lib/tracking";

initAttribution();
void initTracking();

createRoot(document.getElementById("root")!).render(<App />);
