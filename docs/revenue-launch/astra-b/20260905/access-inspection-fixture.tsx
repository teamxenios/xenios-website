// Local-only visual fixture, never imported by a production route. The real
// panel and its adapter execute against invented DTOs, not an admin provider.
import "@vitejs/plugin-react/preamble";
import { useState, type MouseEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  APPROVED_USER_ACCESS_PATH,
  ApprovedUserAccessInput,
  ApprovedUserAccessSchema,
  type ApprovedUserAccess,
} from "../../../../shared/research/approved-user-access";
import {
  APPROVE_CUSTOMER_ACCESS_PATH,
  ApprovedCustomerApprovalInput,
  CustomerApprovalResult,
} from "../../../../shared/research/approved-customer-access";
import { MemberAccessDiagnosisPanel } from "../../../../client/src/research/pages/adminx/MemberAccessDiagnosisPanel";
import "../../../../client/src/index.css";
import "../../../../client/src/fonts";

type Scenario = "absent" | "customer" | "partner" | "conflict" | "unavailable" | "invalid"
  | "approval-ready" | "approval-reviewed" | "approval-uncertain" | "approval-stale";
type FixtureAdmin = "A" | "B";
const ADMIN_TOKENS: Record<FixtureAdmin, string> = {
  A: "synthetic-access-inspection-admin-a-not-a-credential",
  B: "synthetic-access-inspection-admin-b-not-a-credential",
};
let activeScenario: Scenario = "absent";
let activeAdmin: FixtureAdmin = "A";
// Ephemeral synthetic request identity only: never store names, reasons,
// addresses, credentials, or approval data in browser storage or logs.
let mockApprovalRequestKey: string | null = null;
const APPROVAL_SCENARIOS = new Set<Scenario>(["approval-ready", "approval-reviewed", "approval-uncertain", "approval-stale"]);
const FIXTURE_REVISION = "2026-09-05T12:00:00.000Z";
const fixtureIds = {
  auth: "00000000-0000-4000-8000-000000000a01",
  otherAuth: "00000000-0000-4000-8000-000000000a02",
  application: "00000000-0000-4000-8000-000000000b01",
  member: "00000000-0000-4000-8000-000000000c01",
  otherMember: "00000000-0000-4000-8000-000000000c02",
  partner: "00000000-0000-4000-8000-000000000d01",
  organization: "00000000-0000-4000-8000-000000000e01",
} as const;
const memberHref = `/admin/research/members/${fixtureIds.member}`;
const applicationHref = `/admin/research/applications/${fixtureIds.application}`;

