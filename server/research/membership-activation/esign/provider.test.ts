import crypto from "crypto";
import { describe, expect, it } from "vitest";
import {
  DisabledEsignProvider,
  MAX_COMPLETED_FILE_BYTES,
  OpenSignAdapter,
  resolveEsignProvider,
  type EsignBytesResponse,
  type EsignFetchBytes,
  type EsignFetchJson,
  type EsignHttpJsonResponse,
  type EsignHttpRequest,
  type OpenSignAdapterConfig,
} from "./provider";
import type { CreateSigningSessionInput, EsignTemplateSpec } from "./contracts";

// ---------------------------------------------------------------------------
// Fixtures + fake transports (no network anywhere in this file)
// ---------------------------------------------------------------------------

const API_TOKEN = "opensign-secret-api-token-DO-NOT-LEAK";
const WEBHOOK_SECRET = "opensign-webhook-signing-secret-DO-NOT-LEAK";

function baseConfig(overrides: Partial<OpenSignAdapterConfig> = {}): OpenSignAdapterConfig {
  return {
    baseUrl: "https://opensign.acme.co/",
    apiToken: API_TOKEN,
    webhookSecret: WEBHOOK_SECRET,
    redirectUrl: "https://xenios.acme.co/return",
    templateNamespace: "xenios-research",
    sandboxMode: false,
    emailOtpEnabled: true,
    accessCodeEnabled: true,
    signingLinkTtlMinutes: 60,
    ...overrides,
  };
}

const TEMPLATE_SPEC: EsignTemplateSpec = {
  templateKey: "membership-v1",
  title: "xenios membership agreement",
  mode: "opensign_packet",
  documents: [
    {
      xeniosDocumentVersionId: "doc-ver-1",
      category: "membership_agreement",
      title: "Membership agreement",
      sourceContentHash: "hash-abc",
      widgets: [
        { name: "sig", type: "signature", required: true, page: 1 },
        { name: "arb", type: "arbitration_acknowledgment", required: true },
      ],
    },
  ],
};

const SESSION_INPUT: CreateSigningSessionInput = {
  providerTemplateId: "tmpl_123",
  memberId: "member_1",
  signerEmail: "member@example.com",
  externalReference: "xref_555",
  redirectUrl: null,
  accessCode: "one-time-code",
  linkTtlMinutes: 30,
};

/** A fetchJson fake that returns a fixed response and records the request. */
function jsonTransport(
  response: EsignHttpJsonResponse,
): { fetchJson: EsignFetchJson; calls: EsignHttpRequest[] } {
  const calls: EsignHttpRequest[] = [];
  const fetchJson: EsignFetchJson = async (req) => {
    calls.push(req);
    return response;
  };
  return { fetchJson, calls };
}

/** A fetchBytes fake. */
function bytesTransport(response: EsignBytesResponse): EsignFetchBytes {
  return async () => response;
}

/** A transport that must never be called (asserts no network in disabled/off paths). */
const explodingJson: EsignFetchJson = async () => {
  throw new Error("fetchJson must not be called");
};
const explodingBytes: EsignFetchBytes = async () => {
  throw new Error("fetchBytes must not be called");
};

function adapter(overrides: {
  config?: Partial<OpenSignAdapterConfig>;
  fetchJson?: EsignFetchJson;
  fetchBytes?: EsignFetchBytes;
} = {}): OpenSignAdapter {
  return new OpenSignAdapter(
    baseConfig(overrides.config),
    overrides.fetchJson ?? explodingJson,
    overrides.fetchBytes ?? explodingBytes,
  );
}

// ---------------------------------------------------------------------------
// Resolver: feature off
// ---------------------------------------------------------------------------

