// XeniosWaitlist.tsx
//
// Drop-in single-file React component for xeniostechnology.com.
// Replaces the entire current homepage with a one-screen coming-soon + waitlist.
//
// Zero dependencies beyond React. No Tailwind required (uses inline styles
// + a single <style> block). Works in any Next.js / Vite / CRA Replit project.
//
// Usage in Next.js app router:
//   // app/page.tsx
//   import XeniosWaitlist from "@/components/XeniosWaitlist";
//   export default function Page() { return <XeniosWaitlist />; }
//
// Usage in Vite/CRA:
//   // src/App.tsx
//   import XeniosWaitlist from "./XeniosWaitlist";
//   export default function App() { return <XeniosWaitlist />; }
//
// Fonts: Inter + JetBrains Mono are loaded via Google Fonts inside the
// component (one <link> tag), so no setup required.
//
// Waitlist API: POSTs { email } to WAITLIST_ENDPOINT. If your existing
// endpoint differs, change the constant below. If the response is JSON
// with a `position` field, the success message surfaces it. If a GET to
// the same endpoint returns { count: number }, the live count is used;
// otherwise FALLBACK_COUNT is shown.

import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";

const WAITLIST_ENDPOINT = "/api/waitlist";
const FALLBACK_COUNT = 551;

/* ─────────────────────────────────────────────────────────────────────────
   Tokens
   ───────────────────────────────────────────────────────────────────────── */

const C = {
  bg: "#FFFFFF",
  ink: "#0A0A0A",
  inkSoft: "#6B6B6B",
  inkFaint: "#B5B5B5",
  rule: "#E5E5E5",
  gradFrom: "#7C3AED",
  gradVia: "#6366F1",
  gradTo: "#06B6D4",
};

const FONT_SANS =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
const FONT_MONO =
  "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

const GRADIENT = `linear-gradient(120deg, ${C.gradFrom} 0%, ${C.gradVia} 50%, ${C.gradTo} 100%)`;

/* ─────────────────────────────────────────────────────────────────────────
   Icons — line-style, 12px, stroke: currentColor
   ───────────────────────────────────────────────────────────────────────── */

const IconX = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconLinkedIn = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 10.5v6M8 7.5v.01M12 16.5v-3.75a1.75 1.75 0 013.5 0V16.5M12 16.5v-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconInstagram = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
  </svg>
);

const IconMail = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/* ─────────────────────────────────────────────────────────────────────────
   Pulsing status dot
   ───────────────────────────────────────────────────────────────────────── */

function Dot() {
  return (
    <span
      aria-hidden
      className="xen-dot"
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: GRADIENT,
      }}
    />
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   The Venn — three overlapping circles, gradient fill at 14% opacity,
   mix-blend-multiply so overlaps deepen on their own.
   ───────────────────────────────────────────────────────────────────────── */

function Venn() {
  // SVG viewBox is 400x400. Three circles arranged so all three overlap
  // in a small central zone where the wordmark sits.
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 400,
        aspectRatio: "1 / 1",
        margin: "0 auto",
      }}
    >
      {/* Corner anchor labels — load-bearing language, no explanation.
          Hidden on small screens to keep the page breathing. */}
      <CornerLabel pos="tl">Operating layer</CornerLabel>
      <CornerLabel pos="tr">Identity-aware</CornerLabel>
      <CornerLabel pos="bl">Longitudinal</CornerLabel>
      <CornerLabel pos="br">Continuous</CornerLabel>

      <svg
        viewBox="0 0 400 400"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          mixBlendMode: "multiply",
        }}
        aria-hidden
      >
        <defs>
          <linearGradient id="xen-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={C.gradFrom} />
            <stop offset="50%" stopColor={C.gradVia} />
            <stop offset="100%" stopColor={C.gradTo} />
          </linearGradient>
        </defs>

        <circle cx="155" cy="170" r="110" fill="url(#xen-grad)" opacity="0.14" className="xen-circle-a" />
        <circle cx="245" cy="170" r="110" fill="url(#xen-grad)" opacity="0.14" className="xen-circle-b" />
        <circle cx="200" cy="245" r="110" fill="url(#xen-grad)" opacity="0.14" className="xen-circle-c" />
      </svg>

      {/* Circle labels — set in the centroid of each circle's non-overlapping
          lobe, so the eye reads three forces converging on the center word. */}
      <CircleLabel x="14%" y="36%">the practitioner</CircleLabel>
      <CircleLabel x="86%" y="36%" anchor="right">the person</CircleLabel>
      <CircleLabel x="50%" y="88%" anchor="center">the protocol</CircleLabel>

      {/* The punchline — sits at the three-way intersection. */}
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: "55%",
          transform: "translate(-50%, -50%)",
          fontFamily: FONT_SANS,
          fontWeight: 600,
          color: C.ink,
          letterSpacing: "-0.02em",
          fontSize: "clamp(28px, 4vw, 40px)",
          whiteSpace: "nowrap",
        }}
      >
        xenios.
      </span>
    </div>
  );
}

