import { beforeEach, describe, expect, it, vi } from "vitest";
import { careApiFetch } from "./api";
import {
  CARE_DISCOVERY_NEXT_PATH,
  CARE_ROUTE_CONTRACTS,
} from "@shared/care/contracts";
import {
  isCareDiscoverySuccess,
  requestCareDiscovery,
} from "./discovery-api";

vi.mock("./api", () => ({ careApiFetch: vi.fn() }));

const careApiFetchMock = vi.mocked(careApiFetch);

beforeEach(() => {
  careApiFetchMock.mockReset();
  careApiFetchMock.mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );
});

describe("Care discovery client request", () => {
  it("posts only literal consent to the generic Care endpoint", async () => {
    await requestCareDiscovery(true);

    expect(careApiFetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = careApiFetchMock.mock.calls[0];
    expect(path).toBe(CARE_ROUTE_CONTRACTS.discovery);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Content-Type")).toBe(
      "application/json",
    );
    expect(init?.body).toBe(JSON.stringify({ consent: true }));

    const sent = JSON.parse(String(init?.body));
    expect(Object.keys(sent)).toEqual(["consent"]);
    for (const forbidden of [
      "sku",
      "product",
      "productId",
      "order",
      "orderId",
      "price",
      "diagnosis",
      "symptoms",
      "treatment",
      "clinicalData",
    ]) {
      expect(sent).not.toHaveProperty(forbidden);
    }
  });

  it("refuses before HTTP when consent is not exactly true", async () => {
    await expect(requestCareDiscovery(false as true)).rejects.toThrow(
      "care_discovery_consent_required",
    );
    expect(careApiFetchMock).not.toHaveBeenCalled();
  });
});

describe("Care discovery success validation", () => {
  const valid = {
    ok: true,
    discovery: {
      sourceRail: "research",
      destinationRail: "care",
      intent: "learn_about_care",
      subjectId: "subject-1",
      consentedAt: "2026-08-20T18:00:00.000Z",
    },
    nextPath: CARE_DISCOVERY_NEXT_PATH,
  };

  it("accepts only the closed Research-to-Care response", () => {
    expect(isCareDiscoverySuccess(valid)).toBe(true);
  });

  it("does not follow an untrusted or widened response", () => {
    expect(
      isCareDiscoverySuccess({ ...valid, nextPath: "https://example.test" }),
    ).toBe(false);
    expect(
      isCareDiscoverySuccess({
        ...valid,
        discovery: { ...valid.discovery, sourceRail: "commerce" },
      }),
    ).toBe(false);
    expect(
      isCareDiscoverySuccess({
        ...valid,
        discovery: { ...valid.discovery, subjectId: "" },
      }),
    ).toBe(false);
  });
});
