import { useCallback, useEffect, useId, useState } from "react";

import {
  acceptEarlyAccessAgreement,
  loadEarlyAccessAgreementState,
  loadResearchUsePolicy,
  type EarlyAccessAcceptResult,
  type EarlyAccessAgreementState,
  type ResearchPolicyLoad,
} from "../adapters/earlyAccessAgreement";

/**
 * The Private Early Access agreement screen.
 *
 * A customer reads the Research Use Policy, ticks one box, and the acceptance
 * is recorded server-side. Until that write succeeds the order continuation is
 * not offered, because the order route refuses with AGREEMENT_REQUIRED anyway
 * and offering a button that cannot work is a worse experience than not
 * offering it.
 *
 * WHAT THIS COMPONENT IS NOT
 *
 * It is not the record of the agreement, and it does not remember one. The
 * acceptance state is read from the server on every mount, including after a
 * refresh, and nothing is written to browser storage. A value the browser keeps
 * is a value the browser can be made to invent, and this one stands in front of
 * a checkout.
 *
 * It also renders no policy text of its own. Every heading, paragraph and
 * bullet below comes from the served policy document, so the words a customer
 * agrees to are the words the deployment publishes, and editing this file
 * cannot change what was agreed.
 */

export interface EarlyAccessAgreementSectionProps {
  /** Injected for tests. Defaults to the real mounted endpoints. */
  loadPolicy?: () => Promise<ResearchPolicyLoad>;
  loadState?: () => Promise<EarlyAccessAgreementState>;
  accept?: () => Promise<EarlyAccessAcceptResult>;
  /** Told once, whenever the server confirms this customer is agreed. */
  onAccepted?: (accepted: boolean) => void;
  testId?: string;
}

type Phase =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "submitting" }
  | { status: "accepted"; alreadyAccepted: boolean }
  | { status: "locked" }
  | { status: "fault"; message: string };

const ASSENT = "I have read and agree to the Research Use Policy.";

/**
 * Hoisted so each default has ONE identity for the life of the module.
 *
 * As inline default parameters these were new functions on every render, which
 * changed the mount effect's dependencies every time the effect set state: the
 * screen would re-read the policy and the agreement standing forever.
 */
const loadPolicyFromServer = () => loadResearchUsePolicy();
const loadStateFromServer = () => loadEarlyAccessAgreementState();
const acceptOnServer = () => acceptEarlyAccessAgreement();

