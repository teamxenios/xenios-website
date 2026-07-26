export const SUPPORT_CENTER_CATEGORIES = [
  "Account",
  "Membership",
  "Assessment",
  "Plans",
  "Products",
  "Product requests",
  "Orders",
  "Shipping",
  "Certificates",
  "Diagnostics",
  "Supplements",
  "Programs",
  "Clinician-guided pathway interest",
  "Affiliate",
  "Professional accounts",
  "Privacy",
  "Accessibility",
  "General",
] as const;

export const STORAGE_AND_ORGANIZATION_ACCESSORIES = [
  "Refrigerator thermometer",
  "Temperature logger",
  "Opaque organizer",
  "Lockable container",
  "Tamper-evident bag",
  "Labels",
  "Document organizer",
  "Inventory tray",
  "Insulated transport pouch",
  "Approved cool pack",
] as const;

export const STORAGE_ACCESSORY_BOUNDARY =
  "Storage and organization accessories support monitoring, privacy, transport, and recordkeeping. They are not human administration supplies and do not include administration instructions.";

export const RESEARCH_EDUCATION_TOPICS = [
  {
    topicId: "product-status",
    label: "Understanding product status",
    summary:
      "Learn what available, request access, documentation pending, under review, and unavailable mean.",
    href: "/research/education/product-status",
  },
  {
    topicId: "coa-scope",
    label: "How lot-specific COAs work",
    summary:
      "A certificate applies only to its exact verified lot. Missing or mismatched documents fail closed.",
    href: "/research/education/certificates",
  },
  {
    topicId: "research-boundary",
    label: "Research information boundary",
    summary:
      "Research documentation describes records and handling boundaries; it does not provide human-use instructions.",
    href: "/research/education/research-boundary",
  },
] as const;

export const STORAGE_SOURCE_CARDS = [
  {
    sourceId: "approved-product-record",
    label: "Approved product record",
    status: "Primary source",
    summary:
      "Product-specific storage text appears only when it is present in the approved product record.",
  },
  {
    sourceId: "lot-quality-document",
    label: "Exact-lot quality document",
    status: "Lot-scoped source",
    summary:
      "Lot-specific storage evidence applies only to the matching verified lot and document.",
  },
  {
    sourceId: "supplier-review",
    label: "Supplier review",
    status: "Pending until approved",
    summary:
      "Unverified supplier statements remain pending and are not presented as instructions.",
  },
] as const;

export const RESEARCH_EDUCATION_BOUNDARY =
  "Research education does not provide dosing, reconstitution, administration, treatment, diagnosis, or other human-use instructions.";