function CornerLabel({
  pos,
  children,
}: {
  pos: "tl" | "tr" | "bl" | "br";
  children: ReactNode;
}) {
  const map: Record<string, React.CSSProperties> = {
    tl: { top: 0, left: 0 },
    tr: { top: 0, right: 0 },
    bl: { bottom: 0, left: 0 },
    br: { bottom: 0, right: 0 },
  };
  return (
    <span
      className="xen-only-md"
      style={{
        position: "absolute",
        ...map[pos],
        fontFamily: FONT_MONO,
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: C.inkFaint,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function CircleLabel({
  x,
  y,
  anchor = "left",
  children,
}: {
  x: string;
  y: string;
  anchor?: "left" | "right" | "center";
  children: ReactNode;
}) {
  const transform =
    anchor === "right"
      ? "translate(-100%, -50%)"
      : anchor === "center"
      ? "translate(-50%, -50%)"
      : "translate(0, -50%)";
  return (
    <span
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform,
        fontFamily: FONT_SANS,
        fontWeight: 500,
        color: C.ink,
        fontSize: "clamp(13px, 1.4vw, 16px)",
        whiteSpace: "nowrap",
        letterSpacing: "-0.005em",
      }}
    >
      {children}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Waitlist form
   ───────────────────────────────────────────────────────────────────────── */

function Waitlist() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [position, setPosition] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email || status === "loading") return;
    setStatus("loading");
    setError("");

    try {
      const res = await fetch(WAITLIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      try {
        const data = await res.json();
        if (typeof data?.position === "number") setPosition(data.position);
      } catch {
        /* no body, fine */
      }
      setStatus("ok");
    } catch {
      setStatus("err");
      setError("Something went wrong. Try again.");
    }
  }

  if (status === "ok") {
    return (
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: C.ink,
          textAlign: "center",
          marginTop: 4,
        }}
      >
        ▸ On the list
        {position !== null && <> · Position #{position}</>}
        {" · We'll be in touch when your cohort opens"}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} style={{ width: "100%", maxWidth: 480, margin: "0 auto" }}>
      <div className="xen-form-row">
        <div style={{ position: "relative", flex: 1 }}>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="your@email.com"
            disabled={status === "loading"}
            style={{
              width: "100%",
              height: 52,
              padding: "0 0 4px 0",
              background: "transparent",
              color: C.ink,
              fontFamily: FONT_SANS,
              fontSize: 15,
              border: "none",
              borderBottom: `1px solid ${C.rule}`,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 1,
              background: GRADIENT,
              opacity: focused ? 1 : 0,
              transition: "opacity 300ms ease",
              pointerEvents: "none",
            }}
          />
        </div>

        <button
          type="submit"
          disabled={status === "loading"}
          className="xen-cta"
          style={{
            height: 52,
            padding: "0 28px",
            borderRadius: 9999,
            color: "#fff",
            fontFamily: FONT_SANS,
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: "-0.005em",
            border: "none",
            cursor: status === "loading" ? "wait" : "pointer",
            background: GRADIENT,
            backgroundSize: "200% 100%",
            backgroundPosition: "0% 50%",
            transition: "background-position 600ms ease, transform 250ms ease, opacity 200ms ease",
            opacity: status === "loading" ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {status === "loading" ? "…" : "Request a seat"}
        </button>
      </div>
      {status === "err" && (
        <div
          style={{
            marginTop: 12,
            fontFamily: FONT_MONO,
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: C.inkSoft,
            textAlign: "center",
          }}
        >
          {error}
        </div>
      )}
    </form>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Footer link
   ───────────────────────────────────────────────────────────────────────── */

function FooterLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: ReactNode;
  label: string;
}) {
  const isMail = href.startsWith("mailto:");
  return (
    <a
      href={href}
      target={isMail ? undefined : "_blank"}
      rel={isMail ? undefined : "noopener noreferrer"}
      className="xen-footer-link"
      aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontFamily: FONT_MONO,
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: C.inkSoft,
        textDecoration: "none",
        transition: "color 200ms ease",
      }}
    >
      {icon}
      <span className="xen-footer-label">{label}</span>
    </a>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Page
   ───────────────────────────────────────────────────────────────────────── */

export default function XeniosWaitlist() {
  const [count, setCount] = useState<number>(FALLBACK_COUNT);

  // Try to pick up a live count if /api/waitlist exposes one via GET.
  useEffect(() => {
    let cancelled = false;
    fetch(WAITLIST_ENDPOINT, { method: "GET" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d.count === "number") setCount(d.count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Inject Google Fonts once (idempotent in case multiple instances mount).
  useEffect(() => {
    const id = "xen-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";
    document.head.appendChild(link);
  }, []);

  return (
    <>
      <style>{`
        html, body { background: ${C.bg}; color: ${C.ink}; margin: 0; padding: 0; }
        body {
          font-family: ${FONT_SANS};
          font-feature-settings: 'ss01', 'cv11';
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        * { box-sizing: border-box; }

        /* venn drift — three phases, slow, breathy */
        @keyframes xen-drift-a { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-4px, 3px); } }
        @keyframes xen-drift-b { 0%,100% { transform: translate(0,0); } 50% { transform: translate(5px, 2px); } }
        @keyframes xen-drift-c { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-2px, -4px); } }
        .xen-circle-a { transform-origin: center; transform-box: fill-box; animation: xen-drift-a 22s ease-in-out infinite; }
        .xen-circle-b { transform-origin: center; transform-box: fill-box; animation: xen-drift-b 26s ease-in-out infinite; }
        .xen-circle-c { transform-origin: center; transform-box: fill-box; animation: xen-drift-c 24s ease-in-out infinite; }

        @keyframes xen-pulse { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
        .xen-dot { animation: xen-pulse 2s ease-in-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .xen-circle-a, .xen-circle-b, .xen-circle-c, .xen-dot { animation: none; }
        }

        /* CTA hover */
        .xen-cta:hover:not(:disabled) {
          background-position: 100% 50% !important;
          transform: scale(1.02);
        }

        /* footer link hover */
        .xen-footer-link:hover { color: ${C.ink} !important; }

        /* form row */
        .xen-form-row {
          display: flex;
          flex-direction: row;
          gap: 16px;
          align-items: stretch;
        }

        /* vertical right-margin text */
        .xen-vertical {
          writing-mode: vertical-rl;
          text-orientation: mixed;
          letter-spacing: 0.18em;
        }

        /* responsive helpers */
        .xen-only-md { display: inline-block; }
        @media (max-width: 767px) {
          .xen-only-md { display: none !important; }
          .xen-form-row { flex-direction: column; gap: 12px; }
          .xen-footer-label { display: none; }
          .xen-vertical-wrap, .xen-manifesto-fixed { display: none !important; }
        }
        @media (min-width: 768px) {
          .xen-manifesto-mobile { display: none !important; }
        }
      `}</style>

      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          background: C.bg,
          color: C.ink,
          position: "relative",
        }}
      >
        {/* ─── Top bar ─────────────────────────────────────────────── */}
        <header style={{ borderBottom: `1px solid ${C.rule}` }}>
          <div
            style={{
              maxWidth: 1400,
              margin: "0 auto",
              height: 64,
              padding: "0 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontFamily: FONT_SANS,
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: C.ink,
              }}
            >
              xenios.
            </span>
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: C.inkSoft,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Dot />
              <span>Cohort 01 · Open · May 2026</span>
            </span>
          </div>
        </header>

        {/* ─── Right margin vertical text (desktop only) ────────────── */}
        <div
          className="xen-vertical-wrap"
          style={{
            position: "fixed",
            right: 14,
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
            userSelect: "none",
            zIndex: 5,
          }}
        >
          <span
            className="xen-vertical"
            style={{
              fontFamily: FONT_MONO,
              fontSize: 10,
              textTransform: "uppercase",
              color: C.inkFaint,
            }}
          >
            Xenios Technologies, Inc. · Delaware C-Corp · Austin, TX · Confidential · May 2026
          </span>
        </div>

        {/* ─── Bottom-left manifesto (desktop only) ────────────────── */}
        <div
          className="xen-manifesto-fixed"
          style={{
            position: "fixed",
            left: 40,
            bottom: 112,
            fontFamily: FONT_MONO,
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            lineHeight: 1.7,
            color: C.inkSoft,
            maxWidth: 280,
            pointerEvents: "none",
            userSelect: "none",
            zIndex: 5,
          }}
        >
          A category forming in real time<br />
          as AI memory, regulated care, and<br />
          programmable health converge
        </div>

        {/* ─── Center stage ────────────────────────────────────────── */}
        <section
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px 24px 16px",
            gap: 16,
          }}
        >
          <Venn />

          <div
            style={{
              width: "100%",
              maxWidth: 640,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
              textAlign: "center",
            }}
          >
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: C.inkSoft,
              }}
            >
              The operating system for human performance
            </span>

            <h1
              style={{
                fontFamily: FONT_SANS,
                fontWeight: 500,
                color: C.ink,
                letterSpacing: "-0.015em",
                lineHeight: 1.1,
                margin: 0,
                fontSize: "clamp(24px, 3vw, 34px)",
              }}
            >
              The substrate beneath the work of being well.
            </h1>

            <p
              style={{
                fontFamily: FONT_SANS,
                fontSize: 16,
                color: C.inkSoft,
                lineHeight: 1.6,
                maxWidth: 560,
                margin: 0,
              }}
            >
              One agent in the practitioner's voice. One companion in the person's pocket.
              One continuous record across decades.
            </p>

            <Waitlist />

            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: C.inkSoft,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginTop: 4,
              }}
            >
              <Dot />
              Live · {count.toLocaleString()} already in line · Founder-direct onboarding
            </div>
          </div>

          {/* Mobile-only manifesto */}
          <div
            className="xen-manifesto-mobile"
            style={{
              fontFamily: FONT_MONO,
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              lineHeight: 1.7,
              color: C.inkSoft,
              textAlign: "center",
              maxWidth: 300,
            }}
          >
            A category forming in real time<br />
            as AI memory, regulated care, and<br />
            programmable health converge
          </div>
        </section>

        {/* ─── Footer ─────────────────────────────────────────────── */}
        <footer style={{ borderTop: `1px solid ${C.rule}` }}>
          <div style={{ borderBottom: `1px solid ${C.rule}` }}>
            <div
              style={{
                maxWidth: 1400,
                margin: "0 auto",
                height: 48,
                padding: "0 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 28,
              }}
            >
              <FooterLink href="https://x.com/xeniostech" icon={<IconX />} label="X / Twitter" />
              <FooterLink href="https://www.linkedin.com/company/xeniostech" icon={<IconLinkedIn />} label="LinkedIn" />
              <FooterLink href="https://www.instagram.com/officialxenios" icon={<IconInstagram />} label="Instagram" />
              <FooterLink href="mailto:team@xeniostechnology.com" icon={<IconMail />} label="team@xeniostechnology.com" />
            </div>
          </div>

          <div
            style={{
              maxWidth: 1400,
              margin: "0 auto",
              padding: "12px 24px",
              minHeight: 48,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              fontFamily: FONT_MONO,
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: C.inkSoft,
            }}
          >
            <span>Xenios Technologies, Inc. · Delaware C-Corp</span>
            <span>Austin, TX · Remote First</span>
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <a href="/privacy" className="xen-footer-link" style={{ color: C.inkSoft, textDecoration: "none", transition: "color 200ms ease" }}>Privacy</a>
              <span aria-hidden>·</span>
              <a href="/terms" className="xen-footer-link" style={{ color: C.inkSoft, textDecoration: "none", transition: "color 200ms ease" }}>Terms</a>
            </span>
          </div>
        </footer>
      </main>
    </>
  );
}
