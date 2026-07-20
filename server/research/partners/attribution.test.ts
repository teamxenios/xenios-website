import { describe, expect, it } from "vitest";
import {
  PARTNER_FORBIDDEN_FIELDS,
  type AttributionConfig,
} from "@shared/research/distribution";
import {
  createAttributionService,
  createInMemoryAttributionRepository,
  LinkSecretMissingError,
  SubjectKeyNotOpaqueError,
  type AttributionRepository,
  type AttributionService,
  type AttributionServiceDeps,
} from "./attribution";

const SECRET = "test-link-secret";
const BASE_URL = "https://xenios.example/research";
const NOW = new Date("2026-07-20T12:00:00Z");

function build(
  overrides: Partial<AttributionServiceDeps> = {},
): { service: AttributionService; repository: AttributionRepository } {
  const repository = overrides.repository ?? createInMemoryAttributionRepository();
  const service = createAttributionService({
    repository,
    linkSecret: SECRET,
    linkBaseUrl: BASE_URL,
    generateNonce: () => "fixed-nonce",
    ...overrides,
  });
  return { service, repository };
}

function minutesAfter(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

function daysBefore(base: Date, days: number): Date {
  return new Date(base.getTime() - days * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Signed codes
// ---------------------------------------------------------------------------

describe("signed codes", () => {
  it("issues a link whose code verifies back to the partner", () => {
    const { service } = build();
    const link = service.issueLink("partner-1", "signed_link", "summer", NOW);

    expect(service.verifyCode(link.code)).toEqual({ partnerId: "partner-1" });
    expect(link.url).toBe(`${BASE_URL}/r/${link.code}`);
    expect(link.campaign).toBe("summer");
  });

  it("rejects a code whose signature was tampered with", () => {
    const { service } = build();
    const link = service.issueLink("partner-1", "signed_link", null, NOW);

    const parts = link.code.split(".");
    const tamperedSignature = `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3].slice(0, -1)}X`;
    expect(service.verifyCode(tamperedSignature)).toBeNull();
  });

  it("rejects a code whose partner id was swapped under a valid signature", () => {
    const { service } = build();
    const victim = service.issueLink("partner-1", "signed_link", null, NOW);
    const attackerPayload = Buffer.from("partner-2", "utf8").toString("base64url");

    const parts = victim.code.split(".");
    const swapped = `${parts[0]}.${attackerPayload}.${parts[2]}.${parts[3]}`;
    expect(service.verifyCode(swapped)).toBeNull();
  });

  it("rejects an unsigned or malformed code", () => {
    const { service } = build();
    expect(service.verifyCode("partner-1")).toBeNull();
    expect(service.verifyCode("v1.abc.def")).toBeNull();
    expect(service.verifyCode("")).toBeNull();
    expect(service.verifyCode("v2.abc.def.ghi")).toBeNull();
  });

  it("rejects a code signed with a different secret", () => {
    const { service } = build();
    const foreign = createAttributionService({
      repository: createInMemoryAttributionRepository(),
      linkSecret: "some-other-secret",
      linkBaseUrl: BASE_URL,
      generateNonce: () => "fixed-nonce",
    });
    const forged = foreign.signCode("partner-1", "fixed-nonce");

    expect(service.verifyCode(forged)).toBeNull();
  });

  it("fails closed when the secret is absent rather than issuing an unsigned code", () => {
    const { service } = build({ linkSecret: null });

    expect(() => service.issueLink("partner-1", "signed_link", null, NOW)).toThrow(
      LinkSecretMissingError,
    );
    expect(() => service.signCode("partner-1", "n")).toThrow(LinkSecretMissingError);
    expect(() => service.deriveSubjectKey("visitor-1")).toThrow(LinkSecretMissingError);
  });

  it("verifies nothing when the secret is absent", () => {
    const withSecret = build();
    const code = withSecret.service.issueLink("partner-1", "signed_link", null, NOW).code;

    const { service } = build({ linkSecret: "" });
    expect(service.verifyCode(code)).toBeNull();
  });

  it("stores no link when issuing fails on a missing secret", () => {
    const { service, repository } = build({ linkSecret: null });

    expect(() => service.issueLink("partner-1", "signed_link", null, NOW)).toThrow();
    expect(repository.listLinks("partner-1")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Links, QR, listing
// ---------------------------------------------------------------------------

describe("links", () => {
  it("lists only the requesting partner's links", () => {
    const { service } = build({ generateNonce: nonceSequence() });
    service.issueLink("partner-1", "signed_link", null, NOW);
    service.issueLink("partner-1", "qr", "expo", NOW);
    service.issueLink("partner-2", "code", null, NOW);

    const mine = service.listLinks("partner-1");
    expect(mine).toHaveLength(2);
    expect(mine.every((l) => service.verifyCode(l.code)?.partnerId === "partner-1")).toBe(true);
    expect(service.listLinks("partner-2")).toHaveLength(1);
  });

  it("exposes only the contract fields on a partner link", () => {
    const { service } = build();
    const link = service.issueLink("partner-1", "campaign", "launch", NOW);

    expect(Object.keys(link).sort()).toEqual(["campaign", "channel", "code", "qrSvgPath", "url"]);
  });

  it("builds a QR payload that is the link url and nothing about the visitor", () => {
    const { service } = build();
    const link = service.issueLink("partner-1", "qr", null, NOW);

    expect(service.qrPayloadFor(link)).toBe(link.url);
  });

  it("does not double a slash when the base url has a trailing one", () => {
    const { service } = build({ linkBaseUrl: `${BASE_URL}/` });
    const link = service.issueLink("partner-1", "signed_link", null, NOW);

    expect(link.url).toBe(`${BASE_URL}/r/${link.code}`);
  });
});

function nonceSequence(): () => string {
  let n = 0;
  return () => `nonce-${++n}`;
}

// ---------------------------------------------------------------------------
// Attribution and conversion
// ---------------------------------------------------------------------------

describe("attribution", () => {
  it("resolves last touch within the window", () => {
    const { service } = build();
    service.recordTouch("subject-1", "partner-1", "signed_link", daysBefore(NOW, 10));
    service.recordTouch("subject-1", "partner-2", "qr", daysBefore(NOW, 1));

    const record = service.recordConversion("subject-1", "order-1", NOW);
    expect(record?.partnerId).toBe("partner-2");
    expect(record?.channel).toBe("qr");
  });

  it("returns null when every touch is outside the window", () => {
    const { service } = build();
    service.recordTouch("subject-1", "partner-1", "signed_link", daysBefore(NOW, 90));

    expect(service.recordConversion("subject-1", "order-1", NOW)).toBeNull();
  });

  it("returns null when the visitor has no touches at all", () => {
    const { service } = build();
    expect(service.recordConversion("subject-unknown", "order-1", NOW)).toBeNull();
  });

  it("honours an injected first touch config", () => {
    const { service } = build();
    service.recordTouch("subject-1", "partner-1", "signed_link", daysBefore(NOW, 10));
    service.recordTouch("subject-1", "partner-2", "qr", daysBefore(NOW, 1));

    const config: AttributionConfig = { model: "first_touch", windowDays: 30 };
    expect(service.recordConversion("subject-1", "order-1", NOW, config)?.partnerId).toBe("partner-1");
  });

  it("records one attribution for one order id even when called twice", () => {
    const { service } = build();
    service.recordTouch("subject-1", "partner-1", "signed_link", daysBefore(NOW, 2));

    const first = service.recordConversion("subject-1", "order-1", NOW);
    // A later touch would change the automatic answer, so a second call proves the
    // stored winner is returned rather than a freshly recomputed one.
    service.recordTouch("subject-1", "partner-2", "qr", minutesAfter(NOW, 1));
    const second = service.recordConversion("subject-1", "order-1", minutesAfter(NOW, 2));

    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(second?.partnerId).toBe("partner-1");
  });

  it("gives one winner when two writers race the same order id", () => {
    const { service, repository } = build();
    service.recordTouch("subject-a", "partner-1", "signed_link", daysBefore(NOW, 2));
    service.recordTouch("subject-b", "partner-2", "qr", daysBefore(NOW, 2));

    // Two different visitors, two different automatic answers, one order id. The
    // insert-if-absent contract must collapse them to a single stored winner.
    const a = service.recordConversion("subject-a", "order-race", NOW);
    const b = service.recordConversion("subject-b", "order-race", NOW);

    expect(b).toEqual(a);
    expect(repository.getAttribution("order-race")).toEqual(a);
  });

  it("does not overwrite a stored winner when the repository is asked directly", () => {
    const { service, repository } = build();
    service.recordTouch("subject-1", "partner-1", "signed_link", daysBefore(NOW, 2));
    const winner = service.recordConversion("subject-1", "order-1", NOW)!;

    const intruder = repository.putAttributionIfAbsent({
      orderId: "order-1",
      partnerId: "partner-9",
      channel: "code",
      attributedAt: NOW.toISOString(),
      setByAdminId: null,
      overrideReason: null,
    });

    expect(intruder).toEqual(winner);
    expect(repository.getAttribution("order-1")?.partnerId).toBe("partner-1");
  });

  it("keeps one visitor's touches out of another visitor's conversion", () => {
    const { service } = build();
    service.recordTouch("subject-1", "partner-1", "signed_link", daysBefore(NOW, 1));

    expect(service.recordConversion("subject-2", "order-2", NOW)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Applicant privacy
// ---------------------------------------------------------------------------

describe("applicant privacy", () => {
  it("refuses a subject key that carries identity", () => {
    const { service } = build();

    expect(() => service.recordTouch("person@example.com", "partner-1", "code", NOW)).toThrow(
      SubjectKeyNotOpaqueError,
    );
    expect(() => service.recordTouch("Jane Doe", "partner-1", "code", NOW)).toThrow(
      SubjectKeyNotOpaqueError,
    );
    expect(() => service.recordTouch("  ", "partner-1", "code", NOW)).toThrow(
      SubjectKeyNotOpaqueError,
    );
    expect(() => service.recordConversion("person@example.com", "order-1", NOW)).toThrow(
      SubjectKeyNotOpaqueError,
    );
  });

  it("stores nothing when an identity-bearing subject key is refused", () => {
    const { service, repository } = build();

    expect(() => service.recordTouch("person@example.com", "partner-1", "code", NOW)).toThrow();
    expect(repository.touchesFor("person@example.com")).toHaveLength(0);
  });

  it("derives an opaque, non-reversible subject key from a raw identifier", () => {
    const { service } = build();
    const key = service.deriveSubjectKey("person@example.com");

    expect(key).not.toContain("@");
    expect(key).not.toContain("person");
    expect(key).not.toContain("example.com");
    expect(service.deriveSubjectKey("person@example.com")).toBe(key);
    expect(service.deriveSubjectKey("other@example.com")).not.toBe(key);
    expect(() => service.recordTouch(key, "partner-1", "code", NOW)).not.toThrow();
  });

  it("returns no applicant identity and no forbidden field on an attribution record", () => {
    const { service } = build();
    const subjectKey = service.deriveSubjectKey("person@example.com");
    service.recordTouch(subjectKey, "partner-1", "signed_link", daysBefore(NOW, 1));

    const record = service.recordConversion(subjectKey, "order-1", NOW)!;
    const serialized = JSON.stringify(record);

    expect(Object.keys(record).sort()).toEqual([
      "attributedAt",
      "channel",
      "orderId",
      "overrideReason",
      "partnerId",
      "setByAdminId",
    ]);
    expect(serialized).not.toContain("person@example.com");
    expect(serialized).not.toContain(subjectKey);
    for (const field of PARTNER_FORBIDDEN_FIELDS) {
      expect(serialized).not.toContain(field);
    }
  });

  it("keeps the subject key out of every partner-visible link", () => {
    const { service } = build();
    const subjectKey = service.deriveSubjectKey("person@example.com");
    service.recordTouch(subjectKey, "partner-1", "signed_link", NOW);
    service.issueLink("partner-1", "signed_link", null, NOW);

    expect(JSON.stringify(service.listLinks("partner-1"))).not.toContain(subjectKey);
  });
});

// ---------------------------------------------------------------------------
// Manual attribution
// ---------------------------------------------------------------------------

describe("manual attribution", () => {
  it("records the acting admin and the reason", () => {
    const { service } = build();
    const record = service.manualAttribution("order-1", "partner-7", "admin-1", "support ticket 42", NOW);

    expect(record.setByAdminId).toBe("admin-1");
    expect(record.overrideReason).toBe("support ticket 42");
    expect(record.channel).toBe("manual");
    expect(record.attributedAt).toBe(NOW.toISOString());
  });

  it("overrides an automatic winner and stays the stored result", () => {
    const { service, repository } = build();
    service.recordTouch("subject-1", "partner-1", "signed_link", daysBefore(NOW, 1));
    service.recordConversion("subject-1", "order-1", NOW);

    service.manualAttribution("order-1", "partner-7", "admin-1", "correcting a bad link", NOW);

    const stored = repository.getAttribution("order-1");
    expect(stored?.partnerId).toBe("partner-7");
    expect(stored?.setByAdminId).toBe("admin-1");
  });

  it("survives a later conversion replay, which returns the admin's record", () => {
    const { service } = build();
    service.recordTouch("subject-1", "partner-1", "signed_link", daysBefore(NOW, 1));
    service.recordConversion("subject-1", "order-1", NOW);
    service.manualAttribution("order-1", "partner-7", "admin-1", "correcting a bad link", NOW);

    const replay = service.recordConversion("subject-1", "order-1", minutesAfter(NOW, 5));
    expect(replay?.partnerId).toBe("partner-7");
    expect(replay?.setByAdminId).toBe("admin-1");
  });

  it("carries no applicant identity on the manual record either", () => {
    const { service } = build();
    const record = service.manualAttribution("order-1", "partner-7", "admin-1", "ticket 42", NOW);

    expect(Object.keys(record).sort()).toEqual([
      "attributedAt",
      "channel",
      "orderId",
      "overrideReason",
      "partnerId",
      "setByAdminId",
    ]);
  });
});
