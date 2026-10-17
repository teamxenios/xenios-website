import { describe, expect, it } from "vitest";
import {
  INTEGRATION_SPECS,
  MISSING_CANONICAL_NAMES,
  buildIntegrationStatus,
  integrationStatusResponse,
} from "./status";

/**
 * Sentinel values. Every one is a string that could not plausibly appear in the
 * module's own authored text, so if one shows up in the serialized response the
 * only way it got there is by leaking out of the environment.
 */
const SENTINELS = {
  SUPABASE_URL: "https://zzsentinelproject.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_ZZSENTINELANON",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_ZZSENTINELSERVICEROLE",
  RESEARCH_SESSION_SECRET: "ZZSENTINELSESSIONSECRET",
  RESEARCH_ACCESS_PASSWORD: "ZZSENTINELACCESSPASSWORD",
  RESEND_API_KEY: "ZZSENTINELRESENDKEY",
  RESEARCH_EMAIL_FROM: "zzsentinel-from@example.test",
  RESEARCH_EMAIL_REPLY_TO: "zzsentinel-reply@example.test",
  TURNSTILE_SECRET_KEY: "ZZSENTINELTURNSTILESECRET",
  TURNSTILE_SITE_KEY: "ZZSENTINELTURNSTILESITE",
  ADMIN_EMAIL: "zzsentinel-admin@example.test",
  SITE_URL: "https://zzsentinelsite.example.test",
  RESEARCH_PRODUCT_MEDIA_BUCKET: "zzsentinel-media-bucket",
  RESEARCH_COA_BUCKET: "zzsentinel-coa-bucket",
  // Held integrations, supplied anyway so the disabled path is proven to win
  // even when a real-looking value is present.
  PAYMENTS_PROVIDER: "ZZSENTINELPAYMENTPROVIDER",
  PAYMENT_INSTRUCTIONS_ENC_KEY: "ZZSENTINELPAYMENTKEY",
  CARE_TEBRA_BASE_URL: "https://zzsentineltebra.example.test",
  CARE_TEBRA_API_KEY: "ZZSENTINELTEBRAKEY",
  SHIPPING_API_BASE_URL: "https://zzsentinelshipping.example.test",
  SHIPPING_API_AUTH_HEADER: "ZZSENTINELSHIPPINGAUTH",
};

