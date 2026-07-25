import { describe, expect, it } from "vitest";
import { shouldLogApiResponseBody } from "./request-logging";

describe("API response logging policy", () => {
  it("allows only the explicit non-sensitive diagnostic bodies", () => {
    expect(shouldLogApiResponseBody("/api/health")).toBe(true);
    expect(shouldLogApiResponseBody("/api/counter")).toBe(true);
    expect(shouldLogApiResponseBody("/api/waitlist/count")).toBe(true);
  });

  it("keeps config, member, admin, contact, and unknown response bodies private", () => {
    expect(shouldLogApiResponseBody("/api/config")).toBe(false);
    expect(shouldLogApiResponseBody("/api/research/me")).toBe(false);
    expect(shouldLogApiResponseBody("/api/admin/waitlist")).toBe(false);
    expect(shouldLogApiResponseBody("/api/contact")).toBe(false);
    expect(shouldLogApiResponseBody("/api/future-route")).toBe(false);
  });
});
