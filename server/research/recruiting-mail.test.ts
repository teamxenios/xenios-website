import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RECRUITING_MAIL_PATH,
  redactEmail,
  registerRecruitingMail,
  type RecruitingMailDeps,
} from "./recruiting-mail";

const AUTOMATION_TOKEN = "test-automation-token-0123456789abcdef";
const CONTROLLER = "samuel@xeniostechnology.com";
const DIGEST_SUBJECT = "[XENIOS CANDIDATE DIGEST] Medical Spa | PM | Aug 24 | XMD-20260824-PM";
const RECEIPT_SUBJECT = "[XENIOS RECRUITING RECEIPT] XMD-20260824-PM";

const sendMail = vi.fn(async () => ({ id: "resend-msg-123" }));

function buildApp(overrides: Partial<RecruitingMailDeps> = {}) {
  const app = express();
  app.use(express.json({ limit: "256kb" }));
  registerRecruitingMail(app, {
    sendMail,
    automationToken: () => AUTOMATION_TOKEN,
    rateLimit: async () => true,
    log: () => {},
    // Interactive path: a stand-in for the Supabase admin gate.
    requireAdmin: (req: Request, res: Response, next: NextFunction) => {
      if (req.headers["x-test-admin"] === "yes") {
        (req as any).adminEmail = CONTROLLER;
        return next();
      }
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    },
    ...overrides,
  });
  return app;
}

function auto(app: express.Express) {
  return request(app).post(RECRUITING_MAIL_PATH).set("x-recruiting-automation-token", AUTOMATION_TOKEN);
}

const interviewBody = {
  kind: "interview_email",
  to: "kirstie@example.com",
  subject: "Medical Spa & Wellness Clinic Partnerships Executive - Xenios Research",
  text: "Hi, thanks for applying...",
  candidate_id: "b9984e3ab879",
  candidate_email: "kirstie@example.com",
  candidate_email_source: "resume header",
  candidate_email_status: "DIRECT_EMAIL_FOUND",
  digest_id: "XMD-20260824-PM",
  samuel_approval_reference: "gmail-msg-abc123",
  template_version: "INT-2026-08-24-01",
};

beforeEach(() => {
  sendMail.mockClear();
});

