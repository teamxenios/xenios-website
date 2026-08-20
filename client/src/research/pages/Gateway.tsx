import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import Wordmark from "@/components/Wordmark";

// The public membership gateway, now COMMERCIAL (founder launch directive
// 2026-08-19). This page is the entirety of /research for a signed-out
// visitor: wordmark, eyebrow, headline, one sentence, the two primary
// actions, the secondary doors, and three small footer links.
//
// PRIMARY: Browse Research Catalog. The catalog is the front door of a
// storefront, so it is the first thing a visitor can do, and it is reachable
// without any credential. The catalog surface itself fails closed: while the
// server has the storefront off it renders its "not open yet" state with the
// member and application doors still offered, so this button is never a dead
// end even before the storefront is enabled.
//
// SECONDARY: Member Sign In, for the people who already transact here.
//
// Apply, Early Access, and the other access options stay available below,
// because a visitor who cannot buy still needs a way in. Nothing on this page
// promises a purchase: what any given product supports is stated per product
// by the server, on the catalog and product pages.
//
// Structural spacing is inline on purpose: this repo's Tailwind build drops
// most spacing utilities (known quirk), and the gateway must be pixel-exact.
// Buttons sit side by side on desktop and stack on narrow screens without
// media queries: each is min(100%, 240px) inside a wrapping flex row, which
// is what keeps 320px through 430px safe with no horizontal scroll.

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
  // 240 is pinned by public-access-flow.test.tsx and is wide enough for the
  // longest CTA ("Browse Research Catalog" is ~172px at this size, plus 48px
  // of padding), so the commercial rework did not need to move it.
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
            <p
              className="mono-cap text-pulse"
              style={{ marginBottom: 20 }}
              data-testid="text-gateway-eyebrow"
            >
              Private membership
            </p>
            <h1 className="display-m text-balance">Xenios Research</h1>
            <p
              className="body-l text-ink-2 text-balance"
              style={{ marginTop: 20, marginInline: "auto", maxWidth: "38ch" }}
            >
              Research materials, supplements, and testing for approved members.
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
              <Link
                href="/research/catalog"
                className="btn btn-primary"
                style={buttonStyle}
                data-testid="link-gateway-catalog"
              >
                Browse Research Catalog
              </Link>
              <Link
                href="/research/sign-in"
                className="btn btn-secondary"
                style={buttonStyle}
                data-testid="link-gateway-signin"
              >
                Member Sign In
              </Link>
            </div>
            <p
              className="body-s text-ink-2 mt-5 max-w-[46ch]"
              style={{ marginLeft: "auto", marginRight: "auto" }}
              data-testid="text-gateway-catalog-support"
            >
              Browse prices and availability. Sign in to order, or request the
              items that need a person to complete them.
            </p>
            <div
              style={{
                marginTop: 24,
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 14,
              }}
            >
              <Link
                href="/research/apply"
                className="btn btn-secondary"
                style={buttonStyle}
                data-testid="link-gateway-apply"
              >
                Apply for Membership
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
              Already approved through the Xenios network? Enter the private
              ordering experience.
            </p>
            <p
              className="body-s text-ink-mute mt-4"
              style={{ marginLeft: "auto", marginRight: "auto" }}
            >
              <Link
                href="/research/access-hub"
                className="underline"
                data-testid="link-gateway-access-hub"
              >
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
