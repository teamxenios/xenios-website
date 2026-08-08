import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, not URL.pathname. On Windows the latter yields "/C:/..." and
// path.dirname keeps the leading slash, so every read resolves to "C:\C:\..."
// and throws ENOENT. The assertions below are the point of this file; they
// cannot run at all if it cannot find the sources it scans.
const HERE = path.dirname(fileURLToPath(import.meta.url));

describe("Early Access cart client safety", () => {
  it("stores no PII, identity, payment reference, or idempotency key in the cart", () => {
    const source = readFileSync(path.join(HERE, "cartStore.ts"), "utf8");
    for (const forbidden of ["email:", "phone:", "line1:", "customerRef:", "paymentReference:", "idempotencyKey:"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("history allows step names only", () => {
    const source = readFileSync(path.join(HERE, "history.ts"), "utf8");
    expect(source).toContain('["earlyAccess", "step"]');
    for (const forbidden of ["email", "phone", "customerRef", "idempotencyKey", "paymentReference"]) {
      expect(source).toContain(forbidden); // forbidden-list guard must name it
    }
  });

  it("renders server money and never reduces cart prices in the review component", () => {
    const source = readFileSync(path.join(HERE, "EarlyAccessCartReview.tsx"), "utf8");
    expect(source).not.toMatch(/reduce\s*\(/);
    expect(source).not.toMatch(/unitPriceCents\s*\*/);
    expect(source).toContain("quote.payableTotalCents");
  });
});
