import { useId } from "react";
import {
  EARLY_ACCESS_BRAND,
  EARLY_ACCESS_CATEGORY_EXPLANATION,
  EARLY_ACCESS_REQUEST_BOUNDARY,
  EARLY_ACCESS_REQUEST_CTA,
  EARLY_ACCESS_REQUEST_INTRO,
  EARLY_ACCESS_REQUEST_STEPS,
  EARLY_ACCESS_RECEIPT_STEPS,
} from "./request-experience-copy";
import "./request-experience.css";
import "./early-access-v2.css";
import "../assisted-order/early-access-premium.css";

/**
 * Read-only guidance. Does not accept a policy, select items or send a request.
 * Every customer-facing sentence comes from the reviewed request-experience-copy
 * constants; the Early Access 2.0 treatment changes presentation only.
 */
export function EarlyAccessRequestGuide({ browseTargetId }: Readonly<{ browseTargetId?: string }>) {
  const headingId = useId();
  // Only a local fragment is emitted. The caller supplies a mounted catalog target.
  const target = browseTargetId && /^[A-Za-z][A-Za-z0-9_-]*$/.test(browseTargetId)
    ? `#${browseTargetId}` : null;
  return (
    <section className="xenios-request-guide xenios-ea-v2" aria-labelledby={headingId}
      data-testid="early-access-how-it-works">
      <p className="xenios-ea-v2__kicker">
        {EARLY_ACCESS_BRAND.name}
      </p>
      <div className="xenios-ea-v2__hero">
        <div className="xenios-request-guide__heading">
          <h2 id={headingId}>How Early Access works</h2>
          <p>One request. Clear next steps.</p>
        </div>
        <div className="xenios-ea-v2__hero-copy">
          <p className="xenios-ea-v2__lede">{EARLY_ACCESS_REQUEST_INTRO}</p>
          <div className="xenios-request-guide__actions xenios-ea-v2__actions">
            {target && <a href={target} className="btn btn-primary xenios-ea-v2__primary">{EARLY_ACCESS_REQUEST_CTA.browse}</a>}
            <a href="/research/support" className="btn btn-secondary xenios-ea-v2__secondary">{EARLY_ACCESS_REQUEST_CTA.help}</a>
          </div>
        </div>
      </div>
      <ol className="xenios-request-guide__steps xenios-ea-v2__steps" role="list">
        {EARLY_ACCESS_REQUEST_STEPS.map((step, index) => (
          <li key={step.id}>
            <span className="xenios-request-guide__number" aria-hidden="true">{index + 1}</span>
            <div><h3>{step.title}</h3></div>
          </li>
        ))}
      </ol>
      <details className="xenios-request-guide__details xenios-ea-v2__details">
        <summary>How review, decisions and payment work</summary>
        <dl>
          {EARLY_ACCESS_REQUEST_STEPS.map((step) => (
            <div key={step.id}><dt>{step.title}</dt><dd>{step.description}</dd></div>
          ))}
        </dl>
      </details>
      <p className="xenios-request-guide__categories">{EARLY_ACCESS_CATEGORY_EXPLANATION}</p>
      <p className="xenios-request-guide__boundary">{EARLY_ACCESS_REQUEST_BOUNDARY}</p>
    </section>
  );
}

/** Appears only in the existing confirmed-receipt view. All steps are prospective. */
export function EarlyAccessRequestNextSteps({ headingLevel = 2 }: Readonly<{ headingLevel?: 2 | 3 }>) {
  const headingId = useId();
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <section className="xenios-request-next xenios-ea-v2-next" aria-labelledby={headingId}
      data-testid="request-next-steps">
      <Heading id={headingId}>What happens next</Heading>
      <ol className="xenios-request-next__steps" role="list">
        {EARLY_ACCESS_RECEIPT_STEPS.map((step, index) => (
          <li key={step.id}>
            <span className="xenios-ea-v2-next__index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <div><strong>{step.title}</strong><p>{step.description}</p></div>
          </li>
        ))}
      </ol>
      <p className="xenios-ea-v2-next__note">Keep your reference. There is no need to send the same request again while the team reviews it.</p>
    </section>
  );
}
