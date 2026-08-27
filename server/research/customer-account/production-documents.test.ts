import { describe, expect, it } from "vitest";

import type { PlanDocumentRow } from "../documents";
import { createPlanDocumentsSource } from "./production-documents";

function docRow(overrides: Partial<PlanDocumentRow>): PlanDocumentRow {
  return {
    id: "doc-1",
    member_id: "member-1",
    type: "blueprint_pdf",
    title: "Research Blueprint",
    version: 1,
    template_version: "v1",
    checksum_sha256: "0".repeat(64),
    storage_path: "private/member-1/doc-1.pdf",
    status: "current",
    supersedes_document_id: null,
    reviewed_by: "Samuel",
    published_at: "2026-08-20T10:00:00.000Z",
    acknowledged_at: null,
    created_at: "2026-08-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("plan-documents source", () => {
  it("answers [] while the document capability pair is off", async () => {
    const source = createPlanDocumentsSource({
      listRows: async () => [docRow({})],
      getRow: async () => docRow({}),
      accessEnabled: () => false,
    });
    expect(await source.documentsFor("member-1")).toEqual([]);
    expect(await source.openDocument?.("member-1", "doc-1")).toBeNull();
  });

  it("lists current documents with an EMPTY downloadPath when no byte reader is composed", async () => {
    const source = createPlanDocumentsSource({
      listRows: async () => [docRow({}), docRow({ id: "doc-2", status: "archived" })],
      getRow: async () => docRow({}),
      accessEnabled: () => true,
    });
    const documents = await source.documentsFor("member-1");
    expect(documents).toHaveLength(1);
    expect(documents[0].id).toBe("doc-1");
    expect(documents[0].kind).toBe("membership_document");
    // No byte reader ⇒ no claimed download; the client renders its honest
    // "Download unavailable" state for an empty path.
    expect(documents[0].downloadPath).toBe("");
    // and storage_path never crosses the boundary
    expect(JSON.stringify(documents)).not.toContain("private/member-1");
  });

  it("claims a portal download path only when bytes are actually readable", async () => {
    const source = createPlanDocumentsSource({
      listRows: async () => [docRow({})],
      getRow: async (memberId, documentId) =>
        memberId === "member-1" && documentId === "doc-1" ? docRow({}) : null,
      readBytes: async (storagePath) =>
        storagePath === "private/member-1/doc-1.pdf"
          ? { bytes: new Uint8Array([1, 2, 3]), contentType: "application/pdf" }
          : null,
      accessEnabled: () => true,
    });
    const documents = await source.documentsFor("member-1");
    expect(documents[0].downloadPath).toBe(
      "/api/research/customer-account/documents/doc-1",
    );
    const opened = await source.openDocument?.("member-1", "doc-1");
    expect(opened?.contentType).toBe("application/pdf");
    expect(Array.from(opened?.bytes ?? [])).toEqual([1, 2, 3]);
  });

  it("keeps ownership inside the query: a foreign id reads as missing", async () => {
    const source = createPlanDocumentsSource({
      listRows: async () => [],
      getRow: async (memberId, documentId) =>
        memberId === "member-1" && documentId === "doc-1" ? docRow({}) : null,
      readBytes: async () => ({ bytes: new Uint8Array([1]), contentType: "application/pdf" }),
      accessEnabled: () => true,
    });
    expect(await source.openDocument?.("member-2", "doc-1")).toBeNull();
    expect(await source.openDocument?.("member-1", "doc-other")).toBeNull();
  });

  it("refuses an archived document's bytes", async () => {
    const source = createPlanDocumentsSource({
      listRows: async () => [],
      getRow: async () => docRow({ status: "archived" }),
      readBytes: async () => ({ bytes: new Uint8Array([1]), contentType: "application/pdf" }),
      accessEnabled: () => true,
    });
    expect(await source.openDocument?.("member-1", "doc-1")).toBeNull();
  });

  it("PROPAGATES a failed durable read instead of rendering an empty lie", async () => {
    const source = createPlanDocumentsSource({
      listRows: async () => {
        throw new Error("documents_read_failed");
      },
      getRow: async () => null,
      accessEnabled: () => true,
    });
    await expect(source.documentsFor("member-1")).rejects.toThrow("documents_read_failed");
  });
});
