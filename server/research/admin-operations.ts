import type { Express, Request, Response } from "express";
import { requireSupabaseAdmin } from "../routes";
import { getSupabaseAdmin, supabaseConfigured } from "../supabase";

// ---------------------------------------------------------------------------
// xenios research operations console: the admin READ surfaces that the adminx
// pages have always called and that no module ever registered.
//
// The audit that produced this file counted the /api/admin/research/* paths
// client/src/research/adapters/adminOps.ts spells out and compared them with
// the routes the server actually registers. Nine of them matched nothing, so
// the pages behind them (members, member detail, orders, order detail,
// questions, question detail, audit, fulfillment, inventory) rendered their
// "publishes later" pending panel forever: the client asked, the SPA
// catch-all answered, lib/api read that as { kind: "unavailable" }, and the
// panel was a permanent 404 wearing a polite face.
//
// Three rules shape everything here, and they are the reason this module owns
// no table and writes nothing:
//
// 1. READ ONLY. Every route is a GET. The modules that own each state machine
//    keep their writes (applications in membership.ts, order transitions in
//    commerce/routes.ts, question answers in questions.ts). A projection that
//    could also mutate would quietly become a second source of truth.
//
// 2. DEFENSIVE READS. These tables land with different waves, so a missing
//    table, a permissions error, or a thrown client reads as EMPTY, never a
//    500 on Samuel's console. An empty list is the truthful answer to "what is
//    in this queue"; a stack trace is not.
//
// 3. NOTHING IS INVENTED. A field the schema does not carry is serialized as
//    null and the page renders its own "Not recorded" copy. There is no
//    placeholder plan name, no guessed sign-in time, no synthesized reorder
//    point. Where a page's data does not exist anywhere in the system at all
//    (billing plan records, the privacy request queue, the guide library),
//    this module deliberately registers NO route, so the page keeps its honest
//    pending panel instead of showing a confident empty table that would imply
//    the queue is clear.
//
// Payload discipline matches the pages' own promises: roster and order rows
// carry account and commerce metadata only, question LIST rows carry no
// question body, and audit rows reference records by id rather than by member
// email.
// ---------------------------------------------------------------------------

const MEMBERS_TABLE = "research_members";
const APPLICATIONS_TABLE = "research_applications";
const APPLICATION_EVENTS_TABLE = "research_application_events";
const AGREEMENT_ACCEPTANCES_TABLE = "research_agreement_acceptances";
const ORDERS_TABLE = "research_orders";
const ORDER_LINES_TABLE = "research_order_lines";
const ORDER_STATE_EVENTS_TABLE = "research_order_state_events";
const QUESTIONS_TABLE = "research_member_questions";
const OUTBOX_TABLE = "research_notification_outbox";
const FRAUD_FLAGS_TABLE = "referral_fraud_flags";
const FULFILLMENT_ORDERS_TABLE = "research_fulfillment_orders";
const FULFILLMENT_LINES_TABLE = "research_fulfillment_lines";
const SHIPMENTS_TABLE = "research_shipments";
const INVENTORY_LOTS_TABLE = "research_inventory_lots";
const PRODUCTS_TABLE = "research_products";

/** One page of operations data is never the whole database. */
const LIST_LIMIT = 200;
const AUDIT_LIMIT = 100;

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Defensive reads
// ---------------------------------------------------------------------------

/**
 * A missing table, a permissions error, or a thrown client all read as an
 * empty result. Waves land independently, so a surface whose source does not
 * exist yet reports nothing rather than breaking the whole admin console.
 */
async function readTable(table: string, apply?: (query: any) => any): Promise<Row[]> {
  try {
    let query: any = getSupabaseAdmin().from(table).select("*");
    if (apply) query = apply(query);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) return [];
    return data as Row[];
  } catch {
    return [];
  }
}

