import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import {
  isCareDiscoverySuccess,
  requestCareDiscovery,
} from "./discovery-api";

export const CARE_DISCOVERY_PATH = "/care/discovery";

type HandoffState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "auth_required" }
  | { kind: "unavailable" }
  | { kind: "error" };

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => ({}));
}

export default function CareDiscoveryPage() {
  const [, navigate] = useLocation();
  const [consented, setConsented] = useState(false);
  const [consentError, setConsentError] = useState("");
  const [handoffState, setHandoffState] = useState<HandoffState>({
    kind: "idle",
  });

  async function submitHandoff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (handoffState.kind === "submitting") return;
    if (!consented) {
      setConsentError("Choose the consent checkbox before continuing.");
      return;
    }

    setConsentError("");
    setHandoffState({ kind: "submitting" });

    try {
      const response = await requestCareDiscovery(true);
      const body = await readJson(response);

      if (response.status === 401) {
        setHandoffState({ kind: "auth_required" });
        return;
      }
      if (response.status === 503) {
        setHandoffState({ kind: "unavailable" });
        return;
      }
      if (!response.ok || !isCareDiscoverySuccess(body)) {
        setHandoffState({ kind: "error" });
        return;
      }

      navigate(body.nextPath);
    } catch {
      setHandoffState({ kind: "error" });
    }
  }

  const submitting = handoffState.kind === "submitting";

  return (
    <PageShell>
      <SeoHead
        title="Care discovery, xenios"
        description="A consented, generic handoff from Xenios Research to the separate Xenios Care pathway."
        path={CARE_DISCOVERY_PATH}
      />

      <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
        <p className="mono-cap text-pulse mb-6">CARE · DISCOVERY</p>
        <h1 className="display-m max-w-[19ch]">
          Continue from Research to a separate Care pathway.
        </h1>
        <p className="body-l text-ink-2 mt-8 max-w-[64ch]">
          When Research points you here, it is only a routing signal. Research
          products, pricing, requests, and orders stay on the Research rail.
          Care begins with a generic handoff to learn more.
        </p>

        <section
          className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-[920px]"
          aria-labelledby="care-discovery-boundary-title"
        >
          <article className="card">
            <p className="mono-label text-pulse mb-3">WHAT IS SENT</p>
            <h2 id="care-discovery-boundary-title" className="h2">
              Consent and a generic handoff.
            </h2>
            <p className="body-m text-ink-2 mt-4">
              Your browser sends your explicit consent. The server uses your
              signed-in identity only to identify a Research-to-Care handoff.
            </p>
          </article>
          <article className="card">
            <p className="mono-label text-pulse mb-3">WHAT IS NOT SENT</p>
            <h2 className="h2">No commerce or clinical details.</h2>
            <p className="body-m text-ink-2 mt-4">
              No SKU, product, order, price, diagnosis, symptom, treatment, or
              other clinical detail is included in this handoff.
            </p>
          </article>
        </section>

        <form
          className="mt-10 max-w-[760px]"
          onSubmit={submitHandoff}
          aria-busy={submitting}
        >
          <label
            htmlFor="care-discovery-consent"
            className="card flex items-start gap-4 cursor-pointer"
          >
            <input
              id="care-discovery-consent"
              name="consent"
              type="checkbox"
              className="mt-1 h-5 w-5 flex-none"
              checked={consented}
              onChange={(event) => {
                setConsented(event.target.checked);
                if (consentError) setConsentError("");
              }}
              required
              aria-invalid={consentError ? true : undefined}
              aria-describedby="care-discovery-consent-detail"
            />
            <span>
              <strong className="body-m block">
                I explicitly consent to a generic Care discovery handoff from
                my signed-in account.
              </strong>
              <span
                id="care-discovery-consent-detail"
                className="body-s text-ink-mute block mt-2"
              >
                This choice is separate from Research membership or activity.
              </span>
            </span>
          </label>

          {consentError && (
            <p className="body-s text-pulse mt-3" role="alert">
              {consentError}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary mt-6"
            disabled={!consented || submitting}
          >
            {submitting ? "Confirming…" : "Confirm generic handoff"}
          </button>
        </form>

        <div className="mt-8 max-w-[760px]" aria-live="polite">
          {handoffState.kind === "auth_required" && (
            <section className="card" role="alert">
              <p className="mono-label text-pulse mb-3">SIGN IN REQUIRED</p>
              <h2 className="h2">Sign in before sending this handoff.</h2>
              <p className="body-m text-ink-2 mt-4">
                The server did not accept an anonymous Care handoff. Sign in,
                then return to this page and consent again.
              </p>
              <Link href="/research/sign-in" className="btn btn-primary mt-6">
                Sign in securely
              </Link>
            </section>
          )}

          {handoffState.kind === "unavailable" && (
            <section className="card" role="alert">
              <p className="mono-label text-pulse mb-3">CARE UNAVAILABLE</p>
              <h2 className="h2">The Care handoff is not available right now.</h2>
              <p className="body-m text-ink-2 mt-4">
                We cannot confirm a handoff. Research remains separate, and no
                Care availability is promised.
              </p>
            </section>
          )}

          {handoffState.kind === "error" && (
            <section className="card" role="alert">
              <p className="mono-label text-pulse mb-3">HANDOFF NOT CONFIRMED</p>
              <h2 className="h2">We could not confirm the Care handoff.</h2>
              <p className="body-m text-ink-2 mt-4">
                You can try again. This page does not claim that a handoff was
                stored when the server response cannot be verified.
              </p>
            </section>
          )}
        </div>

        <aside className="mt-12 max-w-[760px] pt-10 rule-top">
          <p className="mono-cap text-ink-mute mb-5">NEXT-STEP BOUNDARY</p>
          <p className="body-m text-ink-2">
            A successful handoff only routes you to Care eligibility. It does
            not start treatment, confirm availability, create a prescription,
            or promise durable storage.
          </p>
          <Link href="/care" className="btn btn-ghost mt-8">
            Return to Care
          </Link>
        </aside>
      </div>
    </PageShell>
  );
}
