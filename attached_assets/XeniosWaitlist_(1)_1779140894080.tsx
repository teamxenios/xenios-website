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
//   "use client";
//   import XeniosWaitlist from "@/components/XeniosWaitlist";
//   export default function Page() { return <XeniosWaitlist />; }
//
// Usage in Vite/CRA:
//   import XeniosWaitlist from "./XeniosWaitlist";
//   export default function App() { return <XeniosWaitlist />; }
//
// Fonts: Inter + JetBrains Mono are loaded via Google Fonts inside the
// component (one <link> tag), so no setup required.
//
// Waitlist API: POSTs the full form payload to WAITLIST_ENDPOINT.
//   { name, email, role, practice, about }
// If your existing endpoint differs, change the constant below.
// If the response is JSON with a `position` field, the success message
// surfaces it. If a GET to the same endpoint returns { count: number },
// the live count is used; otherwise FALLBACK_COUNT is shown.

"use client";

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

const ROLE_OPTIONS = [
  "Personal trainer / strength coach",
  "Online fitness coach",
  "Nutrition coach / dietitian",
  "Health & wellness coach",
  "Yoga / pilates / movement",
  "Sports performance coach",
  "Recovery / mobility / PT",
  "Endurance / run coach",
  "Functional medicine / integrative",
  "Longevity / biomarker coach",
  "Studio / gym / multi-coach team",
  "Member / individual",
  "Investor / partner",
  "Other",
];

const PRACTICE_OPTIONS = [
  "Solo / just me",
  "2–10 clients",
  "10–50 clients",
  "50–200 clients",
  "200+ clients",
  "Team of coaches",
  "Not applicable",
];

/* ─────────────────────────────────────────────────────────────────────────
   Icons
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
   The Venn — coach / client / clinician
   ───────────────────────────────────────────────────────────────────────── */

function Venn() {
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
      {/* Corner anchor labels — load-bearing language, no explanation. */}
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

      <CircleLabel x="14%" y="36%">the coach</CircleLabel>
      <CircleLabel x="86%" y="36%" anchor="right">the client</CircleLabel>
      <CircleLabel x="50%" y="88%" anchor="center">the clinician</CircleLabel>

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
          fontSize: "clamp(28px, 3.5vw, 38px)",
          whiteSpace: "nowrap",
        }}
      >
        xenios.
      </span>
    </div>
  );
}

