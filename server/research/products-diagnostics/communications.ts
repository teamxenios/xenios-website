export const RESEARCH_EMAIL_FROM =
  "Xenios Research <research@xeniostechnology.com>";
export const RESEARCH_EMAIL_REPLY_TO = "research@xeniostechnology.com";

export const PRODUCT_DIAGNOSTIC_EMAIL_EVENTS = [
  "order_confirmation",
  "shipment",
  "delivery_inspection",
  "documentation_available",
  "product_request_confirmation",
  "product_request_update",
  "supplement_launch",
  "superpower_launch",
  "metabolic_pathway_launch",
  "biomarker_reminder",
] as const;
export type ProductDiagnosticEmailEvent =
  (typeof PRODUCT_DIAGNOSTIC_EMAIL_EVENTS)[number];
export const PRODUCT_DIAGNOSTIC_TEMPLATE_PREFIX = "product_diagnostic:";

const PAYLOAD_ALLOWLIST: Record<ProductDiagnosticEmailEvent, readonly string[]> = {
  order_confirmation: ["firstName", "orderReference", "memberAreaUrl"],
  shipment: ["firstName", "orderReference", "trackingReference", "memberAreaUrl"],
  delivery_inspection: ["firstName", "orderReference", "memberAreaUrl"],
  documentation_available: ["firstName", "documentLabel", "memberAreaUrl"],
  product_request_confirmation: ["firstName", "requestReference", "memberAreaUrl"],
  product_request_update: ["firstName", "requestReference", "memberAreaUrl"],
  supplement_launch: ["firstName", "supplementCategory", "memberAreaUrl"],
  superpower_launch: ["firstName", "offerLabel", "memberAreaUrl"],
  metabolic_pathway_launch: ["firstName", "pathwayLabel", "memberAreaUrl"],
  biomarker_reminder: ["firstName", "nextStep", "memberAreaUrl"],
};

export interface ProductDiagnosticEmailIntent {
  eventKey: string;
  eventType: ProductDiagnosticEmailEvent;
  recipient: string;
  from: typeof RESEARCH_EMAIL_FROM;
  replyTo: typeof RESEARCH_EMAIL_REPLY_TO;
  subject: string;
  text: string;
  safePayload: Record<string, string>;
  createdAt: string;
}

export interface ProductDiagnosticEmailStore {
  get(eventKey: string): Promise<ProductDiagnosticEmailIntent | null>;
  save(intent: ProductDiagnosticEmailIntent): Promise<void>;
}

export class MemoryProductDiagnosticEmailStore
  implements ProductDiagnosticEmailStore
{
  readonly intents = new Map<string, ProductDiagnosticEmailIntent>();
  async get(eventKey: string): Promise<ProductDiagnosticEmailIntent | null> {
    return this.intents.get(eventKey) ?? null;
  }
  async save(intent: ProductDiagnosticEmailIntent): Promise<void> {
    this.intents.set(intent.eventKey, intent);
  }
}

export function safeProductDiagnosticPayload(
  eventType: ProductDiagnosticEmailEvent,
  payload: Record<string, unknown>,
): Record<string, string> {
  return Object.fromEntries(
    PAYLOAD_ALLOWLIST[eventType].flatMap((key) => {
      const value = payload[key];
      return typeof value === "string" && value.trim()
        ? [[key, value.trim().slice(0, 300)]]
        : [];
    }),
  );
}

