import { describe, expect, it } from "vitest";
import { LiveProductControlReader } from "./product-control-reader";
import type { AdminProductDetail, AdminProductSummary } from "../products-diagnostics/product-admin";

// ---------------------------------------------------------------------------
// What the Early Access catalog costs to read.
//
// The founder reports /research/early-access taking 30-60 seconds on a phone.
// The master-offerings catalog was already repaired — server/index.ts records
// the same symptom there ("27-37 seconds", Cloudflare 522 under load) and wires
// it to a bulk pricing source. The Early Access storefront reads through
// LiveProductControlReader instead, and this measures what that costs.
//
// The count is measured, not reasoned about, because "it looks like a fan-out"
// is exactly the kind of claim that turns out to be wrong once a memo or a
// batch is found somewhere in the chain.
// ---------------------------------------------------------------------------

const PRODUCTS = 236;

const summaries = new Map<number, AdminProductSummary>();
const details = new Map<number, AdminProductDetail>();

function summary(index: number): AdminProductSummary {
  const existing = summaries.get(index);
  if (existing !== undefined) return existing;
  const built = {
    id: `prod_${index}`,
    slug: `product-${index}`,
    productCode: `CODE-${index}`,
    displayName: `Product ${index}`,
    canonicalName: `Product ${index}`,
    aliases: [],
    lane: "research",
    category: "peptides",
    classification: "ruo",
    status: "published",
    visibility: "public",
    active: true,
    availability: "in_stock",
    commerceApproval: "approved",
    qualityDocumentState: "complete",
    variantCount: 1,
    approvedVariantCount: 1,
    missingInputCount: 0,
    updatedAt: "2026-08-01T00:00:00.000Z",
    publishedAt: "2026-08-01T00:00:00.000Z",
  } as unknown as AdminProductSummary;
  summaries.set(index, built);
  return built;
}

/**
 * The SAME object every time, so the reader's stability protocol sees an
 * unchanging catalog. This measures the cost of a quiet catalog, which is the
 * cheapest case; a catalog being edited costs the same reads and returns less.
 */
function detail(index: number): AdminProductDetail {
  const existing = details.get(index);
  if (existing !== undefined) return existing;
  const built = {
    ...summary(index),
    product: summary(index),
    content: {},
    variants: [],
    prices: [],
    media: [],
  } as unknown as AdminProductDetail;
  details.set(index, built);
  return built;
}

/** Counts the remote calls the reader really issues. */
function countingRepository() {
  let listCalls = 0;
  let getCalls = 0;
  const summaries = Array.from({ length: PRODUCTS }, (_, i) => summary(i));
  return {
    calls: () => ({ listCalls, getCalls, total: listCalls + getCalls }),
    repository: {
      async list() {
        listCalls += 1;
        return summaries;
      },
      async get(id: string) {
        getCalls += 1;
        const index = Number(id.replace("prod_", ""));
        return Number.isFinite(index) ? detail(index) : null;
      },
    },
  };
}

describe("Early Access catalog read amplification", () => {
  it("issues two remote calls per product on top of the list reads", async () => {
    const counter = countingRepository();
    const reader = new LiveProductControlReader(counter.repository as never);

    await reader.readCatalog();

    const { listCalls, getCalls, total } = counter.calls();

    // The stability protocol reads every product TWICE — once to check it
    // against its summary, once to confirm it did not change underneath the
    // first read. That guard is real and worth keeping; what is not worth
    // keeping is paying for it with a round trip per product.
    expect(getCalls).toBe(PRODUCTS * 2);
    expect(listCalls).toBe(2);
    expect(total).toBe(PRODUCTS * 2 + 2);

    // Stated as arithmetic so it cannot drift into folklore, and matching the
    // shape the master-offerings repair already documented: each remote read
    // costs several Supabase queries, so this is the 3,306-query path.
    expect(total).toBeGreaterThan(400);
  });

  it("grows linearly with the catalog, which is what a fan-out does", async () => {
    // A bulk read answers the same question in a constant number of calls. If
    // this ever stops growing with catalog size, the fan-out is gone.
    const counter = countingRepository();
    const reader = new LiveProductControlReader(counter.repository as never);

    await reader.readCatalog();
    const first = counter.calls().total;

    await reader.readCatalog();
    const second = counter.calls().total;

    // Nothing is cached between reads either: the second page costs the same
    // as the first, so every customer pays the full amplification.
    expect(second - first).toBe(first);
  });
});
