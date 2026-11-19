import { useId } from "react";
import Wordmark from "@/components/Wordmark";
import { EARLY_ACCESS_BOOKING, EARLY_ACCESS_CONTACTS } from "./early-access-contacts";
import "./premium-early-access.css";

/** Shared across entry, catalog, Details, contact, review and receipt. Links send nothing. */
export function EarlyAccessContactLinks({ compact = false }: Readonly<{ compact?: boolean }>) {
  const headingId = useId();
  const content = <>
    <p className="xenios-premium-muted">Book a team conversation or contact a person. Booking is not a medical appointment. Keep medical and payment details out of email.</p>
    <div className="xenios-premium-contacts__groups">
      {(["Explore", "People", "Follow"] as const).map(group => <div key={group}>
        <p className="xenios-premium-eyebrow">{group}</p>
        <ul>{EARLY_ACCESS_CONTACTS.filter(link => link.group === group).map(link => <li key={link.id}>
          <a href={link.href} {...(link.href.startsWith("https:") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            {link.label}{link.href.startsWith("https:") && <span className="sr-only"> (opens in a new tab)</span>}
          </a>
        </li>)}</ul>
      </div>)}
    </div>
  </>;
  return compact
    ? <details className="xenios-premium-contacts xenios-premium-contacts--compact"><summary>Talk to the Xenios team &amp; follow Xenios</summary>{content}</details>
    : <section className="xenios-premium-contacts" aria-labelledby={headingId}>
      <h2 id={headingId}>A real team, within reach.</h2>{content}
    </section>;
}

/** Count comes from the mounted cart. No second cart or navigation state is created. */
export function EarlyAccessCatalogNavigation({ count, onViewCart }: Readonly<{ count: number; onViewCart?: () => void }>) {
  return <header className="xenios-premium-catalog-header">
    <Wordmark size="sm" asLink={false} />
    <nav aria-label="Early Access catalog navigation">
      {onViewCart ? <button type="button" onClick={onViewCart}>Quote cart <span aria-live="polite" aria-atomic="true">({count})</span></button>
        : <span role="status">Quote cart ({count})</span>}
      <a href={EARLY_ACCESS_BOOKING.href} target="_blank" rel="noopener noreferrer">Book the team<span className="sr-only"> (opens in a new tab)</span></a>
    </nav>
  </header>;
}
