import {
  insertLoi,
  listLoi,
  type LoiInput,
  type LoiRow,
} from "../../supabase-store";
import { supabaseConfigured } from "../../supabase";
import { verifyTurnstile } from "../../turnstile";
import { rateLimitHit } from "../rate-limit";
import { enqueuePublicInquiryNotifications } from "./notifications";
import {
  isPublicInquiryOperationsRow,
  parsePublicInquiryPayload,
} from "./classifier";
import {
  inquiryRecordMatchesContent,
  type DurableInquiryReceipt,
  type DurableInquiryRecord,
  type ResearchInquiryDependencies,
} from "./service";

type InquiryLoiStore = Readonly<{
  insert(input: LoiInput): Promise<LoiRow>;
  list(): Promise<LoiRow[]>;
}>;

export async function persistInquiryWithLoiStore(
  record: DurableInquiryRecord,
  store: InquiryLoiStore,
): Promise<DurableInquiryReceipt> {
  const contentHash = parsePublicInquiryPayload(record.why_interested)?.contentHash;
  if (!contentHash) throw new Error("Inquiry persistence payload is invalid");
  try {
    const row = await store.insert(record);
    if (
      row.id !== record.id ||
      !isPublicInquiryOperationsRow(row) ||
      !inquiryRecordMatchesContent(row, contentHash)
    ) {
      throw new Error("Inquiry persistence returned a mismatched row");
    }
    return { id: row.id, createdAt: row.created_at, replayed: false };
  } catch (error) {
    // A lost insert acknowledgement and a concurrent duplicate look identical
    // to the caller. Resolve both from durable storage before deciding whether
    // the submission is uncertain. The deterministic UUID makes this race safe.
    const existing = (await store.list()).find((row) => row.id === record.id);
    if (
      existing &&
      isPublicInquiryOperationsRow(existing) &&
      inquiryRecordMatchesContent(existing, contentHash)
    ) {
      return { id: existing.id, createdAt: existing.created_at, replayed: true };
    }
    throw error;
  }
}

export function buildProductionResearchInquiryDependencies(): ResearchInquiryDependencies {
  return {
    persistenceReady: supabaseConfigured,
    async allowRequest(ip) {
      return rateLimitHit(`public-inquiry:${ip}`, 15 * 60, 5, {
        durableFailurePolicy: "deny",
      });
    },
    verifyHuman: verifyTurnstile,
    async persist(record) {
      return persistInquiryWithLoiStore(record, {
        insert: insertLoi,
        list: listLoi,
      });
    },
    notify: enqueuePublicInquiryNotifications,
  };
}