describe("recruiting mail - accepted sends", () => {
  it("sends a candidate digest to Samuel", async () => {
    const app = buildApp();
    const res = await auto(app).send({
      kind: "candidate_digest",
      to: CONTROLLER,
      subject: DIGEST_SUBJECT,
      text: "digest body",
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, providerMessageId: "resend-msg-123" });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toMatchObject({
      from: "xenios <team@xeniostechnology.com>",
      to: CONTROLLER,
      replyTo: "team@xeniostechnology.com",
    });
  });

  it("sends a recruiting receipt to Samuel", async () => {
    const app = buildApp();
    const res = await auto(app).send({
      kind: "recruiting_receipt",
      to: CONTROLLER,
      subject: RECEIPT_SUBJECT,
      text: "receipt body",
    });
    expect(res.status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it("sends an interview email when the approval record is complete", async () => {
    const app = buildApp();
    const res = await auto(app).send(interviewBody);
    expect(res.status).toBe(200);
    expect(res.body.providerMessageId).toBe("resend-msg-123");
    expect(sendMail.mock.calls[0][0].to).toBe("kirstie@example.com");
  });

  it("accepts the interactive admin session path", async () => {
    const app = buildApp();
    const res = await request(app)
      .post(RECRUITING_MAIL_PATH)
      .set("x-test-admin", "yes")
      .send({ kind: "candidate_digest", to: CONTROLLER, subject: DIGEST_SUBJECT, text: "body" });
    expect(res.status).toBe(200);
  });
});

describe("recruiting mail - authentication", () => {
  it("rejects a missing credential", async () => {
    const app = buildApp();
    const res = await request(app)
      .post(RECRUITING_MAIL_PATH)
      .send({ kind: "candidate_digest", to: CONTROLLER, subject: DIGEST_SUBJECT, text: "b" });
    expect(res.status).toBe(401);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("rejects an invalid automation token without falling through to the admin gate", async () => {
    const app = buildApp();
    const res = await request(app)
      .post(RECRUITING_MAIL_PATH)
      .set("x-recruiting-automation-token", "wrong-token")
      .set("x-test-admin", "yes")
      .send({ kind: "candidate_digest", to: CONTROLLER, subject: DIGEST_SUBJECT, text: "b" });
    expect(res.status).toBe(401);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("refuses when no automation secret is configured", async () => {
    const app = buildApp({ automationToken: () => undefined });
    const res = await auto(app).send({
      kind: "candidate_digest",
      to: CONTROLLER,
      subject: DIGEST_SUBJECT,
      text: "b",
    });
    expect(res.status).toBe(503);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("recruiting mail - envelope is server controlled", () => {
  it.each(["from", "replyTo", "cc", "bcc"])("rejects a caller-supplied %s", async (field) => {
    const app = buildApp();
    const res = await auto(app).send({
      kind: "candidate_digest",
      to: CONTROLLER,
      subject: DIGEST_SUBJECT,
      text: "b",
      [field]: "attacker@example.com",
    });
    expect(res.status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("rejects multiple recipients", async () => {
    const app = buildApp();
    const res = await auto(app).send({
      kind: "candidate_digest",
      to: [CONTROLLER, "someone@example.com"],
      subject: DIGEST_SUBJECT,
      text: "b",
    });
    expect(res.status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("rejects an unsupported mail kind", async () => {
    const app = buildApp();
    const res = await auto(app).send({
      kind: "marketing_blast",
      to: CONTROLLER,
      subject: "hello",
      text: "b",
    });
    expect(res.status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("recruiting mail - internal digest constraints", () => {
  it("rejects a digest addressed to anyone but Samuel", async () => {
    const app = buildApp();
    const res = await auto(app).send({
      kind: "candidate_digest",
      to: "someone-else@xeniostechnology.com",
      subject: DIGEST_SUBJECT,
      text: "b",
    });
    expect(res.status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("rejects a digest without the required subject prefix", async () => {
    const app = buildApp();
    const res = await auto(app).send({
      kind: "candidate_digest",
      to: CONTROLLER,
      subject: "Morning candidates",
      text: "b",
    });
    expect(res.status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("rejects a receipt without the required subject prefix", async () => {
    const app = buildApp();
    const res = await auto(app).send({
      kind: "recruiting_receipt",
      to: CONTROLLER,
      subject: "done",
      text: "b",
    });
    expect(res.status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("recruiting mail - interview approval record", () => {
  it.each([
    "candidate_id",
    "digest_id",
    "template_version",
    "samuel_approval_reference",
    "candidate_email_source",
  ])("rejects a missing %s", async (field) => {
    const app = buildApp();
    const payload: Record<string, unknown> = { ...interviewBody };
    delete payload[field];
    const res = await auto(app).send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Incomplete approval record");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it.each(["INDEED_RELAY_ONLY", "NO_DIRECT_EMAIL_FOUND", "EMAIL_UNCLEAR", "INCOMPLETE_PROFILE"])(
    "rejects candidate_email_status %s",
    async (status) => {
      const app = buildApp();
      const res = await auto(app).send({ ...interviewBody, candidate_email_status: status });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain("DIRECT_EMAIL_FOUND");
      expect(sendMail).not.toHaveBeenCalled();
    },
  );

  it.each(["applicant+abc@indeedemail.com", "someone@indeed.com"])(
    "rejects the Indeed relay address %s",
    async (address) => {
      const app = buildApp();
      const res = await auto(app).send({ ...interviewBody, to: address, candidate_email: address });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain("relay");
      expect(sendMail).not.toHaveBeenCalled();
    },
  );

  it("rejects a candidate_email that does not match the recipient", async () => {
    const app = buildApp();
    const res = await auto(app).send({ ...interviewBody, candidate_email: "other@example.com" });
    expect(res.status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("rejects the controller mailbox as a candidate recipient", async () => {
    const app = buildApp();
    const res = await auto(app).send({
      ...interviewBody,
      to: CONTROLLER,
      candidate_email: CONTROLLER,
    });
    expect(res.status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("recruiting mail - limits and logging", () => {
  it("rejects an over-long subject", async () => {
    const app = buildApp();
    const res = await auto(app).send({
      kind: "candidate_digest",
      to: CONTROLLER,
      subject: "[XENIOS CANDIDATE DIGEST] " + "x".repeat(300),
      text: "b",
    });
    expect(res.status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("rejects an over-long body", async () => {
    const app = buildApp();
    const res = await auto(app).send({
      kind: "candidate_digest",
      to: CONTROLLER,
      subject: DIGEST_SUBJECT,
      text: "x".repeat(20_001),
    });
    expect(res.status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("returns 429 when the rate limiter refuses", async () => {
    const app = buildApp({ rateLimit: async () => false });
    const res = await auto(app).send({
      kind: "candidate_digest",
      to: CONTROLLER,
      subject: DIGEST_SUBJECT,
      text: "b",
    });
    expect(res.status).toBe(429);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("never writes the body, recipient, or token into the audit line", async () => {
    const lines: string[] = [];
    const app = buildApp({ log: (m) => lines.push(m) });
    await auto(app).send({ ...interviewBody, text: "SECRET-BODY-CONTENT" });
    const joined = lines.join("\n");
    expect(joined).not.toContain("SECRET-BODY-CONTENT");
    expect(joined).not.toContain(AUTOMATION_TOKEN);
    expect(joined).not.toContain("kirstie@example.com");
    expect(joined).toContain("k***@example.com");
    expect(joined).toContain("providerId=resend-msg-123");
  });

  it("reports a provider rejection as 502", async () => {
    const app = buildApp({ sendMail: vi.fn(async () => ({ id: undefined })) });
    const res = await auto(app).send({
      kind: "candidate_digest",
      to: CONTROLLER,
      subject: DIGEST_SUBJECT,
      text: "b",
    });
    expect(res.status).toBe(502);
  });

  it("redacts an address to its first character and domain", () => {
    expect(redactEmail("kirstie@example.com")).toBe("k***@example.com");
    expect(redactEmail("nonsense")).toBe("<redacted>");
  });
});
