import { describe, expect, it } from "vitest";
import {
  assertTebraDetailIsSafe,
  isRetryableTebraCode,
  safeTebraErrorCode,
  tebraAuditDetail,
  tebraErrorEnvelope,
} from "./tebra-redaction";

describe("Upstream error reduction", () => {
  it("keeps a code the connector already publishes", () => {
    expect(safeTebraErrorCode(new Error("tebra_conflict"))).toBe("tebra_conflict");
    expect(safeTebraErrorCode(new Error("tebra_invalid_payload"))).toBe("tebra_invalid_payload");
  });

  it("collapses anything else, including a fault that quotes a record", () => {
    const noisy = [
      new Error("SOAP fault: patient Jane Doe 1974-03-02 not found"),
      new Error("401 Unauthorized customerKey=abc123"),
      "a bare string",
      { message: "an object" },
      undefined,
    ];
    for (const error of noisy) {
      expect(safeTebraErrorCode(error)).toBe("tebra_unavailable");
    }
  });

  it("retries availability failures and nothing else", () => {
    expect(isRetryableTebraCode("tebra_unavailable")).toBe(true);
    for (const code of [
      "tebra_disabled",
      "tebra_unconfigured",
      "tebra_invalid_configuration",
      "tebra_invalid_payload",
      "tebra_conflict",
      "tebra_not_linked",
    ] as const) {
      expect(isRetryableTebraCode(code)).toBe(false);
    }
  });
});

describe("Audit detail allowlist", () => {
  it("builds a fixed shape and drops anything a caller adds", () => {
    const detail = tebraAuditDetail({
      operation: "sync",
      entity: "patient",
      localId: "11111111-1111-4111-8111-111111111111",
      success: true,
      // A caller trying to widen the record gets nothing extra back.
      ...({ firstName: "Jane", diagnosis: "redacted" } as Record<string, never>),
    });

    expect(Object.keys(detail).sort()).toEqual([
      "attempts",
      "code",
      "entity",
      "externalId",
      "localId",
      "operation",
      "success",
      "tebraId",
    ]);
    expect(JSON.stringify(detail)).not.toContain("Jane");
  });

  it("refuses a hand built detail that carries identifying or secret fields", () => {
    for (const key of [
      "firstName",
      "last_name",
      "dateOfBirth",
      "email",
      "phone",
      "diagnosis",
      "medication",
      "reason",
      "password",
      "customerKey",
      "authorization",
    ]) {
      expect(() => assertTebraDetailIsSafe({ [key]: "value" })).toThrow(
        "tebra_audit_detail_rejected",
      );
    }
  });

  it("allows the shape the builder produces", () => {
    expect(() =>
      assertTebraDetailIsSafe(
        tebraAuditDetail({ operation: "sync", entity: "appointment", success: false }) as unknown as Record<
          string,
          unknown
        >,
      ),
    ).not.toThrow();
  });
});

describe("Error envelope", () => {
  it("carries a code and nothing else", () => {
    expect(tebraErrorEnvelope("tebra_unavailable")).toEqual({
      ok: false,
      code: "tebra_unavailable",
    });
  });
});
