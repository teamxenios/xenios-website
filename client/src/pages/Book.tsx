import { useEffect, useState } from "react";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { getConfig } from "@/lib/config";
import { trackSchedule } from "@/lib/tracking";

const CALENDLY_SRC = "https://assets.calendly.com/assets/external/widget.js";
const CONTACT_EMAIL = "team@xeniostechnology.com";

export default function Book() {
  const [calendlyUrl, setCalendlyUrl] = useState<string>("");
  const [booked, setBooked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getConfig().then((cfg) => {
      if (!cancelled) setCalendlyUrl(cfg.calendlyUrl);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!calendlyUrl) return;

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CALENDLY_SRC}"]`);
    if (!existing) {
      const script = document.createElement("script");
      script.src = CALENDLY_SRC;
      script.async = true;
      document.head.appendChild(script);
    }

    function onMessage(e: MessageEvent) {
      if (e.data && typeof e.data === "object" && e.data.event === "calendly.event_scheduled") {
        trackSchedule();
        setBooked(true);
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [calendlyUrl]);

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
        {calendlyUrl && (
          <div
            className="calendly-inline-widget"
            data-url={calendlyUrl}
            style={{ minWidth: "320px", minHeight: 700 }}
            data-testid="embed-calendly"
          />
        )}
        <p className="mt-8 body-s text-ink-2">
          Prefer email? Reach us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-700 hover:text-pulse" data-testid="link-contact-email">{CONTACT_EMAIL}</a>.
        </p>
      </section>
    </PageShell>
  );
}
