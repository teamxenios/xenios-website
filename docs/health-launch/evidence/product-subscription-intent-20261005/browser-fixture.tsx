import React from "react";
import { createRoot } from "react-dom/client";
import { ProductSubscriptionCreate } from "../../../../client/src/research/product-subscriptions/ProductSubscriptionCreate";
import { ResearchContext, type ResearchContextValue } from "../../../../client/src/research/core";
import ProductPage from "../../../../client/src/research/pages/member/ProductPage";
import { Route } from "wouter";

const mode = new URL(location.href).searchParams.get("mode") ?? "pending";
createRoot(document.getElementById("root")!).render(<>
  <h1>Synthetic subscription boundary</h1>
  <p>This isolated local fixture uses the actual request form, adapter and canonical subscription service with in-memory synthetic data. It is not a real offer or a complete referral journey.</p>
  <p>Scenario: {mode}. No real account, database, payment, email or payout service is connected.</p>
  {mode === "mounted" ? <ResearchContext.Provider value={{ gate: "open", memberToken: "synthetic-browser-customer",
    member: { firstName: "Synthetic", status: "active", applicationStatus: null }, memberChecking: false, recovery: "none" } as ResearchContextValue}>
    <Route path="/research/member/products/:slug" component={ProductPage} />
  </ResearchContext.Provider> : <ProductSubscriptionCreate memberToken="synthetic-browser-customer" commerceEnabled={true}
    product={mode === "no-offer" ? null : {
      sku: "SYNTHETIC-RUO-01", displayName: "Synthetic research product", variantLabel: "Synthetic exact variant",
      subscriptionEligible: true, purchasable: true, priceCents: 1250, currency: "USD", priceVersion: "synthetic-price-v1",
    }} />}
</>);
