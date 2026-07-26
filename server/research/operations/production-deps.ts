import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../supabase";
import type {
  AffiliateDashboard,
  AffiliateLink,
  AffiliateResult,
} from "./affiliate-service";
import type { CrmContact, CrmEvent, CrmResult, CrmStage } from "./crm-service";
import type {
  FulfillmentFailureCode,
  FulfillmentResult,
  FulfillmentWorkOrder,
  MemberOrderTracking,
  MitchQueue,
  MitchQueueRow,
} from "./fulfillment-service";
import type { OutboxNotification, NotificationStatus } from "./notification-outbox";
import type { OperationsDashboardInput } from "./operations-dashboard";
import type {
  OperationsTask,
  OperationsTaskResult,
  OperationsTaskStatus,
} from "./operations-tasks";
import {
  DEFAULT_PROFESSIONAL_ECONOMIC_TERMS,
  PROFESSIONAL_PROGRAMS,
  type ProfessionalAccount,
  type ProfessionalLifecycle,
  type ProfessionalProgram,
  type ProfessionalResult,
} from "./professional-accounts";
import type {
  OperationsFulfillmentPort,
  PartnerPortalRequestKind,
  PartnerPortalSurface,
  OperationsRouteDeps,
  OperationsRouteGuards,
} from "./routes";
import type { OperationsActor, OperationsOrderState, PaymentState } from "./state-machines";

type DbError = { message: string };
type DbResult<T> = { data: T | null; error: DbError | null };

