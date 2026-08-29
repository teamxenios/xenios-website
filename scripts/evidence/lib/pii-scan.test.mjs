import { describe, expect, it } from "vitest";
import { redact, scanFileName, scanText, summariseFindings } from "./pii-scan.mjs";

describe("scanText", () => {
  it("flags emails, phone numbers, live keys, JWTs and order references with redacted values", () => {
    const text = [
      "contact person@somewhere.org now",
      "call (555) 010-2233",
      "key " + ["sk", "live", "abcdefghijklmnop"].join("_"),
      "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwxyz",
      "order XRR-20260821-5FDD95BDE9",
      "sb_secret_realkeyvalue",
      `statusToken: "${"a".repeat(43)}"`,
      `https://local.invalid/status?token=${"b".repeat(43)}&view=1`,
    ].join("\n");
    const ids = scanText(text).map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(["EMAIL", "US_PHONE", "STRIPE_LIVE_KEY", "JWT", "ORDER_REFERENCE", "SUPABASE_SECRET", "STATUS_TOKEN"]));
    for (const f of scanText(text)) {
      expect(f.redacted).not.toContain("person@somewhere");
      expect(f.redacted).not.toContain("5FDD95BDE9");
      expect(f.line).toBeGreaterThan(0);
    }
  });

  it("ignores fixture values and published business contact addresses on the allowlist", () => {
    expect(scanText("a@example.com and sb_secret_preview_placeholder and noreply@x.test")).toEqual([]);
    expect(scanText("write to research@xeniostechnology.com or team@xeniostechnology.com")).toEqual([]);
    expect(scanText("someone.private@xeniostechnology.com").map((f) => f.id)).toEqual(["EMAIL"]);
  });

  it("allows only the exact synthetic preview personas", () => {
    expect(scanText("fixture1@preview.invalid and fixture2@preview.invalid")).toEqual([]);

    const ids = scanText([
      "inactive@preview.invalid",
      "fixture3@preview.invalid",
      "fixture1@preview.example",
      "member@somewhere.org",
    ].join("\n")).map((f) => f.id);
    expect(ids).toEqual(["EMAIL", "EMAIL", "EMAIL", "EMAIL"]);
  });

  it("allows only the exact synthetic assisted-order phone fixture", () => {
    expect(scanText("Mobile phone +1 555 010 2000")).toEqual([]);

    const ids = scanText([
      "+1 555 010 2001",
      "(555) 010-2000",
      "+1 312 555 0199",
    ].join("\n")).map((f) => f.id);
    expect(ids).toEqual(["US_PHONE", "US_PHONE", "US_PHONE"]);
  });

  it("allows only the reserved forged-reference fixture across evidence envelopes", () => {
    const representativeEvidence = {
      browserMatrix: {
        route: "/research/early-access/order-request/confirmation/XRR-20000101-0000000000",
      },
      httpEvidence: {
        finalUrl: "http://127.0.0.1:5184/research/early-access/order-request/confirmation/XRR-20000101-0000000000",
      },
      syntheticJourneyEvidence: {
        actualUrl: "http://127.0.0.1:5186/research/early-access/order-request/SYNTHETIC-REFERENCE-REDACTED",
      },
    };
    expect(scanText(JSON.stringify(representativeEvidence))).toEqual([]);
    expect(scanText("XRR-20000101-0000000001").map((finding) => finding.id)).toEqual([
      "ORDER_REFERENCE",
    ]);
    expect(scanText("XRR-20260829-0000000000").map((finding) => finding.id)).toEqual([
      "ORDER_REFERENCE",
    ]);
  });

  it("is clean on ordinary page text", () => {
    expect(scanText("Member sign in. Forgot your password? Terms of research use. 44 x 44 px.")).toEqual([]);
  });

  it("does not misread ordinary numbers as phone numbers or SSNs", () => {
    expect(scanText("scrollWidth 1440 clientWidth 1024 timestamp 2026-08-28T19:21:49Z 20260828")).toEqual([]);
  });

  it("detects exact-length assisted-order credentials but not ordinary token words", () => {
    expect(scanText(`{"statusToken":"${"z".repeat(43)}"}`).map((finding) => finding.id)).toEqual(["STATUS_TOKEN"]);
    expect(scanText(`X-Xenios-Order-Status-Token: ${"h".repeat(43)}`).map((finding) => finding.id)).toEqual(["STATUS_TOKEN"]);
    expect(scanText(`{"x-xenios-order-status-token":"${"j".repeat(43)}"}`).map((finding) => finding.id)).toEqual(["STATUS_TOKEN"]);
    expect(scanText(`GET /request?token=${"A".repeat(43)}`).map((finding) => finding.id)).toEqual(["STATUS_TOKEN"]);
    expect(scanText("token=presentation-only short token=abc123")).toEqual([]);
  });
});

describe("scanFileName", () => {
  it("flags an order reference or email in a file name", () => {
    expect(scanFileName("captures/order--XRR-20260821-5FDD95BDE9--01.png").map((f) => f.kind)).toEqual(["FILENAME"]);
    expect(scanFileName("captures/research-home--default--chromium--1440--01.png")).toEqual([]);
  });
});

describe("redact / summariseFindings", () => {
  it("keeps only two leading and trailing characters", () => {
    expect(redact("abcdefghijkl")).toBe("ab********kl");
    expect(redact("abc")).toBe("***");
  });
  it("summarises by id", () => {
    const s = summariseFindings([{ id: "EMAIL" }, { id: "EMAIL" }, { id: "JWT" }]);
    expect(s).toEqual({ total: 3, byId: { EMAIL: 2, JWT: 1 }, result: "FINDINGS" });
    expect(summariseFindings([]).result).toBe("CLEAN");
  });
});
