import { createHash } from "node:crypto";

export type ResearchPolicyAgreementMetadata = Readonly<{
  kind: string;
  version: string;
}>;

export type ResearchPublishedPolicy = Readonly<{
  title: string;
  updated: string;
  sections: Array<{ heading: string; paragraphs: string[]; bullets?: string[] }>;
  /** Present only when accepting this exact policy creates an agreement row. */
  agreement?: ResearchPolicyAgreementMetadata;
}>;

export const RESEARCH_USE_POLICY_AGREEMENT = Object.freeze({
  kind: "early_access_terms",
  version: "v1",
}) satisfies ResearchPolicyAgreementMetadata;

export const policies: Record<string, ResearchPublishedPolicy> = {
  "research-use": {
    title: "Research Use Policy",
    updated: "July 2026",
    agreement: RESEARCH_USE_POLICY_AGREEMENT,
    sections: [
      { heading: "Purpose", paragraphs: ["Research materials listed through xenios are offered solely for legitimate nonclinical research, analytical, laboratory, or product-development purposes. They are not offered for human or veterinary use."] },
      { heading: "Prohibited use", paragraphs: ["A purchaser may not ingest, inject, administer, prescribe, dispense, recommend, or distribute research materials for human or veterinary use."], bullets: ["No personal use", "No client or patient use", "No dosing or protocol support", "No resale for human use", "No use as medicine, supplement, food, cosmetic, or treatment"] },
      { heading: "Order review", paragraphs: ["xenios may request identity, organization, intended-use, destination, website, reseller, and transaction information. Orders may be delayed, rejected, cancelled, or refunded when the surrounding circumstances are inconsistent with the policy."] },
      { heading: "Communication", paragraphs: ["Customer support may explain product specifications, batch documents, shipping, storage according to the released specification, and order status. It will not provide personal-use instructions or medical advice."] },
    ],
  },
  shipping: {
    title: "Shipping Policy",
    updated: "July 2026",
    sections: [
      { heading: "Fulfillment model", paragraphs: ["The starter architecture assumes Quantum holds inventory and manages labeling, packing, shipping, tracking, replacements, and lot-level fulfillment records. xenios manages the customer-facing storefront and front-line support."] },
      { heading: "Order release", paragraphs: ["An order is not released merely because payment or an order request is submitted. Product, buyer, destination, quality, compliance, fraud, and inventory checks may apply."] },
      { heading: "Tracking and delivery", paragraphs: ["Tracking is provided after fulfillment. Delivery estimates are not guarantees. Temperature-sensitive or restricted products may use product-specific methods."] },
    ],
  },
  returns: {
    title: "Returns and Replacements",
    updated: "July 2026",
    sections: [
      { heading: "General rule", paragraphs: ["Research materials and temperature-sensitive products may be nonreturnable after shipment except for verified damage, wrong item, recall, or another approved exception."] },
      { heading: "Report a problem", paragraphs: ["Contact support promptly with the order number, product, lot, shipping package, condition, and photographs. Do not discard the product or packaging until instructed."] },
      { heading: "Approved remedies", paragraphs: ["Depending on the facts and agreement, the remedy may include replacement, refund, credit, investigation, batch hold, or recall communication."] },
    ],
  },
  accessibility: {
    title: "Accessibility Statement",
    updated: "August 2026",
    sections: [
      { heading: "Draft status", paragraphs: ["This statement is an operational draft prepared from the program's accessibility register (XR-PUB-006, version 0.1.0-draft, 2026-07-19). It describes intent and current state for the Research surfaces; qualified counsel has not yet reviewed it and no external conformance audit has been performed."] },
      { heading: "Our commitment", paragraphs: ["Xenios Research intends its public, member, and account surfaces to be usable by people with disabilities. This statement is written to be honest rather than reassuring: the program is in its founding phase and accessibility work is ongoing."] },
      { heading: "Conformance target", paragraphs: ["The working target is the Web Content Accessibility Guidelines (WCAG) 2.1 at Level AA, published by the W3C. Current status: partially conformant. Some surfaces and some documents do not yet fully meet the target, as described under known limitations."] },
      { heading: "What the Research surfaces do", paragraphs: ["Interactive surfaces are built to work without a mouse, with visible focus, semantic structure, one main landmark per page, labelled form fields, and errors explained in plain language next to the field rather than by colour alone. Text and interface contrast are checked against the target. Motion respects the reduced-motion preference, and required controls target a minimum 44 by 44 pixel size on touch devices."], bullets: ["Keyboard access on public, member, and account pages", "Screen-reader structure: headings, labels, status and alert regions", "Contrast checked against WCAG 2.1 AA", "Reduced-motion and forced-colour compatibility", "Accessibility review is part of the release checklist for new surfaces"] },
      { heading: "Known limitations", paragraphs: ["Being direct about current gaps:"], bullets: ["Supplier-issued quality documents and certificates of analysis are published as received and may not be tagged for screen readers; the substance of a document can be provided in an alternative format on request.", "Identity verification, payment, and provider scheduling run on third-party platforms whose accessibility Xenios does not control. Accessibility is considered in vendor selection, but those surfaces cannot be certified here.", "Some data visualisations may lack complete text equivalents.", "A formal external audit against the target has not yet been performed."] },
      { heading: "Feedback and alternative access", paragraphs: ["If any part of the Research surfaces is difficult or impossible for you to use, email research@xeniostechnology.com with the page or document, what happened, and the assistive technology you use. Where reasonably possible the blocked content or function is provided in an alternative format, for example a document by accessible email or completing a step with human help over a supported channel. Accessibility feedback reaches the founder, who is the named accountable person for the program. Using an alternative format never costs extra and never reduces what you receive."] },
      { heading: "Status of this statement", paragraphs: ["Prepared 2026-07-19 and adapted to the Research surfaces in August 2026. It will be reviewed when major surfaces launch or change, and on a recurring cadence to be confirmed. It describes intent and current state; it does not waive rights that cannot be waived under applicable law and does not relieve Xenios of duties imposed by law."] },
    ],
  },
  terms: {
    title: "Terms of Service",
    updated: "July 2026",
    sections: [
      { heading: "Draft status", paragraphs: ["This starter language is an operational draft for qualified counsel to replace or approve before production launch."] },
      { heading: "Separate offerings", paragraphs: ["Research materials, supplements, programs, and any future clinical services are separate categories with separate terms, claims, payment, fulfillment, and responsibilities."] },
      { heading: "No medical advice", paragraphs: ["Site content is educational and commercial information. It is not diagnosis, prescribing, treatment, or a substitute for a licensed professional."] },
      { heading: "Accounts and orders", paragraphs: ["xenios may approve, restrict, suspend, or close accounts and may reject or cancel transactions as permitted by law and the applicable policy."] },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    updated: "July 2026",
    sections: [
      { heading: "Draft status", paragraphs: ["This starter privacy language must be aligned with the actual analytics, CRM, payment, fulfillment, support, hosting, and clinical vendors before launch."] },
      { heading: "Information collected", paragraphs: ["The site may collect account, order, contact, organization, destination, support, device, referral, and interaction information. Do not use the public research site to collect unnecessary medical information."] },
      { heading: "Sharing", paragraphs: ["Information may be shared with approved processors, fulfillment partners, service providers, compliance reviewers, insurers, counsel, regulators, or others when necessary and permitted."] },
      { heading: "Clinical separation", paragraphs: ["Any future clinical data must remain inside a separate physician-led and appropriately configured clinical system. Research storefront data does not become a clinical record."] },
    ],
  },
};

/**
 * Canonical bytes for the exact Research Use Policy carried by
 * `early_access_terms` / `v1`.
 *
 * The durable agreement table stores the pair rather than a document body.
 * Pinning that pair to the body digest makes an unversioned wording or date
 * edit fail closed: a deliberate policy revision must also mint a new version
 * and update the deployment requirement instead of silently inheriting every
 * v1 acceptance.
 */
export const RESEARCH_USE_POLICY_CONTENT_SHA256 =
  "98918e35e5a0f749790fb31cd406399818ced5d197cbed02679744ccf94ac325";

export function researchPolicyContentSha256(policy: unknown): string | null {
  if (typeof policy !== "object" || policy === null || Array.isArray(policy)) {
    return null;
  }
  const record = policy as Record<string, unknown>;
  if (
    typeof record.title !== "string" ||
    typeof record.updated !== "string" ||
    !Array.isArray(record.sections)
  ) {
    return null;
  }

  const sections: Array<{
    heading: string;
    paragraphs: string[];
    bullets: string[] | null;
  }> = [];
  for (const value of record.sections) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const section = value as Record<string, unknown>;
    if (
      typeof section.heading !== "string" ||
      !Array.isArray(section.paragraphs) ||
      !section.paragraphs.every((paragraph) => typeof paragraph === "string") ||
      (section.bullets !== undefined &&
        (!Array.isArray(section.bullets) ||
          !section.bullets.every((bullet) => typeof bullet === "string")))
    ) {
      return null;
    }
    sections.push({
      heading: section.heading,
      paragraphs: [...section.paragraphs] as string[],
      bullets: section.bullets === undefined ? null : [...section.bullets] as string[],
    });
  }

  const canonical = { title: record.title, updated: record.updated, sections };
  try {
    return createHash("sha256")
      .update(JSON.stringify(canonical), "utf8")
      .digest("hex");
  } catch {
    return null;
  }
}

