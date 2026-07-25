import fs from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import {
  registerAgreementPackageReconciler,
  runAgreementPackageReconciler,
} from "./agreement-package-reconciliation";

describe("agreement package reconciliation coordinator", () => {
  it("runs the registered restart-safe reconciler and can be reset", async () => {
    const reconcile = vi.fn(async () => undefined);
    registerAgreementPackageReconciler(reconcile);
    await runAgreementPackageReconciler();
    expect(reconcile).toHaveBeenCalledTimes(1);

    registerAgreementPackageReconciler(null);
    await runAgreementPackageReconciler();
    expect(reconcile).toHaveBeenCalledTimes(1);
  });
});

describe("agreement package notification migration", () => {
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/research-agreement-package-notifications.sql"),
    "utf8",
  );

  it("captures clickwrap/native and provider completion in the legal transaction without backfill", () => {
    expect(sql).toContain("after insert on public.research_fm_document_signatures");
    expect(sql).toContain("after update on public.research_fm_esign_requests");
    expect(sql).toContain("new.provider <> 'xenios_native'");
    expect(sql).not.toMatch(/insert\s+into\s+public\.research_fm_agreement_email_candidates[\s\S]+select\s+.+from\s+public\.research_fm_document_signatures/i);
  });

  it("atomically inserts exactly the member and admin jobs with stable keys", () => {
    expect(sql).toContain(
      "'research_agreement_package_completed_member:' || v_candidate.member_id || ':' || p_package_version",
    );
    expect(sql).toContain(
      "'research_agreement_package_completed_admin:' || v_candidate.member_id || ':' || p_package_version",
    );
    expect(sql).toContain("'fm_agreement_package_completed_member'");
    expect(sql).toContain("'fm_admin_agreement_package_completed'");
    expect(sql).toContain("on conflict (event_key) do nothing");
    expect(sql).toMatch(
      /insert into public\.research_notification_outbox[\s\S]+values[\s\S]+\),\s*\([\s\S]+on conflict \(event_key\) do nothing;/i,
    );
    expect(sql).toContain("research_fm_agreement_email_candidate_context");
    expect(sql).toContain("'timeline'");
    expect(sql).toContain("'signatures'");
    expect(sql).toContain("'providerCompletions'");
    expect(sql).toContain("'versions'");
  });

  it("keeps the candidate table private and RPCs service-role only", () => {
    expect(sql).toContain(
      "revoke all on table public.research_fm_agreement_email_candidates from public, anon, authenticated",
    );
    expect(sql).toMatch(
      /revoke all on function public\.research_fm_current_agreement_publication_snapshot\(\)\s+from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.research_fm_agreement_email_candidate_context\(uuid\)\s+from public, anon, authenticated/i,
    );
    expect(sql).toContain("grant execute on function public.research_fm_complete_agreement_email_candidate");
    expect(sql).toContain("to service_role");
  });
});
