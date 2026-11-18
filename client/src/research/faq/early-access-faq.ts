import { COMPANY_QUALITY_STATEMENT } from "../quality/company-quality";

export const EARLY_ACCESS_FAQ_GROUPS = [
  { id: "getting-started", label: "Getting started" },
  { id: "requests", label: "Requests" },
  { id: "intake-privacy", label: "Intake and privacy" },
  { id: "clinical-care", label: "Clinical care" },
  { id: "research", label: "Laboratory research" },
  { id: "product-basics", label: "Product basics" },
  { id: "quality", label: "Quality and sourcing" },
  { id: "credentials", label: "Credentials" },
  { id: "availability", label: "Availability" },
  { id: "images", label: "Product images" },
  { id: "handling", label: "Storage and handling" },
  { id: "quotes-payment", label: "Quotes and payment" },
  { id: "delivery-refunds", label: "Delivery and refunds" },
  { id: "support", label: "Support and access" },
  { id: "product-concerns", label: "Product concerns" },
] as const;

export type EarlyAccessFaqGroup = typeof EARLY_ACCESS_FAQ_GROUPS[number]["id"];
export type FaqSource = Readonly<{ title: string; href: string }>;
export type EarlyAccessFaqItem = Readonly<{
  id: string;
  group: EarlyAccessFaqGroup;
  audience: "visitor" | "customer" | "research-buyer";
  productScope: "all" | "clinical" | "research" | "listed-products";
  question: string;
  answer: string;
  detail: string;
  sources: readonly FaqSource[];
  reviewer: string | null;
  reviewedAt: string | null;
  sourceCheckedAt: string;
  publishingState: "public_operational" | "company_confirmed";
  cta: Readonly<{ label: string; href: string }>;
}>;

const SUPPORT = { label: "Get support", href: "/research/support" };
const EARLY_ACCESS = { label: "Browse Peptides & Supplements", href: "/earlyaccess" };
const CARE = { label: "Start Care request", href: "/care/schedule" };
const DOCUMENTS = { label: "Find approved lot records", href: "/research/documents" };
const entry = (item: Omit<EarlyAccessFaqItem, "reviewer" | "reviewedAt" | "sourceCheckedAt" | "publishingState"> &
  Partial<Pick<EarlyAccessFaqItem, "reviewer" | "reviewedAt" | "publishingState">>): EarlyAccessFaqItem => ({
  reviewer: null, reviewedAt: null, sourceCheckedAt: "2026-11-18", publishingState: "public_operational", ...item,
});

/** Public navigation/operation copy only. Proposed medical answers live in the
 * review document, not in this module or a hidden client-side draft array.
 * A source-check date does not assert a qualified clinical or legal review. */