function inspectionFor(email: string, scenario: Scenario): ApprovedUserAccess {
  const inspection: ApprovedUserAccess = {
    schemaVersion: 1,
    observedAt: "2026-09-05T12:00:00.000Z",
    email,
    identityState: "absent",
    authAccounts: [], applications: [], members: [], partners: [],
    organizationRelationships: { state: "unavailable", records: [] },
    boundaries: {
      care: "separate_authority", membershipBillingEnabled: false, customerAccessApproval: "unavailable",
      partnerLifecycleReview: "unavailable", referralEligibility: "checked_by_referral_authority",
    },
    nextActions: [{
      label: "No administrative record is available",
      href: null,
      consequence: "There is no account or application in this synthetic scenario to review. Creating an account or sending an invitation is outside this read-only inspection.",
      notification: "not_available",
    }],
  };
  if (scenario === "customer" || scenario === "partner" || scenario === "conflict") {
    inspection.identityState = "verified";
    inspection.authAccounts = [{ authUserId: fixtureIds.auth, emailVerified: true, signInRecorded: true }];
    inspection.applications = [{ id: fixtureIds.application, status: "approved", href: applicationHref }];
    inspection.members = [{
      id: fixtureIds.member, status: "active", authUserId: fixtureIds.auth,
      binding: "verified", href: memberHref,
    }];
    inspection.organizationRelationships = { state: "available", records: [] };
    inspection.nextActions = [
      {
        label: "Review member record", href: memberHref,
        consequence: "Opening this administrative record is read-only. It does not grant access, activate billing, or send email; any later change is a separate action.",
        notification: "none",
      },
      {
        label: "Review application record", href: applicationHref,
        consequence: "Opening this administrative record does not approve an application or send an application message.",
        notification: "none",
      },
    ];
  }
  if (scenario === "partner") {
    inspection.partners = [{
      id: fixtureIds.partner, memberId: fixtureIds.member, role: "affiliate",
      state: "training_pending", binding: "verified",
      missingRequirements: ["Complete the current compliance training module", "Record current agreement acceptance before lifecycle review"],
    }];
    inspection.organizationRelationships = { state: "available", records: [{
      organizationId: fixtureIds.organization, state: "active", roles: ["organization_member"],
    }] };
    inspection.nextActions.push({
      label: "Partner lifecycle change is unavailable", href: null,
      consequence: "This inspection does not grant partner activation, earning, payout, referral, or organization-wide access. The authoritative workflow must verify the remaining requirements.",
      notification: "not_available",
    });
  }
  if (scenario === "conflict") {
    inspection.identityState = "conflict";
    inspection.authAccounts.push({ authUserId: fixtureIds.otherAuth, emailVerified: false, signInRecorded: false });
    inspection.members[0].binding = "conflict";
    inspection.members.push({
      id: fixtureIds.otherMember, status: "pending_activation", authUserId: fixtureIds.otherAuth,
      binding: "conflict", href: `/admin/research/members/${fixtureIds.otherMember}`,
    });
    inspection.partners = [{
      id: fixtureIds.partner, memberId: fixtureIds.member, role: "professional_partner",
      state: "identity_verification_pending", binding: "conflict",
      missingRequirements: ["Resolve the conflicting authenticated-account binding using authoritative records; do not merge by matching name or email"],
    }];
    inspection.organizationRelationships = { state: "unavailable", records: [] };
    inspection.nextActions.unshift({
      label: "Identity conflict requires separate review", href: null,
      consequence: "Do not create, merge, approve, invite, or activate from this inspection. A verified identity decision is required before any later authorization workflow.",
      notification: "not_available",
    });
  }
  if (APPROVAL_SCENARIOS.has(scenario)) {
    inspection.boundaries.customerAccessApproval = "available";
    inspection.nextActions = [{
      label: "Review the separate synthetic approval form",
      href: null,
      consequence: "Only the explicit confirmation below simulates approval. No real record changes or emails can occur in this fixture; the mock result reports queued, never delivered.",
      notification: "none",
    }];
    if (scenario !== "approval-ready") {
      inspection.identityState = "verified";
      inspection.authAccounts = [{ authUserId: fixtureIds.auth, emailVerified: true, signInRecorded: true }];
      inspection.applications = [{
        id: fixtureIds.application,
        status: scenario === "approval-reviewed" ? "active" : scenario === "approval-uncertain" ? "approved_customer" : "under_review",
        href: applicationHref,
        updatedAt: FIXTURE_REVISION,
      }];
      inspection.members = [{
        id: fixtureIds.member,
        status: scenario === "approval-reviewed" ? "past_due" : "pending_activation",
        authUserId: fixtureIds.auth, binding: "verified", href: memberHref,
      }];
      inspection.boundaries.membershipBillingEnabled = scenario === "approval-reviewed";
    }
  }
  // Every nominal response is reconciled with the exact shared strict schema.
  return ApprovedUserAccessSchema.parse(inspection);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

// No fallback to native fetch exists. Only these two exact local mock POSTs
// are accepted. No input is logged or sent to a real API or provider.
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const scenario = activeScenario;
  const admin = activeAdmin;
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  if (url.origin !== window.location.origin || url.username !== "" || url.password !== ""
    || ![APPROVED_USER_ACCESS_PATH, APPROVE_CUSTOMER_ACCESS_PATH].includes(url.pathname)
    || url.search !== "" || url.hash !== "" || method !== "POST"
    || headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new TypeError("This synthetic fixture has no network access.");
  }
  if (headers.get("Authorization") !== `Bearer ${ADMIN_TOKENS[admin]}`) {
    return jsonResponse({ ok: false, code: "fixture_admin_required" }, 401);
  }
  let body: unknown;
  try {
    const text = typeof init?.body === "string" ? init.body : input instanceof Request ? await input.clone().text() : "";
    body = JSON.parse(text);
  } catch {
    return jsonResponse({ ok: false, code: "invalid_input" }, 400);
  }
  if (scenario !== activeScenario || admin !== activeAdmin) {
    return jsonResponse({ ok: false, code: "stale_inspection" }, 409);
  }
  if (url.pathname === APPROVE_CUSTOMER_ACCESS_PATH) {
    const approval = ApprovedCustomerApprovalInput.safeParse(body);
    if (!approval.success || !approval.data.email.endsWith("@fixture.invalid")) {
      return jsonResponse({ ok: false, code: "invalid_input" }, 400);
    }
    if (!APPROVAL_SCENARIOS.has(scenario)) {
      return jsonResponse({ ok: false, code: "capability_disabled" }, 403);
    }
    const application = inspectionFor(approval.data.email, scenario).applications[0];
    if (scenario === "approval-stale" || approval.data.expectedApplicationId !== (application?.id ?? null)
      || approval.data.expectedUpdatedAt !== (application?.updatedAt ?? null)) {
      return jsonResponse({ ok: false, code: "stale_inspection" }, 409);
    }
    if (mockApprovalRequestKey !== null && mockApprovalRequestKey !== approval.data.idempotencyKey) {
      return jsonResponse({ ok: false, code: "idempotency_conflict" }, 409);
    }
    const replayed = mockApprovalRequestKey === approval.data.idempotencyKey;
    mockApprovalRequestKey = approval.data.idempotencyKey;
    if (scenario === "approval-uncertain" && !replayed) {
      // Simulate a lost result AFTER the invented request was recorded. The
      // real form must retain its exact key and payload for the next attempt.
      return jsonResponse({ ok: false, code: "fixture_outcome_unconfirmed" }, 503);
    }
    return jsonResponse(CustomerApprovalResult.parse({
      ok: true, applicationId: fixtureIds.application, approvalVersion: 1,
      state: "approved_customer", delivery: "queued", expiresAt: "2026-09-19T12:00:00.000Z", replayed,
    }));
  }
  const parsed = ApprovedUserAccessInput.safeParse(body);
  if (!parsed.success || !parsed.data.email.endsWith("@fixture.invalid")) {
    return jsonResponse({
      ok: false, code: "fixture_email_required",
      message: "Use only a synthetic address ending @fixture.invalid. Nothing was sent.",
    }, 400);
  }
  if (scenario === "unavailable") {
    return jsonResponse({ ok: false, code: "inspection_unavailable" }, 503);
  }
  const inspection = inspectionFor(parsed.data.email, scenario);
  if (scenario === "invalid") {
    return jsonResponse({ ok: true, inspection: { ...inspection, schemaVersion: 99 } });
  }
  return jsonResponse({ ok: true, inspection });
};

