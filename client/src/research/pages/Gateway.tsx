import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import Wordmark from "@/components/Wordmark";

// The private membership gateway (canonical structure). This page is the
// entirety of /research for a gated visitor: wordmark, eyebrow, headline, one
// sentence, two actions, three small footer links. No navigation, no catalog,
// no sections, no scrolling on common desktop sizes.
//
// Structural spacing is inline on purpose: this repo's Tailwind build drops
// most spacing utilities (known quirk), and the gateway must be pixel-exact.
// Buttons sit side by side on desktop and stack on narrow screens without
// media queries: each is min(100%, 240px) inside a wrapping flex row.

const footerLink: React.CSSProperties = { textDecoration: "none" };
const buttonStyle: React.CSSProperties = {
  height: 52,
  padding: "0 24px",
  fontSize: 15,
  width: "min(100%, 240px)",
  justifyContent: "center",
};

export default function Gateway() {
  return (
    <>
      <SeoHead
        title="xenios research, private membership"
        description="A private wellness and research environment for approved members."
        path="/research"
      />
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          paddingTop: "max(16px, env(safe-area-inset-top))",
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
          background:
            "radial-gradient(ellipse 70% 45% at 50% 38%, color-mix(in srgb, var(--pulse) 7%, transparent), transparent 70%)",
        }}
      >
        <main
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 24px",
          }}
        >
          <div style={{ maxWidth: 560, width: "100%", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 36 }}>
              <Wordmark size="md" />
            </div>
            <p className="mono-cap text-pulse" style={{ marginBottom: 20 }} data-testid="text-gateway-eyebrow">
              Private membership
            </p>
            <h1 className="display-m text-balance">Xenios Research</h1>
            <p className="body-l text-ink-2 text-balance" style={{ marginTop: 20, marginInline: "auto", maxWidth: "38ch" }}>
              A private wellness and research environment for approved members.
            </p>
            <div
              style={{
                marginTop: 44,
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 14,
              }}
            >
              <Link href="/research/apply" className="btn btn-primary" style={buttonStyle} data-testid="link-gateway-apply">
                Apply for Membership
              </Link>
              <Link href="/research/sign-in" className="btn btn-secondary" style={buttonStyle} data-testid="link-gateway-signin">
                Member Login
              </Link>
            </div>
          </div>
        </main>
        <footer style={{ padding: "0 24px 8px" }}>
          <nav
            aria-label="Gateway links"
            style={{ display: "flex", justifyContent: "center", gap: 32 }}
          >
            <Link href="/research/policies/privacy" className="body-s text-ink-mute hover:text-pulse transition-colors" style={footerLink}>Privacy</Link>
            <Link href="/research/policies/terms" className="body-s text-ink-mute hover:text-pulse transition-colors" style={footerLink}>Terms</Link>
            <a href="mailto:research@xeniostechnology.com" className="body-s text-ink-mute hover:text-pulse transition-colors" style={footerLink}>Support</a>
          </nav>
        </footer>
      </div>
    </>
  );
}
