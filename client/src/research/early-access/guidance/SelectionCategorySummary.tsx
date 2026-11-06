import { useId } from "react";
import { CATEGORY_NAMES, CATEGORY_ORDER, CLINICAL_LIMIT, RESEARCH_LIMIT, REQUEST_LIMIT, summarizeSelection, type SelectionGuidanceInput } from "./product-guidance-model";
import "./early-access-guidance.css";

/** In-memory presentation of already selected records; no new agreement/transaction action. */
export function SelectionCategorySummary({ items }: Readonly<{ items: readonly SelectionGuidanceInput[] }>) {
  const titleId = useId();
  const summary = summarizeSelection(items);
  if (!summary.distinctVariants) return null;
  return <section className="ea-selection-guide" aria-labelledby={titleId} data-testid="selection-category-summary">
    <h3 id={titleId}>What happens with your selections</h3>
    <ul>{CATEGORY_ORDER.filter((category) => summary.counts[category] > 0).map((category) =>
      <li key={category}><strong>{CATEGORY_NAMES[category]}</strong>: {summary.counts[category]} {summary.counts[category] === 1 ? "variant" : "variants"}</li>)}</ul>
    {summary.clinicalPresent && <p>{CLINICAL_LIMIT}</p>}
    {summary.researchPresent && <p className="ea-guide__limit">{RESEARCH_LIMIT}</p>}
    {summary.counts.unconfirmed > 0 && <p>Some item details need confirmation. Keep each listing’s current restrictions in place and contact support for clarification.</p>}
    <p>{REQUEST_LIMIT}</p>
  </section>;
}
