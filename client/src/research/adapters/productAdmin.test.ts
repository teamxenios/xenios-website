import { afterEach, describe, expect, it, vi } from "vitest";
import { updateAdminVariant, uploadAdminMedia } from "./productAdmin";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Website 3 Product Control adapter", () => {
  it("updates one exact product variant through the server-authoritative route", async () => {
    const fetchMock = vi.fn(async () => json({ ok: true, product: { id: "product-1" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateAdminVariant(
      "admin-token",
      "product / 1",
      "variant / 1",
      { status: "approved", active: true },
      "variant-idempotency",
    );

    expect(result.kind).toBe("ok");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/research/products/product%20%2F%201/variants/variant%20%2F%201",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          Authorization: "Bearer admin-token",
          "Idempotency-Key": "variant-idempotency",
        }),
      }),
    );
  });

  it("uploads to the signed private grant without leaking the admin token, then confirms", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json(
          {
            ok: true,
            media: { id: "media / 1" },
            uploadUrl: "https://storage.example/signed",
            expiresAt: "2026-07-26T12:02:00.000Z",
          },
          201,
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(json({ ok: true, product: { id: "product-1" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "mutation-1" });
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "front.png", {
      type: "image/png",
    });

    const result = await uploadAdminMedia("admin-token", "product-1", file, {
      kind: "primary_image",
      altText: "Product front view",
      sortOrder: 0,
    });

    expect(result.kind).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/admin/research/products/product-1/media/upload",
    );
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer admin-token" }),
      }),
    );
    expect(fetchMock.mock.calls[1][0]).toBe("https://storage.example/signed");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: file,
    });
    expect(fetchMock.mock.calls[1][1]?.headers).not.toHaveProperty("Authorization");
    expect(fetchMock.mock.calls[2][0]).toBe(
      "/api/admin/research/products/product-1/media/media%20%2F%201/confirm",
    );
  });

  it("does not confirm when the private upload fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          ok: true,
          media: { id: "media-1" },
          uploadUrl: "https://storage.example/signed",
          expiresAt: "2026-07-26T12:02:00.000Z",
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "mutation-1" });

    const result = await uploadAdminMedia(
      "admin-token",
      "product-1",
      new File(["x"], "front.webp", { type: "image/webp" }),
      { kind: "gallery_image", altText: "Side view" },
    );

    expect(result).toMatchObject({ kind: "error", code: "private_upload_failed" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
