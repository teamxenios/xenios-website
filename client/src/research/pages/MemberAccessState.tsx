import type { ReactNode } from "react";
import { Link, Redirect } from "wouter";
import SeoHead from "@/components/SeoHead";
import { PageIntro } from "../components";
import { denialPresentation, isBillingDenialCode } from "../lib/denials";

// The distinct screens for server-issued member-access denial codes
// (server/research/member-auth.ts requireActiveMember and the guards under
// it). One code, one screen: each renders its own testid, its own copy from
// lib/denials (never the server message), and the one next step that actually
// resolves that state. activation_required never renders here; routing sends
// it to the canonical /research/activate flow (lib/member-routing.ts
// denialDestination).
//
// The ?code= query parameter is transport, not authority: the code always
// originated from a server refusal, this page grants nothing, and a
// hand-typed code reveals nothing beyond the public explanation text. The
// parameter is still validated against the code grammar so arbitrary text
// never influences rendering.

const CODE_GRAMMAR = /^[a-z][a-z0-9_]{0,63}$/;

function requestedCode(): string | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("code");
  if (!raw || !CODE_GRAMMAR.test(raw)) return null;
  return raw;
}

function SupportLink({ testid }: { testid: string }) {
  return (
    <a href="mailto:research@xeniostechnology.com" className="btn btn-secondary" data-testid={testid}>
      Contact support
    </a>
  );
}

function ScreenShell({
  testid,
  code,
  children,
}: {
  testid: string;
  code: string | null;
  children?: ReactNode;
}) {
  const copy = code ? denialPresentation(code) : null;
  const title = copy?.title ?? "This is not available right now.";
  const body = copy?.body ?? "The request was declined. Please try again, or contact support if it keeps happening.";
  return (
    <>
      <SeoHead title="Account access, xenios research" description="The state of your xenios research account access." path="/research/access-state" />
      <PageIntro eyebrow="Account access" title={title} lead={body} />
      <section className="container-x pb-20" role="alert" data-testid={testid}>
        <div className="max-w-[560px] space-y-4">
          {children}
          <p className="body-s text-ink-mute">
            <Link href="/research" className="underline" data-testid="link-access-state-gateway">Back to gateway</Link>
          </p>
        </div>
      </section>
    </>
  );
}

export default function MemberAccessState() {
  const code = requestedCode();

  // Activation has its own canonical screen; never render a duplicate here.
  if (code === "activation_required") return <Redirect to="/research/activate" />;

  if (code === "recovery_session") {
    return (
      <ScreenShell testid="access-state-recovery_session" code={code}>
        <div className="card">
          <p className="mono-label text-ink-mute">Next step</p>
          <p className="body-s text-ink-2 mt-2">
            This session can only finish a password reset. Complete the reset, then sign in with your new password.
          </p>
          <div className="mt-5 flex gap-3" style={{ flexWrap: "wrap" }}>
            <Link href="/research/reset-password" className="btn btn-primary" data-testid="link-access-state-reset">
              Finish password reset
            </Link>
            <Link href="/research/sign-in" className="btn btn-ghost" data-testid="link-access-state-signin">
              Member sign in
            </Link>
          </div>
        </div>
      </ScreenShell>
    );
  }

  if (code === "billing_past_due") {
    return (
      <ScreenShell testid="access-state-billing_past_due" code={code}>
        <div className="card">
          <p className="mono-label text-ink-mute">Next step</p>
          <p className="body-s text-ink-2 mt-2">
            Your membership stays reserved while billing is settled. Contact support and a person will put it right with you; nothing on your account is lost.
          </p>
          <div className="mt-5">
            <SupportLink testid="link-access-state-billing-support" />
          </div>
        </div>
      </ScreenShell>
    );
  }

  // The server emits billing_${state} dynamically for any non-active billing
  // state; every member-facing meaning is the same. Distinct from past-due so
  // the copy never claims a payment is late when the server did not say so.
  if (code && isBillingDenialCode(code)) {
    return (
      <ScreenShell testid="access-state-billing_attention" code={code}>
        <div className="card">
          <p className="mono-label text-ink-mute">Next step</p>
          <p className="body-s text-ink-2 mt-2">
            Contact support and a person will review your membership billing with you. Nothing on your account is lost.
          </p>
          <div className="mt-5">
            <SupportLink testid="link-access-state-billing-support" />
          </div>
        </div>
      </ScreenShell>
    );
  }

  if (code === "membership_inactive") {
    return (
      <ScreenShell testid="access-state-membership_inactive" code={code}>
        <div className="card">
          <p className="mono-label text-ink-mute">Next step</p>
          <p className="body-s text-ink-2 mt-2">
            There is no active research membership on this account. If your membership was paused or closed, support can walk you through reactivating; if you have not joined yet, apply for membership.
          </p>
          <div className="mt-5 flex gap-3" style={{ flexWrap: "wrap" }}>
            <Link href="/research/apply" className="btn btn-primary" data-testid="link-access-state-apply">
              Apply for membership
            </Link>
            <SupportLink testid="link-access-state-inactive-support" />
          </div>
        </div>
      </ScreenShell>
    );
  }

  // Unknown or absent code: a calm generic denial. Never echo the raw code.
  return (
    <ScreenShell testid="access-state-unknown" code={null}>
      <div className="card">
        <p className="mono-label text-ink-mute">Next step</p>
        <p className="body-s text-ink-2 mt-2">
          Try signing in again. If this keeps happening, contact support and a person will look at your account with you.
        </p>
        <div className="mt-5 flex gap-3" style={{ flexWrap: "wrap" }}>
          <Link href="/research/sign-in" className="btn btn-primary" data-testid="link-access-state-signin">
            Member sign in
          </Link>
          <SupportLink testid="link-access-state-unknown-support" />
        </div>
      </div>
    </ScreenShell>
  );
}
