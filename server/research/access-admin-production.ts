import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabaseAdmin, supabaseConfigured } from "../supabase";
import type { AccessInspectionDependencies, AccessInspectionFacts } from "./access-admin";
import { APPROVED_CUSTOMER_SCHEMA_VERSION } from "@shared/research/approved-customer-access";
import { validPartnerLifecycleAuthority } from "./partners/lifecycle-admin";

const id = z.string().uuid();
const timestamp = z.string().datetime({ offset: true }).nullable();
const authRow = z.object({ id, email: z.string().email(), email_confirmed_at: timestamp.optional(), last_sign_in_at: timestamp.optional() });
const applicationRow = z.object({ id, email: z.string().email(), status: z.string(), updated_at: timestamp });
const memberRow = z.object({ id, email: z.string().email(), auth_user_id: id.nullable(), status: z.string() });
const partnerRow = z.object({ id, member_id: id, role: z.string(), state: z.string(), identity_verified: z.boolean(), tax_status: z.string(), payout_status: z.string(), certified_at: timestamp, updated_at: timestamp });
const agreementRow = z.object({ partner_id: id, agreement_key: z.string(), agreement_version: z.string(), decision: z.string(), content_hash: z.string(), decided_at: z.string() });
const trainingRow = z.object({ partner_id: id, module_key: z.string(), module_version: z.string(), completed_at: z.string() });
const orgRow = z.object({ organization_id: id, state: z.string(), roles: z.array(z.string()) });

type Query = PromiseLike<{ data: unknown; error: unknown }>;
async function rows<T>(query: Query, schema: z.ZodType<T>, maximum = 25): Promise<T[]> {
  const result = await query;
  if (result.error) throw new Error("inspection read unavailable");
  return z.array(schema).max(maximum).parse(result.data);
}
function unique<T extends { id: string }>(values: T[]): T[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}

export function createAccessInspectionDependencies(client: () => SupabaseClient = getSupabaseAdmin, env: NodeJS.ProcessEnv = process.env): AccessInspectionDependencies {
  return {
    now: () => new Date(),
    membershipBillingEnabled: () => env.RESEARCH_MEMBERSHIP_BILLING_ENABLED === "true",
    async inspect(email) {
      if (client === getSupabaseAdmin && !supabaseConfigured()) throw new Error("inspection unavailable");
      const db = client();
      const auth: AccessInspectionFacts["auth"] = [];
      let complete = false;
      // The Auth admin API has no exact-email query. Filter each bounded page
      // in memory and discard unrelated users and all provider metadata.
      for (let page = 1; page <= 25; page += 1) {
        const result = await db.auth.admin.listUsers({ page, perPage: 200 });
        if (result.error || !Array.isArray(result.data?.users)) throw new Error("auth inspection unavailable");
        for (const user of result.data.users) {
          if (user.email?.toLowerCase() !== email) continue;
          const found = authRow.parse(user);
          auth.push({ id: found.id, email: found.email, emailVerified: Boolean(found.email_confirmed_at), signInRecorded: Boolean(found.last_sign_in_at) });
        }
        if (result.data.users.length < 200) { complete = true; break; }
      }
      if (!complete) throw new Error("auth inspection incomplete");
      const [applications, emailMembers] = await Promise.all([
        rows(db.from("research_applications").select("id,email,status,updated_at").eq("email", email).limit(26), applicationRow),
        rows(db.from("research_members").select("id,email,auth_user_id,status").eq("email", email).limit(26), memberRow),
      ]);
      const authMembers = auth.length ? await rows(db.from("research_members").select("id,email,auth_user_id,status").in("auth_user_id", auth.map((a) => a.id)).limit(26), memberRow) : [];
      const members = unique([...emailMembers, ...authMembers]);
      const partnerFields = "id,member_id,role,state,identity_verified,tax_status,payout_status,certified_at,updated_at";
      const contactPartners = await rows(db.from("research_partners").select(partnerFields).eq("contact_email", email).limit(26), partnerRow);
      const boundPartners = members.length ? await rows(db.from("research_partners").select(partnerFields).in("member_id", members.map((m) => m.id)).limit(26), partnerRow) : [];
      const partners = unique([...contactPartners, ...boundPartners]);
      const pids = partners.map((p) => p.id);
      const [agreements, training] = pids.length ? await Promise.all([
        rows(db.from("research_partner_agreements").select("partner_id,agreement_key,agreement_version,decision,content_hash,decided_at").in("partner_id", pids).limit(1001), agreementRow, 1000),
        rows(db.from("research_partner_training").select("partner_id,module_key,module_version,completed_at").in("partner_id", pids).limit(1001), trainingRow, 1000),
      ]) : [[], []];
      let organizations: AccessInspectionFacts["organizations"] = { state: "available", records: [] };
      if (auth.length) {
        try {
          const records = await rows(db.from("research_organization_users").select("organization_id,state,roles").in("auth_user_id", auth.map((a) => a.id)).limit(26), orgRow);
          organizations.records = records.map((r) => ({ organizationId: r.organization_id, state: r.state, roles: r.roles }));
        } catch { organizations = { state: "unavailable", records: [] }; }
      }
      let approvedCustomerAccess = false;
      try {
        const authority = await db.rpc("research_approved_customer_access_authority");
        approvedCustomerAccess = !authority.error && z.object({ schemaVersion: z.literal(APPROVED_CUSTOMER_SCHEMA_VERSION) }).strict().safeParse(authority.data).success;
      } catch { /* Optional writer is unavailable; read-only diagnosis remains useful. */ }
      let partnerLifecycleReview = false;
      try {
        const authority = await db.rpc("research_partner_lifecycle_authority");
        partnerLifecycleReview = !authority.error && validPartnerLifecycleAuthority(authority.data);
      } catch { /* Partner review availability does not hide account diagnosis. */ }
      return {
        auth, applications: applications.map((a) => ({ id: a.id, email: a.email, status: a.status, updatedAt: a.updated_at })), approvedCustomerAccess, partnerLifecycleReview,
        members: members.map((m) => ({ id: m.id, email: m.email, authUserId: m.auth_user_id, status: m.status })),
        partners: partners.map((p) => ({
          id: p.id, memberId: p.member_id, role: p.role, state: p.state, updatedAt: p.updated_at,
          identityVerified: p.identity_verified, taxStatus: p.tax_status, payoutStatus: p.payout_status, certifiedAt: p.certified_at,
          agreements: agreements.filter((a) => a.partner_id === p.id).map((a) => ({ key: a.agreement_key, version: a.agreement_version, accepted: a.decision === "accepted", contentHash: a.content_hash, decidedAt: a.decided_at })),
          training: training.filter((t) => t.partner_id === p.id).map((t) => ({ key: t.module_key, version: t.module_version, completedAt: t.completed_at })),
        })),
        organizations,
      };
    },
  };
}
