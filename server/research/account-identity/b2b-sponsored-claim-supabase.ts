import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SponsoredB2BClaim,
  SponsoredB2BClaimDeps,
} from "./b2b-sponsored-claim";

type Row = Record<string, unknown>;

async function required<T>(query: PromiseLike<{ data: T | null; error: any }>, label: string): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${String(error.message ?? "query failed")}`);
  return data as T;
}

function stringIds(rows: unknown): string[] {
  if (!Array.isArray(rows)) throw new Error("Identity projection was not an array.");
  return rows.map((row) => {
    const id = typeof row?.id === "string" ? row.id : "";
    if (!id) throw new Error("Identity projection contained no id.");
    return id;
  });
}

function sponsoredClaim(raw: unknown): SponsoredB2BClaim {
  const row = (Array.isArray(raw) ? raw[0] : raw) as Row | undefined;
  if (!row) throw new Error("Sponsored B2B claim RPC returned no row.");
  return {
    sponsorshipId: String(row.sponsorship_id ?? ""),
    applicationId: String(row.application_id ?? ""),
    normalizedEmail: String(row.normalized_email ?? ""),
    businessKey: String(row.business_key ?? ""),
    businessDisplayName: String(row.business_display_name ?? ""),
    state: String(row.state ?? "") as SponsoredB2BClaim["state"],
    profileKey: String(row.profile_key ?? "") as "KRIS_VOLUME_PARTNER",
    profileVersion: Number(row.profile_version),
    profileEffectiveAt: String(row.profile_effective_at ?? ""),
  };
}

/**
 * Concrete, unmounted Pack02 dependency builder.
 *
 * `actor` must carry the authenticated internal admin JWT so both preparation
 * and later activation derive the exact approver from auth.uid(). `admin` is
 * used only for bounded read-only inspection. The preparation RPC atomically
 * creates the durable account_claim outbox row. `kickNotificationOutbox` is a
 * best-effort wakeup and carries no credential or password material.
 */
export function createSupabaseSponsoredB2BClaimDeps(
  admin: SupabaseClient,
  actor: SupabaseClient,
  kickNotificationOutbox: () => Promise<void>,
): SponsoredB2BClaimDeps {
  return {
    async inspectExactEmail(normalizedEmail) {
      const authUserIds: string[] = [];
      for (let page = 1; page <= 50; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw new Error(`Supabase Auth inspection failed: ${error.message}`);
        const users = data.users ?? [];
        authUserIds.push(...users
          .filter((user) => user.email?.trim().toLowerCase() === normalizedEmail)
          .map((user) => user.id));
        if (users.length < 200) break;
        if (page === 50) throw new Error("Supabase Auth inspection exceeded the bounded roster scan.");
      }

      const [applications, members, sponsorships] = await Promise.all([
        required<any[]>(admin.from("research_applications").select("id").ilike("email", normalizedEmail),
          "Application identity inspection failed"),
        required<any[]>(admin.from("research_members").select("id").ilike("email", normalizedEmail),
          "Member identity inspection failed"),
        required<any[]>(admin.from("research_b2b_sponsored_claims").select("id")
          .eq("normalized_email", normalizedEmail), "B2B sponsorship inspection failed"),
      ]);
      return {
        authUserIds,
        applicationIds: stringIds(applications),
        memberIds: stringIds(members),
        sponsorshipIds: stringIds(sponsorships),
      };
    },

    async prepareSponsoredClaim(input) {
      const data = await required<unknown>((actor as any).rpc("research_prepare_sponsored_b2b_claim", {
        p_normalized_email: input.email,
        p_first_name: input.firstName,
        p_last_name: input.lastName,
        p_country: input.country,
        p_applicant_type: input.applicantType,
        p_business_key: input.businessKey,
        p_business_display_name: input.businessDisplayName,
        p_roles: input.roles,
        p_profile_version: input.profileVersion,
        p_profile_effective_at: input.profileEffectiveAt,
      }), "Sponsored B2B claim preparation failed");
      return sponsoredClaim(data);
    },

    kickNotificationOutbox,
  };
}
