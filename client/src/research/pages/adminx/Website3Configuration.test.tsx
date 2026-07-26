// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminSupplementPlaceholder,
  AdminSuperpowerOffer,
} from "../../adapters/products-diagnostics";

const resources = vi.hoisted(() => {
  const channelMetadata = {
    affiliate: {
      configured: true,
      partnerReference: "partner-initial",
      publicUrl: "https://partner.example/initial",
    },
    wholesale: { configured: false, partnerReference: null, publicUrl: null },
    professional_dispensary: {
      configured: false,
      partnerReference: null,
      publicUrl: null,
    },
    partner_fulfilled: {
      configured: false,
      partnerReference: null,
      publicUrl: null,
    },
    private_label: {
      configured: false,
      partnerReference: null,
      publicUrl: null,
    },
  };
  return {
    supplement: {
      category: "foundational",
      label: "Foundational supplements",
      description: "Reviewed placeholder.",
      launchInterestHref: "/research/member/product-requests/new",
      status: "coming_soon",
      channelMetadata,
      adminEditable: true,
      updatedAt: "2026-07-25T00:00:00.000Z",
      updatedBy: "admin@example.com",
    } as AdminSupplementPlaceholder,
    offer: {
      offerId: "superpower_diagnostics",
      label: "Superpower Diagnostics",
      summary: "Approved offer summary.",
      status: "available",
      availability: "Available to eligible members",
      collectionMethod: "At-home collection",
      priceCents: 19900,
      priceEffectiveDate: "2026-08-01",
      lastVerificationDate: "2026-07-25",
      lastReviewedDate: "2026-07-25",
      verifiedPriceDate: "2026-07-25",
      disclosure: "Xenios may receive compensation.",
      interest: {
        enabled: true,
        href: "/research/member/product-requests/new?source=diagnostics",
      },
      affiliate: {
        enabled: true,
        url: "https://partner.example/initial-offer",
      },
      adminEditable: true,
      updatedAt: "2026-07-25T00:00:00.000Z",
      updatedBy: "admin@example.com",
    } as AdminSuperpowerOffer,
    getSupplements: vi.fn(),
    updateSupplement: vi.fn(),
    getSuperpower: vi.fn(),
    updateSuperpower: vi.fn(),
  };
});

vi.mock("../../adapters/products-diagnostics", () => ({
  getAdminMetabolicPathways: vi.fn(async () => ({
    kind: "ok",
    data: { ok: true, pathways: [] },
  })),
  getAdminSupplementPlaceholders: resources.getSupplements,
  updateAdminSupplementPlaceholder: resources.updateSupplement,
  getAdminSuperpowerOffer: resources.getSuperpower,
  updateAdminSuperpowerOffer: resources.updateSuperpower,
  updateAdminMetabolicPathway: vi.fn(),
}));

vi.mock("./AdminResearchHome", () => ({
  AdminScreen: ({ children }: { children: (token: string) => unknown }) =>
    children("admin-token"),
  AdminBoundary: ({ children }: { children: unknown }) => children,
}));

import Website3Configuration from "./Website3Configuration";

let host: HTMLDivElement;
let root: Root | null;

