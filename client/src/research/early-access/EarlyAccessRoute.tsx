import { useCallback, useEffect, useRef, useState } from "react";
import SeoHead from "@/components/SeoHead";

import { EarlyAccessUnlockForm } from "./EarlyAccessUnlockForm";
import { EarlyAccessStepper } from "./EarlyAccessStepper";
import { EarlyAccessCatalogSection } from "./EarlyAccessCatalogSection";
import { EarlyAccessAgreementSection } from "./EarlyAccessAgreementSection";
import { EARLY_ACCESS_FULFILLMENT_TARGET_COPY } from "./fulfillment-copy";

// The mounted Private Early Access route.
//
// This is the only Early Access component that talks to the network. Everything
// it renders below is a controlled presentation component, so the gate state
// lives in exactly one place.
//
// Nothing private is written to browser storage: the session is an HttpOnly
// cookie the script cannot read, and the authenticated view holds its data in
// memory for the life of the page.

const SESSION_PATH = "/api/research/early-access/session";
const UNLOCK_PATH = "/api/research/early-access/unlock";
const LOGOUT_PATH = "/api/research/early-access/logout";

export const EARLY_ACCESS_STEPS = [
  "Welcome",
  "Contact and Shipping",
  "Identity and Agreements",
  "Research Catalog",
  "Review and Referral",
  "Payment",
  "Payment Confirmation",
  "Status",
] as const;

/** "Identity and Agreements", where a customer sits until they have agreed. */
export const EARLY_ACCESS_AGREEMENT_STEP = 2;
/** "Research Catalog", reached only once the SERVER confirms the acceptance. */
export const EARLY_ACCESS_CATALOG_STEP = 3;