describe("resolveEsignProvider - feature off", () => {
  it("returns a DisabledEsignProvider whose every method refuses", async () => {
    const provider = resolveEsignProvider({});
    expect(provider).toBeInstanceOf(DisabledEsignProvider);
    expect(provider.isLive).toBe(false);
    expect(provider.name).toBe("disabled");

    const t = await provider.provisionTemplate(TEMPLATE_SPEC);
    expect(t).toEqual({ ok: false, code: "DISABLED", message: expect.any(String) });
    const s = await provider.createSigningSession(SESSION_INPUT);
    expect(s.ok).toBe(false);
    if (!s.ok) expect(s.code).toBe("DISABLED");
    const f = await provider.fetchCompletedFile({ fileUrl: "https://opensign.acme.co/file.pdf" });
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.code).toBe("DISABLED");

    // A disabled provider verifies nothing.
    expect(provider.verifyWebhook("{}", "whatever", Date.now())).toEqual({
      ok: false,
      code: "malformed",
    });
  });

  it("treats a missing RESEARCH_ESIGN_ENABLED as off", () => {
    expect(resolveEsignProvider({ RESEARCH_ESIGN_ENABLED: "false" })).toBeInstanceOf(
      DisabledEsignProvider,
    );
  });
});

// ---------------------------------------------------------------------------
// Resolver: on-but-unconfigured
// ---------------------------------------------------------------------------

describe("resolveEsignProvider - enabled but unconfigured", () => {
  const enabled = { RESEARCH_ESIGN_ENABLED: "true" };
  const full = {
    ...enabled,
    RESEARCH_ESIGN_PROVIDER: "opensign",
    OPENSIGN_BASE_URL: "https://opensign.acme.co",
    OPENSIGN_API_TOKEN: API_TOKEN,
    OPENSIGN_WEBHOOK_SECRET: WEBHOOK_SECRET,
  };

  it("wrong provider -> disabled", () => {
    expect(
      resolveEsignProvider({ ...full, RESEARCH_ESIGN_PROVIDER: "docusign" }),
    ).toBeInstanceOf(DisabledEsignProvider);
  });

  it("missing base url -> disabled", () => {
    const env = { ...full };
    delete (env as Record<string, unknown>).OPENSIGN_BASE_URL;
    expect(resolveEsignProvider(env)).toBeInstanceOf(DisabledEsignProvider);
  });

  it("missing api token -> disabled", () => {
    const env = { ...full };
    delete (env as Record<string, unknown>).OPENSIGN_API_TOKEN;
    expect(resolveEsignProvider(env)).toBeInstanceOf(DisabledEsignProvider);
  });

  it("missing webhook secret -> disabled", () => {
    const env = { ...full };
    delete (env as Record<string, unknown>).OPENSIGN_WEBHOOK_SECRET;
    expect(resolveEsignProvider(env)).toBeInstanceOf(DisabledEsignProvider);
  });

  it("fully configured -> a live OpenSignAdapter (transports injected)", () => {
    const provider = resolveEsignProvider(full, {
      fetchJson: explodingJson,
      fetchBytes: explodingBytes,
    });
    expect(provider).toBeInstanceOf(OpenSignAdapter);
    expect(provider.isLive).toBe(true);
    expect(provider.name).toBe("opensign");
  });
});

// ---------------------------------------------------------------------------
// Synthetic-data guard on the configured path
// ---------------------------------------------------------------------------

describe("resolveEsignProvider - synthetic-data guard", () => {
  it("throws when a synthetic marker is live in a production-like process", () => {
    const env = {
      NODE_ENV: "production",
      RESEARCH_ESIGN_ENABLED: "true",
      RESEARCH_ESIGN_PROVIDER: "opensign",
      OPENSIGN_BASE_URL: "https://opensign.example.invalid",
      OPENSIGN_API_TOKEN: API_TOKEN,
      OPENSIGN_WEBHOOK_SECRET: WEBHOOK_SECRET,
    };
    expect(() => resolveEsignProvider(env)).toThrow(/synthetic/i);
  });

  it("the thrown guard error never leaks the token or webhook secret", () => {
    const env = {
      NODE_ENV: "production",
      RESEARCH_ESIGN_ENABLED: "true",
      RESEARCH_ESIGN_PROVIDER: "opensign",
      OPENSIGN_BASE_URL: "https://opensign.example.invalid",
      OPENSIGN_API_TOKEN: API_TOKEN,
      OPENSIGN_WEBHOOK_SECRET: WEBHOOK_SECRET,
    };
    let message = "";
    try {
      resolveEsignProvider(env);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).not.toContain(API_TOKEN);
    expect(message).not.toContain(WEBHOOK_SECRET);
  });
});

