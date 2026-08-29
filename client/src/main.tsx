import { createRoot } from "react-dom/client";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";
import "./fonts";
import "./index.css";
import { initAttribution } from "./lib/attribution";
import { initTracking, installResearchDocumentBoundary } from "./lib/tracking";
import { registerXeniosPwa } from "./pwa/register";
import { PwaLifecycle } from "./pwa/PwaLifecycle";

installResearchDocumentBoundary();
initAttribution();
void initTracking();
registerXeniosPwa();

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <App />
    <PwaLifecycle />
  </AppErrorBoundary>,
);
