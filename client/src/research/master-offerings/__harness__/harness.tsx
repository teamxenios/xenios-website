// Dev-only harness. Not routed, not imported by the app, not built (vite only
// builds client/index.html). It exists so the catalog can be looked at in a
// real browser at a real width, with the real stylesheet, without a member
// session or a running API. Delete it freely.
import { createRoot } from "react-dom/client";
import {
  DEFAULT_MASTER_OFFERING_SORT,
  EMPTY_MASTER_OFFERING_FACETS,
} from "@shared/research/master-offerings/contract";
import type {
  MasterOfferingCardView,
  MasterOfferingCatalogListResponse,
  MasterOfferingCatalogQuery,
  MasterOfferingDetailView,
} from "@shared/research/master-offerings/contract";
import type { ApiResult } from "../../lib/api";
import "../../../index.css";
import { MasterOfferingCatalogSurface } from "../MasterOfferingCatalogSurface";
import { MasterOfferingDetail } from "../MasterOfferingDetail";

const LONG_NAME =
  "BPC157TB500ExtendedReleaseCompoundedResearchBlendMultiDoseVialListing";
const LONG_VARIANT =
  "10mg2mLmultidosepreservativefreelyophilisedvialconfigurationBatchQ4";

function priced(cents: number) {
  return {
    state: "priced" as const,
    amountCents: cents,
    currency: "USD",
    display: `$${(cents / 100).toFixed(2)}`,
    priceId: `price_${cents}`,
    priceVersion: 1,
    effectiveAt: "2026-08-01T00:00:00.000Z",
    expiresAt: null,
  };
}

function card(index: number, overrides: Partial<MasterOfferingCardView> = {}) {
  return {
    id: `mo_${index}`,
    slug: `research-vials-bpc-157-${index}`,
    displayName: `BPC-157 ${index}`,
    canonicalName: `BPC-157 ${index}`,
    family: "research_vials",
    familyLabel: "Research Vials",
    category: "Peptides & Research",
    subcategory: "Single peptide",
    brand: null,
    displayState: "available_now",
    displayLabel: "Available Now",
    stateExplanation: "Available now, and shipped from the Austin facility.",
    copyState: "approved",
    variantCount: 2,
    variants: [
      {
        id: `mov_${index}_a`,
        label: "5 mg vial",
        displayState: "available_now",
        displayLabel: "Available Now",
        price: priced(9900),
      },
      {
        id: `mov_${index}_b`,
        label: LONG_VARIANT,
        displayState: "available_now",
        displayLabel: "Available Now",
        price: priced(18900),
      },
    ],
    priceSummary: {
      state: "range",
      variantCount: 2,
      pricedVariantCount: 2,
      currency: "USD",
      fromCents: 9900,
      toCents: 18900,
      display: "$99.00 to $189.00",
    },
    ...overrides,
  } as MasterOfferingCardView;
}

const PRODUCTS: MasterOfferingCardView[] = [
  card(1, { displayName: LONG_NAME, canonicalName: LONG_NAME }),
  card(2),
  card(3),
  card(4),
  card(5),
  card(6),
];

async function fetchCatalog(
  _token: string | null,
  query: MasterOfferingCatalogQuery = {},
): Promise<ApiResult<MasterOfferingCatalogListResponse>> {
  const pageSize = query.pageSize ?? 3;
  const page = query.page ?? 1;
  const matched = query.q
    ? PRODUCTS.filter((product) =>
        product.displayName.toLowerCase().includes(query.q!.toLowerCase()),
      )
    : PRODUCTS;
  const start = (page - 1) * pageSize;
  return {
    kind: "ok",
    data: {
      ok: true,
      audience: "member",
      launchScope: "founder_admin",
      catalog: {
        ok: true,
        page,
        pageSize,
        total: matched.length,
        totalPages: Math.max(1, Math.ceil(matched.length / pageSize)),
        // The sort lane made both of these required on the page contract after
        // this harness was written. Echoing the default and empty facets keeps
        // the harness honest: it is a fixture server, not a facet engine.
        sort: DEFAULT_MASTER_OFFERING_SORT,
        facets: EMPTY_MASTER_OFFERING_FACETS,
        products: matched.slice(start, start + pageSize),
      },
    },
  };
}

const DETAIL: MasterOfferingDetailView = {
  id: "mo_1",
  slug: "research-vials-bpc-157-1",
  displayName: LONG_NAME,
  canonicalName: LONG_NAME,
  family: "research_vials",
  familyLabel: "Research Vials",
  category: "Peptides & Research",
  subcategory: "Single peptide",
  brand: null,
  displayState: "available_now",
  displayLabel: "Available Now",
  stateExplanation: "Available now, and shipped from the Austin facility.",
  copyState: "approved",
  variantCount: 2,
  priceSummary: {
    state: "range",
    variantCount: 2,
    pricedVariantCount: 2,
    currency: "USD",
    fromCents: 9900,
    toCents: 18900,
    display: "$99.00 to $189.00",
  },
  overview:
    "A research vial listing. Everything consequential on this page is decided by the server, including the action and the price.",
  disclosures: [
    "This listing is for research use and is not a medical recommendation.",
    "Availability and price are the approved values at the time this page loaded.",
  ],
  variants: [
    {
      id: "mov_1_a",
      label: "5 mg vial",
      displayState: "available_now",
      displayLabel: "Available Now",
      price: priced(9900),
      action: {
        kind: "request_access",
        label: "Request Access",
        href: "/research/member/product-requests/new",
      },
    },
    {
      id: "mov_1_b",
      label: LONG_VARIANT,
      displayState: "available_now",
      displayLabel: "Available Now",
      price: priced(18900),
      action: {
        kind: "request_access",
        label: "Request Access",
        href: "/research/member/product-requests/new",
      },
    },
  ],
} as MasterOfferingDetailView;

const root = createRoot(document.getElementById("root")!);
root.render(
  window.location.hash === "#detail" ? (
    <div className="research-app" style={{ padding: 16 }}>
      <MasterOfferingDetail product={DETAIL} />
    </div>
  ) : (
    <div className="research-app" style={{ padding: 16 }}>
      <MasterOfferingCatalogSurface
        memberToken="harness-token"
        fetchCatalog={fetchCatalog}
      />
    </div>
  ),
);