// ---------------------------------------------------------------------------
// provisionTemplate
// ---------------------------------------------------------------------------

describe("OpenSignAdapter.provisionTemplate", () => {
  it("maps a 2xx response to provider ids and posts to the templates endpoint", async () => {
    const { fetchJson, calls } = jsonTransport({
      status: 201,
      json: { objectId: "tmpl_abc", version: "3" },
      text: "",
    });
    const result = await adapter({ fetchJson }).provisionTemplate(TEMPLATE_SPEC);
    expect(result).toEqual({
      ok: true,
      value: { providerTemplateId: "tmpl_abc", providerTemplateVersion: "3" },
    });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://opensign.acme.co/api/v1/templates");
    expect(calls[0].headers["x-api-token"]).toBe(API_TOKEN);
    // The xenios source hash must travel in the body for later drift detection.
    expect(calls[0].body).toContain("hash-abc");
  });

  it("defaults the template version to '1' when the provider omits it", async () => {
    const { fetchJson } = jsonTransport({ status: 200, json: { objectId: "tmpl_v" }, text: "" });
    const result = await adapter({ fetchJson }).provisionTemplate(TEMPLATE_SPEC);
    expect(result.ok && result.value.providerTemplateVersion).toBe("1");
  });

  it("returns PROVIDER_ERROR on a non-2xx", async () => {
    const { fetchJson } = jsonTransport({ status: 500, json: { error: "boom" }, text: "" });
    const result = await adapter({ fetchJson }).provisionTemplate(TEMPLATE_SPEC);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PROVIDER_ERROR");
  });

  it("returns PROVIDER_ERROR when the 2xx body is missing the id", async () => {
    const { fetchJson } = jsonTransport({ status: 200, json: { nope: true }, text: "" });
    const result = await adapter({ fetchJson }).provisionTemplate(TEMPLATE_SPEC);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PROVIDER_ERROR");
  });

  it("returns PROVIDER_ERROR when the transport throws", async () => {
    const result = await adapter({
      fetchJson: async () => {
        throw new Error("network down");
      },
    }).provisionTemplate(TEMPLATE_SPEC);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PROVIDER_ERROR");
  });
});

// ---------------------------------------------------------------------------
// createSigningSession
// ---------------------------------------------------------------------------

describe("OpenSignAdapter.createSigningSession", () => {
  it("maps a 2xx response to a signing session and carries externalReference + accessCode", async () => {
    const { fetchJson, calls } = jsonTransport({
      status: 201,
      json: { objectId: "doc_xyz", url: "https://opensign.acme.co/sign/doc_xyz", expiresAt: "2026-08-01T00:00:00Z" },
      text: "",
    });
    const result = await adapter({ fetchJson }).createSigningSession(SESSION_INPUT);
    expect(result).toEqual({
      ok: true,
      value: {
        providerDocumentId: "doc_xyz",
        signingUrl: "https://opensign.acme.co/sign/doc_xyz",
        expiresAt: "2026-08-01T00:00:00Z",
      },
    });
    expect(calls[0].url).toBe("https://opensign.acme.co/api/v1/documents");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.externalReference).toBe("xref_555");
    expect(body.templateId).toBe("tmpl_123");
    expect(body.accessCode).toBe("one-time-code");
    expect(body.expireInMinutes).toBe(30);
  });

  it("omits the access code when access codes are disabled in config", async () => {
    const { fetchJson, calls } = jsonTransport({
      status: 200,
      json: { objectId: "d", url: "https://opensign.acme.co/s/d" },
      text: "",
    });
    await adapter({ fetchJson, config: { accessCodeEnabled: false } }).createSigningSession(SESSION_INPUT);
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.accessCode).toBeUndefined();
  });

  it("returns a null expiry when the provider gives none", async () => {
    const { fetchJson } = jsonTransport({
      status: 200,
      json: { objectId: "d2", signingUrl: "https://opensign.acme.co/s/d2" },
      text: "",
    });
    const result = await adapter({ fetchJson }).createSigningSession(SESSION_INPUT);
    expect(result.ok && result.value.expiresAt).toBeNull();
  });

  it("returns PROVIDER_ERROR on a non-2xx", async () => {
    const { fetchJson } = jsonTransport({ status: 422, json: {}, text: "" });
    const result = await adapter({ fetchJson }).createSigningSession(SESSION_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PROVIDER_ERROR");
  });

  it("returns PROVIDER_ERROR when the signing url is missing", async () => {
    const { fetchJson } = jsonTransport({ status: 200, json: { objectId: "d3" }, text: "" });
    const result = await adapter({ fetchJson }).createSigningSession(SESSION_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PROVIDER_ERROR");
  });
});

