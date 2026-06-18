import { useEffect, useRef, useState } from "react";
import { getConfig } from "@/lib/config";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve) => {
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      if (window.turnstile) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface Props {
  onToken: (token: string) => void;
  onDark?: boolean;
}

/**
 * Cloudflare Turnstile widget. Renders only when a site key is configured;
 * otherwise it stays invisible and the server skips verification.
 */
export default function Turnstile({ onToken, onDark = false }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  const [siteKey, setSiteKey] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getConfig().then((c) => {
      if (alive) setSiteKey(c.turnstileSiteKey);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || !ref.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        theme: onDark ? "dark" : "light",
        callback: (token: string) => onToken(token),
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
    });
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          /* noop */
        }
        widgetId.current = null;
      }
    };
  }, [siteKey, onDark, onToken]);

  if (!siteKey) return null;
  return <div ref={ref} className="mt-2" data-testid="turnstile-widget" />;
}
