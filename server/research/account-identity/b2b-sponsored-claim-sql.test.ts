import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.resolve(
  "supabase/pack02-candidates/20260813_research_b2b_sponsored_claim.sql",
), "utf8");
const membership = fs.readFileSync(path.resolve("server/research/membership.ts"), "utf8");

describe("sponsored B2B claim candidate", () => {
  it("never depends on the colliding organization table", () => {
    expect(sql).not.toMatch(/public\.research_organizations/i);
    expect(sql).toContain("public.research_b2b_buyer_relationships");
  });

  it("records truthful sponsorship provenance without applicant attestations", () => {
    expect(sql).toContain("'b2b_buyer_sponsored_claim'");
    expect(sql).toMatch(/false,p_applicant_type/i);
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
    expect(sql).toMatch(/set status='active',billing_state='active'/i);
    expect(sql).toContain("public.research_activate_b2b_buyer_bridge");
    expect(sql).toContain("'b2b_buyer_sponsorship_activated'");
    expect(membership.match(/row\.source_page === "b2b_buyer_sponsored_claim"/g)).toHaveLength(2);
    expect(membership).toContain("Sponsored B2B buyers must use the atomic business-buyer activation path.");
  });

  it("keeps profile and roles business-scoped", () => {
    expect(sql).toContain("profile_key='KRIS_VOLUME_PARTNER'");
    expect(sql).toContain("array['organization_owner','business_buyer']");
    expect(sql).toContain("profile_version integer not null check (profile_version>0)");
  });
});
