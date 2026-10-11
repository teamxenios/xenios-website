import { AFFILIATION_OPTIONS, SOURCE_OPTIONS } from "./contracts";

/** Only an already-authorized operator reader may populate this projection.
 * Rendering the fragment grants no access and performs no request or mutation. */
export interface OperatorDeclarationView {
  source: (typeof SOURCE_OPTIONS)[number][0]; sourceDetail: string; declaredCode: string | null;
  affiliationKind: (typeof AFFILIATION_OPTIONS)[number][0]; affiliationDetail: string;
  confirmedAt: string;
  reviewState: "direct_no_referrer" | "captured_unmatched" | "matched_by_authorized_operator" | "disputed" | "corrected";
  trustedAttribution: { state: "absent" | "verified" | "conflict"; reference?: string };
  nextAction: string;
}
const reviewLabels: Record<OperatorDeclarationView["reviewState"], string> = {
  direct_no_referrer: "Direct / no referrer declared", captured_unmatched: "Captured, awaiting attribution review",
  matched_by_authorized_operator: "Matched by authorized operator", disputed: "Disputed", corrected: "Corrected with audit history",
};
export function OperatorDeclarations({ declaration }: { declaration: OperatorDeclarationView | null }) {
  if (!declaration) return <section aria-label="Quick Order declarations"><h3>Quick Order declarations</h3><p>Structured declaration evidence is not available.</p></section>;
  return <section aria-label="Quick Order declarations"><h3>Customer-declared referral and affiliation</h3><dl>
    <dt>Source</dt><dd>{SOURCE_OPTIONS.find(([kind]) => kind === declaration.source)?.[1]}</dd>
    <dt>Source detail</dt><dd>{declaration.sourceDetail || "Not supplied for direct / no referrer"}</dd>
    <dt>Declared referral code</dt><dd>{declaration.declaredCode || "Not supplied"}</dd>
    <dt>Affiliation</dt><dd>{AFFILIATION_OPTIONS.find(([kind]) => kind === declaration.affiliationKind)?.[1]}</dd>
    <dt>Affiliation name</dt><dd>{declaration.affiliationDetail || "No affiliation declared"}</dd>
    <dt>Customer confirmation recorded</dt><dd><time dateTime={declaration.confirmedAt}>{declaration.confirmedAt}</time></dd>
    <dt>Attribution review</dt><dd>{reviewLabels[declaration.reviewState]}</dd>
  </dl><h3>Trusted attribution</h3>
    <p>{declaration.trustedAttribution.state === "verified" ? "Verified by the canonical attribution service."
      : declaration.trustedAttribution.state === "conflict" ? "The trusted attribution and customer declaration disagree. Preserve both for authorized review."
        : "No verified attribution is present."}</p>
    {declaration.trustedAttribution.reference && <p>Trusted reference: {declaration.trustedAttribution.reference}</p>}
    <p>These declarations do not authorize commission, payout or referrer access to the request.</p>
    <h3>Next action</h3><p>{declaration.nextAction}</p>
  </section>;
}
