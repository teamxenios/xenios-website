import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  acceptEarlyAccessAgreement,
  loadEarlyAccessAgreementState,
  loadEarlyAccessPolicy,
  redeemEarlyAccessVerification,
  requestEarlyAccessVerification,
  type EarlyAccessAcceptResult,
  type EarlyAccessAgreementPair,
  type EarlyAccessAgreementState,
  type EarlyAccessVerificationRequestResult,
  type EarlyAccessVerifyResult,
  type ResearchPolicyLoad,
} from "../adapters/earlyAccessAgreement";
import { EarlyAccessVerificationPanel } from "./EarlyAccessVerificationPanel";
import { createLatestOperation } from "../lib/latest-operation";

/**
 * The Private Early Access agreement screen.
 *
 * A customer reads the Early Access Product Policy, ticks one box, and the acceptance
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
  accept?: (agreement: EarlyAccessAgreementPair) => Promise<EarlyAccessAcceptResult>;
  /**
   * Reports whether the exact policy is accepted. A recovery standing comes
   * from an explicit status read, or is error when the write is unconfirmed.
   */
  onAccepted?: (
    accepted: boolean,
    recoveryStanding?: EarlyAccessAgreementState["kind"],
  ) => void;
  /**
   * Told whenever this screen settles, so the surrounding journey can describe
   * the SAME situation. Without it the page can say "accept the policy above"
   * while the policy step is telling the customer they are not verified yet.
   */
  onBlocked?: (reason: "unverified" | "locked" | null) => void;
  /** Injected for tests. The existing, already-mounted verification doors. */
  requestVerification?: (email: string) => Promise<EarlyAccessVerificationRequestResult>;
  redeemVerification?: (token: string) => Promise<EarlyAccessVerifyResult>;
  testId?: string;
}

type Phase =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "submitting" }
  | { status: "accepted"; alreadyAccepted: boolean }
  | { status: "locked" }
  /** Signed in, but not yet verified as an approved Early Access customer. */
  | { status: "unverified" }
  | { status: "fault"; message: string };

/**
 * The name used before a document has loaded, or when it cannot. Once the
 * policy is served, its own title is used instead.
 */
const POLICY_NAME = "Early Access Product Policy";

/**
 * The reviewed acknowledgment label for the v2 policy, word for word. It is
 * fixed text rather than built from the served title: a composed sentence could
 * read as wording nobody reviewed. The pair match above already ties it to the
 * one document it belongs to.
 */
const ASSENT =
  "I have read and agree to the Early Access Product Policy, including the conditions that apply to the products I request.";

const AGREEMENT_POLICY_MISMATCH =
  "We could not match your agreement status to the current Early Access Product Policy. Check agreement status before continuing.";
const AGREEMENT_WRITE_UNCONFIRMED =
  "We could not confirm whether your agreement was recorded. Check its status before continuing.";

function sameAgreement(
  left: EarlyAccessAgreementPair,
  right: EarlyAccessAgreementPair,
): boolean {
  return left.kind === right.kind && left.version === right.version;
}

/**
 * Hoisted so each default has ONE identity for the life of the module.
 *
 * As inline default parameters these were new functions on every render, which
 * changed the mount effect's dependencies every time the effect set state: the
 * screen would re-read the policy and the agreement standing forever.
 */
const loadPolicyFromServer = () => loadEarlyAccessPolicy();
const loadStateFromServer = () => loadEarlyAccessAgreementState();
const acceptOnServer = (agreement: EarlyAccessAgreementPair) =>
  acceptEarlyAccessAgreement(agreement);
const requestVerificationOnServer = (email: string) => requestEarlyAccessVerification(email);
const redeemVerificationOnServer = (token: string) => redeemEarlyAccessVerification(token);

