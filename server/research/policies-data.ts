import { createHash } from "node:crypto";

export type ResearchPolicyAgreementMetadata = Readonly<{
  kind: string;
  version: string;
}>;

export type ResearchPublishedPolicy = Readonly<{
  title: string;
  updated: string;
  sections: Array<{ heading: string; paragraphs: string[]; bullets?: string[] }>;
  /**
   * The agreement identity this exact document carries. Only the identity
   * `publishedEarlyAccessAgreement()` returns can be accepted now. An older
   * identity stays on its own unchanged document, so every acceptance already
   * on file keeps meaning the words that customer was shown.
   */
  agreement?: ResearchPolicyAgreementMetadata;
}>;

/**
 * The historical identity. Acceptances on file as `early_access_terms` / `v1`
 * were given to the Research Use Policy below, which stays published
 * unchanged. This identity is never accepted again.
 */
export const RESEARCH_USE_POLICY_AGREEMENT = Object.freeze({
  kind: "early_access_terms",
  version: "v1",
}) satisfies ResearchPolicyAgreementMetadata;

/** The document a customer accepts before an Early Access request. */
export const EARLY_ACCESS_PRODUCT_POLICY_SLUG = "early-access-product-policy";

export const EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT = Object.freeze({
  kind: "early_access_terms",
  version: "v2",
}) satisfies ResearchPolicyAgreementMetadata;