describe("integration status", () => {
  it("never lets an environment value reach the serialized response", () => {
    // Everything present, including the held integrations, which is the state
    // most likely to leak because every branch has something to say.
    const serialized = JSON.stringify(integrationStatusResponse({ ...SENTINELS }));
    for (const [name, value] of Object.entries(SENTINELS)) {
      expect(serialized, `value of ${name} leaked`).not.toContain(value);
    }
    // The sentinels share a distinctive marker; assert on it directly so a
    // partial or transformed value cannot slip past the exact-string checks.
    expect(serialized).not.toContain("ZZSENTINEL");
    expect(serialized).not.toContain("zzsentinel");
  });

  it("carries no field capable of holding a value", () => {
    const rows = buildIntegrationStatus({ ...SENTINELS });
    const allowed = ["key", "system", "variable", "exposure", "state", "enables", "notes"].sort();
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(allowed);
    }
  });

  it("reports a held integration as disabled, never as a missing credential", () => {
    // Commerce, Care and shipping flags all off, and their variables absent.
    // Reporting these as `missing` would put them in the configuration queue and
    // send Samuel to find secrets for features nobody wants switched on.
    const rows = buildIntegrationStatus({});
    const held = rows.filter((r) =>
      ["payment_provider", "payment_instructions_key", "tebra_base_url", "tebra_api_key", "shipping_base_url", "shipping_auth"].includes(
        r.key,
      ),
    );
    expect(held).toHaveLength(6);
    for (const row of held) expect(row.state).toBe("disabled");
  });

  it("keeps a held integration disabled even when its credential is present", () => {
    // Presence must not silently promote a held feature to configured, or the
    // report would imply the feature is ready when its flag says otherwise.
    const rows = buildIntegrationStatus({ ...SENTINELS });
    expect(rows.find((r) => r.key === "payment_provider")?.state).toBe("disabled");
    expect(rows.find((r) => r.key === "tebra_api_key")?.state).toBe("disabled");
  });

  it("reports configured only once the flag is exactly true and the value is present", () => {
    const rows = buildIntegrationStatus({
      ...SENTINELS,
      CARE_TEBRA_SCHEDULING_ENABLED: "true",
    });
    expect(rows.find((r) => r.key === "tebra_base_url")?.state).toBe("configured");
    expect(rows.find((r) => r.key === "tebra_api_key")?.state).toBe("configured");
  });

  it("treats any near-miss flag value as still held", () => {
    for (const value of ["1", "TRUE", "True", " true ", "true\n", "yes", "on", ""]) {
      const rows = buildIntegrationStatus({ ...SENTINELS, CARE_TEBRA_SCHEDULING_ENABLED: value });
      expect(rows.find((r) => r.key === "tebra_api_key")?.state, `flag "${value}" enabled it`).toBe("disabled");
    }
  });

  it("reports missing when a required variable is absent", () => {
    const rows = buildIntegrationStatus({});
    expect(rows.find((r) => r.key === "supabase_runtime_url")?.state).toBe("missing");
    expect(rows.find((r) => r.key === "email_provider")?.state).toBe("missing");
  });

  it("treats whitespace as absent rather than configured", () => {
    const rows = buildIntegrationStatus({ SUPABASE_URL: "   ", RESEND_API_KEY: "\t\n" });
    expect(rows.find((r) => r.key === "supabase_runtime_url")?.state).toBe("missing");
    expect(rows.find((r) => r.key === "email_provider")?.state).toBe("missing");
  });

  it("reports invalid when a value is present but the wrong shape", () => {
    const rows = buildIntegrationStatus({
      SUPABASE_URL: "http://not-https.example.test",
      RESEARCH_EMAIL_FROM: "not-an-address",
      SITE_URL: "ftp://wrong-scheme.example.test",
    });
    expect(rows.find((r) => r.key === "supabase_runtime_url")?.state).toBe("invalid");
    expect(rows.find((r) => r.key === "email_from")?.state).toBe("invalid");
    expect(rows.find((r) => r.key === "site_url")?.state).toBe("invalid");
  });

  it("reports a service-role value in the browser-exposed anon slot as invalid", () => {
    // This is the case that matters most. Such a key WORKS, so nothing else in
    // the system complains: it is served to anonymous callers with a public
    // cache header and bypasses RLS on every table. Reporting it as configured
    // would be the single most dangerous output this module could produce.
    const rows = buildIntegrationStatus({ SUPABASE_ANON_KEY: "sb_secret_ZZSENTINELWRONGSLOT" });
    expect(rows.find((r) => r.key === "supabase_anon_key")?.state).toBe("invalid");
  });

  it("accepts a publishable value in the anon slot", () => {
    const rows = buildIntegrationStatus({ SUPABASE_ANON_KEY: "sb_publishable_ZZSENTINELRIGHTSLOT" });
    expect(rows.find((r) => r.key === "supabase_anon_key")?.state).toBe("configured");
  });

  it("classifies exposure so a server-only secret is never described as public", () => {
    const rows = buildIntegrationStatus({});
    const publicKeys = rows.filter((r) => r.exposure === "public").map((r) => r.key).sort();
    // Exactly two values legitimately reach a browser. Any growth here should be
    // a deliberate review, which is why this asserts the whole set.
    expect(publicKeys).toEqual(["supabase_anon_key", "turnstile_site"]);
    expect(rows.find((r) => r.key === "supabase_service_role")?.exposure).toBe("server-only");
  });

  it("summarises without inventing a healthy state it did not check", () => {
    // `healthy` is reserved for a check that genuinely ran. This module performs
    // no liveness check by design, so it must never report healthy from shape.
    const response = integrationStatusResponse({ ...SENTINELS });
    expect(response.summary.healthy).toBe(0);
    expect(response.integrations.every((r) => r.state !== "healthy")).toBe(true);
  });

  it("records systems with no canonical variable instead of inventing one", () => {
    // A fabricated variable name in a configuration queue sends Samuel to a
    // dashboard to create a secret no code will ever read.
    const systems = MISSING_CANONICAL_NAMES.map((m) => m.system);
    expect(systems.some((s) => /Sentry/i.test(s))).toBe(true);
    expect(systems.some((s) => /Google/i.test(s))).toBe(true);
    for (const entry of MISSING_CANONICAL_NAMES) expect(entry.note.length).toBeGreaterThan(20);
  });

  it("declares every canonical variable in SCREAMING_SNAKE form and without duplicates", () => {
    const names = INTEGRATION_SPECS.map((s) => s.variable);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[A-Z][A-Z0-9_]*$/);
    const keys = INTEGRATION_SPECS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
