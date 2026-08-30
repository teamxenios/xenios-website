import { useEffect, useRef, useState } from "react";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { isTrustedCalendlyScheduledMessage } from "@/lib/calendly-events";
import { getConfig } from "@/lib/config";
import { trackSchedule } from "@/lib/tracking";

const CALENDLY_SRC = "https://assets.calendly.com/assets/external/widget.js";
const CONTACT_EMAIL = "team@xeniostechnology.com";

declare global {
  interface Window {
    Calendly?: {
      initInlineWidget(options: { url: string; parentElement: HTMLElement }): void;
    };
  }
}

function safeSchedulingUrl(value: string): string {
  try {
    const parsed = new URL(value);
    const calendlyHost = parsed.hostname === "calendly.com"
      || parsed.hostname.endsWith(".calendly.com");
    return parsed.protocol === "https:" && calendlyHost ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function ensureCalendlyScript(): Promise<void> {
  if (window.Calendly?.initInlineWidget) return Promise.resolve();

  let script = document.querySelector<HTMLScriptElement>(`script[src="${CALENDLY_SRC}"]`);
  return new Promise((resolve, reject) => {
    const onLoad = () => {
      script!.dataset.xeniosCalendlyState = "loaded";
      if (window.Calendly?.initInlineWidget) resolve();
      else {
        script!.remove();
        reject(new Error("Calendly loaded without its widget API"));
      }
    };
    const onError = () => {
      script!.dataset.xeniosCalendlyState = "failed";
      script!.remove();
      reject(new Error("Calendly failed to load"));
    };

    if (script?.dataset.xeniosCalendlyState === "loaded") {
      script.remove();
      reject(new Error("Calendly widget API is unavailable"));
      return;
    }
    let shouldAppend = false;
    if (!script) {
      script = document.createElement("script");
      script.src = CALENDLY_SRC;
      script.async = true;
      shouldAppend = true;
    }
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (shouldAppend) document.head.appendChild(script);
  });
}

export default function Book() {
  const [calendlyUrl, setCalendlyUrl] = useState<string>("");
  const [calendarRequested, setCalendarRequested] = useState(false);
  const [calendarReady, setCalendarReady] = useState(false);
  const [calendarError, setCalendarError] = useState(false);
  const [booked, setBooked] = useState(false);
  const calendarHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    getConfig().then((cfg) => {
      if (!cancelled) setCalendlyUrl(safeSchedulingUrl(cfg.calendlyUrl));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!calendarRequested || !calendlyUrl) return;

    let active = true;
    setCalendarReady(false);
    setCalendarError(false);
    void ensureCalendlyScript().then(() => {
      if (!active || !calendarHostRef.current || !window.Calendly) return;
      try {
        window.Calendly.initInlineWidget({
          url: calendlyUrl,
          parentElement: calendarHostRef.current,
        });
        setCalendarReady(true);
      } catch {
        setCalendarReady(false);
        setCalendarError(true);
      }
    }, () => {
      if (active) {
        setCalendarReady(false);
        setCalendarError(true);
      }
    });

    function onMessage(e: MessageEvent) {
      const iframeWindow = calendarHostRef.current?.querySelector<HTMLIFrameElement>("iframe")
        ?.contentWindow ?? null;
      if (isTrustedCalendlyScheduledMessage(e, calendlyUrl, iframeWindow)) {
        trackSchedule();
        setBooked(true);
      }
    }

    window.addEventListener("message", onMessage);
    return () => {
      active = false;
      window.removeEventListener("message", onMessage);
    };
  }, [calendarRequested, calendlyUrl]);

  return (
    <PageShell>
      <SeoHead
        title="Book a call with xenios"
        description="Book a call with the xenios team."
        path="/book"
      />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">BOOK</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "18ch" }}>Book a call</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[60ch]">
          Choose a time that works for you and the xenios team will meet you there.
        </p>
      </section>

      <section className="container-x py-16 rule-top">
        {booked && (
          <p className="body-l text-ink mb-6" data-testid="text-booking-confirmed">Your call is booked.</p>
        )}
        {calendlyUrl && !calendarRequested && (
          <div className="space-y-4" data-testid="calendar-consent-boundary">
            <p className="body-s text-ink-2">
              The embedded scheduler loads content from Calendly only after you choose to load it.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setCalendarRequested(true)}
                data-testid="button-load-calendly"
              >
                Load scheduling calendar
              </button>
              <a
                href={calendlyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost"
                data-testid="link-open-calendly"
              >
                Open scheduler in a new tab
              </a>
            </div>
          </div>
        )}
        {calendlyUrl && calendarRequested && (
          <>
            <div
              ref={calendarHostRef}
              hidden={calendarError}
              style={{ minWidth: 0, width: "100%", minHeight: 700 }}
              data-testid="embed-calendly"
            />
            {!calendarReady && !calendarError && (
              <p className="mt-4 body-s text-ink-2" role="status" data-testid="calendar-loading">
                Loading the scheduler. If it does not appear, you can{" "}
                <a
                  href={calendlyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-700 hover:text-pulse"
                  data-testid="link-open-calendly-loading"
                >
                  open it in a new tab
                </a>.
              </p>
            )}
            {calendarError && (
              <div className="mt-6 space-y-3" role="alert" data-testid="calendar-load-error">
                <p className="body-s text-ink-2">
                  The embedded scheduler could not load. You can retry or open it directly.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setCalendarReady(false);
                      setCalendarError(false);
                      setCalendarRequested(false);
                    }}
                    data-testid="button-retry-calendly"
                  >
                    Retry calendar
                  </button>
                  <a
                    href={calendlyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost"
                    data-testid="link-open-calendly-error"
                  >
                    Open scheduler in a new tab
                  </a>
                </div>
              </div>
            )}
          </>
        )}
        <p className="mt-8 body-s text-ink-2">
          Prefer email? Reach us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-700 hover:text-pulse" data-testid="link-contact-email">{CONTACT_EMAIL}</a>.
        </p>
      </section>
    </PageShell>
  );
}
