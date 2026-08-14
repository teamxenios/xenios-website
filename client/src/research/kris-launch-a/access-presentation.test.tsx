// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// Non-direct detail pages render the pathway request, which reads the member
// token the way the routed pages do. The purchase-control sweep still runs
// over the result: a request action carries no purchase verb, and the sweep
// proving that is exactly the point of this file.
vi.mock("../core", () => ({
  useResearch: () => ({ memberToken: "member-token" }),
}));
import { KRIS_CHANNELS } from "@shared/research/kris-launch-a/contract";
import type { KrisChannel } from "@shared/research/kris-launch-a/contract";
import { KrisCatalogCard } from "./KrisCatalogCard";
import { KrisDetail } from "./KrisDetail";
import {
  krisArtifact,
  krisFixtureDetail,
  krisFixtureItems,
} from "./__fixtures__/krisFixtureServer";

/**
 * The access presentation, checked against all 420 real items.
 *
 * This file renders every item in the artifact, which is exactly what the
 * catalog page must never do. That is the point: the page ships a page, and
 * this test is the sweep that proves only a server-bound direct row can produce
 * Buy Now, while no row loses its channel notices or shows a fake price.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function render(ui: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return {
    host,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

/**
 * Anything that would let a member buy. Text, accessible name, and the
 * attributes a cart control is usually built from.
 *
 * The bare word "purchase" is deliberately not in here: the disclosures say
 * "It does not authorize a purchase", which is the copy doing its job. What is
 * banned is a CONTROL that offers one.
 */
const PURCHASE_CONTROL =
  /(add to (cart|bag|basket)|buy now|buy it|purchase now|place (an )?order|order now|checkout|check out|proceed to pay|pay now)/i;

function purchaseControls(host: HTMLElement): string[] {
  const found: string[] = [];
  const selector = [
    "button",
    "a",
    "input",
    "select",
    "form",
    '[role="button"]',
    '[role="link"]',
  ].join(", ");
  for (const control of Array.from(host.querySelectorAll(selector))) {
    const text = [
      control.textContent ?? "",
      control.getAttribute("aria-label") ?? "",
      control.getAttribute("value") ?? "",
      control.getAttribute("name") ?? "",
      control.getAttribute("data-testid") ?? "",
      control.getAttribute("href") ?? "",
    ].join(" ");
    if (PURCHASE_CONTROL.test(text)) found.push(text.trim());
  }
  return found;
}

/** A price a buyer must never see: zero in any of its formatted shapes. */
// Match an actual zero or negative amount, not a legitimate sub-dollar price
// such as $0.83. The trailing guard keeps the optional decimal branch from
// accepting the `$0` prefix of a non-zero value.
const FAKE_PRICE = /\$\s?0(?:\.0{1,2})?(?![\d.])|\$\s?-/;

