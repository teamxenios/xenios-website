import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAdminMetabolicPathways,
  getProductPlatform,
  requestCertificateAccess,
  updateAdminMetabolicPathway,
  uploadBiomarkerReport,
} from "./products-diagnostics";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Website 3 member production adapter", () => {
  it("uses the member bearer token and no-store policy for the product platform", async () => {
    const fetchMock = vi.fn(async () =>
      json({ ok: true, families: [], products: [], supplements: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getProductPlatform("member-token");

    expect(result.kind).toBe("ok");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/research/product-platform",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: expect.objectContaining({
          Authorization: "Bearer member-token",
        }),
      }),
    );
  });

  it("uploads directly to the signed grant without leaking the member token, then confirms", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          ok: true,
          uploadId: "upload-1",
          uploadUrl: "https://storage.example/signed",
        }, 201),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        json({
          ok: true,
          biomarker: {
            biomarkerRecordId: "bio-1",
            state: "report_uploaded",
            reportFilename: "report.pdf",
            consentVersion: "biomarker-report-storage-v1",
            consentedAt: "2026-07-25T00:00:00.000Z",
            updatedAt: "2026-07-25T00:00:00.000Z",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["%PDF"], "report.pdf", {
      type: "application/pdf",
    });

    const result = await uploadBiomarkerReport("member-token", {
      file,
      consentAccepted: true,
    });

    expect(result.kind).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe("https://storage.example/signed");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: file,
    });
    expect(fetchMock.mock.calls[1][1]?.headers).not.toHaveProperty(
      "Authorization",
    );
    expect(fetchMock.mock.calls[2][0]).toBe(
      "/api/research/diagnostics/biomarker/report-upload/confirm",
    );
  });

  it("does not contact Storage or confirm when upload preparation is unavailable", async () => {
    const fetchMock = vi.fn(async () =>
      json(
        {
          ok: false,
          code: "private_upload_unavailable",
          message: "Private upload is unavailable.",
        },
        409,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadBiomarkerReport("member-token", {
      file: new File(["x"], "report.pdf", { type: "application/pdf" }),
      consentAccepted: true,
    });

    expect(result.kind).toBe("denied");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("encodes the SKU and sends only the exact lot code for certificate access", async () => {
    const fetchMock = vi.fn(async () =>
      json({
        ok: true,
        certificateId: "cert-1",
        lotId: "lot-1",
        signedUrl: "https://storage.example/cert",
        expiresAt: "2026-07-25T00:05:00.000Z",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await requestCertificateAccess("member-token", "SKU / 1", "LOT-9");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/research/products/SKU%20%2F%201/certificates/access",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      lotCode: "LOT-9",
    });
  });

  it("keeps administrator reads and writes on the guarded admin routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ ok: true, pathways: [] }))
      .mockResolvedValueOnce(
        json({
          ok: true,
          pathway: {
            pathwayId: "glp_1_pathway",
            publicName: "GLP-1 Pathway",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await getAdminMetabolicPathways("admin-token");
    await updateAdminMetabolicPathway("admin-token", "glp_1_pathway", {
      publicName: "GLP-1 Pathway",
      publicStatus: "Pending clinician launch",
      publicCopy: "Clinician review remains pending.",
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/admin/research/metabolic-pathways",
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/admin/research/metabolic-pathways/glp_1_pathway",
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "PUT",
      headers: expect.objectContaining({
        Authorization: "Bearer admin-token",
      }),
    });
  });
});