export function EarlyAccessAgreementSection({
  loadPolicy = loadPolicyFromServer,
  loadState = loadStateFromServer,
  accept = acceptOnServer,
  onAccepted = () => {},
  onBlocked = () => {},
  requestVerification = requestVerificationOnServer,
  redeemVerification = redeemVerificationOnServer,
  testId = "early-access-agreement",
}: EarlyAccessAgreementSectionProps) {
  const headingId = useId();
  const checkboxId = useId();
  const [agreementLoadTask] = useState(createLatestOperation);
  const [agreementWriteTask] = useState(createLatestOperation);
  const writeTicket = useRef<symbol | null>(null);
  const [policy, setPolicy] = useState<ResearchPolicyLoad | null>(null);
  const [phase, setPhase] = useState<Phase>({ status: "loading" });
  const [agreement, setAgreement] = useState<EarlyAccessAgreementPair | null>(null);
  // An agreement screen that arrives already ticked has collected nothing.
  const [checked, setChecked] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => {
    agreementLoadTask.invalidate();
    agreementWriteTask.invalidate();
    writeTicket.current = null;
    setChecked(false);
    setAgreement(null);
    setPhase({ status: "loading" });
    setReloadKey((key) => key + 1);
  }, [agreementLoadTask, agreementWriteTask]);

  useEffect(() => {
    let live = true;
    setChecked(false);
    setAgreement(null);
    setPhase({ status: "loading" });

    const reportStanding = (standing: EarlyAccessAgreementState["kind"]) => {
      if (reloadKey === 0) {
        onAccepted(standing === "accepted");
      } else {
        onAccepted(standing === "accepted", standing);
      }
    };
    // Attach handlers before either loader can reject or throw.
    void agreementLoadTask.run(() => Promise.all([
      Promise.resolve().then(loadPolicy),
      Promise.resolve().then(loadState),
    ])).then((outcome) => {
      if (!live || outcome.kind === "cancelled") return;
      if (outcome.kind !== "value") {
        setPolicy(null);
        setPhase({
          status: "fault",
          message: "We could not confirm the current policy and agreement status. Check again before continuing.",
        });
        reportStanding("error");
        onBlocked(null);
        return;
      }
      const [policyResult, stateResult] = outcome.value;
      setPolicy(policyResult);
      if (stateResult.kind === "locked" || stateResult.kind === "unverified") {
        setPhase({ status: stateResult.kind });
        reportStanding(stateResult.kind);
        onBlocked(stateResult.kind);
        return;
      }
      if (stateResult.kind === "error") {
        setPhase({ status: "fault", message: stateResult.message });
        reportStanding("error");
        return;
      }
      if (policyResult.kind !== "ok") {
        // A status row cannot identify a policy the customer could not read.
        setPhase({ status: "ready" });
        onBlocked(null);
        reportStanding("error");
        return;
      }
      if (!sameAgreement(policyResult.policy.agreement, stateResult.agreement)) {
        setPhase({ status: "fault", message: AGREEMENT_POLICY_MISMATCH });
        onBlocked(null);
        reportStanding("error");
        return;
      }
      setAgreement(policyResult.policy.agreement);
      if (stateResult.kind === "accepted") {
        setPhase({ status: "accepted", alreadyAccepted: true });
      } else {
        setPhase({ status: "ready" });
      }
      onBlocked(null);
      reportStanding(stateResult.kind);
    });
    return () => {
      live = false;
      writeTicket.current = null;
      agreementLoadTask.invalidate();
      agreementWriteTask.invalidate();
    };
    // Parent callbacks are observations, not reasons to start another read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreementLoadTask, agreementWriteTask, loadPolicy, loadState, reloadKey]);

  const submit = useCallback(() => {
    if (writeTicket.current !== null || !checked || phase.status !== "ready" || agreement === null) {
      return;
    }
    const ticket = Symbol();
    writeTicket.current = ticket;
    setPhase({ status: "submitting" });

    const requireStatusCheck = (message: string) => {
      setAgreement(null);
      setChecked(false);
      setPhase({ status: "fault", message });
      onAccepted(false, "error");
      onBlocked(null);
    };

    void agreementWriteTask.run(() => accept(agreement), 15_000).then((outcome) => {
      if (writeTicket.current !== ticket || outcome.kind === "cancelled") return;
      writeTicket.current = null;
      if (outcome.kind !== "value") {
        requireStatusCheck(AGREEMENT_WRITE_UNCONFIRMED);
        return;
      }
      const result = outcome.value;
      if (result.kind === "accepted") {
        if (!sameAgreement(result.agreement, agreement)) {
          requireStatusCheck(AGREEMENT_POLICY_MISMATCH);
          return;
        }
        setAgreement(result.agreement);
        setPhase({ status: "accepted", alreadyAccepted: result.alreadyAccepted });
        onBlocked(null);
        onAccepted(true);
        return;
      }
      if (result.kind === "locked" || result.kind === "unverified") {
        setAgreement(null);
        setPhase({ status: result.kind });
        onAccepted(false);
        onBlocked(result.kind);
        return;
      }
      if (result.kind === "refused" && result.code === "NOT_RECORDED") {
        requireStatusCheck("The agreement service reported that your agreement was not recorded. Check its status before continuing.");
        return;
      }
      requireStatusCheck(AGREEMENT_WRITE_UNCONFIRMED);
    });
  }, [accept, agreement, agreementWriteTask, checked, onAccepted, onBlocked, phase.status]);

  const accepted = phase.status === "accepted";
  const busy = phase.status === "submitting";

  if (phase.status === "loading") {
    return (
      <section data-testid={testId} data-state="loading">
        <p className="body-s text-ink-mute" role="status" data-testid={`${testId}-loading`}>
          Loading the {POLICY_NAME}.
        </p>
      </section>
    );
  }

  if (phase.status === "locked") {
    return (
      <section data-testid={testId} data-state="locked">
        <p className="body-s text-ink-2" data-testid={`${testId}-locked`}>
          Your private session has ended. Unlock again to review and accept the {POLICY_NAME}.
          Nothing has been ordered or charged.
        </p>
      </section>
    );
  }

  if (phase.status === "unverified") {
    // NOT "your session has ended". The session is live; what is missing is an
    // approved Early Access customer bound to it, so the server has nobody to
    // record an acceptance for. Saying the session ended sends the customer to
    // unlock again, which succeeds and changes nothing: a loop with no exit.
    return (
      <section data-testid={testId} data-state="unverified">
        <p className="body-s text-ink-2 max-w-[62ch]" data-testid={`${testId}-unverified`}>
          Your private access session is active. Complete identity verification before reviewing
          prices, accepting the {POLICY_NAME}, or placing an order. Nothing has been ordered
          or charged.
        </p>
        {/*
          The EXISTING verification doors, finally reachable. Requesting always
          answers the same way, so this screen cannot be used to discover who is
          an Early Access customer, and redeeming binds only the session the
          token was minted against.
        */}
        <div className="mt-5">
          <EarlyAccessVerificationPanel
            onRequest={requestVerification}
            onRedeem={redeemVerification}
            onVerified={reload}
            testId={`${testId}-verification`}
          />
        </div>
      </section>
    );
  }

  if (phase.status === "fault" && agreement === null) {
    return (
      <section data-testid={testId} data-state="agreement-unavailable">
        <p
          aria-live="polite"
          role="status"
          className="body-s text-ink-2"
          data-testid={`${testId}-error`}
        >
          {phase.message}
        </p>
        <button type="button" className="btn btn-secondary mt-3" onClick={reload}
          data-testid={`${testId}-read-retry`}>Check agreement status</button>
      </section>
    );
  }

  // The policy could not be read. The checkbox is not offered at all: there is
  // no honest way to collect agreement to a document that did not load.
  if (policy === null || policy.kind !== "ok") {
    return (
      <section data-testid={testId} data-state="policy-unavailable">
        <p className="body-s text-ink-2" data-testid={`${testId}-policy-fault`}>
          We could not load the {POLICY_NAME} just now. This is a fault on our side. You
          cannot continue until it loads, and nothing has been ordered or charged.
        </p>
        <button type="button" className="btn btn-secondary mt-3" onClick={reload}
          data-testid={`${testId}-policy-retry`}>Reload policy</button>
      </section>
    );
  }

  const document = policy.policy;

  /*
    The served document, rendered in full and IDENTICALLY in both states. Once
    accepted it moves inside a disclosure rather than being shortened: a
    customer who has agreed to something must still be able to read exactly
    what they agreed to, word for word. Nothing here is rewritten, truncated or
    summarised, and the same testids resolve open or closed.
  */
  const policyBody = (
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
  );

  return (
    <section
      aria-labelledby={headingId}
      className="card min-w-0 p-4"
      data-testid={testId}
      data-state={accepted ? "accepted" : "ready"}
    >
      {accepted ? (
        /*
          COLLAPSED. Before acceptance the policy is the page; after it, the
          page is the catalogue. Re-rendering the whole document on every visit
          buried the products under a wall of text the customer had already
          agreed to, so it becomes a line and a disclosure. The agreement is
          still on file, still stated, and still readable in full.
        */
        <details data-testid={`${testId}-disclosure`}>
          <summary className="body-s cursor-pointer" data-testid={`${testId}-view-policy`}>
            <span aria-hidden="true">✓</span> {document.title} accepted
            <span className="text-ink-mute"> · View policy</span>
          </summary>
          <h2 id={headingId} className="sr-only">
            {document.title}
          </h2>
          {policyBody}
        </details>
      ) : (
        <>
          <p className="mono-label text-ink-mute">Required before ordering</p>
          <h2 id={headingId} className="body-l font-700 mt-2 text-balance">
            {document.title}
          </h2>
          {document.updated !== "" && (
            <p className="body-s text-ink-mute mt-1" data-testid={`${testId}-updated`}>
              Updated {document.updated}
            </p>
          )}
          {policyBody}
        </>
      )}

      {/* The heading names the policy. Its kind is an internal identifier, so only the version is shown. */}
      {agreement !== null && (
        <p
          className="body-s text-ink-mute mt-3"
          data-testid={`${testId}-provenance`}
        >
          Policy version: {agreement.version}
        </p>
      )}

      {accepted ? (
        <p
          aria-live="polite"
          role="status"
          className="body-s text-ink-2 mt-3"
          data-testid={`${testId}-accepted`}
        >
          You have accepted the {document.title}. You can continue to the catalogue.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 min-w-0">
          {/*
            One box, for one policy. Marketing preferences are deliberately not
            here: a single tick must mean exactly one thing, or it is not
            consent to either.
          */}
          <label
            className="flex items-center gap-3 body-s text-ink-2"
            htmlFor={checkboxId}
            data-testid={`${testId}-assent-label`}
          >
            <input
              id={checkboxId}
              type="checkbox"
              className="h-11 w-11 shrink-0 accent-[var(--pulse)]"
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
