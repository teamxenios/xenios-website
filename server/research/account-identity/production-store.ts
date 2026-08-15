import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BusinessProfileSchema,
  OrganizationRoleSchema,
  OrganizationStatusSchema,
  type AccountOrderDto,
  type AccountRequestAgainDto,
  type BusinessProfile,
  type OrganizationRole,
  type OrganizationUserDto,
  type RequestAgainInput,
} from "@shared/research/account-identity";
import type {
  AccountClaimSubject,
  OrganizationAccessRecord,
} from "./service";
import type { AccountIdentityStore } from "./production-deps";

type DbResult<T> = { data: T | null; error: unknown | null; count?: number | null };
type SupabaseStoreClient = Pick<SupabaseClient, "from" | "rpc">;

const ROLES = new Set(OrganizationRoleSchema.options);
const OUTCOMES = {
  claim: new Set(["linked", "replayed", "conflict", "invalid"]),
  invitation: new Set(["accepted", "replayed", "conflict", "invalid"]),
};

/** Deliberately carries no provider message, SQL, table, identity, or token data. */
export class AccountIdentityStoreUnavailableError extends Error {
  constructor() {
    super("Account identity storage is temporarily unavailable.");
    this.name = "AccountIdentityStoreUnavailableError";
  }
}

function unavailable(): never {
  throw new AccountIdentityStoreUnavailableError();
}

