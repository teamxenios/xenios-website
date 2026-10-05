import React from "react";
import { createRoot } from "react-dom/client";
import { ProductSubscriptionCreate } from "../../../../client/src/research/product-subscriptions/ProductSubscriptionCreate";

const mode = new URL(location.href).searchParams.get("mode") ?? "pending";
createRoot(document.getElementById("root")!).render(<>
  <h1>Synthetic subscription boundary</h1>
  <p>This isolated local fixture uses the actual request form, adapter and canonical subscription service with in-memory synthetic data. It is not a real offer or a complete referral journey.</p>
  <p>Scenario: {mode}. No real account, database, payment, email or payout service is connected.</p>
  <ProductSubscriptionCreate memberToken="synthetic-browser-customer" commerceEnabled={true}
    product={mode === "no-offer" ? null : {
      sku: "SYNTHETIC-RUO-01", displayName: "Synthetic research product", variantLabel: "Synthetic exact variant",
      subscriptionEligible: true, purchasable: true, priceCents: 1250, currency: "USD", priceVersion: "synthetic-price-v1",
    }} />
</>);
