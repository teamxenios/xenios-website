// Local-only visual fixture. Not imported by the app or a customer route.
// These invented QA records are not Seth prices or evidence of commerce readiness.
import "@vitejs/plugin-react/preamble";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { AdminProductDetail } from "../../../../shared/research/product-admin";
import { ProductPriceReviewPanel } from "../../../../client/src/research/pages/adminx/ProductPriceReviewPanel";
import "../../../../client/src/index.css";
import "../../../../client/src/fonts";

const timestamp = "2026-09-01T00:00:00.000Z";
const product: AdminProductDetail = {
  id: "qa-product-not-production", productCode: "QA-ONLY", slug: "qa-only",
  displayName: "Synthetic review specimen", canonicalName: "Synthetic QA specimen",
  aliases: [], lane: "research_material", category: "QA only", classification: "research_material",
  status: "draft", active: false, visibility: "hidden", availability: "out_of_stock",
  commerceApproval: "blocked_pending_written_approval", qualityDocumentState: "missing",
  variantCount: 1, approvedVariantCount: 0, missingInputCount: 4,
  updatedAt: timestamp, publishedAt: null,
  content: { shortDescription: null, longDescription: null, overview: null,
    specifications: null, researchInformation: null, storageInformation: null,
    handlingInformation: null, shippingInformation: null, returnInformation: null,
    disclaimers: null, citations: [], reviewDate: null },
  variants: [{ id: "qa-variant-not-production", productId: "qa-product-not-production",
    sku: "QA-LONG-SKU-IDENTITY-EXACT-TEST-ONLY-0123456789", catalogNumber: null,
    label: "Synthetic specimen — no inventory or supplier assertion", strength: null,
    size: null, format: null, presentation: null, shippingClass: null,
    memberEligible: false, status: "draft", active: false, sortOrder: 0,
    createdAt: timestamp, updatedAt: timestamp }],
  prices: [{ id: "qa-price-immutable-version-not-production", productId: "qa-product-not-production",
    variantId: "qa-variant-not-production", audience: "retail", amountCents: 10101,
    quantityTiers: [{ minimumQuantity: 1, amountCents: 10101 },
      { minimumQuantity: 5, amountCents: 9101 }, { minimumQuantity: 10, amountCents: 8101 }],
    currency: "USD", effectiveAt: timestamp, expiresAt: "2026-09-30T00:00:00.000Z",
    status: "draft", approvalNote: "Synthetic QA note only. This record does not approve a price, confirm a supplier, grant purchase rights, or authorize production changes.",
    version: 9, createdBy: "qa-fixture", approvedBy: null,
    createdAt: timestamp, updatedAt: timestamp }],
  media: [], history: [],
};

function Fixture() {
  const [scenario, setScenario] = useState("tiers");
  const record = structuredClone(product);
  if (scenario === "empty") record.prices = [];
  if (scenario === "malformed") record.prices[0].quantityTiers = [
    { minimumQuantity: 1, amountCents: 10101 }, { minimumQuantity: 5, amountCents: 11101 },
  ];
  if (scenario === "unknown-variant") record.prices[0].variantId = "unbound-qa-variant";
  if (scenario === "legacy") delete record.prices[0].quantityTiers;
  return <main className="research-app ra-admin container-x" style={{ paddingTop: 24, paddingBottom: 48 }}>
    <h1 className="body-l font-700">Synthetic price review QA</h1>
    <p className="body-s my-4">Local presentation fixture only. No sign-in, API calls, mutations, real source data or production claims.</p>
    <label className="form-label" htmlFor="qa-scenario">QA scenario</label>
    <select id="qa-scenario" className="input-field mb-6" value={scenario} onChange={event => setScenario(event.target.value)}>
      <option value="tiers">Valid canonical tiers</option>
      <option value="malformed">Malformed tier ladder</option>
      <option value="empty">Empty price history</option>
      <option value="unknown-variant">Unbound variant</option>
      <option value="legacy">Legacy scalar version</option>
    </select>
    <ProductPriceReviewPanel product={record} />
  </main>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
