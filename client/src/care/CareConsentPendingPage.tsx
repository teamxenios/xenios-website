import { useEffect, useState } from "react";
import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import type { CareConsentStatus } from "@shared/care/consent";
import { careApiFetch } from "./api";

type ConsentViewState =
  | { kind: "loading" }
  | { kind: "disabled" }
  | {
      kind: "ready";
      telehealth: CareConsentStatus;
      privacyNotice: CareConsentStatus;
    }
  | { kind: "error" };

export default function CareConsentPendingPage() {
  const [state, setState] = useState<ConsentViewState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });
    careApiFetch("/api/care/eligibility", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (response.status === 503 && body?.code === "care_disabled") {
          setState({ kind: "disabled" });
          return;
        }
        if (!response.ok || body?.ok !== true || !body.consent) {
          throw new Error("care_consent_status_unavailable");
        }
        setState({
          kind: "ready",
          telehealth: body.consent.telehealth,
          privacyNotice: body.consent.privacyNotice,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: "error" });
      });
    return () => controller.abort();
  }, [attempt]);

  return (
    <PageShell>
      <SeoHead
        title="Care notices, xenios"
        description="Versioned Care telehealth consent and privacy-notice readiness."
        path="/care/consent"
      />
      <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
        <p className="mono-cap text-pulse mb-6">CARE · NOTICES</p>
        <h1 className="display-m max-w-[19ch]">
          Consent must be exact, current, and informed.
        </h1>
        <p className="body-l text-ink-2 mt-8 max-w-[64ch]">
          No consent is assumed from Research membership. Care uses separate,
          versioned telehealth and privacy records.
        </p>

        <section
          className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-[920px]"
          aria-live="polite"
          aria-busy={state.kind === "loading"}
        >
          {state.kind === "loading" && (
            <article className="card md:col-span-2">
              <p className="mono-label text-pulse mb-3">CHECKING NOTICES</p>
              <h2 className="h2">No consent action is enabled while status is loading.</h2>
            </article>
          )}
          {state.kind === "disabled" && (
            <article className="card md:col-span-2">
              <p className="mono-label text-pulse mb-3">NOT YET AVAILABLE</p>
              <h2 className="h2">Care consent content has not been activated.</h2>
              <p className="body-m text-ink-2 mt-4">
                No placeholder legal text is being presented as approved.
              </p>
            </article>
          )}
          {state.kind === "error" && (
            <article className="card md:col-span-2">
              <p className="mono-label text-pulse mb-3">STATUS UNAVAILABLE</p>
              <h2 className="h2">Notice status could not be confirmed.</h2>
              <button
                type="button"
                className="btn btn-secondary mt-6"
                onClick={() => setAttempt((current) => current + 1)}
              >
                Try again
              </button>
            </article>
          )}
          {state.kind === "ready" &&
            [
              ["Telehealth consent", state.telehealth],
              ["Privacy notice", state.privacyNotice],
            ].map(([label, consent]) => {
              const status = consent as CareConsentStatus;
              return (
                <article className="card" key={label as string}>
                  <p className="mono-label text-pulse mb-3">
                    {status.satisfied ? "CURRENT" : "REQUIRED"}
                  </p>
                  <h2 className="h2">{label as string}</h2>
                  <p className="body-m text-ink-2 mt-4">
                    {status.reason === "document_unavailable"
                      ? "No approved notice version is configured."
                      : status.satisfied
                        ? `Version ${status.requiredDocument?.version} is recorded.`
                        : "A current version has not been granted."}
                  </p>
                </article>
              );
            })}
        </section>

        <aside className="mt-12 max-w-[760px] pt-10 rule-top">
          <p className="body-m text-ink-2">
            This foundation does not display invented consent language and does
            not enable a Continue action until approved documents are available.
          </p>
          <Link href="/care/eligibility" className="btn btn-ghost mt-8">
            Back to Care eligibility
          </Link>
        </aside>
      </div>
    </PageShell>
  );
}