function Fixture() {
  const [scenario, setScenario] = useState<Scenario>("absent");
  const [admin, setAdmin] = useState<FixtureAdmin>("A");
  const [navigationNotice, setNavigationNotice] = useState("");
  function preventFixtureNavigation(event: MouseEvent<HTMLElement>) {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor) return;
    event.preventDefault();
    setNavigationNotice("Synthetic review link selected. No administrative record was opened and no action was performed.");
  }
  return <main className="research-app ra-admin container-x" style={{ paddingTop: 24, paddingBottom: 48, overflowWrap: "anywhere" }} onClickCapture={preventFixtureNavigation}>
    <h1 className="body-l font-700">Synthetic access inspection QA</h1>
    <p className="body-s my-4">Synthetic UI fixture, no real provider or admin authority. Approval scenarios simulate ephemeral local mutations only. No actual approvals, emails, invitations, billing changes or production actions occur.</p>
    <p className="body-s mb-4">Enter any invented address ending <code>@fixture.invalid</code>, such as <code>customer@fixture.invalid</code>. Other addresses are refused locally and nothing is logged. The observation time is a fixed fixture timestamp.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 16, marginBottom: 24 }}>
      <div>
        <label className="form-label" htmlFor="access-qa-scenario">QA scenario</label>
        <select id="access-qa-scenario" className="input-field" value={scenario} onChange={event => {
          activeScenario = event.target.value as Scenario;
          mockApprovalRequestKey = null;
          setScenario(activeScenario);
          setNavigationNotice("");
        }}>
          <option value="absent">No account or application</option>
          <option value="customer">Verified customer</option>
          <option value="partner">Partner with outstanding requirements</option>
          <option value="conflict">Conflicting identity bindings</option>
          <option value="unavailable">Inspection unavailable</option>
          <option value="invalid">Invalid server response</option>
          <option value="approval-ready">Approval ready — absent customer</option>
          <option value="approval-reviewed">Reviewed past-due customer — active application</option>
          <option value="approval-uncertain">Pending customer — uncertain approval, same-key retry</option>
          <option value="approval-stale">Pending customer — stale approval refusal</option>
        </select>
      </div>
      <div>
        <label className="form-label" htmlFor="access-qa-admin">Synthetic admin context</label>
        <select id="access-qa-admin" className="input-field" value={admin} onChange={event => {
          activeAdmin = event.target.value as FixtureAdmin;
          mockApprovalRequestKey = null;
          setAdmin(activeAdmin);
          setNavigationNotice("");
        }}>
          <option value="A">Synthetic admin A</option>
          <option value="B">Synthetic admin B</option>
        </select>
      </div>
    </div>
    <p className="body-s mb-4">Changing either QA control resets this invented scenario, including its ephemeral mock request key. Resolve the uncertain scenario with the same-request retry before resetting it. Record-review links are visible for QA, but navigation is suppressed.</p>
    {navigationNotice && <p className="body-s mb-4" role="status">{navigationNotice}</p>}
    <MemberAccessDiagnosisPanel key={`${scenario}:${admin}`} token={ADMIN_TOKENS[admin]} />
  </main>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
