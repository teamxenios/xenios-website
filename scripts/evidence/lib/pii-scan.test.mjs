import { describe, expect, it } from "vitest";
import { redact, scanFileName, scanText, summariseFindings } from "./pii-scan.mjs";

describe("scanText", () => {
  it("flags emails, phone numbers, live keys, JWTs and order references with redacted values", () => {
    const text = [
      "contact person@somewhere.org now",
      "call (555) 010-2233",
      "key sk_live_abcdefghijklmnop",
      "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwxyz",
      "order XRR-20260821-5FDD95BDE9",
      "sb_secret_realkeyvalue",
    ].join("\n");
    const ids = scanText(text).map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(["EMAIL", "US_PHONE", "STRIPE_LIVE_KEY", "JWT", "ORDER_REFERENCE", "SUPABASE_SECRET"]));
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

  it("is clean on ordinary page text", () => {
    expect(scanText("Member sign in. Forgot your password? Terms of research use. 44 x 44 px.")).toEqual([]);
  });

  it("does not misread ordinary numbers as phone numbers or SSNs", () => {
    expect(scanText("scrollWidth 1440 clientWidth 1024 timestamp 2026-08-28T19:21:49Z 20260828")).toEqual([]);
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
