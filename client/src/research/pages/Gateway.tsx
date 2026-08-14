import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import Wordmark from "@/components/Wordmark";

// The public access hub. This page is the entirety of /research for a signed-out
// visitor: one canonical-account explanation, a primary member path, and a
// progressively disclosed set of role-specific access paths. It never exposes
// catalog, pricing, products, or role-granting controls.
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

const textActionStyle: React.CSSProperties = {
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
  textDecoration: "underline",
  textUnderlineOffset: 4,
};

const accessLaneStyle: React.CSSProperties = {
  padding: "20px 22px",
  background: "var(--paper)",
};

export default function Gateway() {
  return (
    <>
      <SeoHead
        title="Access Xenios Research"
        description="Choose the Xenios Research access path that matches your approved account, invitation, or application."
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
            padding: "clamp(36px, 7vh, 72px) 24px",
          }}
        >
          <div style={{ maxWidth: 760, width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
              <Wordmark size="md" />
            </div>
            <p className="mono-cap text-pulse" style={{ marginBottom: 18, textAlign: "center" }} data-testid="text-gateway-eyebrow">
              Access hub
            </p>
            <h1 className="display-m text-balance" style={{ textAlign: "center" }}>Choose your Xenios access.</h1>
            <p
              className="body-l text-ink-2 text-balance"
              style={{ marginTop: 18, marginInline: "auto", maxWidth: "52ch", textAlign: "center" }}
              data-testid="text-gateway-account-model"
            >
              One Xenios account is reused across approved access. Each portal verifies server-authorized access before showing account data.
            </p>

            <section
              aria-labelledby="gateway-member-title"
              className="card"
              style={{
                marginTop: 36,
                padding: "clamp(22px, 4vw, 30px)",
              }}
            >
              <p className="mono-cap text-ink-mute">Member / customer</p>
              <h2 id="gateway-member-title" className="h3" style={{ marginTop: 8 }}>Membership access</h2>
              <p className="body-s text-ink-2" style={{ marginTop: 8, maxWidth: "58ch" }}>
                Sign in to an existing account, or apply for membership. An account and an approved membership are separate states.
              </p>
              <div
                style={{
                  marginTop: 22,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <Link href="/research/sign-in" className="btn btn-primary" style={buttonStyle} data-testid="link-gateway-signin">
                  Sign in
                </Link>
                <Link href="/research/apply" className="btn btn-secondary" style={buttonStyle} data-testid="link-gateway-apply">
                  Apply for membership
                </Link>
              </div>
              <div className="body-s text-ink-mute" style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: "4px 18px" }}>
                <Link href="/research/application-status" style={textActionStyle} data-testid="link-gateway-application-status">
                  Check application status
                </Link>
                <Link href="/research/reset-password" style={textActionStyle} data-testid="link-gateway-recovery">
                  Recover account
                </Link>
              </div>
            </section>

            <details
              className="card"
              style={{ marginTop: 14, padding: 0, overflow: "hidden" }}
              data-testid="gateway-other-access"
            >
              <summary
                className="body-m font-700"
                style={{ cursor: "pointer", minHeight: 56, padding: "17px 22px" }}
                data-testid="summary-gateway-other-access"
              >
                Partner, organization, supplier, or private access
              </summary>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                  gap: 1,
                  paddingTop: 1,
                  background: "var(--rule)",
                }}
              >
                <section aria-labelledby="gateway-partner-title" style={accessLaneStyle}>
                  <p className="mono-cap text-ink-mute">Affiliate / partner</p>
                  <h3 id="gateway-partner-title" className="body-m font-700" style={{ marginTop: 6 }}>Research Rep access</h3>
                  <p className="body-s text-ink-2" style={{ marginTop: 6 }}>
                    Approved partners use their Xenios identity. Applications and portal access remain separate.
                  </p>
                  <div className="body-s" style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
                    <Link href="/research/partners" style={textActionStyle} data-testid="link-gateway-partner-access">Partner program / access</Link>
                    <Link href="/research/partners/apply" style={textActionStyle} data-testid="link-gateway-partner-apply">Apply as a Research Rep</Link>
                  </div>
                </section>

                <section aria-labelledby="gateway-organization-title" style={accessLaneStyle}>
                  <p className="mono-cap text-ink-mute">Organization / professional</p>
                  <h3 id="gateway-organization-title" className="body-m font-700" style={{ marginTop: 6 }}>Business access</h3>
                  <p className="body-s text-ink-2" style={{ marginTop: 6 }}>
                    Owners and buyers enter through an approved invitation. Request help if your business access is not ready.
                  </p>
                  <Link href="/research/support" style={textActionStyle} className="body-s" data-testid="link-gateway-organization-access">
                    Request organization access
                  </Link>
                </section>

                <section aria-labelledby="gateway-supplier-title" style={accessLaneStyle}>
                  <p className="mono-cap text-ink-mute">Supplier / fulfillment</p>
                  <h3 id="gateway-supplier-title" className="body-m font-700" style={{ marginTop: 6 }}>Supplier access</h3>
                  <p className="body-s text-ink-2" style={{ marginTop: 6 }}>
                    Supplier workspaces are invitation-only and limited to authorized operational roles.
                  </p>
                  <Link href="/research/support" style={textActionStyle} className="body-s" data-testid="link-gateway-supplier-access">
                    Get supplier access help
                  </Link>
                </section>

                <section aria-labelledby="gateway-private-title" style={accessLaneStyle}>
                  <p className="mono-cap text-ink-mute">Private access</p>
                  <h3 id="gateway-private-title" className="body-m font-700" style={{ marginTop: 6 }}>Invitation or cohort access</h3>
                  <p className="body-s text-ink-2" style={{ marginTop: 6 }}>
                    Use a private invitation or the approved Early Access cohort gate. This does not create a separate identity.
                  </p>
                  <Link href="/research/early-access" style={textActionStyle} className="body-s" data-testid="link-gateway-early-access">
                    Private Early Access
                  </Link>
                </section>
              </div>
            </details>

            <p className="body-s text-ink-mute" style={{ marginTop: 18, textAlign: "center" }}>
              Not sure which path applies? <Link href="/research/support" className="underline" data-testid="link-gateway-support">Contact support</Link>.
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
            <Link href="/research/application-status" className="body-s text-ink-mute hover:text-pulse transition-colors" style={footerTouchLink}>Application status</Link>
            <Link href="/admin/research" className="body-s text-ink-mute hover:text-pulse transition-colors" style={footerTouchLink}>Admin / Internal</Link>
          </nav>
        </footer>
      </div>
    </>
  );
}
