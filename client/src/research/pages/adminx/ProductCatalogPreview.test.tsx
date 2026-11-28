// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminProductDetail } from "@shared/research/product-admin";
import type { CatalogContentPreview } from "@shared/research/catalog-content-preview";
import { apiGet } from "../../lib/api";
import { ProductCatalogPreview } from "./ProductCatalogPreview";

vi.mock("../../lib/api", () => ({ apiGet: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const P = "11111111-1111-4111-8111-111111111111", V1 = "22222222-2222-4222-8222-222222222222", V2 = "33333333-3333-4333-8333-333333333333";
const TOKEN = "SYNTHETIC_INERT_TOKEN";
function product(id = P): AdminProductDetail {
  return { id, variants: [{ id: V1, productId: id, label: "Synthetic first variant" }, { id: V2, productId: id, label: "Synthetic second variant" }],
    content: { shortDescription: "DRAFT_SENTINEL" }, media: [{ href: "PRIVATE_MEDIA_SENTINEL" }], prices: [{ amountCents: 12345 }] } as unknown as AdminProductDetail;
}
function preview(variantId = V1, name = "Synthetic reviewed first", productId = P): CatalogContentPreview {
  return { state: "preview_available", productId, variantId,
    identity: { offeringId: "mo_a", offeringVariantId: "mov_b", displayName: name, variantLabel: "Strength unconfirmed", offeringState: "held", variantState: "held" },
    contentState: "reviewed_content", mediaState: "no_reviewed_media", media: null,
    content: { summary: "Synthetic approved summary", overview: "Synthetic full first paragraph.\n\nSynthetic full second paragraph." },
    reviewMessage: "Details remain under review." };
}
function reply(view: CatalogContentPreview) { return { kind: "ok" as const, data: { ok: true as const, product: product(view.productId ?? P), catalogPreview: view } }; }
function deferred() {
  let resolve!: (value: ReturnType<typeof reply>) => void;
  const promise = new Promise<ReturnType<typeof reply>>(yes => { resolve = yes; });
  return { promise, resolve };
}
const get = vi.mocked(apiGet);
let host: HTMLDivElement, root: Root, model: AdminProductDetail;
beforeEach(() => {
  get.mockReset(); get.mockResolvedValue({ kind: "unavailable" });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network disabled in mounted unit test"); }));
  model = product(); host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function mount(p = model, token = TOKEN) { await act(async () => root.render(<ProductCatalogPreview token={token} product={p} />)); }
async function choose(id: string) {
  const select = host.querySelector<HTMLSelectElement>("#preview-exact-variant")!;
  await act(async () => { select.value = id; select.dispatchEvent(new Event("change", { bubbles: true })); });
}

describe("ProductCatalogPreview mounted read-only behavior", () => {
  it("ignores a publication capability echoed for a different variant", async () => {
    const selected = reply(preview());
    get.mockResolvedValueOnce({ ...selected, data: { ...selected.data, publicationEditorVariantId: V2 } });
    await mount();
    await choose(V1);
    expect(host.textContent).not.toContain("Exact variant publication");
    expect(get).toHaveBeenCalledTimes(1);
  });
  it("mounts the selected editor across a missing binding and retires it on variant change", async () => {
    const selected = reply({ ...preview(), state: "binding_missing", identity: null, content: null, media: null });
    get.mockResolvedValueOnce({ ...selected, data: { ...selected.data, publicationEditorVariantId: V1 } });
    await mount();
    await choose(V1);
    expect(host.textContent).toContain("Exact variant publication");
    expect(get).toHaveBeenCalledWith(`/api/admin/research/products/${P}/variants/${V1}/catalog-publication`, TOKEN);
    expect(fetch).not.toHaveBeenCalled();
    await choose(V2);
    expect(host.textContent).not.toContain("Exact variant publication");
  });
  it("requires deliberate variant selection and reads only the same protected product endpoint", async () => {
    await mount(); expect(get).not.toHaveBeenCalled(); expect(host.querySelector<HTMLSelectElement>("select")!.value).toBe("");
    get.mockResolvedValueOnce(reply(preview())); await choose(V1);
    expect(host.textContent).not.toContain("Exact variant publication");
    expect(get).toHaveBeenCalledTimes(1); expect(get).toHaveBeenCalledWith(`/api/admin/research/products/${P}?previewVariantId=${V1}`, TOKEN);
    expect(host.textContent).toContain("Synthetic reviewed first"); expect(host.textContent).not.toContain("DRAFT_SENTINEL");
    expect(host.textContent).not.toContain("12345"); expect(fetch).not.toHaveBeenCalled();
  });
  it("does not let an older variant response replace the new explicit selection", async () => {
    const first = deferred(), second = deferred(); get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await mount(); await choose(V1); await choose(V2);
    await act(async () => second.resolve(reply(preview(V2, "Synthetic reviewed second"))));
    expect(host.textContent).toContain("Synthetic reviewed second");
    await act(async () => first.resolve(reply(preview(V1, "STALE_FIRST_SENTINEL"))));
    expect(host.textContent).toContain("Synthetic reviewed second"); expect(host.textContent).not.toContain("STALE_FIRST_SENTINEL");
  });
  it("clears selection when product changes and discards the old product response", async () => {
    const pending = deferred(); get.mockReturnValueOnce(pending.promise);
    await mount(); await choose(V1);
    const next = product("44444444-4444-4444-8444-444444444444"); await mount(next);
    expect(host.querySelector<HTMLSelectElement>("select")!.value).toBe("");
    await act(async () => pending.resolve(reply(preview(V1, "OLD_PRODUCT_SENTINEL"))));
    expect(host.textContent).not.toContain("OLD_PRODUCT_SENTINEL"); expect(get).toHaveBeenCalledTimes(1);
  });
  it("does not show an old operator result after the token changes", async () => {
    get.mockResolvedValueOnce(reply(preview(V1, "OLD_OPERATOR_SENTINEL")));
    await mount(); await choose(V1); expect(host.textContent).toContain("OLD_OPERATOR_SENTINEL");
    const pending = deferred(); get.mockReturnValueOnce(pending.promise);
    await mount(model, "SYNTHETIC_SUCCESSOR_TOKEN");
    expect(host.textContent).not.toContain("OLD_OPERATOR_SENTINEL");
    await act(async () => pending.resolve(reply(preview(V1, "Synthetic successor result"))));
    expect(host.textContent).toContain("Synthetic successor result"); expect(host.innerHTML).not.toContain(TOKEN);
  });
  it("refuses mismatched response identity and unknown/prototype state names", async () => {
    await mount(); get.mockResolvedValueOnce(reply(preview(V2, "WRONG_VARIANT_SENTINEL"))); await choose(V1);
    expect(host.textContent).not.toContain("WRONG_VARIANT_SENTINEL"); expect(host.textContent).toContain("Preview could not be confirmed");
    get.mockResolvedValueOnce(reply({ ...preview(), state: "__proto__" } as unknown as CatalogContentPreview));
    await choose(""); await choose(V1); expect(host.textContent).toContain("Preview could not be confirmed");
  });
  it("keeps denied access distinct from missing content and never auto-retries", async () => {
    get.mockResolvedValueOnce({ kind: "denied", code: "synthetic_access_denied" }); await mount(); await choose(V1);
    expect(host.textContent).toContain("Operator access was not confirmed"); expect(get).toHaveBeenCalledTimes(1);
    expect(host.querySelector("article")).toBeNull(); expect(host.textContent).not.toContain("Retry preview");
  });
  it("retries an unavailable read only after an explicit click", async () => {
    await mount(); await choose(V1); expect(get).toHaveBeenCalledTimes(1);
    get.mockResolvedValueOnce(reply(preview()));
    const retry = [...host.querySelectorAll("button")].find(b => b.textContent === "Retry preview")!;
    await act(async () => retry.click()); expect(get).toHaveBeenCalledTimes(2); expect(host.textContent).toContain("Synthetic reviewed first");
  });
  it("retries HTTP200 catalog_unavailable with the same deliberately selected product and variant", async () => {
    get.mockResolvedValueOnce(reply({ ...preview(), state: "catalog_unavailable", identity: null, content: null, media: null,
      contentState: "no_reviewed_content", mediaState: "no_reviewed_media" }));
    await mount(); await choose(V1); expect(host.textContent).toContain("Retry without changing the product");
    expect(get).toHaveBeenCalledTimes(1);
    const retry = [...host.querySelectorAll("button")].find(b => b.textContent === "Retry preview")!;
    expect(retry).toBeTruthy(); get.mockResolvedValueOnce(reply(preview()));
    await act(async () => retry.click()); expect(get).toHaveBeenCalledTimes(2);
    for (const call of get.mock.calls) expect(call).toEqual([`/api/admin/research/products/${P}?previewVariantId=${V1}`, TOKEN]);
    expect(host.querySelector<HTMLSelectElement>("select")!.value).toBe(V1); expect(host.textContent).toContain("Synthetic reviewed first");
  });
  it("shows missing binding without borrowing product-wide draft/media data", async () => {
    get.mockResolvedValueOnce(reply({ ...preview(), state: "binding_missing", identity: null, content: null, media: null,
      contentState: "no_reviewed_content", mediaState: "no_reviewed_media" }));
    await mount(); await choose(V1); expect(host.textContent).toContain("No reviewed exact catalog binding");
    expect(host.querySelector("img")).toBeNull(); expect(host.textContent).not.toContain("DRAFT_SENTINEL");
  });
  it("shows broken reviewed artwork as unavailable, without generic replacement", async () => {
    get.mockResolvedValueOnce(reply({ ...preview(), mediaState: "reviewed_media", media: {
      primary: { href: "/research/media/approved.png", altText: "Synthetic approved artwork", width: 120, height: 80 }, packagingDesign: true,
    } }));
    await mount(); await choose(V1);
    const img = host.querySelector("img")!; expect(img.getAttribute("src")).toBe("/research/media/approved.png");
    await act(async () => img.dispatchEvent(new Event("error")));
    expect(host.textContent).toContain("No replacement artwork is inferred"); expect(host.querySelector("img")).toBeNull();
  });
  it("renders approved paragraphs and escaped text without mutation controls", async () => {
    const value = preview(); get.mockResolvedValueOnce(reply({ ...value, content: { ...value.content!, summary: "<script>synthetic text</script>" } }));
    await mount(); await choose(V1);
    expect(host.textContent).toContain("<script>synthetic text</script>"); expect(host.querySelector("script")).toBeNull();
    expect(host.textContent).toContain("Synthetic full first paragraph."); expect(host.textContent).toContain("Synthetic full second paragraph.");
    expect(host.querySelector("article form, article button, article select")).toBeNull(); expect(fetch).not.toHaveBeenCalled();
  });
});
