import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminRecipients, resolveEmailConfiguration } from "./email-config";

// The incident root cause: credentials were only ever fetched from the Replit
// connector, so Render (direct env only) silently sent nothing. These tests pin
// the resolution order: env first, connector fallback, explicit unavailable.

const ENV_KEYS = [
  "RESEND_API_KEY",
  "FROM_EMAIL",
  "REPLY_TO_EMAIL",
  "ADMIN_EMAIL",
  "ADMIN_EMAILS",
  "RESEARCH_NOTIFICATION_EMAILS",
  "REPLIT_CONNECTORS_HOSTNAME",
  "REPL_IDENTITY",
  "WEB_REPL_RENEWAL",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});
afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
});

describe("resolution order", () => {
  it("uses direct env first (the production path)", async () => {
    process.env.RESEND_API_KEY = "re_direct_key";
    process.env.FROM_EMAIL = "xenios <team@xeniostechnology.com>";
    process.env.REPLY_TO_EMAIL = "research@xeniostechnology.com";
    // Even with connector vars present, direct env wins.
    process.env.REPLIT_CONNECTORS_HOSTNAME = "connector.example";
    process.env.REPL_IDENTITY = "x";
    const config = await resolveEmailConfiguration();
    expect(config.provider).toBe("resend-env");
    expect(config.apiKey).toBe("re_direct_key");
    expect(config.replyToEmail).toBe("research@xeniostechnology.com");
  });

  it("falls back to the Replit connector when no direct key exists", async () => {
    process.env.REPLIT_CONNECTORS_HOSTNAME = "connector.example";
    process.env.REPL_IDENTITY = "identity";
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ items: [{ settings: { api_key: "re_connector_key", from_email: "legacy@x.co" } }] }),
    })) as any);
    const config = await resolveEmailConfiguration();
    expect(config.provider).toBe("resend-replit-connector");
    expect(config.apiKey).toBe("re_connector_key");
  });

  it("is explicitly unavailable with neither path", async () => {
    const config = await resolveEmailConfiguration();
    expect(config.provider).toBe("unavailable");
    expect(config.apiKey).toBeUndefined();
  });
});

describe("admin recipients", () => {
  it("normalizes, deduplicates, and validates across all three variables", () => {
    process.env.ADMIN_EMAIL = "samuel@xeniostechnology.com";
    process.env.ADMIN_EMAILS = "Samuel@XeniosTechnology.com , ops@xeniostechnology.com";
    process.env.RESEARCH_NOTIFICATION_EMAILS = "ops@xeniostechnology.com, not-an-email, ";
    const list = adminRecipients();
    expect(list).toEqual(["ops@xeniostechnology.com", "samuel@xeniostechnology.com"]);
  });

  it("defaults to Samuel when nothing is configured", () => {
    expect(adminRecipients()).toEqual(["samuel@xeniostechnology.com"]);
  });
});
