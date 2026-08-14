import { afterEach, describe, expect, it, vi } from "vitest";
import { krisFixtureDetail } from "./__fixtures__/krisFixtureServer";
import { getKrisDetail } from "./catalogApi";

const FAMILY = "research_capsules" as const;
const SLUG = "research-capsules-bam15-bam15-500-mcg";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Kris catalog API adapter", () => {
  it("calls the mounted detail route and unwraps its product envelope", async () => {
    const product = krisFixtureDetail(FAMILY, SLUG);
    expect(product).not.toBeNull();
    const fetch = vi.fn(async () =>
      jsonResponse({ ok: true, profile: "KRIS_VOLUME_PARTNER", product }),
    );
    vi.stubGlobal("fetch", fetch);

    await expect(getKrisDetail("member-token", FAMILY, SLUG)).resolves.toEqual({
      kind: "ok",
      data: product,
    });
    expect(fetch).toHaveBeenCalledWith(
      `/api/research/kris-launch-a/v1/products/${SLUG}`,
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: expect.objectContaining({
          Authorization: "Bearer member-token",
        }),
      }),
    );
  });

  it("fails closed when a successful response is not the mounted envelope", async () => {
    const product = krisFixtureDetail(FAMILY, SLUG);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(product)));
    await expect(getKrisDetail("member-token", FAMILY, SLUG)).resolves.toEqual({
      kind: "unavailable",
    });
  });

  it("preserves the server's entitlement denial", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ ok: false, code: "kris_catalog_forbidden" }, 403),
      ),
    );
    await expect(getKrisDetail("member-token", FAMILY, SLUG)).resolves.toEqual({
      kind: "denied",
      code: "kris_catalog_forbidden",
      message: undefined,
    });
  });
});
