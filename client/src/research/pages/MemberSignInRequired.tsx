import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { researchAuthPath } from "@shared/research/auth-return-to";

// What a signed-out visitor sees on a member page while the shared review gate
// is locked. The member page itself never renders here; this replaces only the
// reviewer password form, which cannot open a member page anyway. Door labels
// match the public Access Hub so the same action reads the same everywhere.
export default function MemberSignInRequired({ returnTo, path }: { returnTo: string | null; path: string }) {
  const signInHref = researchAuthPath("/research/sign-in", returnTo);
  return (
    <section
      className="container-x"
      style={{ paddingTop: "var(--space-hero-top)", paddingBottom: "var(--space-hero-bottom)" }}
      aria-labelledby="member-sign-in-required-title"
      data-testid="member-sign-in-required"
    >
      <SeoHead
        title="Member sign in required, xenios research"
        description="This page is part of the private Xenios Research member area and opens after member sign in."
        path={path}
        robots="noindex, nofollow"
      />
      <div style={{ maxWidth: 560 }}>
        <p className="mono-cap text-pulse mb-6">xenios research</p>
        <h1 id="member-sign-in-required-title" className="display-m text-balance">
          Sign in to open this member page.
        </h1>
        <p className="mt-6 body-l text-ink-2">
          This page is part of the private Research member area. It opens after you sign in with your own member account.
          {returnTo ? " Signing in brings you back here." : ""}
        </p>
        <div className="mt-10 public-editorial-actions">
          <Link href={signInHref} className="btn btn-primary public-editorial-action" data-testid="link-member-entry-sign-in">
            Research member sign in
          </Link>
          <Link href="/research/order" className="btn btn-secondary public-editorial-action" data-testid="link-member-entry-order">
            Choose how to order
          </Link>
          <Link href="/research/support" className="btn btn-ghost public-editorial-action" data-testid="link-member-entry-support">
            Get support
          </Link>
        </div>
        <p className="mt-8 body-s text-ink-mute max-w-[60ch]">
          Not a member? <Link href="/research/apply">Apply for Research access</Link>, or
          use <Link href="/research/early-access">Private Early Access</Link>, the separate
          passwordless request and ordering experience. Research materials are not for human or veterinary use.
        </p>
      </div>
    </section>
  );
}
