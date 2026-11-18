import { Link } from "wouter";
import { COMPANY_QUALITY_CONFIRMATION } from "./company-quality";
import { formatQualityDate } from "./content";

/** Reusable company statement; it never manufactures a lot/document badge. */
export function EvidenceProvenance({ id = "company-quality", headingLevel = 2 }: {
  id?: string;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const confirmation = COMPANY_QUALITY_CONFIRMATION;
  return <section className="card bg-paper-2" aria-labelledby={`${id}-title`} style={{ minWidth: 0, overflowWrap: "anywhere" }}>
    <p className="mono-cap text-ink-mute">Company-confirmed sourcing</p>
    <Heading id={`${id}-title`} className="h3 mt-4">{confirmation.statement}</Heading>
    <p className="body-s text-ink-mute mt-4">
      Confirmed by {confirmation.confirmedBy} on {formatQualityDate(confirmation.confirmedAt)}.
    </p>
    <p className="body-m text-ink-2 mt-4">{confirmation.scope}</p>
    <p className="body-m text-ink-2 mt-4">
      Company confirmation and independent review of product documentation are different. This statement is not a product certification or an FDA approval.
      Product and lot records need their own matching manufacturer, laboratory, test and accreditation information.
    </p>
    <p className="body-s text-ink-mute mt-4">
      Public lot verification shows only records approved for publication. A laboratory report describes its stated sample, methods and results;
      it does not by itself verify laboratory accreditation or establish suitability for a person.
    </p>
    <div className="public-editorial-actions mt-6">
      <Link href="/research/documents" className="btn btn-secondary public-editorial-action">Find approved lot records</Link>
      <Link href="/research/testing" className="btn btn-ghost public-editorial-action">Understand testing evidence</Link>
      <Link href="/research/support" className="btn btn-ghost public-editorial-action">Ask about documentation</Link>
    </div>
  </section>;
}