function operationsTask(row: Record<string, unknown>): OperationsTask {
  return {
    id: String(row.id),
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    status: String(row.status) as OperationsTask["status"],
    priority: String(row.priority) as OperationsTask["priority"],
    assignedTo: row.assigned_to ? String(row.assigned_to) : null,
    sourceType: row.source_type ? String(row.source_type) : null,
    sourceId: row.source_id ? String(row.source_id) : null,
    dueAt: row.due_at ? String(row.due_at) : null,
    version: Number(row.version),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

function crmContact(row: Record<string, unknown>): CrmContact {
  return {
    id: String(row.id),
    kind: String(row.kind) as CrmContact["kind"],
    displayName: String(row.display_name),
    email: String(row.email),
    stage: String(row.stage) as CrmStage,
    version: Number(row.version),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function inventoryLotDto(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(row.id),
    lotId: String(row.lot_id),
    sku: String(row.sku),
    owner: String(row.owner),
    disposition: String(row.disposition),
    quantityAvailable: Number(row.quantity_available),
    version: Number(row.version),
    expiryDate: row.expiry_date ? String(row.expiry_date) : null,
    retestDate: row.retest_date ? String(row.retest_date) : null,
    shelfLifeSource: String(row.shelf_life_source),
    excursion: String(row.excursion),
    recalled: row.recalled === true,
    updatedAt: String(row.updated_at),
  };
}

async function loadCrmContact(client: SupabaseClient, contactId: string): Promise<CrmContact | null> {
  const result = await client
    .from("research_operations_crm_contacts")
    .select("id, kind, display_name, email, stage, version, tags, created_at, updated_at")
    .eq("id", contactId)
    .maybeSingle();
  if (result.error) throw new Error(`operations CRM contact load failed: ${result.error.message}`);
  return result.data ? crmContact(result.data as Record<string, unknown>) : null;
}

async function applyCrmCommand(
  client: SupabaseClient,
  input: {
    contactId: string;
    action: "create" | "stage" | "note" | "link";
    expectedVersion: number | null;
    actor: OperationsActor;
    idempotencyKey: string;
    payload: Record<string, unknown>;
    occurredAt: Date;
  },
): Promise<CrmResult<CrmContact>> {
  const result = await client.rpc("research_operations_apply_crm_command", {
    p_contact_id: input.contactId || null,
    p_action: input.action,
    p_expected_version: input.expectedVersion,
    p_actor_id: input.actor.id,
    p_actor_role: input.actor.role,
    p_idempotency_key: input.idempotencyKey,
    p_payload: input.payload,
    p_occurred_at: input.occurredAt.toISOString(),
  });
  if (result.error) throw new Error(`operations CRM command failed: ${result.error.message}`);
  const rpc = result.data as {
    ok?: boolean;
    contactId?: string;
    idempotent?: boolean;
    code?: string;
    message?: string;
  };
  if (!rpc.ok || !rpc.contactId) {
    return {
      ok: false,
      code: (rpc.code ?? "invalid_input") as Extract<CrmResult<never>, { ok: false }>["code"],
      message: rpc.message ?? "CRM command refused.",
    };
  }
  const contact = await loadCrmContact(client, rpc.contactId);
  if (!contact) return { ok: false, code: "not_found", message: "CRM contact not found." };
  return { ok: true, value: contact, idempotent: rpc.idempotent === true };
}

function fail<T>(code: FulfillmentFailureCode, message: string): FulfillmentResult<T> {
  return { ok: false, code, message };
}

function requireData<T>(result: DbResult<T>, context: string): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${context}: no data returned`);
  return result.data;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}.`)
    .join(" ");
}

function paymentState(orderState: string): PaymentState {
  if (orderState === "refunded") return "refunded";
  if (["payment_captured", "processing", "partially_fulfilled", "fulfilled", "delivered", "replaced"].includes(orderState)) {
    return "captured";
  }
  if (["payment_authorized", "manual_review", "approved"].includes(orderState)) return "authorized";
  if (orderState === "cancelled") return "failed";
  return "pending";
}

function operationsOrderState(orderState: string): OperationsOrderState {
  if (orderState === "cancelled") return "cancelled";
  if (orderState === "refunded" || orderState === "replaced") return "returned";
  if (["fulfilled", "delivered"].includes(orderState)) return "complete";
  if (["processing", "partially_fulfilled"].includes(orderState)) return "processing";
  if (["payment_authorized", "manual_review", "approved", "payment_captured"].includes(orderState)) return "confirmed";
  return "new";
}

type WorkRow = {
  fulfillment_order_id: string;
  fulfillment_state: FulfillmentWorkOrder["aggregate"]["states"]["fulfillment"];
  shipment_state: FulfillmentWorkOrder["aggregate"]["states"]["shipment"];
  allocation_state: FulfillmentWorkOrder["aggregate"]["states"]["allocation"];
  due_at: string;
  expected_at: string | null;
  acknowledged_at: string | null;
  shipment_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

type FulfillmentRow = {
  id: string;
  order_id: string;
  recipient_name: string;
  address_state: string;
  address_postal_code: string;
};

type OrderRow = { id: string; member_id: string; state: string };
type LineRow = { id: string; sku: string; quantity: number; lot_id: string | null };
type ShipmentRow = {
  carrier: string | null;
  service: string | null;
  tracking_number: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
};
type ExceptionRow = {
  id: string;
  kind: FulfillmentWorkOrder["exceptions"][number]["kind"];
  severity: FulfillmentWorkOrder["exceptions"][number]["severity"];
  detail: string;
  status: "open" | "resolved";
  created_at: string;
  resolved_at: string | null;
};
type NoteRow = {
  id: string;
  actor_id: string;
  note: string;
  assistance_requested: boolean;
  escalation: boolean;
  created_at: string;
};

async function maybeSingle<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
  column: string,
  value: string,
): Promise<T | null> {
  const result = await client.from(table).select(columns).eq(column, value).maybeSingle();
  if (result.error) throw new Error(`${table} load failed: ${result.error.message}`);
  return (result.data as T | null) ?? null;
}

async function loadWorkOrder(client: SupabaseClient, fulfillmentOrderId: string): Promise<FulfillmentWorkOrder | null> {
  const work = await maybeSingle<WorkRow>(
    client,
    "research_fulfillment_work_orders",
    "fulfillment_order_id, fulfillment_state, shipment_state, allocation_state, due_at, expected_at, acknowledged_at, shipment_id, version, created_at, updated_at",
    "fulfillment_order_id",
    fulfillmentOrderId,
  );
  if (!work) return null;
  const fulfillment = await maybeSingle<FulfillmentRow>(
    client,
    "research_fulfillment_orders",
    "id, order_id, recipient_name, address_state, address_postal_code",
    "id",
    fulfillmentOrderId,
  );
  if (!fulfillment) return null;
  const order = await maybeSingle<OrderRow>(
    client,
    "research_orders",
    "id, member_id, state",
    "id",
    fulfillment.order_id,
  );
  if (!order) return null;

  const [lineResult, exceptionResult, noteResult, shipment] = await Promise.all([
    client
      .from("research_fulfillment_lines")
      .select("id, sku, quantity, lot_id")
      .eq("fulfillment_order_id", fulfillmentOrderId),
    client
      .from("research_fulfillment_exceptions")
      .select("id, kind, severity, detail, status, created_at, resolved_at")
      .eq("fulfillment_order_id", fulfillmentOrderId)
      .order("created_at", { ascending: true }),
    client
      .from("research_fulfillment_notes")
      .select("id, actor_id, note, assistance_requested, escalation, created_at")
      .eq("fulfillment_order_id", fulfillmentOrderId)
      .order("created_at", { ascending: true }),
    work.shipment_id
      ? maybeSingle<ShipmentRow>(
          client,
          "research_shipments",
          "carrier, service, tracking_number, shipped_at, delivered_at",
          "id",
          work.shipment_id,
        )
      : Promise.resolve(null),
  ]);
  if (lineResult.error) throw new Error(`fulfillment lines load failed: ${lineResult.error.message}`);
  if (exceptionResult.error) throw new Error(`fulfillment exceptions load failed: ${exceptionResult.error.message}`);
  if (noteResult.error) throw new Error(`fulfillment notes load failed: ${noteResult.error.message}`);

  const lines = (lineResult.data ?? []) as LineRow[];
  const exceptions = (exceptionResult.data ?? []) as ExceptionRow[];
  const notes = (noteResult.data ?? []) as NoteRow[];
  return {
    id: work.fulfillment_order_id,
    memberRef: order.member_id,
    orderReference: `XR-${order.id.slice(0, 8).toUpperCase()}`,
    recipientInitials: initials(fulfillment.recipient_name),
    destinationZone: `${fulfillment.address_state}-${fulfillment.address_postal_code.slice(0, 3)}`,
    dueAt: work.due_at,
    expectedAt: work.expected_at,
    acknowledgedAt: work.acknowledged_at,
    createdAt: work.created_at,
    updatedAt: work.updated_at,
    items: lines.map((line) => ({
      itemId: line.id,
      sku: line.sku,
      displayName: line.sku,
      quantity: line.quantity,
    })),
    aggregate: {
      id: work.fulfillment_order_id,
      version: Number(work.version),
      states: {
        payment: paymentState(order.state),
        order: operationsOrderState(order.state),
        fulfillment: work.fulfillment_state,
        shipment: work.shipment_state,
        allocation: work.allocation_state,
      },
      appliedCommands: {},
    },
    shipment:
      shipment && shipment.carrier && shipment.service && shipment.tracking_number
        ? {
            carrier: shipment.carrier,
            service: shipment.service,
            tracking: shipment.tracking_number,
            shippedAt: shipment.shipped_at,
            deliveredAt: shipment.delivered_at,
          }
        : null,
    exceptions: exceptions.map((row) => ({
      id: row.id,
      kind: row.kind,
      severity: row.severity,
      detail: row.detail,
      status: row.status,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    })),
    notes: notes.map((row) => ({
      id: row.id,
      actorId: row.actor_id,
      text: row.note,
      assistanceRequested: row.assistance_requested,
      escalation: row.escalation,
      createdAt: row.created_at,
    })),
  };
}

function queueIncludes(queue: MitchQueue, work: FulfillmentWorkOrder, asOf: Date): boolean {
  const sameDay = (value: string | null) => value?.slice(0, 10) === asOf.toISOString().slice(0, 10);
  switch (queue) {
    case "new":
      return work.aggregate.states.fulfillment === "new";
    case "awaiting_acknowledgement":
      return work.aggregate.states.fulfillment === "awaiting_acknowledgement";
    case "due_today":
      return sameDay(work.dueAt) && work.aggregate.states.fulfillment !== "shipped";
    case "picking":
      return work.aggregate.states.fulfillment === "picking";
    case "packed":
      return ["packed", "label_required", "ready_to_ship"].includes(work.aggregate.states.fulfillment);
    case "label_required":
      return work.aggregate.states.shipment === "label_required";
    case "shipped_today":
      return sameDay(work.shipment?.shippedAt ?? null);
    case "exceptions":
      return work.exceptions.some((exception) => exception.status === "open");
    case "inventory_issues":
      return (
        ["acknowledged", "picking"].includes(work.aggregate.states.fulfillment) &&
        work.aggregate.states.allocation !== "allocated"
      );
    case "samuel_decisions":
      return work.exceptions.some(
        (exception) => exception.status === "open" && exception.severity === "samuel_decision",
      );
  }
}

function queueRow(work: FulfillmentWorkOrder): MitchQueueRow {
  return {
    id: work.id,
    orderReference: work.orderReference,
    recipientInitials: work.recipientInitials,
    destinationZone: work.destinationZone,
    dueAt: work.dueAt,
    expectedAt: work.expectedAt,
    fulfillmentState: work.aggregate.states.fulfillment,
    shipmentState: work.aggregate.states.shipment,
    allocationState: work.aggregate.states.allocation,
    itemCount: work.items.length,
    openExceptionCount: work.exceptions.filter((exception) => exception.status === "open").length,
    version: work.aggregate.version,
  };
}

type CommandRpc = {
  ok: boolean;
  code?: FulfillmentFailureCode;
  message?: string;
  idempotent?: boolean;
  fulfillmentOrderId?: string;
};

function createSupabaseFulfillmentPort(client: SupabaseClient): OperationsFulfillmentPort {
  async function command(
    action: string,
    input: {
      orderId: string;
      expectedVersion: number;
      idempotencyKey: string;
      actor: OperationsActor;
      occurredAt: Date;
      [key: string]: unknown;
    },
    payload: Record<string, unknown> = {},
  ): Promise<FulfillmentResult<FulfillmentWorkOrder>> {
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(input.actor.id)) {
      return fail("forbidden", "A server-authorized Supabase identity is required.");
    }
    const result = await client.rpc("research_operations_apply_fulfillment_command", {
      p_fulfillment_order_id: input.orderId,
      p_action: action,
      p_expected_version: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey,
      p_actor_id: input.actor.id,
      p_actor_role: input.actor.role,
      p_payload: payload,
      p_occurred_at: input.occurredAt.toISOString(),
    });
    if (result.error) throw new Error(`fulfillment command failed: ${result.error.message}`);
    const rpc = result.data as CommandRpc;
    if (!rpc?.ok) return fail(rpc?.code ?? "invalid_input", rpc?.message ?? "Fulfillment command refused.");
    const work = await loadWorkOrder(client, rpc.fulfillmentOrderId ?? input.orderId);
    if (!work) return fail("not_found", "Fulfillment work order not found after the command.");
    return { ok: true, value: work, idempotent: rpc.idempotent === true };
  }

  return {
    async listMitchQueue(queue, asOf) {
      const result = await client
        .from("research_fulfillment_work_orders")
        .select("fulfillment_order_id")
        .order("due_at", { ascending: true })
        .limit(500);
      if (result.error) throw new Error(`Mitch queue load failed: ${result.error.message}`);
      const work = (
        await Promise.all(
          ((result.data ?? []) as Array<{ fulfillment_order_id: string }>).map((row) =>
            loadWorkOrder(client, row.fulfillment_order_id),
          ),
        )
      ).filter((row): row is FulfillmentWorkOrder => Boolean(row));
      return work.filter((row) => queueIncludes(queue, row, asOf)).map(queueRow);
    },
    async trackingForMember(orderId, memberRef): Promise<MemberOrderTracking | null> {
      const work = await loadWorkOrder(client, orderId);
      if (!work || work.memberRef !== memberRef) return null;
      return {
        orderReference: work.orderReference,
        fulfillmentState: work.aggregate.states.fulfillment,
        shipmentState: work.aggregate.states.shipment,
        carrier: work.shipment?.carrier ?? null,
        service: work.shipment?.service ?? null,
        tracking: work.shipment?.tracking ?? null,
        shippedAt: work.shipment?.shippedAt ?? null,
        deliveredAt: work.shipment?.deliveredAt ?? null,
        updatedAt: work.updatedAt,
      };
    },
    acknowledge: (input) => command("acknowledge", input),
    setExpectedDate: (input) => command("set_expected_date", input, { expectedAt: input.expectedAt }),
    allocateExact: (input) =>
      command("allocate_exact", input, {
        itemId: input.itemId,
        lotId: input.lotId,
        quantity: input.quantity,
        expectedLotVersion: input.expectedLotVersion,
      }),
    beginPicking: (input) => command("begin_picking", input),
    pack: (input) => command("pack", input),
    addShippingLabel: (input) =>
      command("add_label", input, {
        carrier: input.carrier,
        service: input.service,
        tracking: input.tracking,
      }),
    ship: (input) => command("ship", input),
    reportException: (input) =>
      command("exception", input, {
        kind: input.kind,
        severity: input.severity,
        detail: input.detail,
      }),
    resolveException: (input) =>
      command("resolve_exception", input, {
        exceptionId: input.exceptionId,
        resolution: input.resolution,
      }),
    addNote: (input) =>
      command("note", input, {
        text: input.text,
        assistanceRequested: input.assistanceRequested,
        escalation: input.escalation,
      }),
  };
}

