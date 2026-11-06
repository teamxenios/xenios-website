import { useId } from "react";
import {
  EARLY_ACCESS_CATEGORY_EXPLANATION,
  EARLY_ACCESS_REQUEST_BOUNDARY,
  EARLY_ACCESS_REQUEST_CTA,
  EARLY_ACCESS_REQUEST_STEPS,
  EARLY_ACCESS_RECEIPT_STEPS,
} from "./request-experience-copy";
import "./request-experience.css";

/** Read-only guidance. Does not accept a policy, select items or send a request. */
export function EarlyAccessRequestGuide({ browseTargetId }: Readonly<{ browseTargetId?: string }>) {
  const headingId = useId();
  // Only a local fragment is emitted. The caller supplies a mounted catalog target.
  const target = browseTargetId && /^[A-Za-z][A-Za-z0-9_-]*$/.test(browseTargetId)
    ? `#${browseTargetId}` : null;
  return (
    <section className="xenios-request-guide" aria-labelledby={headingId}
      data-testid="early-access-how-it-works">
      <div className="xenios-request-guide__heading">
        <h2 id={headingId}>How Early Access works</h2>
        <p>One request. Clear next steps.</p>
      </div>
      <ol className="xenios-request-guide__steps" role="list">
        {EARLY_ACCESS_REQUEST_STEPS.map((step, index) => (
          <li key={step.id}>
            <span className="xenios-request-guide__number" aria-hidden="true">{index + 1}</span>
            <div><h3>{step.title}</h3></div>
          </li>
        ))}
      </ol>
      <details className="xenios-request-guide__details">
        <summary>How review, decisions and payment work</summary>
        <dl>
          {EARLY_ACCESS_REQUEST_STEPS.map((step) => (
            <div key={step.id}><dt>{step.title}</dt><dd>{step.description}</dd></div>
          ))}
        </dl>
      </details>
      <p className="xenios-request-guide__categories">{EARLY_ACCESS_CATEGORY_EXPLANATION}</p>
      <p className="xenios-request-guide__boundary">{EARLY_ACCESS_REQUEST_BOUNDARY}</p>
      <div className="xenios-request-guide__actions">
        {target && <a href={target} className="btn btn-primary">{EARLY_ACCESS_REQUEST_CTA.browse}</a>}
        <a href="/research/support" className="btn btn-secondary">{EARLY_ACCESS_REQUEST_CTA.help}</a>
      </div>
    </section>
  );
}

/** Appears only in the existing confirmed-receipt view. All steps are prospective. */
export function EarlyAccessRequestNextSteps({ headingLevel = 2 }: Readonly<{ headingLevel?: 2 | 3 }>) {
  const headingId = useId();
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <section className="xenios-request-next" aria-labelledby={headingId}
      data-testid="request-next-steps">
      <Heading id={headingId}>What happens next</Heading>
      <ol className="xenios-request-next__steps" role="list">
        {EARLY_ACCESS_RECEIPT_STEPS.map((step) => (
          <li key={step.id}><strong>{step.title}</strong><p>{step.description}</p></li>
        ))}
      </ol>
      <p>Keep your reference. There is no need to send the same request again while the team reviews it.</p>
    </section>
  );
}
