import { describe, expect, it, vi } from "vitest";
import {
  FAIL,
  PASS,
  UNVERIFIED,
  main,
  parseArgs,
  runProof,
  validateOptions,
} from "../../scripts/acceptance/verify-supabase-auth-email";

const PROJECT_REF = "yvzeduaxbwgcwllhywff";
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const SITE_ORIGIN = "https://xeniostechnology.com";
const REDIRECT_URL = `${SITE_ORIGIN}/research/reset-password`;
const SENDER = "research@xeniostechnology.com";
const RECIPIENT = "auth-email-smoke@example.com";
const RECOVERY_SUBJECT = "Reset your Xenios password";

function utc(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

const BASE_ARGS = [
  "--project-ref", PROJECT_REF,
  "--supabase-url", SUPABASE_URL,
  "--site-origin", SITE_ORIGIN,
  "--redirect-url", REDIRECT_URL,
  "--expected-smtp-host", "smtp.resend.com",
  "--expected-sender", SENDER,
  "--expected-recovery-subject", RECOVERY_SUBJECT,
];

function options(args: string[] = BASE_ARGS, env: Record<string, string | undefined> = {}) {
  return validateOptions(parseArgs(args), env);
}

function greenConfig(overrides: Record<string, unknown> = {}) {
  return {
    smtp_admin_email: SENDER,
    smtp_host: "smtp.resend.com",
    smtp_port: "587",
    smtp_user: "resend",
    smtp_pass: "smtp-super-secret",
    smtp_sender_name: "Xenios Research",
    smtp_max_frequency: 60,
    rate_limit_email_sent: 10,
    external_email_enabled: true,
    mailer_autoconfirm: false,
    mailer_subjects_recovery: RECOVERY_SUBJECT,
    password_min_length: 8,
    site_url: SITE_ORIGIN,
    uri_allow_list: `${REDIRECT_URL},${SITE_ORIGIN}/admin`,
    ...overrides,
  };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Supabase Auth email proof harness", () => {
  it("validates a redacted plan with zero network calls", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const run = await runProof(options(), fetcher);

    expect(run).toEqual({
      mode: "PLAN_VALID",
      status: PASS,
      checks: [
        expect.objectContaining({ name: "plan.pins_valid", status: PASS }),
        expect.objectContaining({ name: "plan.zero_network", status: PASS }),
      ],
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses unknown, duplicate, missing-value, cross-project, and unsafe URL inputs", () => {
    expect(() => parseArgs([...BASE_ARGS, "--mystery", "secret-value"])).toThrow(/unknown or positional/i);
    expect(() => parseArgs([...BASE_ARGS, "--project-ref", PROJECT_REF])).toThrow(/more than once/i);
    expect(() => parseArgs(BASE_ARGS.slice(0, -1))).toThrow(/value is missing/i);
    expect(() => options(BASE_ARGS.map((value) => value === PROJECT_REF ? "abcdefghijklmnopqrst" : value))).toThrow(/not the reviewed/i);
    expect(() => options(BASE_ARGS.map((value) => value === SUPABASE_URL ? "https://different.supabase.co" : value))).toThrow(/does not match|not the reviewed/i);
    expect(() => options(BASE_ARGS.map((value) => value === SITE_ORIGIN ? "ftp://localhost" : value))).toThrow(/exact HTTPS origin/i);
    expect(() => options(BASE_ARGS.map((value) => value === REDIRECT_URL ? `${SITE_ORIGIN}/admin` : value))).toThrow(/exact HTTPS \/research\/reset-password/i);
    for (const unsafeRedirect of [
      `https://user:password@xeniostechnology.com/research/reset-password`,
      `${REDIRECT_URL}?token=unsafe`,
      `${REDIRECT_URL}#unsafe`,
      `https://xeniostechnology.com:444/research/reset-password`,
    ]) {
      expect(() => options(BASE_ARGS.map((value) => value === REDIRECT_URL ? unsafeRedirect : value))).toThrow(/exact HTTPS \/research\/reset-password/i);
    }
  });

  it("requires an explicit config gate and double-confirmed controlled recipient before sending", () => {
    expect(() => options([...BASE_ARGS, "--execute-recovery"], {
      AUTH_EMAIL_TEST_RECIPIENT: RECIPIENT,
      AUTH_EMAIL_CONFIRM_RECIPIENT: RECIPIENT,
    })).toThrow(/requires --check-config/i);

    expect(() => options([...BASE_ARGS, "--check-config", "--execute-recovery"], {
      AUTH_EMAIL_TEST_RECIPIENT: RECIPIENT,
      AUTH_EMAIL_CONFIRM_RECIPIENT: "different@example.com",
    })).toThrow(/does not exactly match/i);
  });

  it("keeps the config and production-target gates inside the network boundary", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const validated = options([...BASE_ARGS, "--check-config", "--execute-recovery"], {
      SUPABASE_ACCESS_TOKEN: "management-token",
      SUPABASE_ANON_KEY: "anon-key",
      AUTH_EMAIL_TEST_RECIPIENT: RECIPIENT,
      AUTH_EMAIL_CONFIRM_RECIPIENT: RECIPIENT,
    });

    const bypass = await runProof({ ...validated, checkConfig: false }, fetcher);
    expect(bypass).toEqual(expect.objectContaining({ mode: "INCOMPLETE", status: FAIL }));
    expect(bypass.checks).toContainEqual(expect.objectContaining({ name: "safety.validated_options_required", status: FAIL }));
    expect(fetcher).not.toHaveBeenCalled();

    const wrongTarget = await runProof({ ...validated, projectRef: "abcdefghijklmnopqrst" }, fetcher);
    expect(wrongTarget.checks).toContainEqual(expect.objectContaining({ name: "safety.validated_options_required", status: FAIL }));
    expect(fetcher).not.toHaveBeenCalled();

    const recipientSwap = await runProof({ ...validated, recipient: "attacker@example.com" }, fetcher);
    expect(recipientSwap.checks).toContainEqual(expect.objectContaining({ name: "safety.validated_options_required", status: FAIL }));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("proves a pinned green Auth configuration without exposing response secrets", async () => {
    const fetcher = vi.fn(async () => json(greenConfig())) as unknown as typeof fetch;
    const run = await runProof(options([...BASE_ARGS, "--check-config"], {
      SUPABASE_ACCESS_TOKEN: "management-super-secret",
      AUTH_EMAIL_CONFIRM_SENDER_AUTH: "YES",
    }), fetcher);

    expect(run.status).toBe(PASS);
    expect(run.mode).toBe("CONFIGURED");
    expect(run.checks).toHaveLength(20);
    expect(run.checks.every((check) => check.status === PASS)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const rendered = JSON.stringify(run);
    expect(rendered).not.toContain("management-super-secret");
    expect(rendered).not.toContain("smtp-super-secret");
    expect(rendered).not.toContain(SENDER);
  });

  it.each([
    [undefined, false, UNVERIFIED],
    [undefined, true, PASS],
    ["********", false, UNVERIFIED],
    ["[REDACTED]", false, UNVERIFIED],
    ["********", true, PASS],
  ] as const)("treats omitted or masked SMTP password evidence as attestation-gated", async (smtpPass, attested, expected) => {
    const config: Record<string, unknown> = greenConfig();
    if (smtpPass === undefined) delete config.smtp_pass;
    else config.smtp_pass = smtpPass;
    const fetcher = vi.fn(async () => json(config)) as unknown as typeof fetch;
    const run = await runProof(options([...BASE_ARGS, "--check-config"], {
      SUPABASE_ACCESS_TOKEN: "management-token",
      AUTH_EMAIL_CONFIRM_SENDER_AUTH: "YES",
      AUTH_EMAIL_CONFIRM_SMTP_PASSWORD_PRESENT: attested ? "YES" : undefined,
    }), fetcher);

    expect(run.checks).toContainEqual(expect.objectContaining({ name: "smtp.password_configured", status: expected }));
    expect(run.status).toBe(expected);
  });

  it.each([
    [false, UNVERIFIED],
    [true, PASS],
  ] as const)("does not infer a project-wide email rate limit when Management API omits it", async (attested, expected) => {
    const config: Record<string, unknown> = greenConfig();
    delete config.rate_limit_email_sent;
    const fetcher = vi.fn(async () => json(config)) as unknown as typeof fetch;
    const run = await runProof(options([...BASE_ARGS, "--check-config"], {
      SUPABASE_ACCESS_TOKEN: "management-token",
      AUTH_EMAIL_CONFIRM_SENDER_AUTH: "YES",
      AUTH_EMAIL_CONFIRM_PROJECT_RATE_LIMIT: attested ? "YES" : undefined,
    }), fetcher);

    expect(run.checks).toContainEqual(expect.objectContaining({ name: "auth.project_email_rate_limit", status: expected }));
    expect(run.status).toBe(expected);
  });

  it("fails unsafe per-recipient and project-wide Auth email rate limits", async () => {
    const fetcher = vi.fn(async () => json(greenConfig({
      smtp_max_frequency: 1,
      rate_limit_email_sent: 1_000,
    }))) as unknown as typeof fetch;
    const run = await runProof(options([...BASE_ARGS, "--check-config"], {
      SUPABASE_ACCESS_TOKEN: "management-token",
      AUTH_EMAIL_CONFIRM_SENDER_AUTH: "YES",
    }), fetcher);

    expect(run.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "smtp.rate_limit_configured", status: FAIL }),
      expect.objectContaining({ name: "auth.project_email_rate_limit", status: FAIL }),
    ]));
    expect(run.status).toBe(FAIL);
  });

  it("fails closed on empty SMTP credentials, autoconfirm, wrong origin, missing callback, and broad wildcard", async () => {
    const fetcher = vi.fn(async () => json(greenConfig({
      smtp_pass: "",
      mailer_autoconfirm: true,
      site_url: "https://wrong.example.com",
      uri_allow_list: `https://**/anything,${REDIRECT_URL}`,
    }))) as unknown as typeof fetch;
    const run = await runProof(options([...BASE_ARGS, "--check-config"], {
      SUPABASE_ACCESS_TOKEN: "management-token",
      AUTH_EMAIL_CONFIRM_SENDER_AUTH: "YES",
    }), fetcher);

    expect(run.status).toBe(FAIL);
    expect(run.mode).toBe("INCOMPLETE");
    expect(run.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "smtp.password_configured", status: FAIL }),
      expect.objectContaining({ name: "auth.confirmation_required", status: FAIL }),
      expect.objectContaining({ name: "redirect.site_url_exact", status: FAIL }),
      expect.objectContaining({ name: "redirect.admin_recovery_exact", status: FAIL }),
      expect.objectContaining({ name: "redirect.broad_production_wildcard_absent", status: FAIL }),
      expect.objectContaining({ name: "redirect.unapproved_entries_absent", status: FAIL }),
    ]));
  });

  it.each([
    `https://*.com/*,${REDIRECT_URL},${SITE_ORIGIN}/admin`,
    `https://xenios*technology.com/**,${REDIRECT_URL},${SITE_ORIGIN}/admin`,
    `https://attacker.example/callback,${REDIRECT_URL},${SITE_ORIGIN}/admin`,
    [REDIRECT_URL, `${SITE_ORIGIN}/admin`, null],
  ])("rejects every wildcard or unapproved redirect entry in the closed production allowlist", async (uriAllowList) => {
    const fetcher = vi.fn(async () => json(greenConfig({ uri_allow_list: uriAllowList }))) as unknown as typeof fetch;
    const run = await runProof(options([...BASE_ARGS, "--check-config"], {
      SUPABASE_ACCESS_TOKEN: "management-token",
      AUTH_EMAIL_CONFIRM_SENDER_AUTH: "YES",
    }), fetcher);

    expect(run.status).toBe(FAIL);
    expect(run.checks).toContainEqual(expect.objectContaining({ name: "redirect.unapproved_entries_absent", status: FAIL }));
  });

  it.each([
    [{ smtp_port: -1 }, "smtp.expected_port"],
    [{ smtp_port: 587 }, "smtp.expected_port"],
    [{ smtp_port: [587] }, "smtp.expected_port"],
    [{ smtp_user: 0 }, "smtp.expected_user"],
    [{ smtp_user: "wrong-user" }, "smtp.expected_user"],
    [{ smtp_sender_name: "Wrong Name" }, "smtp.expected_sender_name"],
    [{ smtp_max_frequency: [60] }, "smtp.rate_limit_configured"],
    [{ rate_limit_email_sent: true }, "auth.project_email_rate_limit"],
    [{ password_min_length: [8] }, "security.minimum_password_length"],
  ] as const)("fails malformed or unreviewed transport configuration: %s", async (override, failedCheck) => {
    const fetcher = vi.fn(async () => json(greenConfig(override))) as unknown as typeof fetch;
    const run = await runProof(options([...BASE_ARGS, "--check-config"], {
      SUPABASE_ACCESS_TOKEN: "management-token",
      AUTH_EMAIL_CONFIRM_SENDER_AUTH: "YES",
      AUTH_EMAIL_CONFIRM_PROJECT_RATE_LIMIT: "YES",
      AUTH_EMAIL_CONFIRM_MIN_PASSWORD_8: "YES",
    }), fetcher);

    expect(run.status).toBe(FAIL);
    expect(run.checks).toContainEqual(expect.objectContaining({ name: failedCheck, status: FAIL }));
  });

  it("reports configuration as unverified, not green, when management evidence is unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const run = await runProof(options([...BASE_ARGS, "--check-config"]), fetcher);

    expect(run.status).toBe(UNVERIFIED);
    expect(run.mode).toBe("INCOMPLETE");
    expect(run.checks).toHaveLength(20);
    expect(run.checks.every((check) => check.status === UNVERIFIED)).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends exactly one gated Auth recovery request and still does not claim delivery", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json(greenConfig()))
      .mockResolvedValueOnce(json({}, 200)) as unknown as typeof fetch;
    const run = await runProof(options([...BASE_ARGS, "--check-config", "--execute-recovery"], {
      SUPABASE_ACCESS_TOKEN: "management-secret",
      SUPABASE_ANON_KEY: "anon-public-key",
      AUTH_EMAIL_TEST_RECIPIENT: RECIPIENT,
      AUTH_EMAIL_CONFIRM_RECIPIENT: RECIPIENT,
      AUTH_EMAIL_CONFIRM_SENDER_AUTH: "YES",
    }), fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
    const [requestUrl, requestInit] = (fetcher as any).mock.calls[1];
    expect(String(requestUrl)).toBe(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(REDIRECT_URL)}`);
    expect(requestInit.method).toBe("POST");
    expect(JSON.parse(requestInit.body)).toEqual({ email: RECIPIENT });
    expect(run.mode).toBe("REQUEST_ACCEPTED");
    expect(run.status).toBe(PASS);
    expect(run.checks.at(-1)).toEqual(expect.objectContaining({
      name: "recovery.auth_request",
      status: PASS,
      detail: expect.stringMatching(/delivery is not yet proven/i),
    }));
    const rendered = JSON.stringify(run);
    expect(rendered).not.toContain(RECIPIENT);
    expect(rendered).not.toContain("management-secret");
    expect(rendered).not.toContain("anon-public-key");
  });

  it.each([
    [500, FAIL],
    [429, UNVERIFIED],
  ] as const)("distinguishes Auth recovery HTTP %i as %s", async (status, expected) => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json(greenConfig()))
      .mockResolvedValueOnce(json({ message: "provider body must not be logged" }, status)) as unknown as typeof fetch;
    const run = await runProof(options([...BASE_ARGS, "--check-config", "--execute-recovery"], {
      SUPABASE_ACCESS_TOKEN: "management-secret",
      SUPABASE_ANON_KEY: "anon-key",
      AUTH_EMAIL_TEST_RECIPIENT: RECIPIENT,
      AUTH_EMAIL_CONFIRM_RECIPIENT: RECIPIENT,
      AUTH_EMAIL_CONFIRM_SENDER_AUTH: "YES",
    }), fetcher);

    expect(run.status).toBe(expected);
    expect(JSON.stringify(run)).not.toContain("provider body must not be logged");
  });

  it("verifies a matching delivered provider record without logging message content", async () => {
    const messageId = "4ef9a417-02e9-4d39-ad75-9611e0fcc33c";
    const requestedAt = utc(-60_000);
    const fetcher = vi.fn(async () => json({
      id: messageId,
      to: [RECIPIENT],
      cc: [],
      bcc: [],
      from: `Xenios Research <${SENDER}>`,
      subject: RECOVERY_SUBJECT,
      html: "<a href='https://example.test/#access_token=secret'>reset</a>",
      last_event: "delivered",
      created_at: utc(-30_000),
    })) as unknown as typeof fetch;
    const run = await runProof(options([...BASE_ARGS, "--verify-delivery"], {
      AUTH_EMAIL_TEST_RECIPIENT: RECIPIENT,
      AUTH_EMAIL_CONFIRM_RECIPIENT: RECIPIENT,
      AUTH_EMAIL_RESEND_MESSAGE_ID: messageId,
      AUTH_EMAIL_REQUESTED_AFTER_UTC: requestedAt,
      RESEND_API_KEY: "resend-super-secret",
    }), fetcher);

    expect(run).toEqual(expect.objectContaining({ mode: "PROVIDER_METADATA_VERIFIED", status: PASS }));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(run)).not.toMatch(/auth-email-smoke|token-secret|access_token|resend-super-secret/i);
  });

  it.each([
    ["sent", RECIPIENT, UNVERIFIED],
    ["failed", RECIPIENT, FAIL],
    ["delivered", "different@example.com", FAIL],
  ] as const)("classifies provider state %s and recipient binding as %s", async (lastEvent, recipient, expected) => {
    const messageId = "4ef9a417-02e9-4d39-ad75-9611e0fcc33c";
    const requestedAt = utc(-60_000);
    const fetcher = vi.fn(async () => json({
      id: messageId,
      to: [recipient],
      from: `Xenios Research <${SENDER}>`,
      subject: RECOVERY_SUBJECT,
      last_event: lastEvent,
      created_at: utc(-30_000),
    })) as unknown as typeof fetch;
    const run = await runProof(options([...BASE_ARGS, "--verify-delivery"], {
      AUTH_EMAIL_TEST_RECIPIENT: RECIPIENT,
      AUTH_EMAIL_CONFIRM_RECIPIENT: RECIPIENT,
      AUTH_EMAIL_RESEND_MESSAGE_ID: messageId,
      AUTH_EMAIL_REQUESTED_AFTER_UTC: requestedAt,
      RESEND_API_KEY: "resend-key",
    }), fetcher);

    expect(run.status).toBe(expected);
  });

  it.each([
    [{ id: "00000000-0000-4000-8000-000000000000" }, "delivery.message_id_exact"],
    [{ from: SENDER }, "delivery.sender_exact"],
    [{ from: "attacker@example.com" }, "delivery.sender_exact"],
    [{ from: `Wrong Name <${SENDER}>` }, "delivery.sender_exact"],
    [{ from: `${SENDER}, attacker@example.com` }, "delivery.sender_exact"],
    [{ to: [RECIPIENT, "attacker@example.com"] }, "delivery.recipient_exact"],
    [{ to: [RECIPIENT, null] }, "delivery.recipient_exact"],
    [{ cc: ["attacker@example.com"] }, "delivery.recipient_exact"],
    [{ cc: [null] }, "delivery.recipient_exact"],
    [{ bcc: ["attacker@example.com"] }, "delivery.recipient_exact"],
    [{ bcc: [""] }, "delivery.recipient_exact"],
    [{ subject: "Unrelated application message" }, "delivery.recovery_subject"],
  ] as const)("rejects misbound provider proof: %s", async (override, failedCheck) => {
    const messageId = "4ef9a417-02e9-4d39-ad75-9611e0fcc33c";
    const requestedAt = utc(-60_000);
    const fetcher = vi.fn(async () => json({
      id: messageId,
      to: [RECIPIENT],
      cc: [],
      bcc: [],
      from: `Xenios Research <${SENDER}>`,
      subject: RECOVERY_SUBJECT,
      last_event: "delivered",
      created_at: utc(-30_000),
      ...override,
    })) as unknown as typeof fetch;
    const run = await runProof(options([...BASE_ARGS, "--verify-delivery"], {
      AUTH_EMAIL_TEST_RECIPIENT: RECIPIENT,
      AUTH_EMAIL_CONFIRM_RECIPIENT: RECIPIENT,
      AUTH_EMAIL_RESEND_MESSAGE_ID: messageId,
      AUTH_EMAIL_REQUESTED_AFTER_UTC: requestedAt,
      RESEND_API_KEY: "resend-key",
    }), fetcher);

    expect(run.status).toBe(FAIL);
    expect(run.checks).toContainEqual(expect.objectContaining({ name: failedCheck, status: FAIL }));
  });

  it("rejects provider creation just outside both bounded request-window edges", async () => {
    vi.useFakeTimers();
    try {
      const nowMs = Date.parse("2026-08-14T18:00:00.000Z");
      vi.setSystemTime(nowMs);
      const requestedMs = nowMs - 10 * 60_000;
      const messageId = "4ef9a417-02e9-4d39-ad75-9611e0fcc33c";
      for (const createdAt of [
        "not-a-timestamp",
        new Date(requestedMs - 30_001).toISOString(),
        new Date(requestedMs + 5 * 60_000 + 1).toISOString(),
      ]) {
        const fetcher = vi.fn(async () => json({
          id: messageId,
          to: [RECIPIENT],
          from: `Xenios Research <${SENDER}>`,
          subject: RECOVERY_SUBJECT,
          last_event: "delivered",
          created_at: createdAt,
        })) as unknown as typeof fetch;
        const run = await runProof(options([...BASE_ARGS, "--verify-delivery"], {
          AUTH_EMAIL_TEST_RECIPIENT: RECIPIENT,
          AUTH_EMAIL_CONFIRM_RECIPIENT: RECIPIENT,
          AUTH_EMAIL_RESEND_MESSAGE_ID: messageId,
          AUTH_EMAIL_REQUESTED_AFTER_UTC: new Date(requestedMs).toISOString(),
          RESEND_API_KEY: "resend-key",
        }), fetcher);

        expect(run.status).toBe(FAIL);
        expect(run.checks).toContainEqual(expect.objectContaining({ name: "delivery.message_created_in_window", status: FAIL }));
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("accepts both inclusive provider creation-window boundaries", async () => {
    vi.useFakeTimers();
    try {
      const nowMs = Date.parse("2026-08-14T18:00:00.000Z");
      vi.setSystemTime(nowMs);
      const requestedMs = nowMs - 10 * 60_000;
      const messageId = "4ef9a417-02e9-4d39-ad75-9611e0fcc33c";
      for (const createdAt of [
        new Date(requestedMs - 30_000).toISOString(),
        new Date(requestedMs + 5 * 60_000).toISOString(),
      ]) {
        const fetcher = vi.fn(async () => json({
          id: messageId,
          to: [RECIPIENT],
          from: `Xenios Research <${SENDER}>`,
          subject: RECOVERY_SUBJECT,
          last_event: "delivered",
          created_at: createdAt,
        })) as unknown as typeof fetch;
        const run = await runProof(options([...BASE_ARGS, "--verify-delivery"], {
          AUTH_EMAIL_TEST_RECIPIENT: RECIPIENT,
          AUTH_EMAIL_CONFIRM_RECIPIENT: RECIPIENT,
          AUTH_EMAIL_RESEND_MESSAGE_ID: messageId,
          AUTH_EMAIL_REQUESTED_AFTER_UTC: new Date(requestedMs).toISOString(),
          RESEND_API_KEY: "resend-key",
        }), fetcher);

        expect(run).toEqual(expect.objectContaining({ mode: "PROVIDER_METADATA_VERIFIED", status: PASS }));
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects stale and future request timestamps before provider lookup", async () => {
    vi.useFakeTimers();
    try {
      const nowMs = Date.parse("2026-08-14T18:00:00.000Z");
      vi.setSystemTime(nowMs);
      const messageId = "4ef9a417-02e9-4d39-ad75-9611e0fcc33c";
      const baseEnv = {
        AUTH_EMAIL_TEST_RECIPIENT: RECIPIENT,
        AUTH_EMAIL_CONFIRM_RECIPIENT: RECIPIENT,
        AUTH_EMAIL_RESEND_MESSAGE_ID: messageId,
        RESEND_API_KEY: "resend-key",
      };
      expect(() => options([...BASE_ARGS, "--verify-delivery"], {
        ...baseEnv,
        AUTH_EMAIL_REQUESTED_AFTER_UTC: new Date(nowMs - 30 * 60_000 - 1).toISOString(),
      })).toThrow(/stale or implausibly future/i);
      expect(() => options([...BASE_ARGS, "--verify-delivery"], {
        ...baseEnv,
        AUTH_EMAIL_REQUESTED_AFTER_UTC: new Date(nowMs + 30_001).toISOString(),
      })).toThrow(/stale or implausibly future/i);

      const fetcher = vi.fn<typeof fetch>();
      const validated = options([...BASE_ARGS, "--verify-delivery"], {
        ...baseEnv,
        AUTH_EMAIL_REQUESTED_AFTER_UTC: new Date(nowMs - 60_000).toISOString(),
      });
      vi.setSystemTime(nowMs + 31 * 60_000);
      const direct = await runProof(validated, fetcher);
      expect(direct.status).toBe(FAIL);
      expect(direct.checks).toContainEqual(expect.objectContaining({ name: "delivery.request_timestamp_recent", status: FAIL }));
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("enforces CLI exit codes and redacts invalid inputs and configuration secrets", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await main(BASE_ARGS, {}, vi.fn<typeof fetch>())).toBe(0);
      expect(await main([...BASE_ARGS, "--check-config"], {}, vi.fn<typeof fetch>())).toBe(2);
      expect(await main([...BASE_ARGS, "--mystery", "do-not-print-this-value"], {}, vi.fn<typeof fetch>())).toBe(64);

      const failingFetcher = vi.fn(async () => json(greenConfig({ smtp_pass: "" }))) as unknown as typeof fetch;
      expect(await main([...BASE_ARGS, "--check-config"], {
        SUPABASE_ACCESS_TOKEN: "management-cli-secret",
        AUTH_EMAIL_CONFIRM_SENDER_AUTH: "YES",
      }, failingFetcher)).toBe(1);

      const rendered = [...log.mock.calls, ...error.mock.calls].flat().join("\n");
      expect(rendered).not.toMatch(/do-not-print-this-value|management-cli-secret|smtp-super-secret/i);
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });
});
