import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import Wordmark from "@/components/Wordmark";

// The public membership gateway (canonical structure). This page is the
// entirety of /research for a signed-out visitor: wordmark, eyebrow, headline, one
// sentence, two actions, three small footer links. No navigation, no catalog,
// no sections, no scrolling on common desktop sizes.
//
// Structural spacing is inline on purpose: this repo's Tailwind build drops
// most spacing utilities (known quirk), and the gateway must be pixel-exact.
// Buttons sit side by side on desktop and stack on narrow screens without
// media queries: each is min(100%, 240px) inside a wrapping flex row.

const footerLink: React.CSSProperties = { textDecoration: "none" };
const footerTouchLink: React.CSSProperties = {
  ...footerLink,
  minHeight: 44,
  padding: "12px 2px",
  display: "inline-flex",
  alignItems: "center",
};
const buttonStyle: React.CSSProperties = {
  height: 52,
  padding: "0 24px",
  fontSize: 15,
  width: "100%",
  maxWidth: 240,
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
          background: "var(--paper)",
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
              <Link
                href="/research/early-access"
                className="btn btn-secondary"
                style={buttonStyle}
                data-testid="link-gateway-early-access"
              >
                Private Early Access
              </Link>
            </div>
            <p
              className="body-s text-ink-2 mt-5 max-w-[46ch]"
              style={{ marginLeft: "auto", marginRight: "auto" }}
              data-testid="text-gateway-early-access-support"
            >
              Already approved through the Xenios network? Enter the private ordering experience.
            </p>
            <p
              className="body-s text-ink-mute mt-4"
              style={{ marginLeft: "auto", marginRight: "auto" }}
            >
              <Link href="/research/access-hub" className="underline" data-testid="link-gateway-access-hub">
                Business, affiliate, supplier, Care, and other access options
              </Link>
            </p>
          </div>
        </main>
        <footer style={{ padding: "0 24px 8px" }}>
          <nav
            aria-label="Gateway links"
            style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", columnGap: 28, rowGap: 4 }}
          >
            <Link href="/research/privacy" className="body-s text-ink-mute hover:text-pulse transition-colors" style={footerTouchLink}>Privacy</Link>
            <Link href="/research/terms" className="body-s text-ink-mute hover:text-pulse transition-colors" style={footerTouchLink}>Terms</Link>
            <Link href="/research/support" className="body-s text-ink-mute hover:text-pulse transition-colors" style={footerTouchLink}>Support</Link>
          </nav>
        </footer>
      </div>
    </>
  );
}
