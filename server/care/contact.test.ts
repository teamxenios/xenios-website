import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  CARE_CONTACT_PATH,
  registerCareContactApi,
  type CareContactDependencies,
} from "./contact";
import { unconfiguredCareAccessDependencies } from "./access";
import { registerCareApi } from "./index";

const validMessage = {
  name: "Jordan Test",
  email: "jordan@example.test",
  persona: "other",
  subject: "Care pathway support",
  message: "I need help finding the correct nonclinical Care support pathway.",
};

function dependencies(
  overrides: Partial<CareContactDependencies> = {},
): CareContactDependencies {
  return {
    allowRequest: vi.fn(async () => true),
    sendMessage: vi.fn(async () => undefined),
    sendAutoReply: vi.fn(async () => undefined),
    ...overrides,
  };
}

function appFor(deps: CareContactDependencies) {
  const app = express();
  app.use(express.json());
  registerCareContactApi(app, deps);
  return app;
}

function integratedAppFor(deps: CareContactDependencies) {
  const app = express();
  app.use(express.json());
  registerCareApi(app, unconfiguredCareAccessDependencies(), {
    contactDependencies: deps,
  });
  return app;
}

describe("Care public contact boundary", () => {
  it("is mounted by the existing Care registrar", async () => {
    const deps = dependencies();
    const response = await request(integratedAppFor(deps))
      .post(CARE_CONTACT_PATH)
      .send(validMessage);

    expect(response.status).toBe(200);
    expect(deps.sendMessage).toHaveBeenCalledExactlyOnceWith(validMessage);
    expect(deps.sendAutoReply).toHaveBeenCalledExactlyOnceWith(validMessage);
  });

  it("validates and routes one nonclinical message through both Health email seams", async () => {
    const deps = dependencies();
    const response = await request(appFor(deps))
      .post(CARE_CONTACT_PATH)
      .send(validMessage);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, message: "We have it." });
    expect(deps.sendMessage).toHaveBeenCalledExactlyOnceWith(validMessage);
    expect(deps.sendAutoReply).toHaveBeenCalledExactlyOnceWith(validMessage);
  });

  it("keeps the honeypot silent and performs no mail or limiter work", async () => {
    const deps = dependencies();
    const response = await request(appFor(deps))
      .post(CARE_CONTACT_PATH)
      .send({ ...validMessage, website: "bot.example" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(deps.allowRequest).not.toHaveBeenCalled();
    expect(deps.sendMessage).not.toHaveBeenCalled();
    expect(deps.sendAutoReply).not.toHaveBeenCalled();
  });

  it("rate limits before validation or email dispatch", async () => {
    const deps = dependencies({ allowRequest: vi.fn(async () => false) });
    const response = await request(appFor(deps))
      .post(CARE_CONTACT_PATH)
      .send({ unexpected: true });

    expect(response.status).toBe(429);
    expect(deps.sendMessage).not.toHaveBeenCalled();
    expect(deps.sendAutoReply).not.toHaveBeenCalled();
  });

  it("rejects malformed payloads without dispatching email", async () => {
    const deps = dependencies();
    const response = await request(appFor(deps))
      .post(CARE_CONTACT_PATH)
      .send({ ...validMessage, message: "too short" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(deps.sendMessage).not.toHaveBeenCalled();
    expect(deps.sendAutoReply).not.toHaveBeenCalled();
  });
});
