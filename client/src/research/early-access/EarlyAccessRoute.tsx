import { useCallback, useEffect, useState } from "react";
import SeoHead from "@/components/SeoHead";

import { EarlyAccessUnlockForm } from "./EarlyAccessUnlockForm";
import { EarlyAccessStepper } from "./EarlyAccessStepper";
import { EarlyAccessCatalogSection } from "./EarlyAccessCatalogSection";
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
        <section className="container-x" style={{ paddingTop: 72, paddingBottom: 96 }}>
          <div className="max-w-[720px] min-w-0">
            <p className="mono-cap text-pulse mb-5">Private Early Access</p>
            <h1 className="display-s max-w-[26ch]">Welcome to Xenios Research Early Access</h1>

            <div className="mt-8">
              <EarlyAccessStepper steps={EARLY_ACCESS_STEPS} activeIndex={0} />
            </div>

            <div className="mt-8 grid gap-4" data-testid="early-access-welcome">
              <p className="body-m text-ink-2 max-w-[62ch]">
                You are entering the private first release of Xenios Research.
              </p>
              <p className="body-s text-ink-2 max-w-[62ch]">
                Our complete member platform is being built in parallel into a deeper, more
                personalized experience. While that experience comes online, Early Access gives
                approved members a streamlined path to review the current research catalog, complete
                required verification, place an order, and receive direct support from payment review
                through fulfillment.
              </p>
              <p className="body-s text-ink-2 max-w-[62ch]">
                This private release is intentionally simple, secure, and concierge-led. We look
                forward to welcoming you into the full Xenios Research experience as it expands.
              </p>
            </div>

            {/*
              The live catalogue. It reads the mounted endpoint and renders
              exactly what the server returns: no fixture rows, no padding to a
              target count, and the dropped-row count surfaced rather than
              absorbed. Whatever the server says today is what a customer sees.
            */}
            <div className="mt-8" data-testid="early-access-catalog-mount">
              <EarlyAccessCatalogSection
                fulfillmentTargetCopy={EARLY_ACCESS_FULFILLMENT_TARGET_COPY}
              />
            </div>

            <div className="card mt-8" data-testid="early-access-next-steps">
              <p className="mono-label text-ink-mute">What happens next</p>
              <p className="body-s text-ink-2 mt-2 max-w-[62ch]">
                Ordering, payment review and fulfillment are being connected and will appear here
                as each one comes online. Nothing has been ordered or charged.
              </p>
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
