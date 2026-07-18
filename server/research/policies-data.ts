export const policies: Record<string, { title: string; updated: string; sections: Array<{ heading: string; paragraphs: string[]; bullets?: string[] }> }> = {
  "research-use": {
    title: "Research Use Policy",
    updated: "July 2026",
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
