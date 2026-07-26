import { Website3ValidationError } from "./errors";

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

type SupplementChannelConfig = {
  configured: boolean;
  partnerReference: string | null;
  publicUrl: string | null;
};

export interface SupplementPlaceholderConfig {
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
  channelMetadata: Record<FutureSupplementChannel, SupplementChannelConfig>;
  launchInterestHref: string;
  adminEditable: true;
  updatedAt: string;
  updatedBy: string | null;
}

export interface SupplementPlaceholder
  extends Omit<SupplementPlaceholderConfig, "channelMetadata" | "updatedBy"> {
  channelMetadata: Record<FutureSupplementChannel, { configured: boolean }>;
}

export const SUPPLEMENT_CHANNELS: readonly FutureSupplementChannel[] = [
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

function channelMetadata(): SupplementPlaceholderConfig["channelMetadata"] {
  return Object.fromEntries(
    SUPPLEMENT_CHANNELS.map((channel) => [
      channel,
      { configured: false, partnerReference: null, publicUrl: null },
    ]),
  ) as SupplementPlaceholderConfig["channelMetadata"];
}

export const DEFAULT_SUPPLEMENT_PLACEHOLDERS: readonly SupplementPlaceholderConfig[] =
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
    launchInterestHref: "/research/member/product-requests/new?source=supplements",
    adminEditable: true,
    updatedAt: "2026-07-25T00:00:00.000Z",
    updatedBy: null,
  }));

export function toPublicSupplementPlaceholder(
  config: SupplementPlaceholderConfig,
): SupplementPlaceholder {
  const {
    channelMetadata: privateChannels,
    updatedBy: _updatedBy,
    ...publicConfig
  } = structuredClone(config);
  void _updatedBy;
  return {
    ...publicConfig,
    channelMetadata: Object.fromEntries(
      SUPPLEMENT_CHANNELS.map((channel) => [
        channel,
        { configured: privateChannels[channel].configured },
      ]),
    ) as SupplementPlaceholder["channelMetadata"],
  };
}

export const SUPPLEMENT_PLACEHOLDERS: readonly SupplementPlaceholder[] =
  DEFAULT_SUPPLEMENT_PLACEHOLDERS.map(toPublicSupplementPlaceholder);

export class SupplementPlaceholderRepository {
  private rows: SupplementPlaceholderConfig[];

  constructor(
    private readonly persist: (
      row: SupplementPlaceholderConfig,
    ) => Promise<void> = async () => undefined,
    initialRows: readonly SupplementPlaceholderConfig[] =
      DEFAULT_SUPPLEMENT_PLACEHOLDERS,
  ) {
    this.rows = initialRows.map((row) => structuredClone(row));
  }

  listPublic(): SupplementPlaceholder[] {
    return this.rows.map(toPublicSupplementPlaceholder);
  }

  listAdmin(): SupplementPlaceholderConfig[] {
    return structuredClone(this.rows);
  }

  async update(
    category: SupplementPlaceholderCategory,
    patch: Partial<
      Pick<
        SupplementPlaceholderConfig,
        "label" | "description" | "channelMetadata" | "launchInterestHref"
      >
    >,
    actor: string,
    at: string,
  ): Promise<SupplementPlaceholderConfig> {
    const index = this.rows.findIndex((row) => row.category === category);
    if (index < 0) throw new Website3ValidationError("Unknown supplement placeholder category.");
    if (patch.label !== undefined && !patch.label.trim()) {
      throw new Website3ValidationError("Supplement placeholder label is required.");
    }
    if (patch.description !== undefined && !patch.description.trim()) {
      throw new Website3ValidationError("Supplement placeholder description is required.");
    }
    if (
      patch.launchInterestHref !== undefined &&
      !patch.launchInterestHref.startsWith("/research/")
    ) {
      throw new Website3ValidationError(
        "Supplement launch-interest links must stay inside the Research member area.",
      );
    }
    if (patch.channelMetadata) {
      for (const channel of SUPPLEMENT_CHANNELS) {
        const config = patch.channelMetadata[channel];
        if (!config) {
          throw new Website3ValidationError(`Missing ${channel} channel configuration.`);
        }
        if (config.configured && !config.partnerReference?.trim()) {
          throw new Website3ValidationError(
            `Configured ${channel} metadata requires a partner reference.`,
          );
        }
        if (config.publicUrl && !config.publicUrl.startsWith("https://")) {
          throw new Website3ValidationError(`${channel} public URL must use HTTPS.`);
        }
      }
    }
    const next: SupplementPlaceholderConfig = {
      ...this.rows[index],
      ...structuredClone(patch),
      placeholderId: this.rows[index].placeholderId,
      category,
      status: "coming_soon",
      priceCents: null,
      brand: null,
      stockState: null,
      servingInstructions: null,
      claims: [],
      adminEditable: true,
      updatedAt: at,
      updatedBy: actor,
    };
    await this.persist(structuredClone(next));
    this.rows[index] = next;
    return structuredClone(next);
  }
}
