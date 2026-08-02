import { describe, expect, it } from "vitest";
import { createMembershipApplication, decideMembershipApplication } from "./kernel";

const APPLICATION_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
const REVIEWER_ID = "33333333-3333-4333-8333-333333333333";
const SUBMIT_KEY = "44444444-4444-4444-8444-444444444444";
const DECISION_KEY = "55555555-5555-4555-8555-555555555555";

const submission = {
  applicationId: APPLICATION_ID,
  accountId: ACCOUNT_ID,
  recipientEmail: " Member@Example.com ",
  submittedAt: "2026-08-02T23:40:00.000Z",
  idempotencyKey: SUBMIT_KEY,
};

const assessment = {
  verified: true,
  action: "membership_application",
  hostnameVerified: true,
  assessedAt: "2026-08-02T23:39:30.000Z",
  expiresAt: "2026-08-02T23:44:30.000Z",
  errorCodes: [],
};

function submittedApplication() {
  const result = createMembershipApplication(submission, assessment);
  if (!result.ok) throw new Error(result.code);
  return result.value.application;
}

const approval = {
  applicationId: APPLICATION_ID,
  actorPrincipalId: REVIEWER_ID,
  actorRole: "membership_reviewer",
  decision: "approve",
  reasonCode: "eligibility_confirmed",
  decidedAt: "2026-08-02T23:42:00.000Z",
  idempotencyKey: DECISION_KEY,
};

describe("auth/admin notification kernel", () => {
  it("accepts a verified application without granting access or checkout", () => {
    const result = createMembershipApplication(submission, assessment);
    expect(result).toEqual({
      ok: true,
      value: {
        application: {
          applicationId: APPLICATION_ID,
          accountId: ACCOUNT_ID,
          recipientEmail: "member@example.com",
          state: "submitted",
          createdAt: submission.submittedAt,
          updatedAt: submission.submittedAt,
          accessGranted: false,
          checkoutEligible: false,
        },
        notification: {
          intentId: SUBMIT_KEY,
          template: "membership_application_received",
          recipientEmail: "member@example.com",
          idempotencyKey: SUBMIT_KEY,
          variables: { applicationReference: APPLICATION_ID, nextState: "submitted" },
        },
        audit: {
          eventId: SUBMIT_KEY,
          applicationId: APPLICATION_ID,
          actorPrincipalId: ACCOUNT_ID,
          actorRole: "public_applicant",
          eventType: "application_submitted",
          occurredAt: submission.submittedAt,
        },
      },
    });
  });

  it.each([
    [{ ...assessment, verified: false }, "turnstile_required"],
    [{ ...assessment, hostnameVerified: false }, "turnstile_required"],
    [{ ...assessment, errorCodes: ["timeout-or-duplicate"] }, "turnstile_required"],
    [{ ...assessment, expiresAt: "2026-08-02T23:39:59.000Z" }, "turnstile_expired"],
  ])("fails closed for invalid Turnstile evidence", (evidence, code) => {
    expect(createMembershipApplication(submission, evidence)).toMatchObject({ ok: false, code });
  });

  it("rejects raw/unknown application fields", () => {
    expect(createMembershipApplication({ ...submission, turnstileToken: "secret" }, assessment)).toMatchObject({
      ok: false,
      code: "invalid_input",
    });
  });

  it("allows only membership reviewers to decide", () => {
    for (const actorRole of ["support_viewer", "product_control_observer"]) {
      expect(decideMembershipApplication(submittedApplication(), { ...approval, actorRole })).toMatchObject({
        ok: false,
        code: "forbidden",
      });
    }
  });

  it("approves only into pending activation and emits a minimum-necessary intent", () => {
    const result = decideMembershipApplication(submittedApplication(), approval);
    expect(result).toMatchObject({
      ok: true,
      value: {
        application: {
          state: "approved_pending_activation",
          accessGranted: false,
          checkoutEligible: false,
        },
        notification: {
          template: "membership_application_approved_pending_activation",
          variables: {
            applicationReference: APPLICATION_ID,
            nextState: "approved_pending_activation",
          },
        },
        audit: { reasonCode: "eligibility_confirmed" },
      },
    });
    if (!result.ok) throw new Error(result.code);
    expect(result.value.notification.variables).not.toHaveProperty("reasonCode");
    expect(result.value.notification.variables).not.toHaveProperty("actorPrincipalId");
  });

  it("rejects mismatched reason codes, repeat decisions, and cross-application decisions", () => {
    expect(decideMembershipApplication(submittedApplication(), {
      ...approval,
      reasonCode: "application_incomplete",
    })).toMatchObject({ ok: false, code: "decision_reason_mismatch" });

    const approved = decideMembershipApplication(submittedApplication(), approval);
    if (!approved.ok) throw new Error(approved.code);
    expect(decideMembershipApplication(approved.value.application, approval)).toMatchObject({
      ok: false,
      code: "state_conflict",
    });
    expect(decideMembershipApplication(submittedApplication(), {
      ...approval,
      applicationId: "66666666-6666-4666-8666-666666666666",
    })).toMatchObject({ ok: false, code: "state_conflict" });
  });

  it("is byte-deterministic and side-effect free for identical commands", () => {
    const first = decideMembershipApplication(submittedApplication(), approval);
    const second = decideMembershipApplication(submittedApplication(), approval);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
