import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ASSISTED_ORDER_STATUS_TOKEN_HEADER,
  createAssistedOrderUploadTicket,
  loadAssistedOrderStatus,
  uploadAssistedOrderDocument,
} from "./api";

function successfulJson(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadAssistedOrderStatus", () => {
  it("sends the opaque status credential only in the dedicated request header", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      successfulJson({ publicReference: "XRR-20260829-ABCDEF1234" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const statusToken = "opaque.status/token?with=url&characters";

    await loadAssistedOrderStatus("XRR-20260829-ABCDEF1234", statusToken);

    expect(ASSISTED_ORDER_STATUS_TOKEN_HEADER).toBe(
      "x-xenios-order-status-token",
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "/api/research/early-access/assisted-orders/XRR-20260829-ABCDEF1234",
    );
    expect(String(url)).not.toContain("?");
    expect(String(url)).not.toContain(statusToken);
    expect(init?.headers).toMatchObject({
      accept: "application/json",
      [ASSISTED_ORDER_STATUS_TOKEN_HEADER]: statusToken,
    });
  });

  it("keeps the status URL clean when no browser credential is available", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      successfulJson({ publicReference: "XRR-20260829-ABCDEF1234" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await loadAssistedOrderStatus("XRR-20260829-ABCDEF1234");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain("?");
    expect(init?.headers).not.toHaveProperty(
      ASSISTED_ORDER_STATUS_TOKEN_HEADER,
    );
  });
});

describe("assisted-order document credential transport", () => {
  const statusToken = "opaque.document/status?token=must-not-serialize";
  const requestId = "11111111-1111-4111-8111-111111111111";
  const publicReference = "XRR-20260829-ABCDEF1234";

  it("sends the upload-ticket credential only in the dedicated header", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      successfulJson({
        documentId: "document-1",
        uploadUrl: "https://storage.example/upload",
        objectPath: `${requestId}/document-1/id-front.jpg`,
        expiresAt: "2026-08-29T12:15:00.000Z",
        requiredHeaders: { "x-upload-fixture": "1" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createAssistedOrderUploadTicket(
      requestId,
      {
        publicReference,
        documentType: "government_id",
        side: "front",
        fileName: "id-front.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 123,
      },
      statusToken,
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain(statusToken);
    expect(String(init?.body)).not.toContain(statusToken);
    expect(JSON.parse(String(init?.body))).toEqual({
      publicReference,
      documentType: "government_id",
      side: "front",
      fileName: "id-front.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 123,
    });
    expect(init?.headers).toMatchObject({
      [ASSISTED_ORDER_STATUS_TOKEN_HEADER]: statusToken,
    });
  });

  it("never sends the status credential to storage or serializes it in completion JSON", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)
      .mockResolvedValueOnce({ ok: true, status: 204 } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const ticket = {
      documentId: "document-1",
      uploadUrl: "https://storage.example/upload",
      objectPath: `${requestId}/document-1/id-front.jpg`,
      expiresAt: "2026-08-29T12:15:00.000Z",
      requiredHeaders: { "x-upload-fixture": "1" },
    };

    await uploadAssistedOrderDocument(
      ticket,
      new File(["fixture"], "id-front.jpg", { type: "image/jpeg" }),
      { publicReference },
      statusToken,
    );

    const [storageUrl, storageInit] = fetchMock.mock.calls[0];
    expect(storageUrl).toBe(ticket.uploadUrl);
    expect(storageInit?.headers).not.toHaveProperty(
      ASSISTED_ORDER_STATUS_TOKEN_HEADER,
    );
    const [completionUrl, completionInit] = fetchMock.mock.calls[1];
    expect(String(completionUrl)).not.toContain(statusToken);
    expect(String(completionInit?.body)).not.toContain(statusToken);
    expect(JSON.parse(String(completionInit?.body))).toEqual({ publicReference });
    expect(completionInit?.headers).toMatchObject({
      [ASSISTED_ORDER_STATUS_TOKEN_HEADER]: statusToken,
    });
  });
});
