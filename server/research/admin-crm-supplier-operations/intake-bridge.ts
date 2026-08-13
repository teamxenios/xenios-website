import { createHash } from "node:crypto";
import {
  RESEARCH_INTAKE_ADDRESS,
  type ResearchIntakeCategory,
  type ResearchIntakeItem,
} from "@shared/research/admin-crm-supplier-operations";

export interface ResearchMailboxEnvelope {
  messageId: string;
  recipientAddress: string;
  senderAddress: string;
  subject: string;
  plainText: string;
  receivedAt: string;
}

export interface ResearchIntakeBridgeRepository {
  /** Persist intake plus the corresponding observed audit event atomically. */
  saveIntakeWithAudit(item: ResearchIntakeItem, sourceFingerprint: string): Promise<ResearchIntakeItem>;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFETY = /\b(emergency|911|adverse event|reaction|diagnos(?:is|ed)|chest pain|suicid(?:e|al)|overdose)\b/i;
const EXCEPTION = /\b(exception|damaged|missing|wrong item|recall|complaint|lost)\b/i;
const TRACKING = /\b(track(?:ing)?|carrier|shipment|where is my order|delivery)\b/i;
const SUPPLIER = /\b(supplier|fulfill(?:ment)?|warehouse|packing|lot|coa)\b/i;
const PAYMENT = /\b(invoice|payment|paid|wire|ach|receipt|refund|charge)\b/i;
const PRICE = /\b(price|pricing|quote|cost|margin|discount)\b/i;
const AVAILABILITY = /\b(availability|available|inventory|stock|lead time|backorder)\b/i;
const ORGANIZATION = /\b(organization|company|clinic|wholesale|reseller|b2b|purchase order|procurement)\b/i;
const BUYER = /\b(buy|buyer|purchase|order|interested|customer)\b/i;

function normalizedAddress(value: string): string {
  return value.trim().toLowerCase();
}

function categoryFor(text: string): ResearchIntakeCategory {
  if (SAFETY.test(text)) return "safety_escalation";
  if (EXCEPTION.test(text)) return "operations_exception";
  if (TRACKING.test(text)) return "tracking";
  if (SUPPLIER.test(text)) return "supplier_fulfillment";
  if (PAYMENT.test(text)) return "invoice_payment";
  if (PRICE.test(text)) return "price";
  if (AVAILABILITY.test(text)) return "availability";
  if (ORGANIZATION.test(text)) return "b2b_organization";
  if (BUYER.test(text)) return "buyer";
  return "unclassified";
}

export class ResearchIntakeRefusal extends Error {}

export function createResearchMailboxIntakeBridge(repository: ResearchIntakeBridgeRepository) {
  return async (envelope: ResearchMailboxEnvelope): Promise<ResearchIntakeItem> => {
    if (normalizedAddress(envelope.recipientAddress) !== RESEARCH_INTAKE_ADDRESS) {
      throw new ResearchIntakeRefusal("The bridge only accepts the canonical research intake address.");
    }
    const senderAddress = normalizedAddress(envelope.senderAddress);
    if (!EMAIL.test(senderAddress)) throw new ResearchIntakeRefusal("Sender address is invalid.");
    if (!envelope.messageId.trim() || envelope.messageId.length > 500) {
      throw new ResearchIntakeRefusal("Message identity is invalid.");
    }
    const received = new Date(envelope.receivedAt);
    if (!Number.isFinite(received.getTime()) || received.toISOString() !== envelope.receivedAt) {
      throw new ResearchIntakeRefusal("Received timestamp must be normalized UTC.");
    }

    const subject = envelope.subject.replace(/[\r\n\t]+/g, " ").trim().slice(0, 240) || "No subject";
    const classificationText = `${subject}\n${envelope.plainText.slice(0, 4000)}`;
    const category = categoryFor(classificationText);
    const sourceFingerprint = createHash("sha256")
      .update(`${normalizedAddress(envelope.recipientAddress)}\n${envelope.messageId.trim()}`)
      .digest("hex");
    const item: ResearchIntakeItem = {
      intakeId: `mail_${sourceFingerprint.slice(0, 24)}`,
      sourceAddress: RESEARCH_INTAKE_ADDRESS,
      senderAddress,
      subject,
      category,
      urgency: category === "safety_escalation" ? "critical" : category === "operations_exception" ? "priority" : "routine",
      state: "needs_human_review",
      linkedType: null,
      linkedId: null,
      receivedAt: envelope.receivedAt,
    };

    // No reply is produced here. Intake is a recorded, human-reviewed bridge;
    // outbound remains in the existing draft/approval/send pipeline.
    return repository.saveIntakeWithAudit(item, sourceFingerprint);
  };
}
