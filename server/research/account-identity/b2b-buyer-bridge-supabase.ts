import type { SupabaseClient } from "@supabase/supabase-js";
import { isRecoveryPurposeSession } from "../member-auth";
import type { AccountAuthVerifier } from "./production-deps";
import {
  KRIS_VOLUME_PARTNER_PROFILE,
  type B2BBuyerBridgeDeps,
  type B2BBuyerEntitlementRecord,
  type B2BBuyerRelationshipRecord,
  type B2BBuyerRole,
} from "./b2b-buyer-bridge";

type Row = Record<string, unknown>;

const BUYER_ROLES = new Set<B2BBuyerRole>([
  "organization_owner",
  "organization_admin",
  "business_buyer",
  "billing_viewer",
]);

function strictBearer(request: unknown): string | null {
  if (typeof request !== "object" || request === null) return null;
  const headers = (request as { headers?: unknown }).headers;
  if (typeof headers !== "object" || headers === null) return null;
  const authorization = (headers as Record<string, unknown>).authorization;
  if (typeof authorization !== "string") return null;
  const match = /^Bearer ([^\s]+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function roles(value: unknown): B2BBuyerRole[] {
  if (!Array.isArray(value)) return [];
  const parsed = value.filter(
    (role): role is B2BBuyerRole => typeof role === "string" && BUYER_ROLES.has(role as B2BBuyerRole),
  );
  return parsed.length === value.length ? Array.from(new Set(parsed)) : [];
}

async function required<T>(query: PromiseLike<{ data: T | null; error: any }>, label: string): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${String(error.message ?? "query failed")}`);
  return data as T;
}

/**
 * Concrete, unmounted Supabase adapter for the temporary B2B bridge candidate.
 * Every query is scoped from the bearer token -> exact auth UID -> canonical
 * research_members row. The adapter never accepts email, relationship, or
 * pricing profile selectors from the browser.
 */
export function createSupabaseB2BBuyerBridgeDeps(
  admin: SupabaseClient,
  auth: AccountAuthVerifier,
  now: () => Date = () => new Date(),
): B2BBuyerBridgeDeps {
  return {
    now: () => now().toISOString(),
    async resolveAuthenticatedMember(request) {
      const token = strictBearer(request);
      if (token === null || isRecoveryPurposeSession(token)) return null;
      const identity = await auth.verifyAccessToken(token);
      if (identity === null) return null;

      const data = await required<any>(admin
        .from("research_members")
        .select("id,auth_user_id,status")
        .eq("auth_user_id", identity.userId)
        .maybeSingle(), "B2B member lookup failed");
      if (!data) return null;
      const memberId = text(data.id);
      const authUserId = text(data.auth_user_id);
      const memberStatus = text(data.status);
      if (memberId === null || authUserId !== identity.userId || memberStatus === null) return null;
      return {
        authUserId,
        memberId,
        emailVerified: Boolean(identity.email && identity.emailConfirmedAt),
        memberStatus,
      };
    },

    async listRelationshipsForMember(memberId): Promise<B2BBuyerRelationshipRecord[]> {
      const operatorRows = await required<any[]>(admin
        .from("research_b2b_buyer_operators")
        .select("id,relationship_id,member_id,roles,state")
        .eq("member_id", memberId)
        .eq("state", "active"), "B2B operator lookup failed");
      if (operatorRows.length === 0) return [];

      const relationshipIds = Array.from(new Set(operatorRows.map((row) => text(row.relationship_id))))
        .filter((id): id is string => id !== null);
      if (relationshipIds.length === 0) throw new Error("B2B operator rows carried no relationship identity.");

      const [relationshipRows, entitlementRows] = await Promise.all([
        required<any[]>(admin
          .from("research_b2b_buyer_relationships")
          .select("id,business_key,business_display_name,state,migrated_organization_id")
          .in("id", relationshipIds), "B2B relationship lookup failed"),
        required<any[]>(admin
          .from("research_b2b_buyer_entitlements")
          .select("id,relationship_id,profile_key,version,state,effective_at,expires_at")
          .in("relationship_id", relationshipIds), "B2B entitlement lookup failed"),
      ]);

      const relationshipById = new Map<string, Row>();
      for (const row of relationshipRows) {
        const id = text(row.id);
        if (id === null || relationshipById.has(id)) {
          throw new Error("B2B relationship projection was missing or duplicated.");
        }
        relationshipById.set(id, row);
      }
      const entitlementsByRelationship = new Map<string, B2BBuyerEntitlementRecord[]>();
      for (const row of entitlementRows) {
        const relationshipId = text(row.relationship_id);
        const entitlementId = text(row.id);
        const profileKey = text(row.profile_key);
        const state = text(row.state);
        const effectiveAt = text(row.effective_at);
        const expiresAt = row.expires_at === null ? null : text(row.expires_at);
        const version = Number(row.version);
        if (
          relationshipId === null || entitlementId === null || profileKey === null
          || effectiveAt === null || (row.expires_at !== null && expiresAt === null)
          || !Number.isSafeInteger(version) || version < 1
          || !["active", "suspended", "expired", "revoked"].includes(state ?? "")
        ) {
          throw new Error("B2B entitlement projection was malformed.");
        }
        const list = entitlementsByRelationship.get(relationshipId) ?? [];
        list.push({
          entitlementId,
          profileKey,
          version,
          state: state as B2BBuyerEntitlementRecord["state"],
          effectiveAt,
          expiresAt,
        });
        entitlementsByRelationship.set(relationshipId, list);
      }

      return operatorRows.map((operator): B2BBuyerRelationshipRecord => {
        const relationshipId = text(operator.relationship_id);
        const operatorMemberId = text(operator.member_id);
        const row = relationshipId === null ? undefined : relationshipById.get(relationshipId);
        const businessKey = text(row?.business_key);
        const businessDisplayName = text(row?.business_display_name);
        const state = text(row?.state);
        if (
          relationshipId === null || operatorMemberId !== memberId || !row
          || businessKey === null || businessDisplayName === null
          || !["active", "suspended", "closed", "migrated"].includes(state ?? "")
        ) {
          throw new Error("B2B operator/relationship projection was inconsistent.");
        }
        return {
          relationshipId,
          businessKey,
          businessDisplayName,
          memberId,
          state: state as B2BBuyerRelationshipRecord["state"],
          roles: roles(operator.roles),
          migratedOrganizationId: row.migrated_organization_id === null
            ? null
            : text(row.migrated_organization_id),
          entitlements: entitlementsByRelationship.get(relationshipId) ?? [],
        };
      });
    },

    async findCanonicalOrderForMember(input) {
      const data = await required<any>(admin
        .from("research_orders")
        .select("id,member_id")
        .eq("id", input.orderId)
        .eq("member_id", input.memberId)
        .maybeSingle(), "B2B canonical order lookup failed");
      if (!data) return null;
      const orderId = text(data.id);
      const memberId = text(data.member_id);
      return orderId === input.orderId && memberId === input.memberId
        ? { orderId, memberId }
        : null;
    },

    async commitOrderOwnership(input) {
      if (input.pricingProfileKey !== KRIS_VOLUME_PARTNER_PROFILE) return "conflict";
      const data = await required<unknown>((admin as any).rpc("research_claim_b2b_order_ownership", {
        p_order_id: input.orderId,
        p_relationship_id: input.relationshipId,
        p_member_id: input.memberId,
        p_entitlement_id: input.entitlementId,
        p_profile_key: input.pricingProfileKey,
        p_profile_version: input.pricingProfileVersion,
      }), "B2B order ownership claim failed");
      if (data !== "linked" && data !== "replayed" && data !== "conflict") {
        throw new Error("B2B order ownership RPC returned an invalid result.");
      }
      return data;
    },
  };
}