describe("every one of the 420 items", () => {
  const items = krisFixtureItems();

  it("is the whole artifact, so the sweep below is not a sample", () => {
    const counts = krisArtifact().counts;
    expect(items).toHaveLength(counts.items);
    expect(items).toHaveLength(420);
    expect(counts.priced).toBe(418);
    expect(counts.pricePending).toBe(2);
    expect(counts.priced + counts.pricePending).toBe(counts.items);
  });

  it("projects only the browser-safe product allowlist", () => {
    const allowedProductKeys = [
      "channel",
      "channelLabel",
      "displayName",
      "dosageForm",
      "family",
      "familyLabel",
      "format",
      "id",
      "moq",
      "packBasis",
      "slug",
      "specification",
      "suppliedNote",
    ];
    for (const product of krisArtifact().products) {
      expect(Object.keys(product).sort(), product.slug).toEqual(allowedProductKeys);
    }
  });

  it("renders no purchase control from purchaseMode alone without an exact Product Control handoff", () => {
    const { host, unmount } = render(
      <ul>
        {items.map((item) => (
          <KrisCatalogCard key={item.id} item={item} />
        ))}
      </ul>,
    );
    expect(host.querySelectorAll('[data-testid="kris-card"]')).toHaveLength(420);
    expect(purchaseControls(host)).toEqual([]);
    // The contract has no add-to-cart member at all, so this string could only
    // appear if someone wrote it by hand.
    expect(host.innerHTML).not.toMatch(/add[-_ ]?to[-_ ]?cart/i);
    expect(host.innerHTML).not.toMatch(/testid="[^"]*cart[^"]*"/i);
    // Every policy says so in the data as well as in the rendering.
    expect(items.every((item) => item.access.purchasable === false)).toBe(true);
    unmount();
  });

  it("renders Buy Now for one real direct row only after an exact server handoff", () => {
    const direct = items.find((item) => item.id === "kli_ab4498834d24d715da48");
    expect(direct).toBeTruthy();
    expect(direct?.purchaseMode).toBe("direct_eligible");
    expect(direct?.price.state).toBe("priced");
    if (!direct || direct.price.state !== "priced") return;
    const detail = krisFixtureDetail(direct.family, direct.slug);
    expect(detail).not.toBeNull();
    if (!detail) return;
    const bound = {
      ...detail,
      canBuyNow: true,
      legacyOrder: {
        productId: "PEX-012",
        variantId: "R360-AOD9604-5MG-VIAL",
        unitPriceCents: direct.price.amountCents,
        currency: direct.price.currency,
        quantityLimit: 50,
        evaluatedAt: "2026-08-13T23:30:00.000Z",
      },
    };
    const { host, unmount } = render(<KrisDetail item={bound} />);
    expect(purchaseControls(host)).toHaveLength(1);
    expect(host.querySelector('[data-testid="kris-buy-now"]')?.textContent).toBe("Buy Now");
    unmount();
  });

  it("renders no zero and no negative price anywhere", () => {
    const { host, unmount } = render(
      <ul>
        {items.map((item) => (
          <KrisCatalogCard key={item.id} item={item} />
        ))}
      </ul>,
    );
    const prices = Array.from(
      host.querySelectorAll('[data-testid="kris-price"]'),
    ).map((node) => node.textContent ?? "");
    expect(prices).toHaveLength(420);
    expect(prices.filter((text) => FAKE_PRICE.test(text))).toEqual([]);
    // And never a blank where a price goes.
    expect(prices.filter((text) => text.trim() === "")).toEqual([]);
    unmount();
  });

  it("renders BOTH the channel notices and the note as supplied, on every item", () => {
    for (const item of items) {
      const { host, unmount } = render(
        <ul>
          <KrisCatalogCard item={item} />
        </ul>,
      );
      const notices = Array.from(
        host.querySelectorAll('[data-testid="kris-access-notice"]'),
      ).map((node) => node.textContent);
      expect(notices, item.slug + " lost its channel notices").toEqual(
        item.access.notices.slice(),
      );
      expect(
        host.querySelector('[data-testid="kris-supplied-note"]')?.textContent,
        item.slug + " lost its supplied note",
      ).toBe(item.suppliedNote);
      expect(
        host.querySelector('[data-testid="kris-access-badge"]')?.textContent,
      ).toBe(item.access.statusLabel);
      unmount();
    }
  });
});

describe("the copy each channel is required to carry", () => {
  const items = krisFixtureItems();
  const byChannel = (channel: KrisChannel) =>
    items.filter((item) => item.channel === channel);

  it("covers all five channels, so no case below is vacuous", () => {
    for (const channel of KRIS_CHANNELS) {
      expect(byChannel(channel).length, channel).toBeGreaterThan(0);
    }
  });

  it("says provider workflow required on every clinical item", () => {
    const clinical = byChannel("clinical_provider_only");
    expect(clinical).toHaveLength(244);
    for (const item of clinical) {
      const { host, unmount } = render(
        <ul>
          <KrisCatalogCard item={item} />
        </ul>,
      );
      const text = host.textContent ?? "";
      expect(text, item.slug).toContain("Provider workflow required");
      expect(text, item.slug).toContain(
        "Subject to applicable state availability and pharmacy requirements.",
      );
      // Nothing may claim a prescription, and nothing may offer a purchase.
      expect(text, item.slug).not.toMatch(/prescription is|we prescribe|prescribed for you/i);
      expect(purchaseControls(host)).toEqual([]);
      unmount();
    }
  });

  it("says research use only on every RUO item", () => {
    const ruo = byChannel("ruo_research");
    expect(ruo).toHaveLength(121);
    for (const item of ruo) {
      const { host, unmount } = render(
        <ul>
          <KrisCatalogCard item={item} />
        </ul>,
      );
      const text = host.textContent ?? "";
      expect(text, item.slug).toContain("Research use only");
      expect(text, item.slug).toContain(
        "Subject to availability and documentation.",
      );
      expect(purchaseControls(host)).toEqual([]);
      unmount();
    }
  });

  it("carries the confirmation notice on every classification pending item", () => {
    const pending = byChannel("classification_pending");
    expect(pending).toHaveLength(32);
    for (const item of pending) {
      const { host, unmount } = render(
        <ul>
          <KrisCatalogCard item={item} />
        </ul>,
      );
      const text = host.textContent ?? "";
      expect(text, item.slug).toContain("Classification pending");
      expect(text, item.slug).toContain(
        "Classification, form and documentation must be confirmed before activation.",
      );
      expect(purchaseControls(host)).toEqual([]);
      unmount();
    }
  });

  it("shows the supplied note faithfully for supplements and nonclinical items", () => {
    for (const channel of ["supplement", "nonclinical_topical"] as const) {
      for (const item of byChannel(channel)) {
        const { host, unmount } = render(
          <ul>
            <KrisCatalogCard item={item} />
          </ul>,
        );
        expect(
          host.querySelector('[data-testid="kris-supplied-note"]')?.textContent,
        ).toBe(item.suppliedNote);
        expect(host.textContent).toContain("Subject to availability.");
        unmount();
      }
    }
  });
});

