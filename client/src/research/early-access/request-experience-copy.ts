/** Customer-facing copy only. Never determines eligibility, consent or payment. */
export const EARLY_ACCESS_REQUEST_CTA = Object.freeze({
  add: "Add to quote cart",
  view: "View request",
  details: "Continue to details",
  finalReview: "Continue to request a quote",
  submit: "Submit Request",
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
  "Choose your products, submit one request, and get clear next steps from our team.";

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
    description: "Enter your contact and delivery details, check your selections and acknowledgments, then select " + EARLY_ACCESS_REQUEST_CTA.submit + ". No payment is collected here." }),
  Object.freeze({ id: "team", title: "Our team reviews it",
    description: "Once saved, your request is available to the team for review. We follow up about the items and any information needed." }),
  Object.freeze({ id: "clinical", title: "Clinical review, when needed",
    description: "For clinical products, requests can proceed only through an appropriate confirmed pathway. A licensed clinician makes clinical decisions; nonclinical items follow their own product requirements." }),
  Object.freeze({ id: "decision", title: "Decision and payment options",
    description: "We let you know whether the request can proceed. For approved, available items, the team confirms the quote, payment options and fulfillment information. Items that are not approved do not proceed to payment." }),
]);

export const EARLY_ACCESS_RECEIPT_STEPS: readonly RequestJourneyStep[] = Object.freeze([
  Object.freeze({ id: "review", title: "Team review",
    description: "We'll review the items you requested and contact you using the details you provided. The reply window begins at the original received time shown on your confirmation." }),
  Object.freeze({ id: "assessment", title: "The right checks for each item",
    description: "Any required clinical review depends on an appropriate confirmed pathway and a licensed clinician's decision. Nonclinical items follow their own requirements and availability checks." }),
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

export const EARLY_ACCESS_PREMIUM_HEADLINE = "Explore the Xenios peptide catalog.";

export const EARLY_ACCESS_FAQS = Object.freeze([
  { question: "I know the product name. Where do I start?", answer: "Complete the required intake, then search the catalog by its listed name. Check the exact form, strength, package and current restrictions before adding a selection to your quote cart." },
  { question: "Can someone help me explore the catalog?", answer: "Yes. Book a team conversation or contact Samuel or Seth. The team can explain listings and the request process. Questions about your personal care belong with your healthcare provider." },
  { question: "What happens after I submit a request?", answer: "Once your request is saved, our team will reply within 24 hours of its original received time. Keep the saved reference for follow-up. A request is not an approved order, prescription or shipment." },
  { question: "Do clinical products require a clinician or prescription?", answer: "Clinical requirements remain specific to the item and confirmed care pathway. Where evaluation or a prescription is required, a licensed clinician decides. Adding an item to a request does not approve it. Research Use Only products are not for human or veterinary use." },
  { question: "Is bloodwork included?", answer: "This catalog does not promise included bloodwork. The team must confirm any testing offer, requirements, provider and costs separately before you agree to it." },
  { question: "When will I see pricing and payment options?", answer: "Send your selections for review. For items that can proceed, the team confirms the quote and payment options separately. Submitting this request does not collect payment." },
  { question: "When will my items ship?", answer: "Availability and delivery timing are confirmed after review. Submitting a request does not reserve inventory, confirm shipment or guarantee an arrival date." },
  { question: "Can supplies arrive separately?", answer: "Ask the team to confirm whether your product and any supplies use separate shipments. Check the exact listing and quote; do not assume supplies, accessories or services are included. Shipment timing is confirmed separately." },
  { question: "Can my business request a custom quote or white label?", answer: "Use the business enquiry route for quantities, packaging or white-label questions. White label is limited to eligible products, with logo, sample and terms agreed separately. An enquiry does not authorize resale of prescription products or promise a minimum quantity, fee or timeline." },
  { question: "How do I reach a person?", answer: "Use the shared team links below to book a conversation, email the team or call Samuel or Seth. Keep your saved reference handy for a submitted request. Do not email medical records or payment details." },
] as const);