type GateState =
  | { kind: "checking" }
  | { kind: "unavailable" }
  | { kind: "locked"; error: string | null; busy: boolean }
  | { kind: "authenticated"; expiresAt: string | null };

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export default function EarlyAccessRoute() {
  const [state, setState] = useState<GateState>({ kind: "checking" });
  // Whether the SERVER says this customer has agreed. It starts false on every
  // load and is only ever set from a server answer, so a refresh re-asks rather
  // than trusting anything the browser kept.
  const [agreed, setAgreed] = useState(false);
  // Why ordering is closed, when it is not simply "has not agreed yet". The
  // journey must describe the SAME situation the agreement step is describing.
  const [blocked, setBlocked] = useState<"unverified" | "locked" | null>(null);
  const catalogRef = useRef<HTMLDivElement | null>(null);
  const nextStepsRef = useRef<HTMLDivElement | null>(null);

  const readSession = useCallback(async () => {
    try {
      const response = await fetch(SESSION_PATH, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      // The gate answers 503 when the deployment has it switched off or
      // incompletely configured. That is a truthful unavailable state, not an
      // error the customer can act on.
      if (response.status === 503 || response.status === 404) {
        setState({ kind: "unavailable" });
        return;
      }
      const body = await readJson(response);
      if (body?.authenticated === true) {
        const expiresAt = typeof body.expiresAt === "string" ? body.expiresAt : null;
        setState({ kind: "authenticated", expiresAt });
        return;
      }
      setState({ kind: "locked", error: null, busy: false });
    } catch {
      setState({ kind: "locked", error: null, busy: false });
    }
  }, []);

  useEffect(() => {
    void readSession();
  }, [readSession]);

  const submitPassword = useCallback(
    (password: string) => {
      setState({ kind: "locked", error: null, busy: true });
      void (async () => {
        try {
          const response = await fetch(UNLOCK_PATH, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ password }),
          });
          if (response.ok) {
            // Re-read the session rather than trusting the unlock body, so the
            // rendered state always reflects what the server will honor.
            await readSession();
            return;
          }
          // One generic message for every refusal. The server deliberately does
          // not distinguish a wrong password from a disabled gate or a lockout,
          // and neither does this copy.
          setState({
            kind: "locked",
            busy: false,
            error: "That password was not accepted. Check the password you were given and try again.",
          });
        } catch {
          setState({
            kind: "locked",
            busy: false,
            error: "We could not reach the access service. Please try again.",
          });
        }
      })();
    },
    [readSession],
  );

  const signOut = useCallback(() => {
    void (async () => {
      try {
        await fetch(LOGOUT_PATH, {
          method: "POST",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
      } catch {
        // Logout is idempotent and the cookie is cleared server-side; a network
        // failure still returns the customer to the password screen.
      }
      // The next customer to unlock on this browser starts from the server's
      // answer about themselves, never from the last person's.
      setAgreed(false);
      setBlocked(null);
      setState({ kind: "locked", error: null, busy: false });
    })();
  }, []);

  return (
    <>
      <SeoHead
        title="Private Early Access, xenios research"
        description="A private ordering experience for approved Xenios Research members."
        path="/research/early-access"
        robots="noindex, nofollow"
      />
      {state.kind === "checking" && (
        <section className="container-x" style={{ paddingTop: 96, paddingBottom: 96 }}>
          <p className="body-s text-ink-mute" role="status" data-testid="early-access-checking">
            Checking your access.
          </p>
        </section>
      )}

      {state.kind === "unavailable" && (
        <section className="container-x" style={{ paddingTop: 96, paddingBottom: 96 }}>
          <p className="mono-cap text-pulse mb-5">Private Early Access</p>
          <h1 className="display-s max-w-[22ch]">This area is not open yet.</h1>
          <p className="mt-6 body-m text-ink-2 max-w-[58ch]" data-testid="early-access-unavailable">
            Private Early Access is being prepared. Nothing is wrong with your invitation, and no
            action is needed from you right now.
          </p>
        </section>
      )}

      {state.kind === "locked" && (
        <section className="container-x" style={{ paddingTop: 96, paddingBottom: 96 }}>
          <div className="max-w-[520px]">
            <p className="mono-cap text-pulse mb-5">Invitation only</p>
            <h1 className="display-s max-w-[22ch]">Private Early Access</h1>
            <p className="mt-6 body-m text-ink-2 max-w-[58ch]">
              Enter the access password you were given. This area is limited to members approved
              through the Xenios network.
            </p>
            <div className="mt-8">
              <EarlyAccessUnlockForm
                onSubmit={submitPassword}
                busy={state.busy}
                error={state.error}
              />
            </div>
          </div>
        </section>
      )}

      {state.kind === "authenticated" && (
        <section className="container-x" style={{ paddingTop: 32, paddingBottom: 48 }}>
          <div className="max-w-[1280px] min-w-0">
            {/*
              A compact masthead. The three-paragraph welcome that used to sit
              here explained the programme to someone who had already unlocked,
              read it once, and was now trying to buy. It pushed the catalogue
              below the fold on every visit, so it is gone rather than
              shortened: the place to explain the programme is before the
              password, not after it.
            */}
            <p className="mono-cap text-pulse mb-2">Private Early Access</p>
            <h1 className="display-s max-w-[26ch]">Research Catalogue</h1>

            <div className="mt-4">
              <EarlyAccessStepper
                steps={EARLY_ACCESS_STEPS}
                activeIndex={agreed && blocked === null ? EARLY_ACCESS_CATALOG_STEP : EARLY_ACCESS_AGREEMENT_STEP}
              />
            </div>

            {/*
              The required agreement, above the catalogue. Browsing is not
              gated: a customer may read the whole shelf before agreeing to
              anything, and the catalogue is unchanged by what follows. What IS
              gated is the continuation into ordering, because the order route
              refuses with AGREEMENT_REQUIRED until this is on file.
            */}
            <div className="mt-5" data-testid="early-access-agreement-mount">
              <EarlyAccessAgreementSection onAccepted={setAgreed} onBlocked={setBlocked} />
            </div>

            {/*
              The live catalogue. It reads the mounted endpoint and renders
              exactly what the server returns: no fixture rows, no padding to a
              target count, and the dropped-row count surfaced rather than
              absorbed. Whatever the server says today is what a customer sees.
            */}
            <div className="mt-5" data-testid="early-access-catalog-mount" ref={catalogRef} tabIndex={-1}>
              <EarlyAccessCatalogSection
                fulfillmentTargetCopy={EARLY_ACCESS_FULFILLMENT_TARGET_COPY}
                onReview={() => {
                  nextStepsRef.current?.focus();
                  nextStepsRef.current?.scrollIntoView({ block: "start" });
                }}
              />
            </div>

            <div
              className="card mt-5"
              data-testid="early-access-next-steps"
              ref={nextStepsRef}
              tabIndex={-1}
            >
              <p className="mono-label text-ink-mute">What happens next</p>
              {agreed ? (
                <p
                  className="body-s text-ink-2 mt-2 max-w-[62ch]"
                  data-testid="early-access-continue-available"
                >
                  Your agreement is on file. Contact and shipping details, payment review and
                  fulfillment are being connected and will appear here as each one comes online.
                  Nothing has been ordered or charged.
                </p>
              ) : blocked === "unverified" ? (
                <p
                  className="body-s text-ink-2 mt-2 max-w-[62ch]"
                  data-testid="early-access-continue-unverified"
                >
                  Ordering opens once this session is verified against an approved Early Access
                  account. Accepting the policy is not the step that is missing. Nothing has been
                  ordered or charged.
                </p>
              ) : blocked === "locked" ? (
                <p
                  className="body-s text-ink-2 mt-2 max-w-[62ch]"
                  data-testid="early-access-continue-locked"
                >
                  Your private session has ended. Unlock again to continue. Nothing has been
                  ordered or charged.
                </p>
              ) : (
                <p
                  className="body-s text-ink-2 mt-2 max-w-[62ch]"
                  data-testid="early-access-continue-blocked"
                >
                  Accept the Research Use Policy above before continuing to an order. Nothing has
                  been ordered or charged.
                </p>
              )}
              <div className="mt-4">
                {/*
                  The order continuation. It is genuinely unavailable until the
                  SERVER confirms the acceptance, rather than merely styled that
                  way: the order route refuses with AGREEMENT_REQUIRED until the
                  row is on file, and an enabled control that cannot work is
                  worse than one that is not yet offered.

                  It does one real thing, which is to put the customer where
                  they choose a unit. It deliberately does not pretend to carry
                  them further than the mounted journey actually goes.
                */}
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!agreed}
                  onClick={() => {
                    catalogRef.current?.focus();
                    catalogRef.current?.scrollIntoView({ block: "start" });
                  }}
                  data-testid="early-access-continue"
                >
                  Continue to the research catalogue
                </button>
              </div>
            </div>

            <div className="mt-8">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={signOut}
                data-testid="early-access-signout"
              >
                Sign out of Early Access
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
