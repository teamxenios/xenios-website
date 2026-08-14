// PWA lifecycle UX — self-contained, mounted beside <App /> so no app surface
// is touched. Three affordances, all dismissible, none blocking:
//
//   1. UPDATE: when register.ts dispatches "xenios:pwa-update-available", a
//      quiet banner offers one-tap refresh (applyPwaUpdate -> SKIP_WAITING ->
//      controllerchange reload). Members are never force-reloaded mid-task.
//   2. INSTALL (Chromium): beforeinstallprompt is captured (preventDefault) and
//      surfaced as a small "Install xenios" pill; prompt() runs only on tap.
//   3. INSTALL (iOS Safari): no install API exists, so a one-time hint explains
//      Share -> Add to Home Screen. Shown only outside standalone mode.
//
// Privacy: the only state stored is a dismissal flag in sessionStorage —
// no identifiers, nothing durable, nothing private.

import { useEffect, useState } from "react";
import { applyPwaUpdate } from "./register";

const DISMISS_KEY = "xenios-pwa-hint-dismissed";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    nav.standalone === true
  );
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua);
  const safari = /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return ios && safari;
}

const pillStyle: React.CSSProperties = {
  position: "fixed",
  bottom: "1rem",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 2147483000,
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  background: "#000",
  color: "#fff",
  border: "1px solid #3f3f46",
  borderRadius: "9999px",
  padding: "0.5rem 1rem",
  fontSize: "0.85rem",
  maxWidth: "min(92vw, 26rem)",
  boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
};

const buttonStyle: React.CSSProperties = {
  appearance: "none",
  border: "1px solid #fff",
  borderRadius: "9999px",
  background: "transparent",
  color: "#fff",
  padding: "0.25rem 0.9rem",
  fontSize: "0.8rem",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const dismissStyle: React.CSSProperties = {
  appearance: "none",
  border: "none",
  background: "transparent",
  color: "#a1a1aa",
  fontSize: "0.8rem",
  cursor: "pointer",
  padding: "0.25rem",
};

export function PwaLifecycle(): React.JSX.Element | null {
  const [updateRegistration, setUpdateRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const [installPrompt, setInstallPrompt] =
    useState<InstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ registration?: ServiceWorkerRegistration }>).detail;
      if (detail?.registration) setUpdateRegistration(detail.registration);
    };
    window.addEventListener("xenios:pwa-update-available", onUpdate);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    try {
      if (
        !isStandalone() &&
        isIosSafari() &&
        window.sessionStorage.getItem(DISMISS_KEY) !== "1"
      ) {
        setShowIosHint(true);
      }
    } catch {
      // sessionStorage unavailable (private mode edge): show nothing.
    }

    return () => {
      window.removeEventListener("xenios:pwa-update-available", onUpdate);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  const dismiss = () => {
    setDismissed(true);
    setInstallPrompt(null);
    setShowIosHint(false);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Dismissal simply won't persist; acceptable.
    }
  };

  // The update banner outranks install hints: freshness before acquisition.
  if (updateRegistration) {
    return (
      <div style={pillStyle} role="status" aria-live="polite">
        <span>A new version of xenios is ready.</span>
        <button
          style={buttonStyle}
          onClick={() => applyPwaUpdate(updateRegistration)}
        >
          Refresh
        </button>
      </div>
    );
  }

  if (dismissed) return null;

  if (installPrompt) {
    return (
      <div style={pillStyle} role="status" aria-live="polite">
        <span>Add xenios to your home screen.</span>
        <button
          style={buttonStyle}
          onClick={() => {
            void installPrompt.prompt();
            setInstallPrompt(null);
          }}
        >
          Install
        </button>
        <button style={dismissStyle} onClick={dismiss} aria-label="Dismiss">
          ✕
        </button>
      </div>
    );
  }

  if (showIosHint) {
    return (
      <div style={pillStyle} role="status" aria-live="polite">
        <span>
          Install xenios: tap Share, then “Add to Home Screen”.
        </span>
        <button style={dismissStyle} onClick={dismiss} aria-label="Dismiss">
          ✕
        </button>
      </div>
    );
  }

  return null;
}
