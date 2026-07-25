export const SUPPLEMENT_PLACEHOLDER_CATEGORIES = [
  "foundational",
  "performance",
  "longevity",
  "specialty",
] as const;

export type SupplementPlaceholderCategory =
  (typeof SUPPLEMENT_PLACEHOLDER_CATEGORIES)[number];

export type FutureSupplementChannel =
  | "affiliate"
  | "wholesale"
  | "professional_dispensary"
  | "partner_fulfilled"
  | "private_label";

export interface SupplementPlaceholder {
  placeholderId: string;
  category: SupplementPlaceholderCategory;
  label: string;
  status: "coming_soon";
  description: string;
  priceCents: null;
  brand: null;
  stockState: null;
  servingInstructions: null;
  claims: never[];
  channelMetadata: Record<
    FutureSupplementChannel,
    { configured: boolean; partnerReference: null; publicUrl: null }
  >;
  adminEditable: true;
}

const CHANNELS: readonly FutureSupplementChannel[] = [
  "affiliate",
  "wholesale",
  "professional_dispensary",
  "partner_fulfilled",
  "private_label",
];

const descriptions: Record<SupplementPlaceholderCategory, string> = {
  foundational:
    "Foundational supplement candidates are being reviewed for formula clarity, sourcing, documentation, and channel approval.",
  performance:
    "Performance supplement candidates will publish only after product, quality, claims, and commercial review.",
  longevity:
    "Longevity supplement candidates remain in content and product review; no benefit claim or serving guidance is published.",
  specialty:
    "Specialty supplement candidates require category-specific documentation and professional-channel review before launch.",
};

function channelMetadata(): SupplementPlaceholder["channelMetadata"] {
  return Object.fromEntries(
    CHANNELS.map((channel) => [
      channel,
      { configured: false, partnerReference: null, publicUrl: null },
    ]),
  ) as SupplementPlaceholder["channelMetadata"];
}

export const SUPPLEMENT_PLACEHOLDERS: readonly SupplementPlaceholder[] =
  SUPPLEMENT_PLACEHOLDER_CATEGORIES.map((category) => ({
    placeholderId: `supplement_placeholder_${category}`,
    category,
    label: `${category.charAt(0).toUpperCase()}${category.slice(1)} supplements`,
    status: "coming_soon",
    description: descriptions[category],
    priceCents: null,
    brand: null,
    stockState: null,
    servingInstructions: null,
    claims: [] as never[],
    channelMetadata: channelMetadata(),
    adminEditable: true,
  }));