async function renderPage() {
  await act(async () => {
    root = createRoot(host);
    root.render(<Website3Configuration />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function submit(form: HTMLFormElement) {
  await act(async () => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = null;
  resources.getSupplements.mockImplementation(async () => ({
    kind: "ok",
    data: {
      ok: true,
      supplements: [structuredClone(resources.supplement)],
    },
  }));
  resources.updateSupplement.mockImplementation(
    async (
      _token: string,
      _category: string,
      patch: Partial<AdminSupplementPlaceholder>,
    ) => {
      resources.supplement = {
        ...resources.supplement,
        ...structuredClone(patch),
      };
      return {
        kind: "ok",
        data: {
          ok: true,
          supplement: structuredClone(resources.supplement),
        },
      };
    },
  );
  resources.getSuperpower.mockImplementation(async () => ({
    kind: "ok",
    data: { ok: true, offer: structuredClone(resources.offer) },
  }));
  resources.updateSuperpower.mockImplementation(
    async (_token: string, patch: Partial<AdminSuperpowerOffer>) => {
      resources.offer = {
        ...resources.offer,
        ...structuredClone(patch),
      };
      return {
        kind: "ok",
        data: { ok: true, offer: structuredClone(resources.offer) },
      };
    },
  );
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host.remove();
  vi.clearAllMocks();
});

describe("Website 3 production configuration", () => {
  it("persists and reloads populated supplement channels and an available offer", async () => {
    await renderPage();

    const partnerReference = host.querySelector<HTMLInputElement>(
      'input[name="affiliatePartnerReference"]',
    );
    const channelUrl = host.querySelector<HTMLInputElement>(
      'input[name="affiliatePublicUrl"]',
    );
    expect(partnerReference?.value).toBe("partner-initial");
    expect(channelUrl?.value).toBe("https://partner.example/initial");
    if (!partnerReference || !channelUrl) throw new Error("channel controls missing");
    partnerReference.value = "partner-persisted";
    channelUrl.value = "https://partner.example/persisted";
    const supplementForm = partnerReference.closest("form");
    if (!supplementForm) throw new Error("supplement form missing");
    await submit(supplementForm);

    const collectionMethod = host.querySelector<HTMLInputElement>(
      'input[name="collectionMethod"]',
    );
    const affiliateUrl = host.querySelector<HTMLInputElement>(
      'input[name="affiliateUrl"]',
    );
    const affiliateEnabled = host.querySelector<HTMLInputElement>(
      'input[name="affiliateEnabled"]',
    );
    expect(collectionMethod?.value).toBe("At-home collection");
    expect(affiliateUrl?.value).toBe(
      "https://partner.example/initial-offer",
    );
    if (!collectionMethod || !affiliateUrl || !affiliateEnabled) {
      throw new Error("Superpower controls missing");
    }
    collectionMethod.value = "Partner collection center";
    affiliateUrl.value = "https://partner.example/persisted-offer";
    affiliateEnabled.checked = true;
    const offerForm = affiliateUrl.closest("form");
    if (!offerForm) throw new Error("Superpower form missing");
    await submit(offerForm);

    expect(resources.updateSupplement).toHaveBeenCalledWith(
      "admin-token",
      "foundational",
      expect.objectContaining({
        channelMetadata: expect.objectContaining({
          affiliate: {
            configured: true,
            partnerReference: "partner-persisted",
            publicUrl: "https://partner.example/persisted",
          },
        }),
      }),
    );
    expect(resources.updateSuperpower).toHaveBeenCalledWith(
      "admin-token",
      expect.objectContaining({
        status: "available",
        collectionMethod: "Partner collection center",
        affiliate: {
          enabled: true,
          url: "https://partner.example/persisted-offer",
        },
      }),
    );
    expect(resources.getSupplements.mock.calls.length).toBeGreaterThan(1);
    expect(resources.getSuperpower.mock.calls.length).toBeGreaterThan(1);

    await act(async () => root?.unmount());
    root = null;
    host.replaceChildren();
    await renderPage();

    expect(
      host.querySelector<HTMLInputElement>(
        'input[name="affiliatePartnerReference"]',
      )?.value,
    ).toBe("partner-persisted");
    expect(
      host.querySelector<HTMLInputElement>(
        'input[name="collectionMethod"]',
      )?.value,
    ).toBe("Partner collection center");
    expect(
      host.querySelector<HTMLInputElement>('input[name="affiliateUrl"]')
        ?.value,
    ).toBe("https://partner.example/persisted-offer");
    expect(
      host.querySelector<HTMLSelectElement>('select[name="status"]')?.value,
    ).toBe("available");
  });
});
