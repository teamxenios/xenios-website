import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initAttribution } from "./lib/attribution";

initAttribution();

createRoot(document.getElementById("root")!).render(<App />);