async function partnerForAuth(client: SupabaseClient, authUserId: string) {
  const member = await maybeSingle<{ id: string }>(
    client,
    "research_members",
    "id",
    "auth_user_id",
    authUserId,
  );
  if (!member) return null;
  return maybeSingle<{
    id: string;
    role: string;
    state: string;
    identity_verified: boolean;
    tax_status: string;
    payout_status: string;
    certified_at: string | null;
    activated_at: string | null;
  }>(
    client,
    "research_partners",
    "id, role, state, identity_verified, tax_status, payout_status, certified_at, activated_at",
    "member_id",
    member.id,
  );
}

function affiliateLink(row: { id: string; code: string; campaign: string | null; created_at: string }, base: string): AffiliateLink {
  return {
    id: row.id,
    code: row.code,
    url: `${base.replace(/\/$/, "")}/r/${encodeURIComponent(row.code)}`,
    campaign: row.campaign,
    createdAt: row.created_at,
  };
}

async function affiliateDashboard(
  client: SupabaseClient,
  authUserId: string,
  base: string,
): Promise<AffiliateResult<AffiliateDashboard>> {
  const partner = await partnerForAuth(client, authUserId);
  if (!partner || !["active", "quality_review", "suspended"].includes(partner.state)) {
    return { ok: false, code: "login_refused", message: "No available affiliate account is linked to this login." };
  }
  const [linksResult, touchesResult, conversionsResult, ledgerResult, payoutsResult, metricEventsResult] = await Promise.all([
    client
      .from("research_partner_links")
      .select("id, code, campaign, created_at")
      .eq("partner_id", partner.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
    client.from("research_attribution_touches").select("subject_key").eq("partner_id", partner.id),
    client.from("research_attribution_conversions").select("id").eq("partner_id", partner.id),
    client
      .from("research_commission_ledger")
      .select("state, eligible_net_cents, amount_cents")
      .eq("partner_id", partner.id),
    client
      .from("research_payout_batches")
      .select("id, total_cents, settled_at, provider_reference")
      .eq("partner_id", partner.id)
      .eq("state", "settled"),
    client
      .from("research_partner_metric_events")
      .select("kind, amount_cents")
      .eq("partner_id", partner.id),
  ]);
  for (const [name, result] of [
    ["links", linksResult],
    ["touches", touchesResult],
    ["conversions", conversionsResult],
    ["commission ledger", ledgerResult],
    ["payouts", payoutsResult],
    ["metric events", metricEventsResult],
  ] as const) {
    if (result.error) throw new Error(`affiliate ${name} load failed: ${result.error.message}`);
  }
  const links = (linksResult.data ?? []) as Array<{ id: string; code: string; campaign: string | null; created_at: string }>;
  const touches = (touchesResult.data ?? []) as Array<{ subject_key: string }>;
  const conversions = conversionsResult.data ?? [];
  const ledger = (ledgerResult.data ?? []) as Array<{ state: string; eligible_net_cents: number; amount_cents: number }>;
  const metricEvents = (metricEventsResult.data ?? []) as Array<{ kind: string; amount_cents: number }>;
  const sumState = (state: string) =>
    ledger.filter((row) => row.state === state).reduce((sum, row) => sum + Number(row.amount_cents), 0);
  const revenue = ledger.reduce((sum, row) => sum + Number(row.eligible_net_cents), 0);
  const orders = conversions.length;
  return {
    ok: true,
    idempotent: true,
    value: {
      id: partner.id,
      state: partner.state === "active" ? "active" : "paused",
      code: links[0]?.code ?? null,
      links: links.map((row) => affiliateLink(row, base)),
      campaigns: Array.from(
        new Set(links.map((row) => row.campaign).filter((value): value is string => Boolean(value))),
      ),
      metrics: {
        clicks: touches.length,
        uniqueVisitors: new Set(touches.map((row) => row.subject_key)).size,
        qualifiedSignups: metricEvents.filter((row) => row.kind === "qualified_signup").length,
        orders,
        conversionRate: touches.length ? orders / new Set(touches.map((row) => row.subject_key)).size : 0,
        eligibleRevenueCents: revenue,
        refundsCents: metricEvents
          .filter((row) => row.kind === "refund")
          .reduce((sum, row) => sum + Number(row.amount_cents), 0),
        chargebacksCents: metricEvents
          .filter((row) => row.kind === "chargeback")
          .reduce((sum, row) => sum + Number(row.amount_cents), 0),
      },
      commission: {
        pendingCents: sumState("pending") + sumState("held"),
        approvedCents: sumState("approved"),
        payableCents: sumState("payable"),
        paidCents: sumState("paid"),
        reversedCents: sumState("reversed"),
      },
      payoutHistory: ((payoutsResult.data ?? []) as Array<{
        id: string;
        total_cents: number;
        settled_at: string;
        provider_reference: string;
      }>).map((row) => ({
        batchId: row.id,
        amountCents: Number(row.total_cents),
        paidAt: row.settled_at,
        reference: row.provider_reference,
      })),
    },
  };
}

async function loadProfessionalAccount(client: SupabaseClient, id: string): Promise<ProfessionalAccount | null> {
  const account = await maybeSingle<{
    id: string;
    account_type: "practitioner" | "professional";
    organization_name: string;
    contact_email: string;
    state: ProfessionalLifecycle;
    agreement_version: string | null;
    economic_terms: ProfessionalAccount["economicTerms"];
    version: number;
    created_at: string;
    updated_at: string;
  }>(
    client,
    "research_professional_accounts",
    "id, account_type, organization_name, contact_email, state, agreement_version, economic_terms, version, created_at, updated_at",
    "id",
    id,
  );
  if (!account) return null;
  const programs = await client
    .from("research_professional_programs")
    .select("program")
    .eq("account_id", id);
  if (programs.error) throw new Error(`professional programs load failed: ${programs.error.message}`);
  return {
    id: account.id,
    accountType: account.account_type,
    organizationName: account.organization_name,
    contactEmail: account.contact_email,
    programs: ((programs.data ?? []) as Array<{ program: ProfessionalProgram }>).map((row) => row.program),
    state: account.state,
    version: Number(account.version),
    economicTerms: { ...DEFAULT_PROFESSIONAL_ECONOMIC_TERMS, ...(account.economic_terms ?? {}) },
    agreementVersion: account.agreement_version,
    createdAt: account.created_at,
    updatedAt: account.updated_at,
  };
}

async function countWhere(
  client: SupabaseClient,
  table: string,
  column?: string,
  value?: string | string[],
): Promise<number> {
  let query = client.from(table).select("id", { count: "exact", head: true });
  if (column && Array.isArray(value)) query = query.in(column, value);
  else if (column && value !== undefined) query = query.eq(column, value);
  const result = await query;
  if (result.error) throw new Error(`${table} count failed: ${result.error.message}`);
  return result.count ?? 0;
}

function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optionalHttpsUrl(value: unknown): string | null {
  const text = boundedText(value, 2048);
  if (!text) return null;
  try {
    const parsed = new URL(text);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function partnerRequestInput(
  kind: PartnerPortalRequestKind,
  body: unknown,
): { title: string; payload: Record<string, unknown> } | null {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (kind === "campaign") {
    const name = boundedText(input.name, 160);
    const timeframe = boundedText(input.timeframe, 160);
    const description = boundedText(input.description, 4000);
    return name && timeframe && description ? { title: name, payload: { timeframe, description } } : null;
  }
  if (kind === "event") {
    const name = boundedText(input.name, 160);
    const date = boundedText(input.date, 40);
    const location = boundedText(input.location, 240);
    const description = boundedText(input.description, 4000);
    return name && date && location && description
      ? { title: name, payload: { date, location, description } }
      : null;
  }
  if (kind === "organization") {
    const organization = boundedText(input.organization, 200);
    const contactName = boundedText(input.contactName, 200);
    const contactEmail = boundedText(input.contactEmail, 320).toLowerCase();
    const website = optionalHttpsUrl(input.website);
    const description = boundedText(input.description, 4000) || null;
    if (!organization || !contactName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) return null;
    if (boundedText(input.website, 2048) && !website) return null;
    return { title: organization, payload: { website, contactName, contactEmail, description } };
  }
  const title = boundedText(input.title, 200);
  const description = boundedText(input.description, 4000);
  const link = optionalHttpsUrl(input.link);
  if (!title || !description || (boundedText(input.link, 2048) && !link)) return null;
  return { title, payload: { link, description } };
}

function portalPeriod(value: string): string {
  return value.slice(0, 7);
}

async function partnerPortalRead(
  client: SupabaseClient,
  authUserId: string,
  surface: PartnerPortalSurface,
  currentSessionKey?: string | null,
): Promise<Record<string, unknown>> {
  const partner = await partnerForAuth(client, authUserId);
  if (!partner) throw new Error("Partner ownership could not be resolved.");

  if (surface === "conversions") {
    const result = await client
      .from("research_attribution_conversions")
      .select("converted_at")
      .eq("partner_id", partner.id)
      .order("converted_at", { ascending: false });
    if (result.error) throw new Error(`partner conversions load failed: ${result.error.message}`);
    const counts = new Map<string, number>();
    for (const row of (result.data ?? []) as Array<{ converted_at: string }>) {
      const period = portalPeriod(row.converted_at);
      counts.set(period, (counts.get(period) ?? 0) + 1);
    }
    return { rows: Array.from(counts, ([period, activations]) => ({ period, activations, renewals: null })) };
  }

  if (surface === "leads") {
    const result = await client
      .from("research_attribution_touches")
      .select("channel, occurred_at")
      .eq("partner_id", partner.id)
      .order("occurred_at", { ascending: false });
    if (result.error) throw new Error(`partner leads load failed: ${result.error.message}`);
    const counts = new Map<string, { period: string; channel: string; leads: number }>();
    for (const row of (result.data ?? []) as Array<{ channel: string; occurred_at: string }>) {
      const period = portalPeriod(row.occurred_at);
      const key = `${period}:${row.channel}`;
      const prior = counts.get(key);
      counts.set(key, { period, channel: row.channel, leads: (prior?.leads ?? 0) + 1 });
    }
    return { rows: Array.from(counts.values()) };
  }

  if (surface === "commissions") {
    const result = await client
      .from("research_commission_ledger")
      .select("id, state, amount_cents, created_at")
      .eq("partner_id", partner.id)
      .order("created_at", { ascending: false });
    if (result.error) throw new Error(`partner commissions load failed: ${result.error.message}`);
    return {
      entries: ((result.data ?? []) as Array<{
        id: string;
        state: string;
        amount_cents: number;
        created_at: string;
      }>).map((row) => ({
        id: row.id,
        date: row.created_at,
        description: "Attributed membership commission",
        commissionCents: Number(row.amount_cents),
        state: row.state,
      })),
    };
  }

  if (surface === "payouts") {
    const result = await client
      .from("research_payout_batches")
      .select("id, total_cents, state, provider_name, built_at, settled_at")
      .eq("partner_id", partner.id)
      .order("built_at", { ascending: false });
    if (result.error) throw new Error(`partner payouts load failed: ${result.error.message}`);
    return {
      method:
        partner.payout_status === "verified"
          ? { configured: true, label: "Verified payout method" }
          : { configured: false },
      payouts: ((result.data ?? []) as Array<{
        id: string;
        total_cents: number;
        state: string;
        provider_name: string;
        built_at: string;
        settled_at: string | null;
      }>).map((row) => ({
        id: row.id,
        date: row.settled_at ?? row.built_at,
        amountCents: Number(row.total_cents),
        method: row.provider_name === "disabled" ? null : row.provider_name,
        status: row.state,
      })),
    };
  }

  if (surface === "resources") {
    const result = await client
      .from("research_content_assets")
      .select("id, title, version, created_at")
      .eq("partner_id", partner.id)
      .eq("state", "preapproved")
      .order("created_at", { ascending: false });
    if (result.error) throw new Error(`partner resources load failed: ${result.error.message}`);
    return {
      assets: ((result.data ?? []) as Array<{ id: string; title: string; version: number; created_at: string }>).map(
        (row) => ({
          id: row.id,
          title: row.title,
          type: "Approved partner content",
          version: String(row.version),
          updatedAt: row.created_at,
          signedUrl: null,
        }),
      ),
    };
  }

  if (surface === "training") {
    const result = await client
      .from("research_partner_training")
      .select("id, module_key, module_version, completed_at")
      .eq("partner_id", partner.id)
      .order("completed_at", { ascending: true });
    if (result.error) throw new Error(`partner training load failed: ${result.error.message}`);
    return {
      certified: partner.certified_at !== null,
      modules: ((result.data ?? []) as Array<{
        id: string;
        module_key: string;
        module_version: string;
        completed_at: string;
      }>).map((row) => ({
        id: row.id,
        title: row.module_key.replaceAll("_", " "),
        summary: `Version ${row.module_version}`,
        required: true,
        completed: true,
        completedAt: row.completed_at,
      })),
    };
  }

  if (["campaigns", "events", "compliance"].includes(surface)) {
    const kind = surface === "campaigns" ? "campaign" : surface === "events" ? "event" : "compliance";
    const result = await client
      .from("research_partner_portal_requests")
      .select("id, title, payload, state, created_at")
      .eq("partner_id", partner.id)
      .eq("kind", kind)
      .order("created_at", { ascending: false });
    if (result.error) throw new Error(`partner ${surface} load failed: ${result.error.message}`);
    const rows = (result.data ?? []) as Array<{
      id: string;
      title: string;
      payload: Record<string, unknown>;
      state: string;
      created_at: string;
    }>;
    if (surface === "campaigns") {
      return {
        campaigns: rows.map((row) => ({
          id: row.id,
          name: row.title,
          window: boundedText(row.payload.timeframe, 160) || null,
          status: row.state,
        })),
      };
    }
    if (surface === "events") {
      return {
        events: rows.map((row) => ({
          id: row.id,
          name: row.title,
          date: boundedText(row.payload.date, 40) || null,
          location: boundedText(row.payload.location, 240) || null,
          status: row.state,
        })),
      };
    }
    return {
      submissions: rows.map((row) => ({
        id: row.id,
        title: row.title,
        submittedAt: row.created_at,
        status: row.state,
      })),
    };
  }

  if (surface === "organizations") {
    const [organizations, requests] = await Promise.all([
      client
        .from("research_organizations")
        .select("id, name, state")
        .eq("owner_partner_id", partner.id)
        .order("created_at", { ascending: false }),
      client
        .from("research_partner_portal_requests")
        .select("id, title, state")
        .eq("partner_id", partner.id)
        .eq("kind", "organization")
        .order("created_at", { ascending: false }),
    ]);
    if (organizations.error) throw new Error(`partner organizations load failed: ${organizations.error.message}`);
    if (requests.error) throw new Error(`partner organization requests load failed: ${requests.error.message}`);
    return {
      organizations: [
        ...((organizations.data ?? []) as Array<{ id: string; name: string; state: string }>).map((row) => ({
          id: row.id,
          name: row.name,
          role: "Owner",
          status: row.state,
        })),
        ...((requests.data ?? []) as Array<{ id: string; title: string; state: string }>).map((row) => ({
          id: row.id,
          name: row.title,
          role: "Applicant",
          status: row.state,
        })),
      ],
    };
  }

  if (surface === "onboarding") {
    const agreements = await client
      .from("research_partner_agreements")
      .select("id, agreement_key, agreement_version, decision")
      .eq("partner_id", partner.id)
      .order("decided_at", { ascending: false });
    if (agreements.error) throw new Error(`partner onboarding load failed: ${agreements.error.message}`);
    return {
      verification: {
        state: partner.state,
        detail:
          partner.state === "active"
            ? "Partner account is active."
            : "Partner onboarding remains pending until every server-authoritative gate is complete.",
      },
      agreements: ((agreements.data ?? []) as Array<{
        id: string;
        agreement_key: string;
        agreement_version: string;
        decision: string;
      }>).map((row) => ({
        id: row.id,
        title: row.agreement_key.replaceAll("_", " "),
        version: row.agreement_version,
        acknowledged: row.decision === "accepted",
      })),
    };
  }

  const sessions = await client
    .from("research_partner_security_sessions")
    .select("id, session_key, started_at, user_agent, revoked_at")
    .eq("partner_id", partner.id)
    .order("last_seen_at", { ascending: false })
    .limit(20);
  if (sessions.error) throw new Error(`partner sessions load failed: ${sessions.error.message}`);
  return {
    sessions: ((sessions.data ?? []) as Array<{
      id: string;
      session_key: string;
      started_at: string;
      user_agent: string | null;
      revoked_at: string | null;
    }>).map((row) => ({
      id: row.id,
      startedAt: row.started_at,
      device: row.user_agent,
      approximateLocation: null,
      current: row.session_key === currentSessionKey && row.revoked_at === null,
    })),
  };
}

async function submitPartnerPortalRequest(
  client: SupabaseClient,
  authUserId: string,
  kind: PartnerPortalRequestKind,
  body: unknown,
  occurredAt: Date,
): Promise<{ ok: boolean; message?: string; code?: string; idempotent?: boolean }> {
  const partner = await partnerForAuth(client, authUserId);
  if (!partner) return { ok: false, code: "not_found", message: "Partner account not found." };
  const input = partnerRequestInput(kind, body);
  if (!input) return { ok: false, code: "invalid_input", message: "The partner request is incomplete or invalid." };
  const idempotencyKey = createHash("sha256")
    .update(JSON.stringify({ kind, title: input.title, payload: input.payload }))
    .digest("hex");
  const result = await client.rpc("research_operations_submit_partner_request", {
    p_partner_id: partner.id,
    p_kind: kind,
    p_title: input.title,
    p_payload: input.payload,
    p_idempotency_key: idempotencyKey,
    p_occurred_at: occurredAt.toISOString(),
  });
  if (result.error) throw new Error(`partner request failed: ${result.error.message}`);
  const value = result.data as { ok?: boolean; idempotent?: boolean; code?: string; message?: string };
  return value.ok
    ? {
        ok: true,
        idempotent: value.idempotent === true,
        message: value.idempotent ? "This request was already received." : "Received. The team will follow up by email.",
      }
    : { ok: false, code: value.code ?? "invalid_input", message: value.message ?? "Partner request refused." };
}

export function buildOperationsProductionDependencies(
  guards: OperationsRouteGuards,
  client: SupabaseClient = getSupabaseAdmin(),
  env: NodeJS.ProcessEnv = process.env,
  now: () => Date = () => new Date(),
): OperationsRouteDeps {
  const baseUrl = env.RESEARCH_AFFILIATE_BASE_URL || "https://xeniostechnology.com";
  const fulfillment = createSupabaseFulfillmentPort(client);

  return {
    guards,
    fulfillment,
    affiliates: {
      login: (authUserId) => affiliateDashboard(client, authUserId, baseUrl),
      async issueLink(input) {
        const partner = await partnerForAuth(client, input.actor.id);
        if (!partner) return { ok: false, code: "not_found", message: "Affiliate not found." };
        if (partner.state !== "active") {
          return { ok: false, code: "invalid_state", message: "Affiliate must be active to issue links." };
        }
        const existing = await client
          .from("research_partner_links")
          .select("id, code, campaign, created_at")
          .eq("partner_id", partner.id)
          .eq("idempotency_key", input.idempotencyKey)
          .maybeSingle();
        if (existing.error) throw new Error(`affiliate link replay failed: ${existing.error.message}`);
        if (existing.data) {
          const row = existing.data as { id: string; code: string; campaign: string | null; created_at: string };
          if ((row.campaign ?? null) !== (input.campaign?.trim() || null)) {
            return { ok: false, code: "idempotency_conflict", message: "That idempotency key was used for another campaign." };
          }
          return { ok: true, value: affiliateLink(row, baseUrl), idempotent: true };
        }
        const row = {
          partner_id: partner.id,
          code: randomBytes(24).toString("base64url"),
          channel: input.campaign ? "campaign" : "signed_link",
          campaign: input.campaign?.trim() || null,
          idempotency_key: input.idempotencyKey,
          created_at: input.occurredAt.toISOString(),
        };
        const inserted = await client
          .from("research_partner_links")
          .insert(row)
          .select("id, code, campaign, created_at")
          .single();
        if (inserted.error) throw new Error(`affiliate link insert failed: ${inserted.error.message}`);
        return {
          ok: true,
          value: affiliateLink(inserted.data as typeof row & { id: string }, baseUrl),
          idempotent: false,
        };
      },
    },
    professionals: {
      async apply(input): Promise<ProfessionalResult<ProfessionalAccount>> {
        const proposed = input.proposedEconomics ?? {};
        const forbidden = [
          "prescriptionPaymentCents",
          "patientReferralPaymentCents",
          "diagnosisPaymentCents",
          "clinicalApprovalPaymentCents",
          "medicationValuePaymentCents",
          "prescription",
          "patientReferral",
          "diagnosis",
          "clinicalApproval",
          "medicationValue",
        ];
        if (Object.keys(proposed).some((key) => forbidden.includes(key))) {
          return {
            ok: false,
            code: "clinical_economics_refused",
            message: "Clinical referral economics are prohibited.",
          };
        }
        if (input.programs.some((program) => !PROFESSIONAL_PROGRAMS.includes(program))) {
          return { ok: false, code: "invalid_input", message: "An unknown professional program was supplied." };
        }
        const result = await client.rpc("research_operations_apply_professional_account", {
          p_account_type: input.accountType,
          p_organization_name: input.organizationName,
          p_contact_email: input.contactEmail,
          p_programs: input.programs,
          p_economic_terms: proposed,
          p_idempotency_key: input.idempotencyKey,
          p_occurred_at: input.occurredAt.toISOString(),
        });
        if (result.error) throw new Error(`professional application failed: ${result.error.message}`);
        const rpc = result.data as {
          ok: boolean;
          accountId?: string;
          idempotent?: boolean;
          code?: ProfessionalResult<never> extends { code: infer C } ? C : never;
          message?: string;
        };
        if (!rpc.ok || !rpc.accountId) {
          return {
            ok: false,
            code: (rpc.code || "invalid_input") as "invalid_input",
            message: rpc.message || "Professional application refused.",
          };
        }
        const account = await loadProfessionalAccount(client, rpc.accountId);
        if (!account) return { ok: false, code: "not_found", message: "Professional account was not found." };
        return { ok: true, value: account, idempotent: rpc.idempotent === true };
      },
      async list(_actor, state): Promise<ProfessionalResult<ProfessionalAccount[]>> {
        let query = client
          .from("research_professional_accounts")
          .select("id")
          .order("updated_at", { ascending: false });
        if (state) query = query.eq("state", state);
        const result = await query;
        if (result.error) throw new Error(`professional accounts load failed: ${result.error.message}`);
        const accounts = (
          await Promise.all(
            ((result.data ?? []) as Array<{ id: string }>).map((row) => loadProfessionalAccount(client, row.id)),
          )
        ).filter((row): row is ProfessionalAccount => Boolean(row));
        return { ok: true, value: accounts, idempotent: true };
      },
      async review(input): Promise<ProfessionalResult<ProfessionalAccount>> {
        const result = await client.rpc("research_operations_transition_professional_account", {
          p_account_id: input.accountId,
          p_to_state: input.to,
          p_expected_version: input.expectedVersion,
          p_agreement_version: input.agreementVersion ?? null,
          p_actor_id: input.actor.id,
          p_actor_role: input.actor.role,
          p_idempotency_key: input.idempotencyKey,
          p_occurred_at: input.occurredAt.toISOString(),
        });
        if (result.error) throw new Error(`professional transition failed: ${result.error.message}`);
        const rpc = result.data as {
          ok?: boolean;
          accountId?: string;
          idempotent?: boolean;
          code?: string;
          message?: string;
        };
        if (!rpc.ok || !rpc.accountId) {
          return {
            ok: false,
            code: (rpc.code ?? "invalid_input") as "invalid_input",
            message: rpc.message ?? "Professional transition refused.",
          };
        }
        const account = await loadProfessionalAccount(client, rpc.accountId);
        if (!account) return { ok: false, code: "not_found", message: "Professional account was not found." };
        return { ok: true, value: account, idempotent: rpc.idempotent === true };
      },
    },
    partnerPortal: {
      read: (surface, authUserId, currentSessionKey) =>
        partnerPortalRead(client, authUserId, surface, currentSessionKey),
      submit: (kind, authUserId, body, occurredAt) =>
        submitPartnerPortalRequest(client, authUserId, kind, body, occurredAt),
    },
    crm: {
      async get(contactId, _actor): Promise<CrmResult<{ contact: CrmContact; timeline: CrmEvent[] }>> {
        const contact = await loadCrmContact(client, contactId);
        if (!contact) return { ok: false, code: "not_found", message: "CRM contact not found." };
        const events = await client
          .from("research_operations_crm_events")
          .select("id, contact_id, kind, actor_id, actor_role, summary, reference_type, reference_id, occurred_at")
          .eq("contact_id", contactId)
          .order("occurred_at", { ascending: true });
        if (events.error) throw new Error(`operations CRM timeline load failed: ${events.error.message}`);
        return {
          ok: true,
          value: {
            contact,
            timeline: ((events.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
              id: String(row.id),
              contactId: String(row.contact_id),
              kind: String(row.kind) as CrmEvent["kind"],
              actorId: String(row.actor_id),
              actorRole: String(row.actor_role) as CrmEvent["actorRole"],
              summary: String(row.summary),
              referenceType: row.reference_type ? (String(row.reference_type) as "order" | "exception") : null,
              referenceId: row.reference_id ? String(row.reference_id) : null,
              occurredAt: String(row.occurred_at),
            })),
          },
          idempotent: true,
        };
      },
      create(input) {
        return applyCrmCommand(client, {
          contactId: input.id,
          action: "create",
          expectedVersion: null,
          actor: input.actor,
          idempotencyKey: input.idempotencyKey,
          payload: {
            kind: input.kind,
            displayName: input.displayName,
            email: input.email,
          },
          occurredAt: input.occurredAt,
        });
      },
      transitionStage(input) {
        return applyCrmCommand(client, {
          contactId: input.contactId,
          action: "stage",
          expectedVersion: input.expectedVersion,
          actor: input.actor,
          idempotencyKey: input.idempotencyKey,
          payload: { to: input.to },
          occurredAt: input.occurredAt,
        });
      },
      addNote(input) {
        return applyCrmCommand(client, {
          contactId: input.contactId,
          action: "note",
          expectedVersion: input.expectedVersion,
          actor: input.actor,
          idempotencyKey: input.idempotencyKey,
          payload: { summary: input.summary },
          occurredAt: input.occurredAt,
        });
      },
      linkReference(input) {
        return applyCrmCommand(client, {
          contactId: input.contactId,
          action: "link",
          expectedVersion: input.expectedVersion,
          actor: input.actor,
          idempotencyKey: input.idempotencyKey,
          payload: { referenceType: input.referenceType, referenceId: input.referenceId },
          occurredAt: input.occurredAt,
        });
      },
      async list(_actor, stage?: CrmStage, search?: string): Promise<CrmResult<CrmContact[]>> {
        let query = client
          .from("research_operations_crm_contacts")
          .select("id, kind, display_name, email, stage, version, tags, created_at, updated_at")
          .order("updated_at", { ascending: false });
        if (stage) query = query.eq("stage", stage);
        const result = await query;
        if (result.error) throw new Error(`operations CRM load failed: ${result.error.message}`);
        const needle = search?.trim().toLowerCase() ?? "";
        const contacts = ((result.data ?? []) as Array<{
          id: string;
          kind: CrmContact["kind"];
          display_name: string;
          email: string;
          stage: CrmStage;
          version: number;
          tags: string[];
          created_at: string;
          updated_at: string;
        }>)
          .filter(
            (row) =>
              !needle ||
              row.display_name.toLowerCase().includes(needle) ||
              row.email.toLowerCase().includes(needle),
          )
          .map((row) => crmContact(row));
        return { ok: true, value: contacts, idempotent: true };
      },
    },
    tasks: {
      async list(_actor, status?: OperationsTaskStatus): Promise<OperationsTaskResult<OperationsTask[]>> {
        let query = client
          .from("research_operations_tasks")
          .select(
            "id, title, description, status, priority, assigned_to, source_type, source_id, due_at, version, created_by, created_at, updated_at, completed_at",
          )
          .order("priority", { ascending: false })
          .order("created_at", { ascending: true });
        if (status) query = query.eq("status", status);
        const result = await query;
        if (result.error) throw new Error(`operations task load failed: ${result.error.message}`);
        return {
          ok: true,
          value: ((result.data ?? []) as Array<Record<string, unknown>>).map(operationsTask),
          idempotent: true,
        };
      },
      async create(input): Promise<OperationsTaskResult<OperationsTask>> {
        const result = await client.rpc("research_operations_apply_task_command", {
          p_task_id: input.id || null,
          p_action: "create",
          p_expected_version: null,
          p_actor_id: input.actor.id,
          p_actor_role: input.actor.role,
          p_idempotency_key: input.idempotencyKey,
          p_payload: {
            title: input.title,
            description: input.description ?? null,
            priority: input.priority ?? "normal",
            assignedTo: input.assignedTo ?? null,
            sourceType: input.sourceType ?? null,
            sourceId: input.sourceId ?? null,
            dueAt: input.dueAt ?? null,
          },
          p_occurred_at: input.occurredAt.toISOString(),
        });
        if (result.error) throw new Error(`operations task create failed: ${result.error.message}`);
        const rpc = result.data as {
          ok?: boolean;
          taskId?: string;
          idempotent?: boolean;
          code?: string;
          message?: string;
        };
        if (!rpc.ok || !rpc.taskId) {
          return {
            ok: false,
            code: (rpc.code ?? "invalid_input") as Extract<OperationsTaskResult<never>, { ok: false }>["code"],
            message: rpc.message ?? "Task creation refused.",
          };
        }
        const loaded = await client
          .from("research_operations_tasks")
          .select(
            "id, title, description, status, priority, assigned_to, source_type, source_id, due_at, version, created_by, created_at, updated_at, completed_at",
          )
          .eq("id", rpc.taskId)
          .single();
        if (loaded.error || !loaded.data) throw new Error(`operations task reload failed: ${loaded.error?.message ?? "missing row"}`);
        return { ok: true, value: operationsTask(loaded.data as Record<string, unknown>), idempotent: rpc.idempotent === true };
      },
      async transition(input): Promise<OperationsTaskResult<OperationsTask>> {
        const result = await client.rpc("research_operations_apply_task_command", {
          p_task_id: input.taskId,
          p_action: "transition",
          p_expected_version: input.expectedVersion,
          p_actor_id: input.actor.id,
          p_actor_role: input.actor.role,
          p_idempotency_key: input.idempotencyKey,
          p_payload: {
            to: input.to,
            ...(input.assignedTo !== undefined ? { assignedTo: input.assignedTo } : {}),
          },
          p_occurred_at: input.occurredAt.toISOString(),
        });
        if (result.error) throw new Error(`operations task transition failed: ${result.error.message}`);
        const rpc = result.data as {
          ok?: boolean;
          taskId?: string;
          idempotent?: boolean;
          code?: string;
          message?: string;
        };
        if (!rpc.ok || !rpc.taskId) {
          return {
            ok: false,
            code: (rpc.code ?? "invalid_input") as Extract<OperationsTaskResult<never>, { ok: false }>["code"],
            message: rpc.message ?? "Task transition refused.",
          };
        }
        const loaded = await client
          .from("research_operations_tasks")
          .select(
            "id, title, description, status, priority, assigned_to, source_type, source_id, due_at, version, created_by, created_at, updated_at, completed_at",
          )
          .eq("id", rpc.taskId)
          .single();
        if (loaded.error || !loaded.data) throw new Error(`operations task reload failed: ${loaded.error?.message ?? "missing row"}`);
        return { ok: true, value: operationsTask(loaded.data as Record<string, unknown>), idempotent: rpc.idempotent === true };
      },
    },
    inventory: {
      async list() {
        const result = await client
          .from("research_inventory_lots")
          .select(
            "id, lot_id, sku, owner, disposition, quantity_available, version, expiry_date, retest_date, shelf_life_source, excursion, recalled, updated_at",
          )
          .order("updated_at", { ascending: false })
          .limit(500);
        if (result.error) throw new Error(`operations inventory load failed: ${result.error.message}`);
        return {
          ok: true as const,
          lots: ((result.data ?? []) as Array<Record<string, unknown>>).map(inventoryLotDto),
        };
      },
      async command(input) {
        const result = await client.rpc("research_operations_apply_inventory_command", {
          p_lot_id: input.lotId,
          p_action: input.action,
          p_expected_version: input.expectedVersion,
          p_actor_id: input.actor.id,
          p_actor_role: input.actor.role,
          p_idempotency_key: input.idempotencyKey,
          p_payload: {
            ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
            ...(input.onHandDelta !== undefined ? { onHandDelta: input.onHandDelta } : {}),
            ...(input.reason !== undefined ? { reason: input.reason } : {}),
            ...(input.allocationId !== undefined ? { allocationId: input.allocationId } : {}),
            ...(input.orderId !== undefined ? { orderId: input.orderId } : {}),
          },
          p_occurred_at: input.occurredAt.toISOString(),
        });
        if (result.error) throw new Error(`operations inventory command failed: ${result.error.message}`);
        const rpc = result.data as {
          ok?: boolean;
          code?: string;
          message?: string;
          idempotent?: boolean;
          lotId?: string;
        };
        if (!rpc.ok || !rpc.lotId) {
          return {
            ok: false,
            code: rpc.code ?? "invalid_input",
            message: rpc.message ?? "Inventory command refused.",
          };
        }
        const loaded = await client
          .from("research_inventory_lots")
          .select(
            "id, lot_id, sku, owner, disposition, quantity_available, version, expiry_date, retest_date, shelf_life_source, excursion, recalled, updated_at",
          )
          .eq("id", rpc.lotId)
          .single();
        if (loaded.error || !loaded.data) {
          throw new Error(`operations inventory reload failed: ${loaded.error?.message ?? "missing lot"}`);
        }
        return {
          ok: true,
          idempotent: rpc.idempotent === true,
          lot: inventoryLotDto(loaded.data as Record<string, unknown>),
        };
      },
    },
    outbox: {
      async list(status?: NotificationStatus): Promise<OutboxNotification[]> {
        let query = client
          .from("research_notification_outbox")
          .select(
            "id, event_key, application_id, member_id, event_type, channel, template_key, payload, status, attempt_count, next_attempt_at, provider_message_id, last_error_code, created_at, updated_at",
          )
          .order("created_at", { ascending: false })
          .limit(500);
        if (status) {
          const canonicalStatus = status === "suppressed" ? "cancelled" : status;
          query = query.eq("status", canonicalStatus);
        }
        const result = await query;
        if (result.error) throw new Error(`notification outbox load failed: ${result.error.message}`);
        return ((result.data ?? []) as Array<Record<string, unknown>>).map((row) => {
          const payload = row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : {};
          const canonicalStatus = String(row.status);
          return {
            id: String(row.id),
            audience: {
              kind: row.member_id ? "member" : "operator",
              id: String(row.member_id ?? row.application_id ?? row.event_key),
            },
            channel: ["in_app", "email", "sms", "telegram"].includes(String(row.channel))
              ? (String(row.channel) as OutboxNotification["channel"])
              : "email",
            topic: String(row.event_type),
            dedupeKey: String(row.event_key),
            sensitivity: row.member_id || row.application_id ? "customer_sensitive" : "operational",
            message: {
              title: String(payload.title ?? row.template_key),
              body: String(payload.summary ?? "Delivery status is available to authorized operators."),
              ...(typeof payload.actionUrl === "string" ? { actionUrl: payload.actionUrl } : {}),
            },
            status:
              canonicalStatus === "cancelled"
                ? "suppressed"
                : canonicalStatus === "delivered"
                  ? "sent"
                  : (canonicalStatus as NotificationStatus),
            attemptCount: Number(row.attempt_count),
            nextAttemptAt: String(row.next_attempt_at),
            leaseUntil: null,
            providerReference: row.provider_message_id ? String(row.provider_message_id) : null,
            failureCode: row.last_error_code ? String(row.last_error_code) : null,
            createdAt: String(row.created_at),
            updatedAt: String(row.updated_at),
          };
        });
      },
    },
    async dashboard(): Promise<OperationsDashboardInput> {
      const asOf = now();
      const [
        pendingApplications,
        pendingActivation,
        paymentVerification,
        paidOrders,
        readyFulfillment,
        exceptions,
        quarantinedLots,
        affiliateApplications,
        activeAffiliates,
        commissions,
        payouts,
        professionalApplications,
        activeProfessionals,
        notificationFailures,
      ] = await Promise.all([
        countWhere(client, "research_applications", "status", [
          "submitted",
          "under_review",
          "more_information_requested",
          "resubmitted",
        ]),
        countWhere(client, "research_members", "status", "pending_activation"),
        countWhere(client, "research_applications", "status", [
          "approved_pending_payment",
          "payment_pending",
        ]),
        countWhere(client, "research_orders", "state", ["payment_captured", "processing"]),
        countWhere(client, "research_fulfillment_work_orders", "fulfillment_state", "awaiting_acknowledgement"),
        countWhere(client, "research_fulfillment_exceptions", "status", "open"),
        countWhere(client, "research_inventory_lots", "disposition", ["quarantined", "quality_hold", "temperature_hold"]),
        countWhere(client, "research_partners", "state", "application"),
        countWhere(client, "research_partners", "state", "active"),
        countWhere(client, "research_commission_ledger"),
        countWhere(client, "research_payout_batches"),
        countWhere(client, "research_professional_accounts", "state", "applied"),
        countWhere(client, "research_professional_accounts", "state", "active"),
        countWhere(client, "research_notification_outbox", "status", ["failed_retryable", "failed_permanent"]),
      ]);
      const workResult = await client
        .from("research_fulfillment_work_orders")
        .select("fulfillment_state, shipment_state, allocation_state, due_at, acknowledged_at");
      if (workResult.error) throw new Error(`fulfillment metrics load failed: ${workResult.error.message}`);
      const lotsResult = await client
        .from("research_inventory_lots")
        .select("id, quantity_available, disposition");
      if (lotsResult.error) throw new Error(`inventory metrics load failed: ${lotsResult.error.message}`);
      const qualityResult = await client
        .from("research_lot_quality_documents")
        .select("lot_id, coa_on_file");
      if (qualityResult.error) throw new Error(`quality metrics load failed: ${qualityResult.error.message}`);
      const work = (workResult.data ?? []) as Array<{
        fulfillment_state: string;
        shipment_state: string;
        allocation_state: string;
        due_at: string;
        acknowledged_at: string | null;
      }>;
      const lots = (lotsResult.data ?? []) as Array<{ id: string; quantity_available: number; disposition: string }>;
      const qualityByLot = new Map(
        ((qualityResult.data ?? []) as Array<{ lot_id: string; coa_on_file: boolean }>).map((row) => [
          row.lot_id,
          row.coa_on_file,
        ]),
      );
      const nowMs = asOf.getTime();
      return {
        generatedAt: asOf.toISOString(),
        pending_applications: pendingApplications,
        pending_activation: pendingActivation,
        payment_verification: paymentVerification,
        paid_orders: paidOrders,
        ready_fulfillment: readyFulfillment,
        overdue_acknowledgement: work.filter(
          (row) =>
            row.fulfillment_state === "awaiting_acknowledgement" &&
            new Date(row.due_at).getTime() < nowMs,
        ).length,
        shipping_today: work.filter((row) => row.due_at.slice(0, 10) === asOf.toISOString().slice(0, 10)).length,
        late_orders: work.filter(
          (row) => row.fulfillment_state !== "shipped" && new Date(row.due_at).getTime() < nowMs,
        ).length,
        exceptions,
        low_inventory: lots.filter((row) => row.disposition === "available" && row.quantity_available <= 5).length,
        quarantined_lots: quarantinedLots,
        missing_coas: lots.filter((row) => qualityByLot.get(row.id) !== true).length,
        affiliate_applications: affiliateApplications,
        active_affiliates: activeAffiliates,
        commissions,
        payouts,
        professional_applications: professionalApplications,
        active_professional_accounts: activeProfessionals,
        notification_failures: notificationFailures,
      };
    },
    now,
  };
}
