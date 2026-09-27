import type { ReactNode } from "react";
import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import PublicShell from "./PublicShell";
import { pageTitle } from "./brand";

export type Action = {
  label: string;
  href: string;
  kind?: "primary" | "secondary" | "text";
};

export function ActionLink({ action, className = "" }: { action: Action; className?: string }) {
  const variant = action.kind === "primary" ? "btn-primary" : action.kind === "text" ? "clarity-text-link" : "btn-secondary";
  return <Link href={action.href} className={`${action.kind === "text" ? "" : "btn"} ${variant} ${className}`.trim()}>{action.label}</Link>;
}

export function ActionRow({ actions }: { actions: Action[] }) {
  return (
    <div className="clarity-actions">
      {actions.map((action) => <ActionLink key={`${action.href}-${action.label}`} action={action} />)}
    </div>
  );
}

export function PublicPage({
  title,
  description,
  path,
  eyebrow,
  heading,
  lead,
  actions = [],
  robots,
  children,
}: {
  title: string;
  description: string;
  path: string;
  eyebrow?: string;
  heading: string;
  lead: string;
  actions?: Action[];
  robots?: string;
  children?: ReactNode;
}) {
  return (
    <PublicShell>
      <SeoHead title={pageTitle(title)} description={description} path={path} robots={robots} />
      <section className="clarity-hero container-x">
        {eyebrow && <p className="mono-cap text-pulse">{eyebrow}</p>}
        <h1 className="display-l text-balance">{heading}</h1>
        <p className="body-l text-ink-2 clarity-lead">{lead}</p>
        {actions.length > 0 && <ActionRow actions={actions} />}
      </section>
      {children}
    </PublicShell>
  );
}

export function ContentSection({
  eyebrow,
  title,
  intro,
  children,
  tone = "light",
  id,
}: {
  eyebrow?: string;
  title?: string;
  intro?: string;
  children: ReactNode;
  tone?: "light" | "soft" | "dark";
  id?: string;
}) {
  const toneClass = tone === "dark" ? "clarity-section-dark" : tone === "soft" ? "clarity-section-soft" : "";
  return (
    <section id={id} className={`clarity-section rule-top ${toneClass}`.trim()}>
      <div className="container-x">
        {eyebrow && <p className={`mono-cap mb-5 ${tone === "dark" ? "text-paper/60" : "text-ink-mute"}`}>{eyebrow}</p>}
        {title && <h2 className={`display-m text-balance clarity-section-title ${tone === "dark" ? "text-paper" : ""}`}>{title}</h2>}
        {intro && <p className={`body-l clarity-section-intro ${tone === "dark" ? "text-paper/70" : "text-ink-2"}`}>{intro}</p>}
        {children}
      </div>
    </section>
  );
}

export function InfoGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`clarity-grid ${className}`.trim()}>{children}</div>;
}

export function InfoCard({ title, children, eyebrow }: { title: string; children: ReactNode; eyebrow?: string }) {
  return (
    <article className="clarity-card">
      {eyebrow && <p className="mono-cap text-pulse mb-3">{eyebrow}</p>}
      <h3 className="h3">{title}</h3>
      <div className="body-m text-ink-2 clarity-card-body">{children}</div>
    </article>
  );
}

export function NumberedSteps({ steps }: { steps: Array<{ title: string; body: string }> }) {
  return (
    <ol className="clarity-steps">
      {steps.map((step, index) => (
        <li key={step.title} className="clarity-step">
          <span className="clarity-step-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <div><h3 className="h3">{step.title}</h3><p className="body-m text-ink-2 mt-3">{step.body}</p></div>
        </li>
      ))}
    </ol>
  );
}

export function FaqList({ items }: { items: Array<{ question: string; answer: ReactNode }> }) {
  return (
    <div className="clarity-faq">
      {items.map((item) => (
        <details key={item.question} className="clarity-faq-item">
          <summary>{item.question}</summary>
          <div className="body-m text-ink-2">{item.answer}</div>
        </details>
      ))}
    </div>
  );
}

export function BoundaryNote({ children }: { children: ReactNode }) {
  return <div className="clarity-boundary body-m">{children}</div>;
}
