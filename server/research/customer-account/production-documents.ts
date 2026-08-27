// Durable documents source for the customer account portal, graduated onto
// research_plan_documents (ledger row 15) — the member-scoped plan-document
// store the existing Document Center reads.
//
// Honesty rules, in order:
//   1. The listing exists only while the SAME capability pair that gates the
//      existing document surface is live (document_rendering + private_media,
//      documents.ts documentAccessEnabled). Either flag off ⇒ [] — the exact
//      answer the rest of the site gives.
//   2. downloadPath is non-empty ONLY when a byte reader is actually composed.
//      No production DocumentBytesStore adapter exists yet (documents.ts
//      selects notConfigured under NODE_ENV=production), so the production
//      wiring passes no reader, every downloadPath ships empty, and the client
//      renders its honest "Download unavailable" state instead of a button
//      that would 404. Nothing here fakes a working download.
//   3. openDocument is ownership-scoped INSIDE the query (id AND member_id),
//      so a foreign documentId is indistinguishable from a missing one.
//   4. A failed durable read THROWS (ports contract) — never an empty lie.
//
// storage_path never crosses this module's boundary: the DTO carries a
// server-authorized portal path, and bytes are fetched by storage key
// server-side only.

import type { DocumentSummaryDto } from "@shared/research/customer-account/contract";
import { getSupabaseAdmin } from "../../supabase";
import { PLAN_DOCUMENTS_TABLE, documentAccessEnabled, type PlanDocumentRow } from "../documents";
import type { CustomerDocumentBytes, CustomerDocumentsPort } from "./ports";
import { CUSTOMER_ACCOUNT_PATHS } from "./routes";

export type PlanDocumentsSourceDeps = Readonly<{
  /** Throws when the durable read fails — never swallows into []. */
  listRows: (memberId: string) => Promise<readonly PlanDocumentRow[]>;
  /** Ownership-scoped single read: (memberId, documentId) or null. */
  getRow: (memberId: string, documentId: string) => Promise<PlanDocumentRow | null>;
  /** Byte reader by storage key. ABSENT means downloads are not available. */
  readBytes?: (storagePath: string) => Promise<Readonly<{
    bytes: Uint8Array;
    contentType: string;
  }> | null>;
  /** Capability gate; defaults to the shared documentAccessEnabled pair. */
  accessEnabled?: () => boolean;
}>;

function toSummary(row: PlanDocumentRow, downloadable: boolean): DocumentSummaryDto {
  return {
    id: row.id,
    // Plan documents are membership records; receipts/COAs graduate through
    // their own sources later and carry their own kinds when they do.
    kind: "membership_document",
    title: row.title,
    issuedAt: row.published_at,
    downloadPath: downloadable ? `${CUSTOMER_ACCOUNT_PATHS.documents}/${row.id}` : "",
  };
}

export function createPlanDocumentsSource(deps: PlanDocumentsSourceDeps): CustomerDocumentsPort {
  const enabled = deps.accessEnabled ?? documentAccessEnabled;
  const downloadable = typeof deps.readBytes === "function";
  return {
    async documentsFor(memberKey) {
      if (!enabled()) return [];
      const rows = await deps.listRows(memberKey);
      return rows
        .filter((row) => row.status === "current")
        .slice()
        .sort((a, b) => (a.published_at < b.published_at ? 1 : a.published_at > b.published_at ? -1 : 0))
        .map((row) => toSummary(row, downloadable));
    },
    async openDocument(memberKey, documentId): Promise<CustomerDocumentBytes | null> {
      if (!enabled() || !deps.readBytes) return null;
      const row = await deps.getRow(memberKey, documentId);
      if (row === null || row.status !== "current") return null;
      const stored = await deps.readBytes(row.storage_path);
      if (stored === null) return null;
      return { bytes: stored.bytes, contentType: stored.contentType, filename: row.title };
    },
  };
}

/**
 * The production wiring: Supabase-backed rows, NO byte reader — a real
 * production DocumentBytesStore adapter does not exist yet, so every listed
 * document honestly ships downloadPath "" until one is composed here.
 */
export function createSupabasePlanDocumentsSource(): CustomerDocumentsPort {
  return createPlanDocumentsSource({
    async listRows(memberId) {
      const { data, error } = await getSupabaseAdmin()
        .from(PLAN_DOCUMENTS_TABLE)
        .select("*")
        .eq("member_id", memberId);
      if (error || !Array.isArray(data)) throw new Error("documents_read_failed");
      return data as PlanDocumentRow[];
    },
    async getRow(memberId, documentId) {
      const { data, error } = await getSupabaseAdmin()
        .from(PLAN_DOCUMENTS_TABLE)
        .select("*")
        .eq("id", documentId)
        .eq("member_id", memberId)
        .maybeSingle();
      if (error) throw new Error("documents_read_failed");
      return (data as PlanDocumentRow | null) ?? null;
    },
  });
}