export const policies: Record<string, ResearchPublishedPolicy> = {
  "early-access-product-policy": {
    title: "Early Access Product Policy",
    updated: "November 2026",
    agreement: EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT,
    sections: [
      {
        heading: "About Early Access",
        paragraphs: [
          "Early Access brings the products and services listed by Xenios into one place to review and request. The catalog includes different types of offerings, and the conditions for one type do not automatically apply to another. Review the description, specifications and conditions shown for the exact product you select.",
        ],
      },
      {
        heading: "Requests, review and availability",
        paragraphs: [
          "Submitting a request does not by itself confirm an order, approve a treatment, issue a prescription, reserve stock or authorize a charge. A displayed catalog amount may be a reference amount rather than a final quote, as indicated on the product page. Any required review and confirmation must be completed before the request can proceed under the applicable product terms.",
        ],
      },
      {
        heading: "Clinical products",
        paragraphs: [
          "Clinical products remain subject to the individual review, prescribing and fulfillment requirements that apply to the selected item. A catalog listing does not establish that a product is appropriate for you or that it can be supplied in your location. Product information explains the documented formulation and its supported context; it is not a diagnosis, prescription or individualized treatment plan. Controlled substances are prescribed and dispensed only under the federal and state requirements that apply to them.",
          "Where the selected product's details identify it as a compounded drug, it is not FDA-approved. The FDA does not verify the safety, effectiveness or quality of compounded drugs before they are marketed, and sharing an ingredient with an FDA-approved drug does not make a compounded drug equivalent to it.",
        ],
      },
      {
        heading: "Supplements",
        paragraphs: [
          "Supplement descriptions explain the selected product's ingredients, form and supported nutritional or other functions. Review the exact label, ingredient amounts, serving information, allergens and cautions for the package being offered. Supplement information does not replace individualized medical advice or establish that a supplement treats a disease. Manufacturer label directions, when shown, apply to that specific product and revision.",
        ],
      },
      {
        heading: "Research-only products",
        paragraphs: [
          "Products identified as research-only are offered solely for legitimate nonclinical research, laboratory, analytical or product-development purposes. They are not offered for human or veterinary use. They must not be ingested, injected, administered, prescribed, dispensed, recommended or distributed for human or veterinary use, including personal use, use with clients or patients, resale for human use, or use as a medicine, supplement, food, cosmetic or treatment. These conditions apply to every research-only item and form, including vials, capsules and research supplies; a capsule form does not make a research product suitable for ingestion.",
          "Scientific background may describe laboratory or preclinical findings for the compound, which may have been studied in a different form, amount or preparation from the listed product. Those findings do not establish a human benefit for the listed product. Where a compound is also the active ingredient of an approved medicine, the research listing is not that medicine and must not be used in its place.",
          "For research-only products, a listed amount or strength is the amount the catalog states for that vial, capsule or package; it is not a statement of purity, net content or salt form unless the product page says so.",
          "Xenios may ask for identity, organization, website, intended-use, destination and resale information before a research request proceeds, and may delay, decline or cancel a request whose circumstances are inconsistent with these conditions.",
          "Research-product support may address documented specifications, product documents where one exists for the selected item, stated storage requirements and request status. Published studies cited in a product description are background on the compound, not documents for the listed product. Support does not provide dosing or protocol support, instructions for personal use, administration or treatment, or medical advice.",
        ],
      },
      {
        heading: "Topicals, supplies and services",
        paragraphs: [
          "The description and conditions for the exact selected item determine its category and intended context. A topical product must not be treated as a clinical medicine, cosmetic or research material merely because it is applied to a surface. Supplies and kits are described by their documented contents, specifications and intended use. Shipping and other services are described as services and do not carry a physical-product quantity or clinical purpose unless that is explicitly applicable.",
        ],
      },
      {
        heading: "Product details and artwork",
        paragraphs: [
          "Check the exact product name, formulation or material, strength or concentration, form, package and stated selling unit before submitting a request. An amount per vial or a historical supplier package is not automatically the quantity included in a current customer order. A product image may be a design illustration of Xenios packaging rather than a photograph of the supplied item, and current physical packaging may differ. A picture or general compound description does not override the exact specifications and conditions of the selected product.",
        ],
      },
      {
        heading: "Shipping, returns and replacements",
        paragraphs: [
          "The applicable shipping and return or replacement terms must be reviewed for the exact item and request. Product-specific handling or destination conditions may apply. Consult the Shipping Policy and the Returns and Replacements policy for the current process; this document does not create a new delivery guarantee, return period or remedy.",
        ],
      },
      {
        heading: "Information and support",
        paragraphs: [
          "Provide only the information needed for the request through the designated form. Clinical information, where required for an available clinical service, belongs in the designated clinical process. Review the Privacy Policy for the information the service collects and how it is handled. Use the listed support contact if the product information, policy or request status is unclear.",
        ],
      },
    ],
  },
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
    updated: "November 5, 2026",
    sections: [
      { heading: "Separate processing and carrier transit", paragraphs: ["Product review, any required clinical process, payment verification, preparation and carrier transit are separate. Shipping service names describe a carrier option, not a promise that an unreviewed request will ship immediately."] },
      { heading: "Order-specific confirmation", paragraphs: ["The confirmed transaction should identify the product, destination, available shipping method and charges. Dispatch timing depends on the actual fulfillment stage and any item-specific requirements. No supplier is designated by this policy; the actual authorized fulfillment arrangement governs the order."] },
      { heading: "Tracking and delivery", paragraphs: ["Tracking, when provided, reflects the carrier or fulfillment record for that shipment. Carrier estimates may change. Contact the support route shown on the transaction about a missing or inconsistent update; do not infer shipment solely from a request receipt."] },
      { heading: "Temperature-sensitive or restricted items", paragraphs: ["Follow the handling information supplied for the actual product. Temperature requirements, delivery restrictions or special packaging must come from the product and fulfillment specification, not from a generic catalog statement."] },
      { heading: "Delivery problems", paragraphs: ["Report a damaged, incorrect or apparently compromised package through the transaction’s support channel. Retain relevant packaging and identification for review. Do not use a product that appears unsafe, and obtain clinical advice where a medicine or health concern is involved."] },
    ],
  },
  returns: {
    title: "Returns and Replacements",
    updated: "November 5, 2026",
    sections: [
      { heading: "Before fulfillment", paragraphs: ["Request changes or cancellation through the support channel shown on your transaction. Whether a change is possible depends on the stage already reached, including clinical assessment, patient-specific preparation and dispatch. No automatic cancellation or refund is promised by a request alone."] },
      { heading: "After shipment", paragraphs: ["Return conditions depend on the product, legal requirements and the applicable transaction terms. Prescription, patient-specific, sterile, temperature-sensitive and research products may have restrictions. Do not send back a medicine or restricted material without instructions."] },
      { heading: "Damage, incorrect items and quality concerns", paragraphs: ["Provide the reference number, exact item, observed problem and relevant photographs when appropriate. Include available lot information without sending unnecessary personal or medical data. Retain the product and packaging unless instructed otherwise."] },
      { heading: "Remedies", paragraphs: ["After review, an applicable remedy may include correction, replacement, refund, credit or investigation. The appropriate remedy depends on the facts and terms governing the transaction. This policy does not reduce rights or remedies that cannot lawfully be excluded."] },
      { heading: "Clinical services are separate", paragraphs: ["Fees for a consultation or other clinical service, where offered, follow that service’s separately disclosed terms. Declining a product request does not by itself establish the refund rules for a completed independent service."] },
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
 * Pinning each pair to its body digest makes an unversioned wording or date
 * edit fail closed: a deliberate policy revision must also mint a new version
 * and update the deployment requirement instead of silently inheriting every
 * earlier acceptance. This v1 pin now guards the historical document, which
 * must keep these exact bytes for the acceptances already on file.
 */
export const RESEARCH_USE_POLICY_CONTENT_SHA256 =
  "98918e35e5a0f749790fb31cd406399818ced5d197cbed02679744ccf94ac325";

/**
 * Canonical bytes for the reviewed Early Access Product Policy carried by
 * `early_access_terms` / `v2`. Any edit to its title, date or text must mint a
 * new version rather than change this pin.
 */
export const EARLY_ACCESS_PRODUCT_POLICY_CONTENT_SHA256 =
  "491d2559f05f6201ee0279bbd0fb711ebc7eeb1fd0a826c8d9141373c146fa06";

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
 *
 * Only the Early Access Product Policy can answer. The historical Research Use
 * Policy still carries `v1`, but nothing reads it here, so a stale v1
 * acceptance can never satisfy, or be recorded against, the current pair.
 */
export function publishedEarlyAccessAgreement(): ResearchPolicyAgreementMetadata | null {
  const policy = policies[EARLY_ACCESS_PRODUCT_POLICY_SLUG];
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
    record.kind !== EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT.kind ||
    record.version !== EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT.version ||
    policy === undefined ||
    researchPolicyContentSha256(policy) !== EARLY_ACCESS_PRODUCT_POLICY_CONTENT_SHA256
  ) {
    return null;
  }
  return Object.freeze({ kind: record.kind, version: record.version });
}