async function result<T>(operation: PromiseLike<DbResult<T>>): Promise<T | null> {
  try {
    const response = await operation;
    if (response.error) unavailable();
    return response.data;
  } catch (error) {
    if (error instanceof AccountIdentityStoreUnavailableError) throw error;
    unavailable();
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function iso(value: unknown): string | null {
  const candidate = text(value);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

function roles(value: unknown): OrganizationRole[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.some((role) => !ROLES.has(role as OrganizationRole))) {
    return null;
  }
  return Array.from(new Set(value as OrganizationRole[]));
}

function subjectColumns(subject: AccountClaimSubject) {
  return subject.subjectType === "personal"
    ? { subject_type: "personal", member_id: subject.memberId, organization_id: null }
    : { subject_type: "organization", member_id: null, organization_id: subject.organizationId };
}

function subjectFromRow(row: Record<string, unknown>): AccountClaimSubject | null {
  if (row.subject_type === "personal" && text(row.member_id) && row.organization_id === null) {
    return { subjectType: "personal", memberId: row.member_id as string };
  }
  if (row.subject_type === "organization" && text(row.organization_id) && row.member_id === null) {
    return { subjectType: "organization", organizationId: row.organization_id as string };
  }
  return null;
}

function byteaHash(hash: string): string {
  if (!/^[a-f0-9]{64}$/.test(hash)) unavailable();
  return `\\x${hash}`;
}

function organizationAccess(user: Record<string, unknown>, organization: Record<string, unknown>): OrganizationAccessRecord {
  const parsedRoles = roles(user.roles);
  const status = OrganizationStatusSchema.safeParse(organization.status);
  const profile = BusinessProfileSchema.safeParse({
    legalName: organization.legal_name,
    displayName: organization.display_name,
    purchasingEmail: organization.purchasing_email,
    billingEmail: organization.billing_email,
    phone: organization.phone ?? null,
    taxIdLast4: organization.tax_id_last4 ?? null,
    purchaseOrderRequired: organization.purchase_order_required,
    billingAddress: organization.billing_address ?? null,
    shippingAddress: organization.shipping_address ?? null,
  });
  const membershipId = text(user.id);
  const id = text(organization.id);
  const slug = text(organization.slug);
  const legalName = text(organization.legal_name);
  const displayName = text(organization.display_name);
  if (!parsedRoles || !status.success || !profile.success || !membershipId || !id || !slug || !legalName || !displayName) {
    unavailable();
  }
  return {
    membershipId,
    roles: parsedRoles,
    passwordChangeRequired: user.password_change_required === true,
    passwordChangeRequiredAt: user.password_change_required_at === null
      ? null
      : iso(user.password_change_required_at) ?? unavailable(),
    organization: {
      id,
      slug,
      legalName,
      displayName,
      status: status.data,
      roles: parsedRoles,
      passwordChangeRequired: user.password_change_required === true,
    },
    profile: profile.data,
  };
}

function orderFromRows(
  header: Record<string, unknown>,
  ownership: Record<string, unknown>,
  lineRows: Record<string, unknown>[],
  shipmentRows: Record<string, unknown>[],
): AccountOrderDto {
  const id = text(header.id);
  const organizationId = text(ownership.organization_id);
  const basis = ownership.ownership_basis;
  const state = text(header.state);
  const total = integer(header.total_cents);
  const placedAt = iso(header.placed_at) ?? iso(header.created_at);
  if (!id || !organizationId || !state || total === null || !placedAt
      || (basis !== "organization_checkout" && basis !== "verified_customer_claim")) unavailable();
  const lines = lineRows.map((line) => {
    const sku = text(line.sku);
    const displayName = text(line.display_name);
    const quantity = integer(line.quantity);
    const lineTotalCents = integer(line.line_total_cents);
    if (!sku || !displayName || quantity === null || quantity < 1 || quantity > 50 || lineTotalCents === null) unavailable();
    return { sku, displayName, quantity, lineTotalCents };
  });
  const payments = text(header.payment_reference)
    ? [{
        status: state,
        amountCents: integer(header.captured_amount_cents)
          ?? integer(header.authorized_amount_cents)
          ?? total,
        currency: "USD",
        recordedAt: iso(header.updated_at) ?? placedAt,
        referenceLabel: header.payment_reference as string,
      }]
    : [];
  return {
    ownership: { organizationId, basis },
    source: "research_order",
    sourceOrderId: id,
    orderNumber: id,
    state,
    reviewTriggers: Array.isArray(header.review_triggers)
      ? header.review_triggers.filter((entry): entry is string => typeof entry === "string")
      : [],
    placedAt,
    totalCents: total,
    currency: "USD",
    lines,
    invoice: null,
    payments,
    tracking: shipmentRows.map((shipment) => ({
      carrier: typeof shipment.carrier === "string" ? shipment.carrier : null,
      trackingNumber: typeof shipment.tracking_number === "string" ? shipment.tracking_number : null,
      status: text(shipment.status) ?? unavailable(),
      updatedAt: iso(shipment.created_at),
    })),
    canRequestAgain: lines.length > 0 && !["draft", "checkout_pending", "cancelled", "refunded"].includes(state),
  };
}

async function rows(client: SupabaseStoreClient, table: string, select: string, filters: (query: any) => any): Promise<Record<string, unknown>[]> {
  const data = await result<unknown[]>(filters(client.from(table).select(select)));
  if (!Array.isArray(data)) unavailable();
  const mapped = data.map(record);
  if (mapped.some((row) => row === null)) unavailable();
  return mapped as Record<string, unknown>[];
}

async function maybeRow(client: SupabaseStoreClient, table: string, select: string, filters: (query: any) => any) {
  const data = await result<unknown>(filters(client.from(table).select(select)).maybeSingle());
  if (data === null) return null;
  return record(data) ?? unavailable();
}

async function canonicalOrder(
  client: SupabaseStoreClient,
  organizationId: string,
  sourceOrderId: string,
): Promise<AccountOrderDto | null> {
  const ownership = await maybeRow(
    client,
    "research_organization_order_ownership",
    "order_id,organization_id,ownership_basis",
    (query) => query.eq("organization_id", organizationId).eq("order_id", sourceOrderId),
  );
  if (!ownership) return null;
  const header = await maybeRow(
    client,
    "research_orders",
    "id,state,total_cents,authorized_amount_cents,captured_amount_cents,payment_reference,review_triggers,placed_at,created_at,updated_at",
    (query) => query.eq("id", sourceOrderId),
  );
  if (!header) unavailable();
  const [lines, shipments] = await Promise.all([
    rows(client, "research_order_lines", "sku,display_name,quantity,line_total_cents", (query) => query.eq("order_id", sourceOrderId)),
    rows(client, "research_order_shipments", "seq,status,tracking_number,carrier,created_at", (query) => query.eq("order_id", sourceOrderId).order("seq")),
  ]);
  return orderFromRows(header, ownership, lines, shipments);
}

/**
 * Service-role adapter for the reviewed Pack02 candidate schema. Missing tables
 * or RPCs throw a redacted error; this intentionally does not degrade to an
 * in-memory identity or order store.
 */
export function createSupabaseAccountIdentityStore(client: SupabaseStoreClient): AccountIdentityStore {
  return {
    async findPersonalAccount(userId) {
      const member = await maybeRow(client, "research_members", "id,application_id,first_name,status", (query) => query.eq("auth_user_id", userId));
      if (!member) return null;
      const application = await maybeRow(client, "research_applications", "last_name", (query) => query.eq("id", member.application_id));
      const memberId = text(member.id);
      const firstName = text(member.first_name);
      const lastName = application && text(application.last_name);
      const status = text(member.status);
      if (!memberId || !firstName || !lastName || !status) unavailable();
      return { memberId, firstName, lastName, status };
    },

    async listOrganizationAccess(userId) {
      const memberships = await rows(client, "research_organization_users", "id,organization_id,roles,password_change_required,password_change_required_at", (query) => query.eq("auth_user_id", userId).eq("state", "active"));
      if (memberships.length === 0) return [];
      const ids = memberships.map((membership) => text(membership.organization_id) ?? unavailable());
      const organizations = await rows(client, "research_account_organizations", "id,slug,legal_name,display_name,status,purchasing_email,billing_email,phone,tax_id_last4,purchase_order_required,billing_address,shipping_address", (query) => query.in("id", ids));
      const byId = new Map(organizations.map((organization) => [text(organization.id), organization]));
      return memberships.map((membership) => organizationAccess(membership, byId.get(text(membership.organization_id)) ?? unavailable()));
    },

    async getOrganizationAccess(userId, organizationId) {
      const membership = await maybeRow(client, "research_organization_users", "id,organization_id,roles,password_change_required,password_change_required_at", (query) => query.eq("auth_user_id", userId).eq("organization_id", organizationId).eq("state", "active"));
      if (!membership) return null;
      const organization = await maybeRow(client, "research_account_organizations", "id,slug,legal_name,display_name,status,purchasing_email,billing_email,phone,tax_id_last4,purchase_order_required,billing_address,shipping_address", (query) => query.eq("id", organizationId));
      return organization ? organizationAccess(membership, organization) : unavailable();
    },

    async findCustomerByRef(customerRef) {
      // A bare opaque eac_ handle is not identity evidence. Only the canonical
      // legal binding may resolve it to research_members and its verified email.
      const binding = await maybeRow(client, "research_early_access_legal_bindings", "member_id,customer_ref,alias_refs", (query) => query.or(`customer_ref.eq.${customerRef},alias_refs.cs.{${customerRef}}`));
      if (!binding) return null;
      const member = await maybeRow(client, "research_members", "email", (query) => query.eq("id", binding.member_id));
      const email = member && text(member.email)?.trim().toLowerCase();
      return email ? { customerRef, normalizedEmail: email } : unavailable();
    },

    async insertCustomerClaimChallenge(input) {
      const inserted = await result(client.from("research_account_claim_challenges").insert({
        id: input.claimId,
        auth_user_id: input.userId,
        normalized_email: input.email.trim().toLowerCase(),
        customer_ref: input.customerRef,
        ...subjectColumns(input.subject),
        token_hash: byteaHash(input.tokenHash),
        expires_at: input.expiresAt,
      }).select("id").single());
      if (!record(inserted) || record(inserted)?.id !== input.claimId) unavailable();
    },

    async inspectCustomerClaimChallenge({ claimId, userId }) {
      const row = await maybeRow(client, "research_account_claim_challenges", "customer_ref,normalized_email,subject_type,member_id,organization_id", (query) => query.eq("id", claimId).eq("auth_user_id", userId).is("consumed_at", null).gt("expires_at", new Date().toISOString()));
      if (!row) return null;
      const subject = subjectFromRow(row);
      const customerRef = text(row.customer_ref);
      const email = text(row.normalized_email);
      return subject && customerRef && email ? { customerRef, email, subject } : unavailable();
    },

    async commitCustomerClaimHash(input) {
      const data = await result<unknown>(client.rpc("research_account_commit_customer_claim", {
        p_claim_id: input.claimId,
        p_token_hash: byteaHash(input.tokenHash),
        p_auth_user_id: input.userId,
        p_verified_email: input.email.trim().toLowerCase(),
      }));
      return typeof data === "string" && OUTCOMES.claim.has(data)
        ? data as "linked" | "replayed" | "conflict" | "invalid"
        : unavailable();
    },

    async getOrganizationDashboard(organizationId) {
      const organization = await maybeRow(client, "research_account_organizations", "id,slug,legal_name,display_name,status,purchasing_email,billing_email,phone,tax_id_last4,purchase_order_required,billing_address,shipping_address", (query) => query.eq("id", organizationId));
      if (!organization) unavailable();
      const usersRaw = await rows(client, "research_organization_users", "id,email_at_binding,roles,state,bound_at", (query) => query.eq("organization_id", organizationId));
      const users: OrganizationUserDto[] = usersRaw.map((user) => {
        const membershipId = text(user.id);
        const email = text(user.email_at_binding);
        const parsedRoles = roles(user.roles);
        if (!membershipId || !email || !parsedRoles || (user.state !== "active" && user.state !== "revoked")) unavailable();
        return { membershipId, email, roles: parsedRoles, state: user.state as "active" | "revoked", boundAt: iso(user.bound_at) };
      });
      const ownership = await rows(client, "research_organization_order_ownership", "order_id,organization_id,ownership_basis", (query) => query.eq("organization_id", organizationId).order("established_at", { ascending: false }));
      const orders = await Promise.all(ownership.map((owner) => canonicalOrder(client, organizationId, text(owner.order_id) ?? unavailable())));
      const requestsRaw = await rows(client, "research_organization_request_again", "id,organization_id,source_system,source_order_id,state,created_at,note", (query) => query.eq("organization_id", organizationId).order("created_at", { ascending: false }));
      const requests: AccountRequestAgainDto[] = requestsRaw.map((request) => ({
        requestId: text(request.id) ?? unavailable(),
        organizationId: request.organization_id === organizationId ? organizationId : unavailable(),
        source: request.source_system as RequestAgainInput["source"],
        sourceOrderId: text(request.source_order_id) ?? unavailable(),
        state: request.state as AccountRequestAgainDto["state"],
        requestedAt: iso(request.created_at) ?? unavailable(),
        note: request.note === null ? null : text(request.note) ?? unavailable(),
      }));
      const access = organizationAccess({ id: "projection", roles: ["billing_viewer"], password_change_required: false, password_change_required_at: null }, organization);
      return { profile: access.profile, users, orders: orders.map((order) => order ?? unavailable()), requests, openRequestAgainCount: requests.filter((request) => request.state === "requested" || request.state === "reviewing").length };
    },

    async updateOrganizationProfile({ organizationId, patch }) {
      const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const names: Record<string, string> = { legalName: "legal_name", displayName: "display_name", purchasingEmail: "purchasing_email", billingEmail: "billing_email", phone: "phone", taxIdLast4: "tax_id_last4", purchaseOrderRequired: "purchase_order_required", billingAddress: "billing_address", shippingAddress: "shipping_address" };
      for (const [key, value] of Object.entries(patch)) dbPatch[names[key] ?? unavailable()] = value;
      const updated = await result<unknown>(client.from("research_account_organizations").update(dbPatch).eq("id", organizationId).select("id,slug,legal_name,display_name,status,purchasing_email,billing_email,phone,tax_id_last4,purchase_order_required,billing_address,shipping_address").single());
      const row = record(updated) ?? unavailable();
      return organizationAccess({ id: "projection", roles: ["organization_admin"], password_change_required: false, password_change_required_at: null }, row).profile;
    },

    async insertOrganizationInvitation(input) {
      const inserted = await result<unknown>(client.from("research_organization_invitations").insert({ id: input.invitationId, organization_id: input.organizationId, normalized_email: input.email, roles: input.roles, token_hash: byteaHash(input.tokenHash), state: "pending", invited_by_auth_user_id: input.actorUserId, invited_by_label: "Account organization administrator", expires_at: input.expiresAt }).select("id").single());
      if (record(inserted)?.id !== input.invitationId) unavailable();
    },

    async inspectOrganizationInvitation({ invitationId }) {
      const invitation = await maybeRow(client, "research_organization_invitations", "organization_id,normalized_email,roles", (query) => query.eq("id", invitationId).eq("state", "pending").gt("expires_at", new Date().toISOString()));
      if (!invitation) return null;
      const organizationId = text(invitation.organization_id);
      const email = text(invitation.normalized_email);
      const parsedRoles = roles(invitation.roles);
      return organizationId && email && parsedRoles ? { organizationId, email, roles: parsedRoles } : unavailable();
    },

    async commitOrganizationInvitationHash(input) {
      const data = await result<unknown>(client.rpc("research_account_accept_organization_invitation", { p_invitation_id: input.invitationId, p_token_hash: byteaHash(input.tokenHash), p_auth_user_id: input.userId, p_verified_email: input.email.trim().toLowerCase() }));
      return typeof data === "string" && OUTCOMES.invitation.has(data)
        ? data as "accepted" | "replayed" | "conflict" | "invalid"
        : unavailable();
    },

    async clearPasswordChangeRequirement(input) {
      const current = await rows(client, "research_organization_users", "id,password_change_required_at", (query) => query.eq("auth_user_id", input.userId).eq("state", "active").eq("password_change_required", true).in("id", input.membershipIds));
      if (current.length !== input.membershipIds.length || current.some((row) => !iso(row.password_change_required_at) || Date.parse(row.password_change_required_at as string) > Date.parse(input.requiredAfter))) return false;
      const updated = await result<unknown[]>(client.from("research_organization_users").update({ password_change_required: false, password_changed_at: input.verifiedChangedAt, updated_at: input.verifiedChangedAt }).eq("auth_user_id", input.userId).eq("state", "active").eq("password_change_required", true).in("id", input.membershipIds).select("id"));
      return Array.isArray(updated) && updated.length === input.membershipIds.length;
    },

    async findOrderForOrganization(input) {
      if (input.source !== "research_order") return null;
      return canonicalOrder(client, input.organizationId, input.sourceOrderId);
    },

    async createRequestAgain(input) {
      const payload = { organization_id: input.organizationId, requested_by_auth_user_id: input.actorUserId, source_system: input.order.source, source_order_id: input.order.sourceOrderId, source_snapshot: input.order, note: input.note, state: "requested" };
      const response = await client.from("research_organization_request_again").insert(payload).select("id").single() as unknown as DbResult<unknown>;
      if (response.error) {
        if (record(response.error)?.code !== "23505") unavailable();
        const replay = await maybeRow(client, "research_organization_request_again", "id", (query) => query.eq("organization_id", input.organizationId).eq("source_system", input.order.source).eq("source_order_id", input.order.sourceOrderId));
        return replay ? { requestId: text(replay.id) ?? unavailable(), replayed: true } : unavailable();
      }
      return { requestId: text(record(response.data)?.id) ?? unavailable(), replayed: false };
    },

    async emitAudit(event, detail) {
      const safeDetail = JSON.parse(JSON.stringify(detail, (key, value) => /token|password|authorization|cookie/i.test(key) ? "[REDACTED]" : value));
      const inserted = await result<unknown>(client.from("research_account_binding_events").insert({ event_type: event, auth_user_id: text(detail.actorUserId), organization_id: text(detail.organizationId), customer_ref: text(detail.customerRef), actor_label: "Pack02 account identity API", detail: safeDetail }).select("id").single());
      if (!record(inserted)?.id) unavailable();
    },
  } satisfies AccountIdentityStore;
}
