import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  REQUEST_SUBMITTED_STAFF_TEMPLATE,
  requestSubmittedStaffNoticeConfig,
  sendRequestSubmittedStaffNotice,
} from "./staff-notice";

const send = vi.hoisted(() => vi.fn());
vi.mock("../../../services/email", () => ({
  getResendClient: async () => ({ client: { emails: { send } }, fromEmail: "Xenios <staff@example.invalid>" }),
}));

const env = {
  EA_REQUEST_SUBMITTED_STAFF_NOTICE_ENABLED: "true",
  EA_REQUEST_SUBMITTED_STAFF_NOTICE_RECIPIENTS: "team@example.invalid, Samuel@example.invalid",
  EA_REQUEST_SUBMITTED_STAFF_NOTICE_START_AT: "2026-11-15T20:00:00Z",
  SITE_URL: "https://staff.example.invalid",
  RESEND_API_KEY: "synthetic-test-only",
};
const job = {
  event_key: "ea-request-submitted-10000000-0000-4000-8000-000000000001",
  event_type: REQUEST_SUBMITTED_STAFF_TEMPLATE,
  recipient: "team@example.invalid",
  payload: {
    reference: "XRI-10000000000040008000000000000001",
    submittedAt: "2026-11-15T20:10:00+00:00",
    itemCount: 2,
    recipients: ["team@example.invalid", "samuel@example.invalid"],
  },
};

describe("request-submitted staff notice", () => {
  beforeEach(() => send.mockReset());

  it("requires the kill switch, two distinct recipients, a cutoff and the trusted site origin", () => {
    expect(requestSubmittedStaffNoticeConfig(env)?.recipients).toEqual(job.payload.recipients);
    for (const changes of [
      { EA_REQUEST_SUBMITTED_STAFF_NOTICE_ENABLED: "false" },
      { EA_REQUEST_SUBMITTED_STAFF_NOTICE_RECIPIENTS: "team@example.invalid,TEAM@example.invalid" },
      { EA_REQUEST_SUBMITTED_STAFF_NOTICE_RECIPIENTS: "team@example.invalid" },
      { EA_REQUEST_SUBMITTED_STAFF_NOTICE_START_AT: undefined },
      { SITE_URL: "http://staff.example.invalid" },
    ]) expect(requestSubmittedStaffNoticeConfig({ ...env, ...changes })).toBeNull();
  });

  it("uses one idempotent send for both configured inboxes with only staff-safe fields", async () => {
    send.mockResolvedValue({ data: { id: "proof" }, error: null });
    const config = requestSubmittedStaffNoticeConfig(env)!;
    expect(await sendRequestSubmittedStaffNotice(job, config, env)).toEqual({ ok: true, providerId: "proof" });
    expect(send).toHaveBeenCalledExactlyOnceWith({
      from: "Xenios <staff@example.invalid>",
      to: job.payload.recipients,
      subject: "New Early Access request",
      text: "Request XRI-10000000000040008000000000000001\nSubmitted Nov 15, 2026, 2:10 PM Central\nItems: 2\nPrivate staff queue: https://staff.example.invalid/care/request-intents",
    }, { idempotencyKey: job.event_key });
  });

  it("refuses changed recipient bindings, unexpected payload fields, and mismatched references", async () => {
    const config = requestSubmittedStaffNoticeConfig(env)!;
    for (const changes of [
      { recipients: ["team@example.invalid", "other@example.invalid"] },
      { address: "private@example.invalid" },
      { reference: "XRI-10000000000040008000000000000002" },
    ]) {
      expect(await sendRequestSubmittedStaffNotice({ ...job, payload: { ...job.payload, ...changes } }, config, env))
        .toMatchObject({ ok: false, nonRetryable: true });
    }
    expect(send).not.toHaveBeenCalled();
  });

  it("returns a retryable failure without exposing a provider error or treating it as delivery", async () => {
    send.mockRejectedValueOnce(new Error("untrusted provider details"));
    expect(await sendRequestSubmittedStaffNotice(job, requestSubmittedStaffNoticeConfig(env)!, env))
      .toEqual({ ok: false, providerId: null, error: "Staff notice email was not accepted." });
  });
});
