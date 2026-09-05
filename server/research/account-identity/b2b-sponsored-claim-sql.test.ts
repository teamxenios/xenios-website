import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.resolve(
  "supabase/pack02-candidates/20260813_research_b2b_sponsored_claim.sql",
), "utf8");
const membership = fs.readFileSync(path.resolve("server/research/membership.ts"), "utf8");
const outbox = fs.readFileSync(path.resolve("server/research/outbox.ts"), "utf8");
const emails = fs.readFileSync(path.resolve("server/research/membership-emails.ts"), "utf8");
const activationSql = sql.slice(
  sql.indexOf("create or replace function public.research_activate_sponsored_b2b_buyer"),
  sql.indexOf("alter table public.research_b2b_sponsored_claims enable row level security"),
);

function activationDisposition(
  state: "claim_queued" | "activated" | "expired" | "revoked",
  expiresAtMs: number,
  databaseNowMs: number,
  completedBeforeExpiry = false,
) {
  if (state === "activated") return completedBeforeExpiry ? "replay" : "refuse";
  if (state !== "claim_queued") return "refuse";
  return databaseNowMs < expiresAtMs ? "activate" : "refuse";
}

describe("sponsored B2B claim candidate", () => {
  it("never depends on the colliding organization table", () => {
    expect(sql).not.toMatch(/public\.research_organizations/i);
    expect(sql).toContain("public.research_b2b_buyer_relationships");
  });

  it("records truthful sponsorship provenance without applicant attestations", () => {
    expect(sql).toContain("'b2b_buyer_sponsored_claim'");
    expect(sql).toMatch(/false,'professional'/i);
    expect(sql).toContain("p_region text");
    expect(sql).toMatch(/'\[\]'::jsonb,null,null,false/i);
    expect(sql).toContain("public applicant attestations were not collected or asserted");
  });

  it("rechecks exact identity under an email-scoped lock before writing", () => {
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("from auth.users where lower(email)=p_normalized_email");
    expect(sql).toContain("from public.research_applications where lower(email)=p_normalized_email");
    expect(sql).toContain("from public.research_members where lower(email)=p_normalized_email");
  });

  it("derives the internal approver from auth.uid and exposes no direct writes", () => {
    expect(sql).toContain("v_actor uuid:=auth.uid()");
    expect(sql).toContain("research_prelaunch_role_assignments");
    expect(sql).toContain("revoke all on public.research_b2b_sponsored_claims from public,anon,authenticated,service_role");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)/i);
  });

  it("atomically activates canonical member and Roman bridge before returning", () => {
    expect(sql).toContain("public.research_activate_sponsored_b2b_buyer");
    expect(sql).toMatch(/set status='active',billing_state='not_started',access_basis='sponsored_b2b'/i);
    expect(sql).toContain("public.research_activate_b2b_buyer_bridge");
    expect(sql).toContain("'b2b_buyer_sponsorship_activated'");
    // The membership router centralizes this refusal in the shared
    // adminAction transition guard, so one source-page check protects every
    // legacy transition path that reaches it. Do not require duplicate guards.
    expect(membership.match(/row\.source_page === "b2b_buyer_sponsored_claim"/g)).toHaveLength(1);
    expect(membership).toContain("Sponsored B2B buyers must use the atomic business-buyer activation path.");
  });

  it("keeps profile and roles business-scoped", () => {
    expect(sql).toContain("profile_key='KRIS_VOLUME_PARTNER'");
    expect(sql).toContain("array['organization_owner','business_buyer']");
    expect(sql).toContain("profile_version integer not null check (profile_version>0)");
    expect(sql).toContain("profile_source_sha text not null");
    expect(sql).toContain("e7bc0b691ed813b5ce024f0026e8ab5ba64d74f4");
  });

  it("preserves the founder-confirmed buyer legal name through activation", () => {
    expect(sql).toContain("business_legal_name text not null");
    expect(sql).toContain("p_business_legal_name text");
    expect(sql).toContain("v_claim.business_legal_name");
  });

  it("uses the database clock after the claim row lock and before any activation mutation", () => {
    const rowLock = activationSql.indexOf("where id=p_sponsorship_id for update");
    const databaseNow = activationSql.indexOf("v_activation_now:=clock_timestamp()");
    const expiryGuard = activationSql.indexOf("v_activation_now>=v_claim.claim_expires_at");
    const firstMutation = activationSql.indexOf("update public.research_members");
    expect(rowLock).toBeGreaterThan(-1);
    expect(databaseNow).toBeGreaterThan(rowLock);
    expect(expiryGuard).toBeGreaterThan(databaseNow);
    expect(firstMutation).toBeGreaterThan(expiryGuard);
    expect(activationSql.slice(rowLock, expiryGuard)).not.toMatch(/^\s*(update|insert|delete)\s/im);
  });

  it("allows before-expiry activation and refuses exact- or after-expiry activation", () => {
    const expiry = Date.parse("2026-08-16T00:00:00.000Z");
    expect(activationDisposition("claim_queued", expiry, expiry - 1)).toBe("activate");
    expect(activationDisposition("claim_queued", expiry, expiry)).toBe("refuse");
    expect(activationDisposition("claim_queued", expiry, expiry + 1)).toBe("refuse");
  });

  it("evaluates a waiter at the post-lock database time at the expiry boundary", () => {
    const expiry = Date.parse("2026-08-16T00:00:00.000Z");
    const transactionStartedBeforeExpiry = expiry - 30_000;
    const lockAcquiredAtExpiry = expiry;
    expect(transactionStartedBeforeExpiry).toBeLessThan(expiry);
    expect(activationDisposition("claim_queued", expiry, lockAcquiredAtExpiry)).toBe("refuse");
  });

  it("keeps valid completed replay read-only and never revives expired queued claims", () => {
    expect(activationDisposition("activated", 100, 200, true)).toBe("replay");
    expect(activationDisposition("activated", 100, 200, false)).toBe("refuse");
    expect(activationDisposition("claim_queued", 100, 200)).toBe("refuse");
    const replayBranch = activationSql.slice(
      activationSql.indexOf("if v_claim.state='activated' then"),
      activationSql.indexOf("if v_claim.state<>'claim_queued' then"),
    );
    expect(replayBranch).toContain("v_claim.activated_at>=v_claim.claim_expires_at");
    expect(replayBranch).toContain("a.id=v_claim.application_id");
    expect(replayBranch).toContain("lower(btrim(u.email))=v_claim.normalized_email");
    expect(replayBranch).toContain("o.roles=v_claim.roles");
    expect(replayBranch).not.toMatch(/\b(update|insert|delete)\b/i);
  });

  it("raises on expiry before member, buyer, entitlement, audit, or outbox writes", () => {
    const guard = activationSql.indexOf("raise exception 'sponsored B2B claim has expired'");
    expect(guard).toBeGreaterThan(-1);
    for (const mutation of [
      "update public.research_members",
      "public.research_activate_b2b_buyer_bridge",
      "update public.research_applications",
      "insert into public.research_application_events",
      "update public.research_b2b_sponsored_claims",
      "insert into public.research_b2b_sponsored_claim_events",
    ]) {
      expect(activationSql.indexOf(mutation)).toBeGreaterThan(guard);
    }
    expect(activationSql).not.toContain("update public.research_notification_outbox");
  });

  it("queues a truthful purpose-scoped claim atomically and independently verifies Auth at activation", () => {
    expect(sql).toContain("public.research_notification_outbox");
    expect(sql).toContain("'b2b_buyer_claim'");
    expect(sql).toContain("'approved_sponsored_b2b'");
    expect(sql).toContain("research_applications_normalized_email_uidx");
    expect(sql).toContain("research_members_normalized_email_uidx");
    expect(sql).toContain("email_confirmed_at");
    expect(sql).not.toContain("research_mark_sponsored_b2b_claim_sent");
    expect(outbox).toContain('case "b2b_buyer_claim"');
    const sponsoredEmail = emails.slice(
      emails.indexOf("export async function sendB2BBuyerClaim"),
      emails.indexOf("export async function sendApplicationDeclined"),
    );
    expect(sponsoredEmail).toContain("does not request a personal membership payment");
    expect(sponsoredEmail).not.toMatch(/\$50|\$25|monthly membership/i);
  });
});
