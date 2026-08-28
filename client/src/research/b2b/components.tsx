import type { ReactNode } from "react";
import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import type { PartnershipPathway } from "./pathways";
import "./pathways.css";

export function B2BPageFrame({
  title,
  description,
  path,
  eyebrow,
  heading,
  lead,
  actions,
  children,
}: {
  title: string;
  description: string;
  path: string;
  eyebrow: string;
  heading: string;
  lead: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <SeoHead title={title} description={description} path={path} />
      <header className="xr-b2b-hero-band">
        <div className="container-x xr-b2b-hero-content">
          <div>
            <p className="mono-cap text-pulse">{eyebrow}</p>
            <h1 className="display-m text-balance max-w-[19ch] mt-4">{heading}</h1>
            <p className="body-l text-ink-2 max-w-[66ch] mt-6">{lead}</p>
          </div>
          {actions && <div className="xr-b2b-hero-actions">{actions}</div>}
        </div>
      </header>
      {children}
    </>
  );
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  body,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="mb-8">
      <p className="mono-cap text-pulse">{eyebrow}</p>
      <h2 id={id} className="display-s text-balance max-w-[24ch] mt-3">
        {title}
      </h2>
      {body && <p className="body-m text-ink-2 max-w-[68ch] mt-4">{body}</p>}
    </div>
  );
}

export function PathwayCard({ pathway }: { pathway: PartnershipPathway }) {
  return (
    <article className="xr-b2b-pathway-card" data-testid={`b2b-pathway-${pathway.id}`}>
      <p className="mono-label text-ink-mute">{pathway.eyebrow}</p>
      <h3 className="h3 mt-3">{pathway.title}</h3>
      <p className="body-s text-ink-2 mt-3">{pathway.summary}</p>
      <div className="xr-b2b-review">
        <p className="mono-label text-ink-mute">Human review covers</p>
        <p className="body-s text-ink-2 mt-2">{pathway.reviewFocus}</p>
      </div>
      <div className="xr-b2b-card-actions">
        {pathway.route.startsWith("#") ? (
          <a href={pathway.route} className="btn btn-secondary">
            {pathway.actionLabel}
          </a>
        ) : (
          <Link href={pathway.route} className="btn btn-secondary">
            {pathway.actionLabel}
          </Link>
        )}
      </div>
    </article>
  );
}

export function ReviewSteps({
  steps,
}: {
  steps: readonly { title: string; body: string }[];
}) {
  return (
    <ol className="xr-b2b-steps">
      {steps.map((step, index) => (
        <li className="xr-b2b-step" key={step.title}>
          <span className="xr-b2b-step-number mono-label" aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>
          <h3 className="body-l font-700 mt-5">{step.title}</h3>
          <p className="body-s text-ink-2 mt-3">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}

export function BoundaryPanel({
  id,
  title,
  body,
  items,
}: {
  id: string;
  title: string;
  body: string;
  items: readonly string[];
}) {
  return (
    <aside className="xr-b2b-boundary" aria-labelledby={id}>
      <p className="mono-cap text-pulse">Operating boundary</p>
      <h2 id={id} className="body-l font-700 mt-3">
        {title}
      </h2>
      <p className="body-s text-ink-2 mt-3 max-w-[70ch]">{body}</p>
      <ul className="xr-b2b-checklist body-s text-ink-2">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </aside>
  );
}