const AGREEMENT_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

/**
 * Read the agreement identity from the policy object that the policies API
 * actually publishes. The acceptance route calls this at decision time, so a
 * missing, malformed, or replaced metadata object closes the write boundary
 * instead of letting deployment configuration name a different document.
 */
export function publishedResearchUsePolicyAgreement(): ResearchPolicyAgreementMetadata | null {
  const policy = policies["research-use"];
  const value = (policy as unknown as Record<string, unknown> | undefined)?.agreement;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 2 ||
    !Object.prototype.hasOwnProperty.call(record, "kind") ||
    !Object.prototype.hasOwnProperty.call(record, "version") ||
    typeof record.kind !== "string" ||
    typeof record.version !== "string" ||
    record.kind !== record.kind.trim() ||
    record.version !== record.version.trim() ||
    !AGREEMENT_IDENTIFIER.test(record.kind) ||
    !AGREEMENT_IDENTIFIER.test(record.version) ||
    record.kind !== RESEARCH_USE_POLICY_AGREEMENT.kind ||
    record.version !== RESEARCH_USE_POLICY_AGREEMENT.version ||
    policy === undefined ||
    researchPolicyContentSha256(policy) !== RESEARCH_USE_POLICY_CONTENT_SHA256
  ) {
    return null;
  }
  return Object.freeze({ kind: record.kind, version: record.version });
}