export function EarlyAccessAgreementSection({
  loadPolicy = loadPolicyFromServer,
  loadState = loadStateFromServer,
  accept = acceptOnServer,
  onAccepted = () => {},
  testId = "early-access-agreement",
}: EarlyAccessAgreementSectionProps) {
  const headingId = useId();
  const checkboxId = useId();
  const [policy, setPolicy] = useState<ResearchPolicyLoad | null>(null);
  const [phase, setPhase] = useState<Phase>({ status: "loading" });
  // Unchecked, always, on every mount. An agreement screen that arrives already
  // ticked has collected nothing.
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let live = true;
    // The policy and the standing are read together, but they answer different
    // questions and a failure in one must not be reported as the other.
    void Promise.all([loadPolicy(), loadState()]).then(([policyResult, stateResult]) => {
      if (!live) return;
      setPolicy(policyResult);
      if (stateResult.kind === "accepted") {
        // Already on file, from a previous visit or before a refresh. The
        // server said so; nothing here remembered it.
        setPhase({ status: "accepted", alreadyAccepted: true });
        onAccepted(true);
        return;
      }
      if (stateResult.kind === "locked") {
        setPhase({ status: "locked" });
        return;
      }
      if (stateResult.kind === "error") {
        setPhase({ status: "fault", message: stateResult.message });
        return;
      }
      setPhase({ status: "ready" });
    });
    return () => {
      live = false;
    };
    // The injected callables are the identity of this effect. onAccepted is
    // deliberately not a dependency: a parent re-creating it must not re-run a
    // network read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadPolicy, loadState]);

  const submit = useCallback(() => {
    setPhase({ status: "submitting" });
    void accept().then((result) => {
      if (result.kind === "accepted") {
        // BOTH outcomes are success. A duplicate write means the acceptance is
        // on file, which is the only thing checkout asks about, so telling the
        // customer it failed would be false.
        setPhase({ status: "accepted", alreadyAccepted: result.alreadyAccepted });
        onAccepted(true);
        return;
      }
      if (result.kind === "locked") {
        setPhase({ status: "locked" });
        return;
      }
      // Fail closed. Nothing is recorded, so nothing is unlocked.
      setPhase({
        status: "fault",
        message:
          result.kind === "refused"
            ? "Your agreement was not recorded. Nothing has been ordered or charged. Please try again."
            : result.message,
      });
    });
  }, [accept, onAccepted]);

  const accepted = phase.status === "accepted";
  const busy = phase.status === "submitting";

  if (phase.status === "loading") {
    return (
      <section data-testid={testId} data-state="loading">
        <p className="body-s text-ink-mute" role="status" data-testid={`${testId}-loading`}>
          Loading the Research Use Policy.
        </p>
      </section>
    );
  }

  if (phase.status === "locked") {
    return (
      <section data-testid={testId} data-state="locked">
        <p className="body-s text-ink-2" data-testid={`${testId}-locked`}>
          Your private session has ended. Unlock again to review and accept the Research Use
          Policy. Nothing has been ordered or charged.
        </p>
      </section>
    );
  }

  // The policy could not be read. The checkbox is not offered at all: there is
  // no honest way to collect agreement to a document that did not load.
  if (policy === null || policy.kind !== "ok") {
    return (
      <section data-testid={testId} data-state="policy-unavailable">
        <p className="body-s text-ink-2" data-testid={`${testId}-policy-fault`}>
          We could not load the Research Use Policy just now. This is a fault on our side. You
          cannot continue until it loads, and nothing has been ordered or charged.
        </p>
      </section>
    );
  }

  const document = policy.policy;

  return (
    <section
      aria-labelledby={headingId}
      className="card min-w-0"
      data-testid={testId}
      data-state={accepted ? "accepted" : "ready"}
    >
      <p className="mono-label text-ink-mute">Required before ordering</p>
      <h2 id={headingId} className="body-l font-700 mt-2 text-balance">
        {document.title}
      </h2>
      {document.updated !== "" && (
        <p className="body-s text-ink-mute mt-1" data-testid={`${testId}-updated`}>
          Updated {document.updated}
        </p>
      )}

      {/*
        The served document, rendered in full. It is scrollable on a small
        screen rather than truncated: a policy a customer cannot reach the end
        of is a policy they were not shown.
      */}
      <div
        className="mt-5 grid gap-5 max-w-[62ch] min-w-0"
        data-testid={`${testId}-policy`}
        data-sections={document.sections.length}
      >
        {document.sections.map((section, index) => (
          <div key={`${section.heading}-${index}`} className="min-w-0">
            {section.heading !== "" && (
              <h3 className="body-s font-700" data-testid={`${testId}-heading`}>
                {section.heading}
              </h3>
            )}
            {section.paragraphs.map((paragraph, paragraphIndex) => (
              <p
                key={paragraphIndex}
                className="body-s text-ink-2 mt-2"
                data-testid={`${testId}-paragraph`}
              >
                {paragraph}
              </p>
            ))}
            {section.bullets.length > 0 && (
              <ul className="mt-2 grid gap-1 list-disc pl-5">
                {section.bullets.map((bullet, bulletIndex) => (
                  <li
                    key={bulletIndex}
                    className="body-s text-ink-2"
                    data-testid={`${testId}-bullet`}
                  >
                    {bullet}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {accepted ? (
        <p
          aria-live="polite"
          role="status"
          className="body-s text-ink-2 mt-6"
          data-testid={`${testId}-accepted`}
        >
          You have accepted the Research Use Policy. You can continue to the research catalogue.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 min-w-0">
          {/*
            One box, for one policy. Marketing preferences are deliberately not
            here: a single tick must mean exactly one thing, or it is not
            consent to either.
          */}
          <label
            className="flex items-start gap-3 body-s text-ink-2"
            htmlFor={checkboxId}
            data-testid={`${testId}-assent-label`}
          >
            <input
              id={checkboxId}
              type="checkbox"
              checked={checked}
              disabled={busy}
              onChange={(event) => setChecked(event.target.checked)}
              data-testid={`${testId}-checkbox`}
            />
            <span>{ASSENT}</span>
          </label>

          <div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!checked || busy}
              onClick={submit}
              data-testid={`${testId}-submit`}
            >
              {busy ? "Recording your agreement" : "Accept and continue"}
            </button>
          </div>

          {phase.status === "fault" && (
            <p
              aria-live="polite"
              role="status"
              className="body-s text-ink-2"
              data-testid={`${testId}-error`}
            >
              {phase.message}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export default EarlyAccessAgreementSection;
