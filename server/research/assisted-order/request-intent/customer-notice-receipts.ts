import {
  resendDeliveryKind,
  resendWebhookVerifier,
  type ResendDeliveryKind,
  type ResendWebhookVerifier,
} from "../../email/resend-webhook-signature.mjs";
import * as quoteMail from "../quote/delivery/mail.mjs";
import { getSupabaseAdmin } from "../../../supabase";

// The customer-notice receipt channel on the one signed receipt endpoint. The
// quote channel sees each verified event first; an event it does not claim
// comes here. This channel records a provider report as four facts. The
// database joins it to a notice only when the evidence is read, through the
// provider message id that the notice's own outbox job stored, so the order in
// which the report and the send's id are committed does not matter. It never
// matches by subject, sender or address, stores none of them, and records no
// event that names more than one recipient, so a report about a set of
// recipients is never taken as evidence about one customer.
//
// Accepted, delivered and bounced are the provider's reports. None of them
// means the customer read the notice.

export const CUSTOMER_NOTICE_RECEIPT_RECORD_RPC = "request_intent_customer_notice_receipt_record";

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

// The one mailbox check the quote channel already applies to this same
// provider field (quote/delivery/mail.mjs). It accepts the provider's casing.
// Its declaration file does not list it, so it is read here by name.
const verifiedAddress = (quoteMail as unknown as { verifiedAddress?: (value: unknown) => boolean }).verifiedAddress;
if (typeof verifiedAddress !== "function") throw new Error("Customer notice receipts need the shared address check.");

export type CustomerNoticeReceipt = Readonly<{
  /** The signed provider event id. */
  eventId: string;
  /** The provider message id, lower case. */
  messageId: string;
  kind: ResendDeliveryKind;
  /** sha256 hex of the exact signed bytes. */
  digest: string;
}>;

/** recorded: first time this event was seen. replayed: the same event, same facts. */
export type ReceiptDisposition = "recorded" | "replayed";

export class CustomerNoticeReceiptConflict extends Error {
  constructor() {
    super("customer_notice_receipt_identity_conflict");
  }
}

export type CustomerNoticeReceiptRecorder = (receipt: CustomerNoticeReceipt) => Promise<ReceiptDisposition>;

/** Records one receipt through the backend-only database function. */
export const recordCustomerNoticeReceipt: CustomerNoticeReceiptRecorder = async (receipt) => {
  const { data, error } = await getSupabaseAdmin().rpc(CUSTOMER_NOTICE_RECEIPT_RECORD_RPC, {
    p_provider_event_id: receipt.eventId,
    p_provider_message_id: receipt.messageId,
    p_kind: receipt.kind,
    p_digest: receipt.digest,
  });
  if (error) {
    if ((error as { code?: unknown }).code === "23505") throw new CustomerNoticeReceiptConflict();
    throw new Error("customer notice receipt not recorded");
  }
  if (data !== "recorded" && data !== "replayed") throw new Error("customer notice receipt not recorded");
  return data;
};

export type ReceiptResponse = { status: 204 | 400 | 409 | 503 };

/**
 * Receives one provider request: the exact bytes and the raw header list.
 * 204 acknowledges it, whether or not it belongs to a notice (that is decided
 * when the evidence is read). 400 is an event
 * whose signature or shape is invalid, 409 a replayed event id carrying
 * different facts, and 503 a database failure, which the provider retries.
 */
export function createCustomerNoticeReceipts(options: {
  verify: ResendWebhookVerifier;
  record?: CustomerNoticeReceiptRecorder;
}) {
  const { verify } = options;
  const record = options.record ?? recordCustomerNoticeReceipt;
  if (typeof verify !== "function" || typeof record !== "function") throw new Error("Customer notice receipts need a verifier.");

  async function receive(bytes: Buffer, headers: readonly string[]): Promise<ReceiptResponse> {
    let verified: ReturnType<ResendWebhookVerifier>;
    try {
      verified = verify(bytes, headers);
    } catch {
      return { status: 400 };
    }
    const kind = resendDeliveryKind(verified.event.type);
    if (!kind) return { status: 204 };
    const data = verified.event.data as { email_id?: unknown; to?: unknown } | undefined;
    if (typeof data?.email_id !== "string" || !UUID.test(data.email_id) || !Array.isArray(data.to)) return { status: 400 };
    // A customer notice has exactly one recipient. A report about any other
    // set is not evidence about one customer, so it is not recorded.
    if (data.to.length !== 1) return { status: 204 };
    // That one recipient must be a mailbox. It is checked here and then
    // dropped: no address is stored, logged or passed to the recorder.
    if (!verifiedAddress(data.to[0])) return { status: 400 };
    try {
      await record({ eventId: verified.eid, messageId: data.email_id.toLowerCase(), kind, digest: verified.digest });
      return { status: 204 };
    } catch (error) {
      return { status: error instanceof CustomerNoticeReceiptConflict ? 409 : 503 };
    }
  }

  return { receive };
}

/** The channel for the receipt endpoint, verifying with the endpoint's own secrets. */
export function customerNoticeReceiptChannel(secrets: readonly string[], record?: CustomerNoticeReceiptRecorder) {
  return createCustomerNoticeReceipts({ verify: resendWebhookVerifier({ secrets }), record });
}