async function readOne(table: string, column: string, value: string): Promise<Row | null> {
  const rows = await readTable(table, (query) => query.eq(column, value).limit(1));
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Field helpers. Every one of these answers "what does the schema actually
// carry" and returns null when the answer is nothing.
// ---------------------------------------------------------------------------

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function requiredStr(value: unknown): string {
  return str(value) ?? "";
}

function int(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Underscored enum labels read as words on the console. */
function label(value: unknown): string {
  const raw = str(value);
  return raw === null ? "unknown" : raw.replace(/_/g, " ");
}

function timeOf(value: unknown): number {
  const raw = str(value);
  if (raw === null) return 0;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

function newestFirst(a: Row, b: Row, column: string): number {
  return timeOf(b[column]) - timeOf(a[column]);
}

function indexBy(rows: Row[], column: string): Map<string, Row> {
  const map = new Map<string, Row>();
  for (const row of rows) {
    const key = str(row[column]);
    if (key !== null && !map.has(key)) map.set(key, row);
  }
  return map;
}

function notConfigured(res: Response): Response {
  // 503, which lib/api reads as { kind: "unavailable" }, so the page shows the
  // pending panel it already has rather than an error.
  return res.status(503).json({ ok: false, message: "Not configured" });
}

function ok(res: Response, body: Record<string, unknown>): void {
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, ...body });
}

type Handler = (req: Request, res: Response) => Promise<void>;

/**
 * Every route shares one shape: refuse when Supabase is absent, answer with
 * no-store, and never leak an internal failure to the console.
 */
function guarded(name: string, handler: Handler): Handler {
  return async (req, res) => {
    try {
      if (!supabaseConfigured()) {
        notConfigured(res);
        return;
      }
      await handler(req, res);
    } catch (error) {
      console.error(`[research admin operations] ${name} error:`, error);
      res.status(500).json({ ok: false, message: "The request could not be completed." });
    }
  };
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

// research_members carries first_name but not last_name, so the surname comes
// from the application the member was created from. Fields the schema has no
// column for (plan records, last sign-in) stay null; the pages render their
// own "Not recorded" copy for those rather than a value nobody stored.
function memberRow(member: Row, application: Row | null): Record<string, unknown> {
  return {
    id: requiredStr(member.id),
    email: requiredStr(member.email),
    first_name: str(member.first_name),
    last_name: application === null ? null : str(application.last_name),
    status: requiredStr(member.status),
    plan: null,
    activated_at: str(member.activated_at),
    last_sign_in_at: null,
  };
}

async function listMembers(_req: Request, res: Response): Promise<void> {
  const members = (await readTable(MEMBERS_TABLE, (query) => query.limit(LIST_LIMIT))).sort((a, b) =>
    newestFirst(a, b, "created_at"),
  );
  const applications = indexBy(await readTable(APPLICATIONS_TABLE, (query) => query.limit(LIST_LIMIT)), "id");
  ok(res, {
    members: members.map((member) => memberRow(member, applications.get(requiredStr(member.application_id)) ?? null)),
  });
}

async function getMember(req: Request, res: Response): Promise<void> {
  const memberId = String(req.params.memberId ?? "");
  const member = await readOne(MEMBERS_TABLE, "id", memberId);
  if (member === null) {
    res.status(404).json({ ok: false, message: "Member not found." });
    return;
  }
  const applicationId = str(member.application_id);
  const application = applicationId === null ? null : await readOne(APPLICATIONS_TABLE, "id", applicationId);

  // Consent is the member's own agreement acceptances. A DECLINED acceptance
  // is reported with granted_at null rather than dropped, because "declined"
  // and "never asked" are different facts.
  const acceptances = (
    await readTable(AGREEMENT_ACCEPTANCES_TABLE, (query) =>
      query.eq("subject_type", "member").eq("subject_id", memberId).limit(LIST_LIMIT),
    )
  ).sort((a, b) => newestFirst(a, b, "created_at"));
  const latestByKey = new Map<string, Row>();
  for (const row of acceptances) {
    const key = str(row.agreement_key);
    if (key !== null && !latestByKey.has(key)) latestByKey.set(key, row);
  }
  const consent = Array.from(latestByKey.entries()).map(([kind, row]) => ({
    kind,
    granted_at: row.decision === "accepted" ? str(row.created_at) : null,
    version: str(row.agreement_version),
  }));

  // The account timeline is the application's own event history, which is the
  // only durable per-member event record that exists today. Internal notes are
  // deliberately excluded from the detail line: the application file is where
  // those are read, with the review context around them.
  const events =
    applicationId === null
      ? []
      : (await readTable(APPLICATION_EVENTS_TABLE, (query) => query.eq("application_id", applicationId).limit(LIST_LIMIT)))
          .sort((a, b) => timeOf(a.created_at) - timeOf(b.created_at))
          .map((row) => ({
            at: requiredStr(row.created_at),
            title: `Application ${label(row.new_status)}`,
            detail: str(row.actor_type) === null ? undefined : `by ${label(row.actor_type)}`,
          }));

  ok(res, {
    member: {
      ...memberRow(member, application),
      application_id: applicationId,
      consent,
      events,
    },
  });
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

// The console's queue tabs, mapped onto the real order states. The state is
// reported verbatim on every row; this map only decides which rows a tab
// shows, so a queue label can never rename what actually happened.
const ORDER_QUEUES: Record<string, readonly string[]> = {
  pending: ["draft", "checkout_pending", "manual_review", "approved"],
  paid: ["payment_authorized", "payment_captured"],
  fulfilling: ["processing", "partially_fulfilled"],
  shipped: ["fulfilled", "delivered"],
  cancelled: ["cancelled", "refunded", "replaced"],
};

async function listOrders(req: Request, res: Response): Promise<void> {
  const queue = typeof req.query.status === "string" ? req.query.status : "";
  const states = ORDER_QUEUES[queue];
  const orders = (
    await readTable(ORDERS_TABLE, (query) => (states ? query.in("state", [...states]) : query).limit(LIST_LIMIT))
  ).sort((a, b) => newestFirst(a, b, "created_at"));
  if (orders.length === 0) {
    ok(res, { orders: [] });
    return;
  }
  const members = indexBy(await readTable(MEMBERS_TABLE, (query) => query.limit(LIST_LIMIT)), "id");
  const lines = await readTable(ORDER_LINES_TABLE, (query) => query.limit(LIST_LIMIT * 10));
  const lineCounts = new Map<string, number>();
  for (const line of lines) {
    const orderId = str(line.order_id);
    if (orderId === null) continue;
    lineCounts.set(orderId, (lineCounts.get(orderId) ?? 0) + 1);
  }
  ok(res, {
    orders: orders.map((order) => {
      const id = requiredStr(order.id);
      return {
        id,
        // The order id IS the reference this system uses for an order; there
        // is no separate human reference column to report.
        reference: id,
        member_email: requiredStr(members.get(requiredStr(order.member_id))?.email),
        status: requiredStr(order.state),
        total_cents: int(order.total_cents),
        item_count: lineCounts.get(id) ?? 0,
        // placed_at is null until an order is actually placed; created_at is
        // the honest fallback for a draft that never reached checkout.
        placed_at: str(order.placed_at) ?? requiredStr(order.created_at),
      };
    }),
  });
}

async function getOrder(req: Request, res: Response): Promise<void> {
  const orderId = String(req.params.orderId ?? "");
  const order = await readOne(ORDERS_TABLE, "id", orderId);
  if (order === null) {
    res.status(404).json({ ok: false, message: "Order not found." });
    return;
  }
  const memberId = str(order.member_id);
  const member = memberId === null ? null : await readOne(MEMBERS_TABLE, "id", memberId);
  const lines = await readTable(ORDER_LINES_TABLE, (query) => query.eq("order_id", orderId).limit(LIST_LIMIT));
  const events = (
    await readTable(ORDER_STATE_EVENTS_TABLE, (query) => query.eq("order_id", orderId).limit(LIST_LIMIT))
  ).sort((a, b) => timeOf(a.occurred_at) - timeOf(b.occurred_at));

  // Shipping is reported only from a real fulfillment record. No fulfillment
  // order means no shipping summary, which the page renders as "Not recorded".
  const fulfillment = (await readTable(FULFILLMENT_ORDERS_TABLE, (query) => query.eq("order_id", orderId).limit(4)))
    .sort((a, b) => newestFirst(a, b, "created_at"))[0] ?? null;
  const shippingSummary = fulfillment === null ? null : str(fulfillment.shipping_service);

  ok(res, {
    order: {
      id: orderId,
      reference: orderId,
      member_email: requiredStr(member?.email),
      status: requiredStr(order.state),
      total_cents: int(order.total_cents),
      placed_at: str(order.placed_at) ?? requiredStr(order.created_at),
      payment_reference: str(order.payment_reference),
      shipping_summary: shippingSummary,
      items: lines.map((line) => ({
        id: requiredStr(line.id),
        name: requiredStr(line.display_name),
        sku: str(line.sku),
        quantity: int(line.quantity),
        price_cents: int(line.unit_price_cents),
      })),
      events: events.map((event) => ({
        at: requiredStr(event.occurred_at),
        title: `${label(event.from_state)} to ${label(event.to_state)}`,
        detail: `by ${label(event.actor_type)}`,
      })),
    },
  });
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

const QUESTION_QUEUES: Record<string, readonly string[]> = {
  open: ["pending", "being_reviewed", "more_information_needed"],
  answered: ["answer_ready"],
  closed: ["completed"],
};

// A voice question stores a transcript reference in the private media table,
// not text on the row. Saying so is the truthful body; inventing a transcript
// here would put words in a member's mouth.
const VOICE_QUESTION_BODY =
  "This question arrived as a voice note. Its transcript is held in the member's private media record.";

function questionBody(row: Row): string {
  const text = str(row.body_text);
  if (text !== null) return text;
  return str(row.source) === "telegram_voice" ? VOICE_QUESTION_BODY : "";
}

async function listQuestions(req: Request, res: Response): Promise<void> {
  const queue = typeof req.query.status === "string" ? req.query.status : "";
  const states = QUESTION_QUEUES[queue];
  const questions = (
    await readTable(QUESTIONS_TABLE, (query) => (states ? query.in("status", [...states]) : query).limit(LIST_LIMIT))
  ).sort((a, b) => newestFirst(a, b, "created_at"));
  if (questions.length === 0) {
    ok(res, { questions: [] });
    return;
  }
  const members = indexBy(await readTable(MEMBERS_TABLE, (query) => query.limit(LIST_LIMIT)), "id");
  ok(res, {
    // The list carries subject metadata only. body_text never appears here,
    // because a member question can hold health context and a roster view is
    // the widest-angle read of it that exists.
    questions: questions.map((question) => ({
      id: requiredStr(question.id),
      member_email: requiredStr(members.get(requiredStr(question.member_id))?.email),
      topic: str(question.category),
      status: requiredStr(question.status),
      asked_at: requiredStr(question.created_at),
      last_activity_at: str(question.updated_at),
    })),
  });
}

async function getQuestion(req: Request, res: Response): Promise<void> {
  const questionId = String(req.params.questionId ?? "");
  const question = await readOne(QUESTIONS_TABLE, "id", questionId);
  if (question === null) {
    res.status(404).json({ ok: false, message: "Question not found." });
    return;
  }
  const memberId = str(question.member_id);
  const member = memberId === null ? null : await readOne(MEMBERS_TABLE, "id", memberId);

  // The thread is the answer, if one has been written. answered_by holds a
  // display name only, so no admin email can reach this response.
  const answer = str(question.answer_text);
  const thread =
    answer === null
      ? []
      : [
          {
            id: `${questionId}:answer`,
            author: str(question.answered_by) ?? "xenios",
            body: answer,
            at: str(question.answered_at) ?? requiredStr(question.updated_at),
          },
        ];

  ok(res, {
    question: {
      id: questionId,
      member_email: requiredStr(member?.email),
      topic: str(question.category),
      status: requiredStr(question.status),
      asked_at: requiredStr(question.created_at),
      body: questionBody(question),
      thread,
    },
  });
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

// The unified view the Audit page has always described: the three trails that
// are ALREADY recorded (application decisions, referral fraud resolutions,
// email delivery attempts) plus order state transitions, merged and sorted.
//
// Subjects are record ids, never member emails, and no note field is copied
// in. That is the page's own promise ("audit events reference records by id"),
// and it is the difference between an audit trail and a data leak.
type AuditEvent = {
  id: string;
  at: string;
  actor: string;
  action: string;
  subject: string;
  detail: string | null;
};

async function collectApplicationAudit(): Promise<AuditEvent[]> {
  const rows = await readTable(APPLICATION_EVENTS_TABLE, (query) => query.limit(AUDIT_LIMIT));
  return rows.map((row) => ({
    id: `application-event:${requiredStr(row.id)}`,
    at: requiredStr(row.created_at),
    actor: str(row.actor_id) ?? label(row.actor_type),
    action: `application ${label(row.new_status)}`,
    subject: `application ${requiredStr(row.application_id)}`,
    detail: str(row.reason_code),
  }));
}

async function collectFraudAudit(): Promise<AuditEvent[]> {
  const rows = await readTable(FRAUD_FLAGS_TABLE, (query) => query.limit(AUDIT_LIMIT));
  return rows
    .filter((row) => str(row.resolved_at) !== null)
    .map((row) => ({
      id: `fraud-flag:${requiredStr(row.id)}`,
      at: requiredStr(row.resolved_at),
      actor: str(row.resolved_by) ?? "admin",
      action: `referral flag ${label(row.resolution_action)}`,
      subject: `referral flag ${requiredStr(row.id)}`,
      detail: label(row.reason),
    }));
}

async function collectOutboxAudit(): Promise<AuditEvent[]> {
  const rows = await readTable(OUTBOX_TABLE, (query) => query.limit(AUDIT_LIMIT));
  return rows
    .filter((row) => str(row.last_attempt_at) !== null)
    .map((row) => ({
      id: `outbox:${requiredStr(row.id)}`,
      at: requiredStr(row.last_attempt_at),
      actor: "system",
      action: `email ${label(row.status)}`,
      // The recipient address is deliberately NOT the subject: the outbox row
      // id identifies the message without putting an email in an audit list.
      subject: `notification ${requiredStr(row.id)}`,
      detail: str(row.event_type),
    }));
}

async function collectOrderAudit(): Promise<AuditEvent[]> {
  const rows = await readTable(ORDER_STATE_EVENTS_TABLE, (query) => query.limit(AUDIT_LIMIT));
  return rows.map((row) => ({
    id: `order-event:${requiredStr(row.id)}`,
    at: requiredStr(row.occurred_at),
    actor: str(row.actor_id) ?? label(row.actor_type),
    action: `order ${label(row.to_state)}`,
    subject: `order ${requiredStr(row.order_id)}`,
    detail: str(row.provider_reference),
  }));
}

async function listAudit(_req: Request, res: Response): Promise<void> {
  const collected = await Promise.all([
    collectApplicationAudit(),
    collectFraudAudit(),
    collectOutboxAudit(),
    collectOrderAudit(),
  ]);
  const events = collected
    .flat()
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id))
    .slice(0, AUDIT_LIMIT);
  ok(res, { events });
}

// ---------------------------------------------------------------------------
// Fulfillment
// ---------------------------------------------------------------------------

async function listFulfillment(_req: Request, res: Response): Promise<void> {
  const orders = (await readTable(FULFILLMENT_ORDERS_TABLE, (query) => query.limit(LIST_LIMIT))).sort((a, b) =>
    newestFirst(a, b, "created_at"),
  );
  if (orders.length === 0) {
    ok(res, { shipments: [] });
    return;
  }
  const lines = await readTable(FULFILLMENT_LINES_TABLE, (query) => query.limit(LIST_LIMIT * 10));
  const linesByOrder = new Map<string, Row[]>();
  for (const line of lines) {
    const key = str(line.fulfillment_order_id);
    if (key === null) continue;
    const list = linesByOrder.get(key) ?? [];
    list.push(line);
    linesByOrder.set(key, list);
  }
  const shipments = (await readTable(SHIPMENTS_TABLE, (query) => query.limit(LIST_LIMIT))).sort((a, b) =>
    newestFirst(a, b, "created_at"),
  );
  const shipmentByOrder = indexBy(shipments, "fulfillment_order_id");

  ok(res, {
    shipments: orders.map((order) => {
      const id = requiredStr(order.id);
      const shipment = shipmentByOrder.get(id) ?? null;
      return {
        id,
        fulfillment_order_id: id,
        order_reference: requiredStr(order.order_id),
        // The stage is the stored state, verbatim. The console maps the states
        // it recognizes into the partner view and ignores the rest; renaming a
        // state here to make it render would be a lie about a shipment.
        stage: requiredStr(order.state),
        supplier_id: str(order.owner),
        supplier_label: str(order.owner),
        expected_ship_at: str(order.submitted_at),
        recipient_name: str(order.recipient_name),
        address_city: str(order.address_city),
        address_state: str(order.address_state),
        address_postal_code: str(order.address_postal_code),
        address_country: str(order.address_country),
        shipping_service: str(order.shipping_service),
        handling_profile: str(order.handling_profile),
        lines: (linesByOrder.get(id) ?? []).map((line) => ({
          id: requiredStr(line.id),
          sku: requiredStr(line.sku),
          quantity: int(line.quantity),
          lot_id: requiredStr(line.lot_id),
          lot_code: requiredStr(line.lot_id),
        })),
        label_reference: str(order.partner_reference),
        carrier: shipment === null ? null : str(shipment.carrier),
        tracking_reference: shipment === null ? null : str(shipment.tracking_number),
        updated_at: str(order.updated_at),
      };
    }),
  });
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

// Lots that represent stock the business physically holds. Shipped, expired,
// destroyed, and recalled lots are excluded because counting them as on hand
// would overstate what can actually be sent.
const ON_HAND_DISPOSITIONS = new Set([
  "available",
  "allocated",
  "picked",
  "packed",
  "quarantined",
  "quality_hold",
  "temperature_hold",
  "damaged",
]);

/** Committed to an order but not yet shipped. */
const RESERVED_DISPOSITIONS = new Set(["allocated", "picked", "packed"]);

async function listInventory(_req: Request, res: Response): Promise<void> {
  const lots = await readTable(INVENTORY_LOTS_TABLE, (query) => query.limit(LIST_LIMIT * 5));
  if (lots.length === 0) {
    ok(res, { inventory: [] });
    return;
  }
  const products = indexBy(await readTable(PRODUCTS_TABLE, (query) => query.limit(LIST_LIMIT * 5)), "sku");

  const bySku = new Map<string, { on_hand: number; reserved: number; updated_at: string | null }>();
  for (const lot of lots) {
    const sku = str(lot.sku);
    const disposition = str(lot.disposition);
    if (sku === null || disposition === null || !ON_HAND_DISPOSITIONS.has(disposition)) continue;
    const quantity = int(lot.quantity_available);
    const entry = bySku.get(sku) ?? { on_hand: 0, reserved: 0, updated_at: null };
    entry.on_hand += quantity;
    if (RESERVED_DISPOSITIONS.has(disposition)) entry.reserved += quantity;
    const updated = str(lot.updated_at);
    if (updated !== null && (entry.updated_at === null || timeOf(updated) > timeOf(entry.updated_at))) {
      entry.updated_at = updated;
    }
    bySku.set(sku, entry);
  }

  ok(res, {
    inventory: Array.from(bySku.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([sku, totals]) => ({
        id: sku,
        sku,
        // The catalog display name when the SKU is in the catalog. When it is
        // not, the SKU stands for itself rather than a name nobody recorded.
        product_name: str(products.get(sku)?.display_name) ?? sku,
        on_hand: totals.on_hand,
        reserved: totals.reserved,
        // No reorder point is stored on a lot, so none is reported. The page
        // treats null as "no threshold set" instead of showing a low-stock
        // warning against a number this module made up.
        reorder_point: null,
        updated_at: totals.updated_at,
      })),
  });
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerAdminOperationsApi(app: Express): void {
  app.get("/api/admin/research/members", requireSupabaseAdmin, guarded("members", listMembers));
  app.get("/api/admin/research/members/:memberId", requireSupabaseAdmin, guarded("member detail", getMember));

  app.get("/api/admin/research/orders", requireSupabaseAdmin, guarded("orders", listOrders));
  app.get("/api/admin/research/orders/:orderId", requireSupabaseAdmin, guarded("order detail", getOrder));

  app.get("/api/admin/research/questions", requireSupabaseAdmin, guarded("questions", listQuestions));
  app.get("/api/admin/research/questions/:questionId", requireSupabaseAdmin, guarded("question detail", getQuestion));

  app.get("/api/admin/research/audit", requireSupabaseAdmin, guarded("audit", listAudit));
  app.get("/api/admin/research/fulfillment", requireSupabaseAdmin, guarded("fulfillment", listFulfillment));
  app.get("/api/admin/research/inventory", requireSupabaseAdmin, guarded("inventory", listInventory));
}
