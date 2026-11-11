/** Customer-facing copy only. Never determines eligibility, consent or payment. */
export const EARLY_ACCESS_REQUEST_CTA = Object.freeze({
  add: "Add to quote cart",
  view: "View request",
  details: "Continue to details",
  finalReview: "Continue to request a quote",
  submit: "Request a quote",
  retry: "Retry same request",
  submitting: "Submitting request…",
  finalHeading: "Submit your request",
  summary: "Your request",
  browse: "Browse products",
  help: "Get help with your request",
  open: "Browse products and submit a request",
} as const);

export const EARLY_ACCESS_BRAND = Object.freeze({
  name: "Xenios Care + Research",
  wordmarkSuffix: "care + research",
});

export const EARLY_ACCESS_REQUEST_INTRO =
  "Explore clinical and nonclinical products, choose the items you want, and submit one request. Our team reviews your request and confirms the next steps.";

export const EARLY_ACCESS_REQUEST_BOUNDARY =
  "Submitting a request does not collect payment, approve treatment, create a prescription or confirm shipping. Availability and any required clinical review are confirmed separately.";

export const EARLY_ACCESS_CATEGORY_EXPLANATION =
  "Clinical products follow the applicable clinician-review process. Nonclinical products include different categories, such as supplements and research materials; they do not all have the same intended use. Items labeled Research Use Only are for laboratory research, not human or veterinary use.";

export type RequestJourneyStep = Readonly<{ id: string; title: string; description: string }>;

/** Founder-described process. Future steps, not evidence that any action occurred. */
export const EARLY_ACCESS_REQUEST_STEPS: readonly RequestJourneyStep[] = Object.freeze([
  Object.freeze({ id: "choose", title: "Choose your products",
    description: "Read the descriptions and intended use, then add items to your quote cart." }),
  Object.freeze({ id: "submit", title: "Submit your request",
    description: "Enter your contact and delivery details, check your selections and acknowledgments, then select Request a quote. No payment is collected here." }),
  Object.freeze({ id: "team", title: "Our team reviews it",
    description: "Once saved, your request is available to the team for review. We follow up about the items and any information needed." }),
  Object.freeze({ id: "clinical", title: "Clinical review, when needed",
    description: "For clinical products, requests go through the provider pathway, where a licensed clinician decides whether the product is appropriate. Nonclinical items follow their own product requirements." }),
  Object.freeze({ id: "decision", title: "Decision and payment options",
    description: "We let you know whether the request can proceed. For approved, available items, the team confirms the price and payment options. Items that are not approved do not proceed to payment." }),
]);

export const EARLY_ACCESS_RECEIPT_STEPS: readonly RequestJourneyStep[] = Object.freeze([
  Object.freeze({ id: "review", title: "Team review",
    description: "Our team reviews the selected products and uses the contact details you provided if more information is needed." }),
  Object.freeze({ id: "assessment", title: "The right checks for each item",
    description: "For clinical products, requests go through the provider pathway, where a licensed clinician decides whether the product is appropriate. Nonclinical items follow their own requirements and availability checks." }),
  Object.freeze({ id: "decision", title: "A clear decision",
    description: "The team lets you know which items can proceed, which need more information and which cannot be approved." }),
  Object.freeze({ id: "payment", title: "Pricing and payment options",
    description: "For approved, available items, the team confirms pricing and explains the payment options. This submitted request has not collected payment or confirmed shipping." }),
]);

export function finalRequestActionLabel(frozen: boolean, busy = false): string {
  // A first POST also freezes its payload; frozen alone cannot distinguish a retry in flight.
  if (busy) return EARLY_ACCESS_REQUEST_CTA.submitting;
  return frozen ? EARLY_ACCESS_REQUEST_CTA.retry : EARLY_ACCESS_REQUEST_CTA.submit;
}

/** A recovered or reopened receipt describes an earlier submission. */
export function requestReceiptHeading(earlierReceipt: boolean): string {
  return earlierReceipt ? "Your submitted request" : "Request submitted";
}