function render(
  eventType: ProductDiagnosticEmailEvent,
  payload: Record<string, string>,
): { subject: string; text: string } {
  const firstName = payload.firstName || "there";
  const url = payload.memberAreaUrl || "https://xeniostechnology.com/research/member";
  const templates: Record<
    ProductDiagnosticEmailEvent,
    { subject: string; line: string }
  > = {
    order_confirmation: {
      subject: "Your Xenios Research order is confirmed",
      line: `Order ${payload.orderReference || "reference unavailable"} is confirmed. Review its current status in your private member area.`,
    },
    shipment: {
      subject: "Your Xenios Research order has shipped",
      line: `Order ${payload.orderReference || "reference unavailable"} has a shipment update. Tracking reference: ${payload.trackingReference || "available in your member area"}.`,
    },
    delivery_inspection: {
      subject: "Inspect your Xenios Research delivery",
      line: `Order ${payload.orderReference || "reference unavailable"} is marked delivered. Inspect the package and report damage, missing items, or a temperature concern from the order page.`,
    },
    documentation_available: {
      subject: "Product documentation is available",
      line: `${payload.documentLabel || "Product documentation"} is available through your private member area. It is not attached to this email.`,
    },
    product_request_confirmation: {
      subject: "Your product request was received",
      line: `Product request ${payload.requestReference || "reference unavailable"} was received. A request is a demand signal, not an order or availability promise.`,
    },
    product_request_update: {
      subject: "Your product request has an update",
      line: `Product request ${payload.requestReference || "reference unavailable"} has a meaningful update in your private member area.`,
    },
    supplement_launch: {
      subject: "A supplement category is now available",
      line: `${payload.supplementCategory || "A supplement category"} has a launch update. Review current product, price, stock, and documentation details before deciding.`,
    },
    superpower_launch: {
      subject: "Superpower Diagnostics has an update",
      line: `${payload.offerLabel || "Superpower Diagnostics"} has a launch update. Review current collection, availability, effective-date, price, and disclosure details.`,
    },
    metabolic_pathway_launch: {
      subject: "A clinician-guided care pathway has an update",
      line: `${payload.pathwayLabel || "A clinician-guided pathway"} has an update. Eligibility and care decisions remain with the qualified clinical team.`,
    },
    biomarker_reminder: {
      subject: "Your Biomarker Center has a reminder",
      line: `${payload.nextStep || "A next step is available"} in your private Biomarker Center. This email contains no results or medical interpretation.`,
    },
  };
  const selected = templates[eventType];
  return {
    subject: selected.subject,
    text: `Hi ${firstName},\n\n${selected.line}\n\nOpen your member area: ${url}\n\nXenios Research\nresearch@xeniostechnology.com`,
  };
}

export function productDiagnosticTemplateKey(
  eventType: ProductDiagnosticEmailEvent,
): string {
  return `${PRODUCT_DIAGNOSTIC_TEMPLATE_PREFIX}${eventType}`;
}

export function renderProductDiagnosticOutboxEmail(
  templateKey: string,
  payload: Record<string, unknown>,
): { subject: string; text: string } | null {
  if (!templateKey.startsWith(PRODUCT_DIAGNOSTIC_TEMPLATE_PREFIX)) return null;
  const eventType = templateKey.slice(
    PRODUCT_DIAGNOSTIC_TEMPLATE_PREFIX.length,
  ) as ProductDiagnosticEmailEvent;
  if (!PRODUCT_DIAGNOSTIC_EMAIL_EVENTS.includes(eventType)) return null;
  return render(eventType, safeProductDiagnosticPayload(eventType, payload));
}

export class ProductDiagnosticEmailService {
  constructor(
    private readonly store: ProductDiagnosticEmailStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createIntent(input: {
    eventKey: string;
    eventType: ProductDiagnosticEmailEvent;
    recipient: string;
    payload: Record<string, unknown>;
  }): Promise<{ created: boolean; intent: ProductDiagnosticEmailIntent }> {
    const existing = await this.store.get(input.eventKey);
    if (existing) return { created: false, intent: existing };
    const payload = safeProductDiagnosticPayload(input.eventType, input.payload);
    const message = render(input.eventType, payload);
    const intent: ProductDiagnosticEmailIntent = {
      eventKey: input.eventKey,
      eventType: input.eventType,
      recipient: input.recipient,
      from: RESEARCH_EMAIL_FROM,
      replyTo: RESEARCH_EMAIL_REPLY_TO,
      subject: message.subject,
      text: message.text,
      safePayload: payload,
      createdAt: this.now().toISOString(),
    };
    await this.store.save(intent);
    return { created: true, intent };
  }
}