export const EARLY_ACCESS_FAQ_ITEMS: readonly EarlyAccessFaqItem[] = [
  entry({ id: "what-is-early-access", group: "getting-started", audience: "visitor", productScope: "all",
    question: "What is Early Access?",
    answer: "A way to browse eligible offerings and send your selections to the Xenios team for review.",
    detail: "Enter details → Browse and select → Submit Request → Team review and next steps. Review and accept the current Early Access policy when asked. A saved request is not an accepted order, prescription, payment or shipment.",
    sources: [{ title: "Early Access", href: "/earlyaccess" }], cta: EARLY_ACCESS }),
  entry({ id: "who-is-early-access-for", group: "getting-started", audience: "visitor", productScope: "all",
    question: "Who is Early Access for?",
    answer: "Visitors who can complete the required access steps and want the team to review items they select.",
    detail: "The intake includes contact details, postal details and an age acknowledgement. Access does not establish clinical eligibility. Research-designated materials remain for legitimate nonclinical laboratory use, not human or veterinary use.",
    sources: [{ title: "Current access steps", href: "/earlyaccess" }], cta: EARLY_ACCESS }),
  entry({ id: "available-today", group: "getting-started", audience: "visitor", productScope: "listed-products",
    question: "What is available today?",
    answer: "The current Early Access catalog includes clinical options, laboratory research materials, supplements, creams and other listed products.",
    detail: "Check each listing's category, exact variant, requirements and hold status. A listing is an opportunity to ask for review, not a promise of stock, clinical services or fulfillment. Infinity remains in development.",
    sources: [{ title: "Current catalog entry", href: "/earlyaccess" }], cta: EARLY_ACCESS }),
  entry({ id: "after-submission", group: "requests", audience: "customer", productScope: "all",
    question: "What happens after I submit a request?",
    answer: "A successful save gives you a request reference and confirmation. The team reviews your selections and explains the next steps.",
    detail: "Keep the reference. The confirmation page distinguishes saved request facts from any available workflow status. Email can be delayed or unavailable; a missing email does not mean a saved request was lost. No response time or approval is promised.",
    sources: [{ title: "Request help", href: "/research/support" }], cta: SUPPORT }),
  entry({ id: "request-not-order", group: "requests", audience: "customer", productScope: "all",
    question: "Is submitting a request an order or an accepted quote?",
    answer: "No. Submit Request saves your requested selections for review.",
    detail: "It does not approve treatment, create a prescription, collect payment or place a supplier order. Final availability, quantities, pricing and delivery are confirmed separately. Any later quote, payment or fulfillment step has its own requirements.",
    sources: [{ title: "Early Access request flow", href: "/earlyaccess" }], cta: EARLY_ACCESS }),
  entry({ id: "track-correct-withdraw", group: "requests", audience: "customer", productScope: "all",
    question: "How do I track, correct or withdraw my request?",
    answer: "Use your original confirmation page and contact support with the request reference for a correction or withdrawal question.",
    detail: "The confirmation page can show status when its authorized status source is available. This FAQ does not provide a correction or withdrawal control, and contacting support does not itself record a withdrawal. If the result of submission is uncertain, keep the tab and retry that same attempt; after session expiry or closing the tab, contact support before sending a replacement.",
    sources: [{ title: "Request support", href: "/research/support" }], cta: SUPPORT }),
  entry({ id: "why-contact-address", group: "intake-privacy", audience: "visitor", productScope: "all",
    question: "Why are contact and postal details requested?",
    answer: "They let the team identify the request, contact you and review the requested delivery details.",
    detail: "Providing an address does not schedule shipment. Use the required fields in the intake; do not add medical records or payment details to an operational question.",
    sources: [{ title: "Privacy policy", href: "/research/privacy" }], cta: { label: "Read privacy information", href: "/research/privacy" } }),
  entry({ id: "required-details", group: "intake-privacy", audience: "visitor", productScope: "all",
    question: "Which intake details are required?",
    answer: "Follow the required labels and validation in the current intake. Fields marked optional may be left blank.",
    detail: "The flow asks for contact and postal information and required acknowledgements. Optional goals guide the conversation; they do not diagnose a condition or select a treatment or research product for personal use.",
    sources: [{ title: "Current intake", href: "/earlyaccess" }], cta: EARLY_ACCESS }),
  entry({ id: "information-retention", group: "intake-privacy", audience: "visitor", productScope: "all",
    question: "How is my information used and retained?",
    answer: "Read the privacy information and the current access policy for the scope that applies to your request.",
    detail: "A browser session ending is not a promise that the saved request or audit records are deleted. This FAQ does not set a retention period. If a policy is unavailable, marked as a draft or unclear, ask support before providing additional information.",
    sources: [{ title: "Privacy policy", href: "/research/privacy" }, { title: "Policy documents", href: "/research/policies" }],
    cta: { label: "Read privacy information", href: "/research/privacy" } }),
  entry({ id: "clinical-assessment", group: "clinical-care", audience: "visitor", productScope: "clinical",
    question: "Where do clinical assessment and prescription questions go?",
    answer: "Use the separate Care request path to ask about an appropriate clinical handoff.",
    detail: "The public Care request is nonclinical and does not establish a provider relationship. Commercial staff, catalog choices and software do not make clinical decisions. Ask the appropriate licensed professional about individual assessment and prescribing requirements; no prescription is guaranteed.",
    sources: [{ title: "Care access request", href: "/care/schedule" }], cta: CARE }),
  entry({ id: "clinical-location", group: "clinical-care", audience: "visitor", productScope: "clinical",
    question: "How do I check clinician review and state availability?",
    answer: "Ask through Care about the service and your current location before assuming a pathway is available.",
    detail: "A catalog listing does not establish clinical availability in a state or tell you what an individual assessment will require. The appropriate clinical organization must confirm its pathway and requirements separately.",
    sources: [{ title: "Care access request", href: "/care/schedule" }], cta: CARE }),
  entry({ id: "research-intended-buyer", group: "research", audience: "research-buyer", productScope: "research",
    question: "What is a laboratory research product, and who is it for?",
    answer: "A research-designated listing is for legitimate nonclinical research, analytical or laboratory work.",
    detail: "Research-designated materials are not for human or veterinary use. Read the exact product, variant, documentation and access requirements; do not interpret admission to the catalog as permission for personal treatment.",
    sources: [{ title: "Research pathway", href: "/research/access-hub" }], cta: { label: "Explore Research", href: "/research/access-hub" } }),
  entry({ id: "research-treatment-separation", group: "research", audience: "research-buyer", productScope: "research",
    question: "Why is laboratory research separate from treatment?",
    answer: "The catalog preserves different purposes, access requirements and review paths for research and clinical offerings.",
    detail: "Research Support handles operational and documentation questions. It does not provide personal-use, dosing, preparation or administration instructions. Personal clinical questions belong with an appropriately licensed professional through the Care or authorized provider path.",
    sources: [{ title: "Support boundaries", href: "/research/support" }], cta: SUPPORT }),
  entry({ id: "product-category-basics", group: "product-basics", audience: "visitor", productScope: "listed-products",
    question: "How do I understand peptide and other product categories?",
    answer: "Start with the listing's classification and exact variant. A shared ingredient name does not make clinical, research, supplement and topical offerings interchangeable.",
    detail: "Use Details and ask the team about a listing's identity or documentation. This operational FAQ does not explain medical benefits or decide which product is appropriate for a person.",
    sources: [{ title: "Current offerings", href: "/earlyaccess" }], cta: EARLY_ACCESS }),
  entry({ id: "personal-goals", group: "product-basics", audience: "visitor", productScope: "all",
    question: "Where can I discuss my health or performance goals?",
    answer: "Use the Care request path to ask about an appropriate professional conversation.",
    detail: "Optional intake goals do not create a diagnosis, prescription or automated product recommendation. Research products are not suggested for human use based on a goal. A public request does not guarantee access to clinical services.",
    sources: [{ title: "Care access request", href: "/care/schedule" }], cta: CARE }),
  entry({ id: "company-sourcing", group: "quality", audience: "visitor", productScope: "listed-products",
    question: "What has Xenios confirmed about sourcing and testing?",
    answer: COMPANY_QUALITY_STATEMENT,
    detail: "This is Xenios's company-confirmed sourcing statement dated November 18, 2026, for the products described by the company. It is distinct from independent review of manufacturer, laboratory, accreditation and product/lot records. It is not a statement about research supplies or shipping services, a product certification or an FDA approval.",
    publishingState: "company_confirmed", reviewer: "Samuel Boadu — company confirmation", reviewedAt: "2026-11-18",
    sources: [{ title: "Quality and sourcing", href: "/research/quality" }], cta: DOCUMENTS }),
  entry({ id: "who-tested-item", group: "quality", audience: "customer", productScope: "listed-products",
    question: "Who tested this item, and where can I see the report?",
    answer: "Check the exact product and lot's approved public documents, where available, or ask the team for documentation.",
    detail: "A report for another product or lot is not a match. Public lot verification may show an unavailable or incomplete record; that is not a passing result or proof that no private record exists. Only documents approved for public access are downloadable.",
    sources: [{ title: "Approved document paths", href: "/research/documents" }], cta: DOCUMENTS }),
  entry({ id: "coa-scope", group: "quality", audience: "visitor", productScope: "listed-products",
    question: "What does a certificate of analysis establish and omit?",
    answer: "Read the report's stated sample, lot, test methods, dates and measured results; do not treat a headline number as a universal guarantee.",
    detail: "Identity, purity, content, sterility and endotoxin are distinct questions. A COA alone does not establish every one of them, laboratory accreditation, clinical safety or suitability for a person. Testing evidence must be read within its actual scope.",
    sources: [{ title: "How to read testing evidence", href: "/research/testing" }], cta: { label: "Understand testing evidence", href: "/research/testing" } }),
  entry({ id: "credential-records", group: "credentials", audience: "visitor", productScope: "listed-products",
    question: "Where can I check laboratory, pharmacy and approval credentials?",
    answer: "Ask for the named organization and the exact credential record rather than treating a testing report as proof of every credential.",
    detail: "Laboratory accreditation, pharmacy licensing and product approval are different records. The company sourcing statement is not an independently reviewed accreditation certificate. No accreditation badge is created from an unverified registration number or from a report for a different lot.",
    sources: [{ title: "NIST: accreditation and certification", href: "https://www.nist.gov/nvlap/accreditation-vs-certification" }], cta: SUPPORT }),
  entry({ id: "held-items", group: "availability", audience: "customer", productScope: "listed-products",
    question: "Why is an item held or awaiting information?",
    answer: "A hold or documentation status identifies a limit that must be resolved through the item's current review path.",
    detail: "Read the listing's displayed reason and ask the team about that exact variant. A hold is not silently removed by adding an item to selections or sending a request. Do not substitute a similar-looking strength or formulation.",
    sources: [{ title: "Catalog entry", href: "/earlyaccess" }], cta: SUPPORT }),
  entry({ id: "listing-stock", group: "availability", audience: "customer", productScope: "listed-products",
    question: "Does a catalog listing mean the item is in stock?",
    answer: "No. Listing presence does not promise availability, price, eligibility or shipment.",
    detail: "The team confirms applicable availability and next steps separately. Keep the exact item, strength, format and quantity clear when asking a question; a saved request does not reserve stock.",
    sources: [{ title: "Early Access request flow", href: "/earlyaccess" }], cta: EARLY_ACCESS }),
  entry({ id: "image-types", group: "images", audience: "visitor", productScope: "listed-products",
    question: "Is an image a product photo, label reference or proposed render?",
    answer: "Read the image caption and product Details for the type of image and the exact variant it represents.",
    detail: "A proposed packaging render is an illustration, not proof of supplied packaging, maker, lot or certification. If a caption or match is unclear, ask about the item before relying on the image.",
    sources: [{ title: "Catalog entry and Details", href: "/earlyaccess" }], cta: SUPPORT }),
  entry({ id: "storage-handling", group: "handling", audience: "customer", productScope: "listed-products",
    question: "Where do I find storage and handling instructions?",
    answer: "Use the exact product's current supplied documentation and the appropriate supplier, pharmacy or professional contact.",
    detail: "There is no universal storage or handling protocol in this FAQ. If the relevant instructions are missing or unclear, ask for the correct documentation. Research Support does not provide personal-use preparation or administration guidance.",
    sources: [{ title: "Document help", href: "/research/support" }], cta: SUPPORT }),
  entry({ id: "pricing-quotes", group: "quotes-payment", audience: "customer", productScope: "all",
    question: "How are prices and quotes supplied?",
    answer: "Send your selections for review. The team confirms applicable pricing and next steps separately.",
    detail: "A missing price is not zero, and a request reference is not an accepted quote. Ask about the exact item, quantity and any applicable consultation, shipping or other charges before deciding to proceed.",
    sources: [{ title: "Request and quote support", href: "/research/support" }], cta: SUPPORT }),
  entry({ id: "quote-expiry-payment", group: "quotes-payment", audience: "customer", productScope: "all",
    question: "When can a quote change or expire, and when is payment requested?",
    answer: "Use the terms and expiry on the actual quote or payment step, if one is provided. Submit Request does not collect payment.",
    detail: "This FAQ does not promise that online quote acceptance or payment is enabled for your request. Confirm any changed price, expiry, availability and payment instructions with the team through the applicable approved path.",
    sources: [{ title: "Terms of Service", href: "/research/terms" }], cta: SUPPORT }),
  entry({ id: "shipping-cancellation-refunds", group: "delivery-refunds", audience: "customer", productScope: "all",
    question: "Which shipping, cancellation and refund policies apply?",
    answer: "Check the current terms and any applicable confirmed quote or order documents, and ask the team about your exact request.",
    detail: "Submitting a review request does not start shipping or establish an order cancellation or refund entitlement. This FAQ does not promise a delivery date, universal return period or immediate cancellation. If the relevant policy is missing or unclear, ask before proceeding.",
    sources: [{ title: "Current terms", href: "/research/terms" }], cta: { label: "Read current terms", href: "/research/terms" } }),
  entry({ id: "get-help", group: "support", audience: "visitor", productScope: "all",
    question: "How do I reach someone for help?",
    answer: "The Support page provides the team's email and the current catalog-help text route.",
    detail: "Support handles access, listing identity, documents and request questions. A draft email or text is not a submitted request, an approval or a recorded workflow action. Support coverage and response times are not guaranteed. Do not send medical or payment details by text.",
    sources: [{ title: "Support contact routes", href: "/research/support" }], cta: SUPPORT }),
  entry({ id: "receipt-missing-email", group: "support", audience: "customer", productScope: "all",
    question: "Where is my receipt if the email is missing?",
    answer: "Keep the reference shown after a successful save and use the original confirmation link in that browser tab.",
    detail: "A saved request can exist even if an email is delayed or unavailable. Check the confirmation and contact support with your reference rather than submitting again. Support cannot recover an account or private request merely from an unauthenticated page view.",
    sources: [{ title: "Receipt help", href: "/research/support" }], cta: SUPPORT }),
  entry({ id: "account-access", group: "support", audience: "customer", productScope: "all",
    question: "How do I regain account access?",
    answer: "Use the existing sign-in and password-reset path for your account, or contact support if you cannot continue.",
    detail: "A reset request does not grant membership, staff permissions or access to another person's request. Recovery can fail or expire. Support will not ask for your password, and you should not send passwords or recovery links in a support message.",
    sources: [{ title: "Password reset", href: "/research/reset-password" }], cta: { label: "Reset password", href: "/research/reset-password" } }),
  entry({ id: "report-product-concern", group: "product-concerns", audience: "customer", productScope: "listed-products",
    question: "How do I report a suspected product problem?",
    answer: "Contact support for an operational or product-documentation concern, identifying the exact item and lot when available.",
    detail: "For symptoms, a suspected adverse reaction or other personal clinical concerns, use an appropriately licensed clinician or your authorized provider route. Research Support does not assess or treat a reaction. This FAQ does not replace an urgent-care or emergency service.",
    sources: [{ title: "Support and clinical boundaries", href: "/research/support" }], cta: SUPPORT }),
];

export function filterEarlyAccessFaq(query: string, group: EarlyAccessFaqGroup | "all" = "all"): readonly EarlyAccessFaqItem[] {
  const terms = query.toLowerCase().trim().split(/\s+/u).filter(Boolean);
  return EARLY_ACCESS_FAQ_ITEMS.filter((item) => {
    if (group !== "all" && item.group !== group) return false;
    const groupLabel = EARLY_ACCESS_FAQ_GROUPS.find((value) => value.id === item.group)!.label;
    const text = `${groupLabel} ${item.question} ${item.answer} ${item.detail}`.toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