/**
 * THE TWO ROWS THE WHOLE ACCESS DESIGN EXISTS FOR.
 *
 * Their supplied note says "Price pending." INSTEAD of the channel text. A
 * surface trusting that cell alone would drop "Research use only" from BAM15
 * and "Provider workflow required" from the syringes.
 */
describe("the two price-pending items", () => {
  const pending = krisFixtureItems().filter(
    (item) => item.price.state === "pending",
  );

  it("is exactly the two the artifact counted", () => {
    expect(pending).toHaveLength(krisArtifact().counts.pricePending);
    expect(pending.map((item) => item.slug).sort()).toEqual([
      "research-capsules-bam15-bam15-500-mcg",
      "shipping-and-fulfillment-syringes-and-alcohol-swabs",
    ]);
    expect(pending.every((item) => item.suppliedNote === "Price pending.")).toBe(
      true,
    );
  });

  it("renders Price pending, never a zero and never a blank", () => {
    for (const item of pending) {
      const { host, unmount } = render(
        <ul>
          <KrisCatalogCard item={item} />
        </ul>,
      );
      const price = host.querySelector('[data-testid="kris-price"]');
      expect(price?.textContent).toBe("Price pending");
      expect(price?.getAttribute("data-state")).toBe("pending");
      expect(host.textContent).not.toMatch(FAKE_PRICE);
      // No basis line either: there is no price to be measured on anything.
      expect(host.querySelector('[data-testid="kris-price-basis"]')).toBeNull();
      unmount();
    }
  });

  it("keeps the channel notices the supplied note does not carry", () => {
    const bam15 = pending.find((item) => item.channel === "ruo_research");
    const syringes = pending.find(
      (item) => item.channel === "clinical_provider_only",
    );
    expect(bam15).toBeTruthy();
    expect(syringes).toBeTruthy();

    for (const [item, required] of [
      [bam15, "Research use only"],
      [syringes, "Provider workflow required"],
    ] as const) {
      if (!item) continue;
      const { host, unmount } = render(
        <ul>
          <KrisCatalogCard item={item} />
        </ul>,
      );
      const text = host.textContent ?? "";
      // Both. Never one instead of the other.
      expect(text, item.slug).toContain(required);
      expect(text, item.slug).toContain("Price pending.");
      expect(text, item.slug).toContain("Price pending");
      unmount();
    }
  });

  it("holds on the detail page too, disclosures and all", () => {
    const detail = krisFixtureDetail(
      "shipping_and_fulfillment",
      "shipping-and-fulfillment-syringes-and-alcohol-swabs",
    );
    expect(detail).not.toBeNull();
    if (!detail) return;
    const { host, unmount } = render(<KrisDetail item={detail} />);
    const text = host.textContent ?? "";
    expect(text).toContain("Provider workflow required");
    expect(text).toContain(
      "Subject to applicable state availability and pharmacy requirements.",
    );
    expect(
      host.querySelector('[data-testid="kris-supplied-note"]')?.textContent,
    ).toBe("Price pending.");
    expect(host.querySelector('[data-testid="kris-price"]')?.textContent).toBe(
      "Price pending",
    );
    expect(text).toContain(
      "Signing in gives access to this catalog. It does not authorize a purchase.",
    );
    expect(purchaseControls(host)).toEqual([]);
    expect(text).not.toMatch(FAKE_PRICE);
    unmount();
  });
});

describe("the detail page of a priced clinical item", () => {
  it("shows the price, its basis, the provider notices and no way to buy", () => {
    const priced = krisFixtureItems().find(
      (item) =>
        item.channel === "clinical_provider_only" && item.price.state === "priced",
    );
    expect(priced).toBeTruthy();
    if (!priced) return;
    const detail = krisFixtureDetail(priced.family, priced.slug);
    expect(detail).not.toBeNull();
    if (!detail) return;

    const { host, unmount } = render(<KrisDetail item={detail} />);
    const text = host.textContent ?? "";
    expect(
      host.querySelector('[data-testid="kris-price"]')?.getAttribute("data-state"),
    ).toBe("priced");
    expect(host.querySelector('[data-testid="kris-price-basis"]')).not.toBeNull();
    expect(text).toContain("Provider workflow required");
    expect(text).toContain(
      "Subject to applicable state availability and pharmacy requirements.",
    );
    expect(
      host.querySelector('[data-testid="kris-supplied-note"]')?.textContent,
    ).toBe(detail.suppliedNote);
    expect(purchaseControls(host)).toEqual([]);
    expect(text).not.toMatch(/add to cart/i);
    unmount();
  });
});
