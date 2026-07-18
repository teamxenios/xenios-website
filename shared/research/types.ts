// xenios research: shared types (types ONLY; no product data may live in files
// the client imports, so the catalog itself stays server-side behind the gate).

export type CommerceLane = "research" | "consumer";
export type ProductCategory = "peptides" | "supplements" | "programs" | "quantum";
export type ProductStatus = "live" | "professional-only" | "request-access" | "coming-soon" | "hold";

export type Product = {
  slug: string;
  name: string;
  shortName?: string;
  category: ProductCategory;
  lane: CommerceLane;
  status: ProductStatus;
  priceCents: number | null;
  compareAtCents?: number | null;
  size?: string;
  eyebrow: string;
  summary: string;
  description: string[];
  highlights: string[];
  tags: string[];
  specifications?: Record<string, string>;
  researchContext?: string[];
  qualityNotes?: string[];
  sourceUrl?: string;
  featured?: boolean;
  badge?: string;
  sortOrder?: number;
};

export type CartItem = {
  slug: string;
  quantity: number;
};

export type CommerceFlags = {
  research: boolean;
  consumer: boolean;
};

export type PolicySection = { heading: string; paragraphs: string[]; bullets?: string[] };
export type Policy = { title: string; updated: string; sections: PolicySection[] };

// GET /api/research/catalog (gated)
export type CatalogResponse = {
  products: Product[];
  commerce: CommerceFlags;
  email: string;
};

// GET /api/research/me (open; reports gate state only)
export type AccessState = {
  configured: boolean;
  authed: boolean;
};