// ---------------------------------------------------------------------------
// fetchCompletedFile
// ---------------------------------------------------------------------------

describe("OpenSignAdapter.fetchCompletedFile", () => {
  it("accepts an application/pdf response and returns the bytes", async () => {
    const bytes = Buffer.from("%PDF-1.7 ...", "utf8");
    const result = await adapter({
      fetchBytes: bytesTransport({ status: 200, bytes, contentType: "application/pdf" }),
    }).fetchCompletedFile({ fileUrl: "https://opensign.acme.co/completed/doc_xyz.pdf" });
    expect(result).toEqual({ ok: true, value: { bytes, contentType: "application/pdf" } });
  });

  it("tolerates a charset parameter on the content type", async () => {
    const bytes = Buffer.from("%PDF", "utf8");
    const result = await adapter({
      fetchBytes: bytesTransport({ status: 200, bytes, contentType: "application/pdf; charset=binary" }),
    }).fetchCompletedFile({ fileUrl: "https://opensign.acme.co/c.pdf" });
    expect(result.ok).toBe(true);
  });

  it("refuses a non-pdf content type", async () => {
    const result = await adapter({
      fetchBytes: bytesTransport({
        status: 200,
        bytes: Buffer.from("<html>", "utf8"),
        contentType: "text/html",
      }),
    }).fetchCompletedFile({ fileUrl: "https://opensign.acme.co/oops.html" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("REFUSED");
  });

  it("refuses an oversize file", async () => {
    const big = Buffer.alloc(MAX_COMPLETED_FILE_BYTES + 1, 1);
    const result = await adapter({
      fetchBytes: bytesTransport({ status: 200, bytes: big, contentType: "application/pdf" }),
    }).fetchCompletedFile({ fileUrl: "https://opensign.acme.co/huge.pdf" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("REFUSED");
  });

  it("returns PROVIDER_ERROR on a non-2xx download", async () => {
    const result = await adapter({
      fetchBytes: bytesTransport({ status: 404, bytes: Buffer.alloc(0), contentType: null }),
    }).fetchCompletedFile({ fileUrl: "https://opensign.acme.co/missing.pdf" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PROVIDER_ERROR");
  });
});

// ---------------------------------------------------------------------------
// verifyWebhook - the safety-critical crypto
// ---------------------------------------------------------------------------

function sign(rawBody: string, secret = WEBHOOK_SECRET): string {
  return crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

const WEBHOOK_BODY = JSON.stringify({
  eventId: "evt_1",
  event: "signed",
  documentId: "doc_xyz",
  signedFileUrl: "https://opensign.acme.co/completed/doc_xyz.pdf",
  certificateUrl: "https://opensign.acme.co/cert/doc_xyz.pdf",
  signerEmail: "member@example.com",
  externalReference: "xref_555",
  occurredAt: "2026-07-22T12:00:00Z",
});

describe("OpenSignAdapter.verifyWebhook", () => {
  it("passes a valid HMAC and parses the event", () => {
    const result = adapter().verifyWebhook(WEBHOOK_BODY, sign(WEBHOOK_BODY), Date.now());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event).toEqual({
        eventId: "evt_1",
        type: "signed",
        providerDocumentId: "doc_xyz",
        signedFileUrl: "https://opensign.acme.co/completed/doc_xyz.pdf",
        certificateUrl: "https://opensign.acme.co/cert/doc_xyz.pdf",
        signerEmail: "member@example.com",
        externalReference: "xref_555",
        occurredAt: "2026-07-22T12:00:00Z",
      });
    }
  });

  it("accepts an optional sha256= prefix on the signature header", () => {
    const result = adapter().verifyWebhook(WEBHOOK_BODY, `sha256=${sign(WEBHOOK_BODY)}`, Date.now());
    expect(result.ok).toBe(true);
  });

  it("rejects a wrong signature as invalid_signature", () => {
    const wrong = sign(WEBHOOK_BODY, "a-different-secret");
    const result = adapter().verifyWebhook(WEBHOOK_BODY, wrong, Date.now());
    expect(result).toEqual({ ok: false, code: "invalid_signature" });
  });

  it("rejects a tampered body against a genuine signature", () => {
    const goodSig = sign(WEBHOOK_BODY);
    const tampered = WEBHOOK_BODY.replace("doc_xyz", "doc_evil");
    const result = adapter().verifyWebhook(tampered, goodSig, Date.now());
    expect(result).toEqual({ ok: false, code: "invalid_signature" });
  });

  it("rejects an absent header as invalid_signature", () => {
    expect(adapter().verifyWebhook(WEBHOOK_BODY, null, Date.now())).toEqual({
      ok: false,
      code: "invalid_signature",
    });
  });

  it("rejects a non-hex signature header as invalid_signature", () => {
    expect(adapter().verifyWebhook(WEBHOOK_BODY, "not-hex-!!", Date.now())).toEqual({
      ok: false,
      code: "invalid_signature",
    });
  });

  it("reports malformed on a correctly-signed non-JSON body", () => {
    const raw = "this is not json";
    const result = adapter().verifyWebhook(raw, sign(raw), Date.now());
    expect(result).toEqual({ ok: false, code: "malformed" });
  });

  it("reports malformed on a correctly-signed unknown event type", () => {
    const raw = JSON.stringify({
      eventId: "evt_2",
      event: "carrier_pigeon_delivered",
      documentId: "doc_1",
      occurredAt: "2026-07-22T12:00:00Z",
    });
    const result = adapter().verifyWebhook(raw, sign(raw), Date.now());
    expect(result).toEqual({ ok: false, code: "malformed" });
  });

  it("reports malformed when a required field is missing", () => {
    const raw = JSON.stringify({ event: "signed", documentId: "doc_1", occurredAt: "2026-07-22T12:00:00Z" });
    const result = adapter().verifyWebhook(raw, sign(raw), Date.now());
    expect(result).toEqual({ ok: false, code: "malformed" });
  });
});

// ---------------------------------------------------------------------------
// Secret hygiene: no output ever carries the token or webhook secret
// ---------------------------------------------------------------------------

describe("secret hygiene", () => {
  it("no returned value or thrown error from any path contains the token or secret", async () => {
    const outputs: string[] = [];
    const record = (value: unknown) => outputs.push(JSON.stringify(value));

    // Error and success paths across every method.
    const errProvision = adapter({ fetchJson: jsonTransport({ status: 500, json: {}, text: "" }).fetchJson });
    record(await errProvision.provisionTemplate(TEMPLATE_SPEC));

    const okProvision = adapter({
      fetchJson: jsonTransport({ status: 200, json: { objectId: "t", version: "1" }, text: "" }).fetchJson,
    });
    record(await okProvision.provisionTemplate(TEMPLATE_SPEC));

    const session = adapter({
      fetchJson: jsonTransport({ status: 200, json: { objectId: "d", url: "https://opensign.acme.co/s/d" }, text: "" }).fetchJson,
    });
    record(await session.createSigningSession(SESSION_INPUT));

    const badFile = adapter({
      fetchBytes: bytesTransport({ status: 200, bytes: Buffer.from("x"), contentType: "text/plain" }),
    });
    record(await badFile.fetchCompletedFile({ fileUrl: "https://opensign.acme.co/x" }));

    record(adapter().verifyWebhook(WEBHOOK_BODY, sign(WEBHOOK_BODY), Date.now()));
    record(adapter().verifyWebhook(WEBHOOK_BODY, "bad", Date.now()));

    // A transport throw surfaced as a structured result, not a leaked error.
    record(
      await adapter({
        fetchJson: async () => {
          throw new Error(`boom ${API_TOKEN} ${WEBHOOK_SECRET}`);
        },
      }).provisionTemplate(TEMPLATE_SPEC),
    );

    const blob = outputs.join("\n");
    expect(blob).not.toContain(API_TOKEN);
    expect(blob).not.toContain(WEBHOOK_SECRET);
  });
});