function CornerLabel({ pos, children }: { pos: "tl" | "tr" | "bl" | "br"; children: ReactNode }) {
  const map: Record<string, React.CSSProperties> = {
    tl: { top: 0, left: 0 },
    tr: { top: 0, right: 0 },
    bl: { bottom: 0, left: 0 },
    br: { bottom: 0, right: 0 },
  };
  return (
    <span
      className="xen-corner"
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
        fontSize: "clamp(13px, 1.2vw, 15px)",
        whiteSpace: "nowrap",
        letterSpacing: "-0.005em",
      }}
    >
      {children}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Form field with hairline-underline + focus gradient
   ───────────────────────────────────────────────────────────────────────── */

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div style={{ position: "relative" }} className="xen-field">
      <label
        htmlFor={id}
        style={{
          display: "block",
          fontFamily: FONT_MONO,
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: C.inkFaint,
          marginBottom: 4,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const fieldInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 0 8px 0",
  background: "transparent",
  color: C.ink,
  fontFamily: FONT_SANS,
  fontSize: 14,
  border: "none",
  borderBottom: `1px solid ${C.rule}`,
  outline: "none",
  borderRadius: 0,
  appearance: "none",
  WebkitAppearance: "none",
};

/* ─────────────────────────────────────────────────────────────────────────
   Waitlist form
   ───────────────────────────────────────────────────────────────────────── */

function Waitlist() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "",
    practice: "",
    about: "",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [position, setPosition] = useState<number | null>(null);
  const [error, setError] = useState("");

  function update<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.email || !form.name || !form.role || status === "loading") return;
    setStatus("loading");
    setError("");
    try {
      const res = await fetch(WAITLIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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
          marginTop: 8,
          lineHeight: 1.7,
        }}
      >
        ▸ On the list
        {position !== null && <> · Position #{position}</>}
        <br />
        We'll be in touch when your cohort opens.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 2 }}>
      <div className="xen-field-row">
        <Field id="xen-name" label="Name">
          <input
            id="xen-name"
            type="text"
            required
            autoComplete="name"
            placeholder="Full name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            disabled={status === "loading"}
            style={fieldInputStyle}
          />
        </Field>
        <Field id="xen-email" label="Email">
          <input
            id="xen-email"
            type="email"
            required
            autoComplete="email"
            placeholder="your@email.com"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            disabled={status === "loading"}
            style={fieldInputStyle}
          />
        </Field>
      </div>

      <div className="xen-field-row">
        <Field id="xen-role" label="I am a">
          <select
            id="xen-role"
            required
            value={form.role}
            onChange={(e) => update("role", e.target.value)}
            disabled={status === "loading"}
            style={{ ...fieldInputStyle, paddingRight: 18 }}
          >
            <option value="" disabled>Select your role</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field id="xen-practice" label="Practice size">
          <select
            id="xen-practice"
            value={form.practice}
            onChange={(e) => update("practice", e.target.value)}
            disabled={status === "loading"}
            style={{ ...fieldInputStyle, paddingRight: 18 }}
          >
            <option value="" disabled>Optional</option>
            {PRACTICE_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field id="xen-about" label="Tell us about your practice (optional)">
        <textarea
          id="xen-about"
          rows={2}
          placeholder="What you do, what tools you use today, what would change if you had this"
          value={form.about}
          onChange={(e) => update("about", e.target.value)}
          disabled={status === "loading"}
          style={{
            ...fieldInputStyle,
            minHeight: 44,
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />
      </Field>

      <button
        type="submit"
        disabled={status === "loading"}
        className="xen-cta"
        style={{
          height: 48,
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
          alignSelf: "flex-start",
          minWidth: 200,
          marginTop: 4,
        }}
      >
        {status === "loading" ? "…" : "Request a seat"}
      </button>

      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: C.inkFaint,
          marginTop: 2,
        }}
      >
        Founder-direct onboarding · We read every response
      </div>

      {status === "err" && (
        <div
          style={{
            marginTop: 4,
            fontFamily: FONT_MONO,
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: C.inkSoft,
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

  useEffect(() => {
    if (typeof document === "undefined") return;
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

        .xen-cta:hover:not(:disabled) {
          background-position: 100% 50% !important;
          transform: scale(1.02);
        }
        .xen-footer-link:hover { color: ${C.ink} !important; }

        /* form fields — gradient underline on focus */
        .xen-field input, .xen-field select, .xen-field textarea { transition: border-color 200ms ease; }
        .xen-field input::placeholder, .xen-field textarea::placeholder { color: ${C.inkFaint}; }
        .xen-field input:focus, .xen-field select:focus, .xen-field textarea:focus {
          border-bottom-color: transparent;
          border-image: linear-gradient(90deg, ${C.gradFrom}, ${C.gradVia}, ${C.gradTo}) 1;
        }

        .xen-stage {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 56px;
          align-items: center;
          padding: 20px 80px 24px;
          max-width: 1400px;
          margin: 0 auto;
          width: 100%;
        }
        .xen-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

        .xen-vertical {
          writing-mode: vertical-rl;
          text-orientation: mixed;
          letter-spacing: 0.18em;
        }

        @media (max-width: 1023px) {
          .xen-stage { grid-template-columns: 1fr; gap: 32px; padding: 24px 24px 48px; }
          .xen-vertical-wrap, .xen-manifesto-fixed { display: none !important; }
        }
        @media (max-width: 767px) {
          .xen-corner { display: none !important; }
          .xen-field-row { grid-template-columns: 1fr; gap: 12px; }
          .xen-footer-label { display: none; }
          .xen-stage { padding: 20px 20px 32px; }
          .xen-cta { width: 100%; align-self: stretch !important; }
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
            <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em", color: C.ink }}>
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

        {/* ─── Right margin vertical text ──────────────────────────── */}
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

        {/* ─── Bottom-left manifesto ───────────────────────────────── */}
        <div
          className="xen-manifesto-fixed"
          style={{
            position: "fixed",
            left: 24,
            bottom: 96,
            fontFamily: FONT_MONO,
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            lineHeight: 1.7,
            color: C.inkSoft,
            maxWidth: 240,
            pointerEvents: "none",
            userSelect: "none",
            zIndex: 5,
          }}
        >
          A category forming in real time<br />
          as AI memory, regulated care, and<br />
          proactive health converge
        </div>

        {/* ─── Stage ───────────────────────────────────────────────── */}
        <section className="xen-stage">
          {/* Left: Venn */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
            <Venn />
          </div>

          {/* Right: Copy + Form */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 520 }}>
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: C.inkSoft,
              }}
            >
              The operating system for proactive health and wellness
            </span>

            <h1
              style={{
                fontFamily: FONT_SANS,
                fontWeight: 500,
                color: C.ink,
                letterSpacing: "-0.015em",
                lineHeight: 1.1,
                margin: 0,
                fontSize: "clamp(26px, 2.6vw, 34px)",
              }}
            >
              One platform for the professional, the client, and the clinical layer between them.
            </h1>

            <p
              style={{
                fontFamily: FONT_SANS,
                fontSize: 14,
                color: C.inkSoft,
                lineHeight: 1.55,
                margin: 0,
              }}
            >
              Xenios replaces the fifteen-tool stack underneath trainers, coaches, and practitioners
              with one substrate — and gives every client an AI companion that remembers everything.
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
              Live · {count.toLocaleString()} already in line
            </div>

            <p
              style={{
                fontFamily: FONT_SANS,
                fontSize: 12,
                color: C.inkSoft,
                lineHeight: 1.55,
                margin: 0,
                paddingTop: 10,
                borderTop: `1px solid ${C.rule}`,
              }}
            >
              Built for personal trainers, strength coaches, nutritionists and dietitians, health and
              wellness coaches, sports performance staff, yoga and movement instructors, recovery and
              mobility specialists, run and endurance coaches, functional medicine practitioners,
              longevity coaches, and the studios, gyms, and teams that run them.
            </p>
          </div>
        </section>

        {/* Mobile manifesto */}
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
            maxWidth: 320,
            margin: "0 auto",
            padding: "0 24px 32px",
          }}
        >
          A category forming in real time<br />
          as AI memory, regulated care, and<br />
          proactive health converge
        </div>

        {/* ─── Footer ─────────────────────────────────────────────── */}
        <footer style={{ borderTop: `1px solid ${C.rule}`, marginTop: "auto" }}>
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
              minHeight: 40,
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
