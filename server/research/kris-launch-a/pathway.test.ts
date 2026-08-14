// The pathway view, proven over every row of the real artifact.
//
// Three properties carry the safety story:
//   1. A pathway exists exactly when the row is not direct_eligible, so the
//      view can never disagree with the purchase mode.
//   2. A row carrying a pathway never carries an order entry, so the pathway
//      cannot ride beside an open purchase door.
//   3. No pathway text leaks a private operational fact, because the texts are
//      composed only from policy strings and the two member-safe identity
//      fields already shown on the same view.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { KrisChannel, KrisPriceView } from "@shared/research/kris-launch-a/contract";
import { krisPathwayView } from "./pathway";
import { krisPurchaseMode } from "./purchase-mode";
import { projectKrisItem } from "./projection";
import type { KrisProductRecord } from "./dataset-reader";

const ARTIFACT = path.resolve(
  process.cwd(),
  "server/research/kris-launch-a/data/kris-launch-a-catalog.generated.json",
);

type Artifact = {
  products: Array<KrisProductRecord>;
  priceOverlays: Record<
    string,
    Record<string, { state: string; amountCents?: number; currency?: string; display?: string; basis?: string }>
  >;
};

function rows() {
  const data = JSON.parse(fs.readFileSync(ARTIFACT, "utf8")) as Artifact;
  const overlay = data.priceOverlays.KRIS_VOLUME_PARTNER;
  return data.products.map((product) => {
    const entry = overlay[product.id];
    const price: KrisPriceView =
      entry?.state === "priced"
        ? {
            state: "priced",
            amountCents: entry.amountCents as number,
            currency: entry.currency as string,
            display: entry.display as string,
            basis: entry.basis as string,
          }
        : { state: "pending", display: "Price pending" };
    return { product, price, mode: krisPurchaseMode({ channel: product.channel, price }) };
  });
}

const PRIVATE_TERMS =
  /supplier|buy cost|gross profit|gross margin|sourcing|internal note|selected supplier/i;

describe("the pathway view over every artifact row", () => {
  it("exists exactly when the row is not direct_eligible", () => {
    for (const { product, mode } of rows()) {
      const pathway = krisPathwayView(mode, product.channel, product);
      if (mode === "direct_eligible") {
        expect(pathway, product.displayName).toBeNull();
      } else {
        expect(pathway?.kind, product.displayName).toBe(mode);
      }
    }
  });

  it("covers the full matrix: 143 null, 243 provider, 32 classification, 2 price", () => {
    const counts: Record<string, number> = {};
    for (const { product, mode } of rows()) {
      const pathway = krisPathwayView(mode, product.channel, product);
      const key = pathway === null ? "null" : pathway.kind;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    expect(counts).toEqual({
      null: 143,
      provider_workflow: 243,
      classification_pending: 32,
      price_pending: 2,
    });
  });

  it("never leaks a private operational term in any pathway text", () => {
    for (const { product, mode } of rows()) {
      const pathway = krisPathwayView(mode, product.channel, product);
      if (pathway === null) continue;
      const texts = [
        pathway.headline,
        pathway.explanation,
        pathway.request.label,
        pathway.request.subject,
      ];
      for (const text of texts) {
        expect(PRIVATE_TERMS.test(text), `${product.displayName}: ${text}`).toBe(false);
      }
    }
  });

  it("prefills the request subject from the member-safe identity only", () => {
    const sample = { displayName: "BAM15", specification: "500 mcg" };
    const pathway = krisPathwayView("price_pending", "ruo_research", sample);
    expect(pathway?.request.subject).toBe("Price request: BAM15 (500 mcg)");
    const bare = krisPathwayView("price_pending", "ruo_research", {
      displayName: "BAM15",
      specification: "",
    });
    expect(bare?.request.subject).toBe("Price request: BAM15");
  });
});

describe("the pathway cannot ride beside an open purchase door", () => {
  it("in the real projection, a row with a pathway never has an order entry", () => {
    const data = JSON.parse(fs.readFileSync(ARTIFACT, "utf8")) as Artifact;
    const overlay = data.priceOverlays.KRIS_VOLUME_PARTNER;
    for (const product of data.products) {
      const entry = overlay[product.id];
      const price: KrisPriceView =
        entry?.state === "priced"
          ? {
              state: "priced",
              amountCents: entry.amountCents as number,
              currency: entry.currency as string,
              display: entry.display as string,
              basis: entry.basis as string,
            }
          : { state: "pending", display: "Price pending" };
      const view = projectKrisItem(product, price);
      if (view.pathway != null) {
        expect(view.canBuyNow, product.displayName).toBe(false);
        expect(view.legacyOrder, product.displayName).toBeNull();
        expect(view.pathway.kind).toBe(view.purchaseMode);
      } else {
        expect(view.purchaseMode, product.displayName).toBe("direct_eligible");
      }
    }
  });

  it("is sensitive to the mode, not vacuously null", () => {
    // The same row flips from no-pathway to pathway when the mode says so,
    // proving the null branch is a decision rather than a default.
    const sample = { displayName: "Sample", specification: "10 mg" };
    expect(krisPathwayView("direct_eligible", "supplement", sample)).toBeNull();
    expect(krisPathwayView("provider_workflow", "supplement", sample)?.kind).toBe(
      "provider_workflow",
    );
  });

  it("carries no field an order route could consume", () => {
    const pathway = krisPathwayView(
      "provider_workflow",
      "clinical_provider_only" as KrisChannel,
      { displayName: "X", specification: "Y" },
    );
    expect(pathway).not.toBeNull();
    expect(Object.keys(pathway as object).sort()).toEqual([
      "explanation",
      "headline",
      "kind",
      "request",
    ]);
    expect(Object.keys((pathway as { request: object }).request).sort()).toEqual([
      "label",
      "subject",
    ]);
  });
});
