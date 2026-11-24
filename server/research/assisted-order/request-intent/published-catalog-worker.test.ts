import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";
import { readPilotDisplay } from "./published-catalog-display";

it("sends published images back to the server even if the installed worker already has a cached response", async () => {
  const revisionId = "00000000-0000-4000-8000-000000000003";
  const assetId = "00000000-0000-4000-8000-000000000004";
  const identity = { offeringId: "mo_1", offeringVariantId: "mov_2", productId: revisionId, variantId: assetId };
  const href = `/api/research/catalog-media/${revisionId}/${assetId}`;
  const media = { primary: { href, altText: "Approved packaging", width: 300, height: 200 },
    representation: "catalog_reference", packagingDesign: false };
  const readPublishedRevision = async () => ({ revisionId, generation: 1, identity,
    content: { summary: "Approved summary", overview: "Approved overview" }, media,
    provenance: { contentSha256: "a".repeat(64), mediaSha256: "b".repeat(64), rightsApprovalSha256: "c".repeat(64) } });
  const display = await readPilotDisplay({ selected: identity, readPublishedRevision }, identity);
  expect(display?.media.primary.href).toBe(href);

  type ImageRequest = { url: string; method: string; destination: string; mode: string };
  type FetchEvent = { request: ImageRequest; respondWith: (response: Promise<unknown>) => void };
  const origin = "https://catalog.example.test";
  const cachedResponse = { source: "previous cache entry" };
  const match = vi.fn().mockResolvedValue(cachedResponse);
  let handleFetch!: (event: FetchEvent) => void;
  runInNewContext(readFileSync("client/public/sw.js", "utf8"), {
    URL, caches: { match },
    self: { location: { origin }, addEventListener(name: string, handler: typeof handleFetch) {
      if (name === "fetch") handleFetch = handler;
    } },
  });
  const request = { url: origin + href, method: "GET", destination: "image", mode: "no-cors" };
  const respondWith = vi.fn<(response: Promise<unknown>) => void>();
  handleFetch({ request, respondWith });
  expect(match).not.toHaveBeenCalled();
  expect(respondWith).not.toHaveBeenCalled();

  // The old image path exercises the same worker and really is intercepted on a cache hit.
  handleFetch({ request: { ...request, url: origin + href.slice("/api".length) }, respondWith });
  expect(match).toHaveBeenCalledTimes(1);
  await expect(respondWith.mock.calls[0][0]).resolves.toBe(cachedResponse);
});
