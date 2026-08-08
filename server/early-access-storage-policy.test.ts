import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  auditStoragePolicy,
  EARLY_ACCESS_STORAGE_ROOT,
  type StorageAuditFs,
} from "../scripts/acceptance/verify-storage-policy.ts";

/**
 * The auditor's own tests, in two halves.
 *
 * POSITIVE: it sees the writes a regex cannot (aliases, optional chaining,
 * helpers, `satisfies`, `as`) and does NOT see the ones that are not writes
 * (a comment, a regex literal).
 *
 * NEGATIVE, and the more important half: every way the auditor can fail to
 * look is a FAILURE, not a clean result. A detector that cannot read its
 * input, cannot parse it, or throws while analyzing it must never report zero
 * findings. That exact confusion (stderr suppressed, output still "0") is why
 * this file exists.
 */

function memoryFs(files: Readonly<Record<string, string>>): StorageAuditFs {
  return {
    listFiles: () => Object.keys(files).sort(),
    readFile: (file) => {
      const source = files[file];
      if (source === undefined) throw new Error(`no such file: ${file}`);
      return source;
    },
  };
}

function audit(files: Readonly<Record<string, string>>) {
  return auditStoragePolicy({ root: "/audit", repoRoot: "/audit", fs: memoryFs(files) });
}

function codes(result: { findings: readonly { code: string }[] }): string[] {
  return result.findings.map((finding) => finding.code);
}

const CART_KEY = "xenios.research.earlyAccess.cart.v1";
const ATTEMPT_KEY = "xenios.research.earlyAccess.cartAttempt.v2";

describe("the storage auditor fails closed", () => {
  it("reports a MISSING ROOT rather than an empty clean scan", () => {
    const result = auditStoragePolicy({
      root: "/audit",
      fs: {
        listFiles: () => {
          throw new Error("ENOENT: no such directory");
        },
        readFile: () => "",
      },
    });
    expect(codes(result)).toEqual(["MISSING_ROOT"]);
    expect(result.scannedFiles).toHaveLength(0);
  });

  it("reports an EMPTY SCAN, because reading nothing proves nothing", () => {
    const result = audit({});
    expect(codes(result)).toEqual(["EMPTY_SCAN"]);
  });

  it("reports an UNREADABLE FILE instead of skipping it quietly", () => {
    const result = auditStoragePolicy({
      root: "/audit",
      repoRoot: "/audit",
      fs: {
        listFiles: () => ["/audit/a.ts"],
        readFile: () => {
          throw new Error("EACCES: permission denied");
        },
      },
    });
    expect(codes(result)).toContain("UNREADABLE_FILE");
    expect(result.findings.length).toBeGreaterThan(0);
  });

  // Mutation 20. TypeScript's parser is error tolerant and hands back a tree
  // for input it did not understand, so an auditor that walks that tree and
  // finds nothing would announce a clean file it never actually read.
  it("reports a PARSE ERROR rather than walking a tree it could not build", () => {
    const result = audit({
      "/audit/broken.ts": "export function ( { const = = = ;;; )) }}} <<<>>>",
    });
    expect(codes(result)).toContain("PARSE_ERROR");
  });

  it("reports AUDITOR FAILED when the detector itself throws", () => {
    const result = auditStoragePolicy({
      root: "/audit",
      repoRoot: "/audit",
      fs: {
        listFiles: () => ["/audit/a.ts"],
        // Not a string. The parser throws on it, which is an auditor failure,
        // not an audited file with no findings.
        readFile: () => 42 as unknown as string,
      },
    });
    expect(codes(result)).toContain("AUDITOR_FAILED");
  });

  it("a file that parses and stores nothing is clean, so the failures above are real signal", () => {
    const result = audit({ "/audit/pure.ts": "export const answer = 42;\n" });
    expect(result.findings).toEqual([]);
    expect(result.scannedFiles).toHaveLength(1);
  });
});

describe("the storage auditor sees what a regex cannot", () => {
  it("sees a direct write and refuses a forbidden field", () => {
    const result = audit({
      "/audit/a.ts": `
        export function save(): void {
          sessionStorage.setItem("${CART_KEY}", JSON.stringify({ version: 1, email: "x@y.z" }));
        }
      `,
    });
    expect(codes(result)).toContain("FORBIDDEN_PAYLOAD_FIELD");
    expect(result.findings.some((finding) => finding.message.includes("'email'"))).toBe(true);
  });

  it("sees an OPTIONAL CHAINED write through an alias", () => {
    const result = audit({
      "/audit/a.ts": `
        const bucket = window.sessionStorage;
        export function save(): void {
          bucket?.setItem("${CART_KEY}", JSON.stringify({ version: 1, postalCode: "77001" }));
        }
      `,
    });
    expect(codes(result)).toContain("FORBIDDEN_PAYLOAD_FIELD");
  });

  it("sees a write through a storage-returning HELPER declared below its use", () => {
    const result = audit({
      "/audit/a.ts": `
        export function save(): void {
          storage()?.setItem("${CART_KEY}", JSON.stringify({ version: 1, paymentReference: "r" }));
        }
        function storage(): Storage | null {
          try { return window.sessionStorage; } catch { return null; }
        }
      `,
    });
    expect(codes(result)).toContain("FORBIDDEN_PAYLOAD_FIELD");
  });

  it("sees through a `satisfies` wrapper", () => {
    const result = audit({
      "/audit/a.ts": `
        type Basket = { version: 1; customerRef: string };
        export function save(): void {
          sessionStorage.setItem(
            "${CART_KEY}",
            JSON.stringify({ version: 1, customerRef: "c" } satisfies Basket),
          );
        }
      `,
    });
    expect(codes(result)).toContain("FORBIDDEN_PAYLOAD_FIELD");
  });

  it("sees through an `as` wrapper", () => {
    const result = audit({
      "/audit/a.ts": `
        export function save(): void {
          sessionStorage.setItem(
            "${CART_KEY}",
            JSON.stringify({ version: 1, unitPriceCents: 1 } as Record<string, unknown>),
          );
        }
      `,
    });
    expect(codes(result)).toContain("FORBIDDEN_PAYLOAD_FIELD");
  });

  it("proves a payload handed in as a TYPED PARAMETER, and catches a forbidden field in its type", () => {
    const result = audit({
      "/audit/a.ts": `
        type Attempt = Readonly<{ idempotencyKey: string; email: string }>;
        export function save(attempt: Attempt): void {
          sessionStorage.setItem("xenios.earlyAccess.pendingOrder.v1", JSON.stringify(attempt));
        }
      `,
    });
    expect(codes(result)).toContain("FORBIDDEN_PAYLOAD_FIELD");
  });

  it("counts an ALIASED localStorage identifier, which is the whole point", () => {
    const result = audit({
      "/audit/a.ts": `
        const store = localStorage;
        export function save(): void {
          store.setItem("${ATTEMPT_KEY}", "xeac_0123456789abcdef01");
        }
      `,
    });
    expect(codes(result)).toContain("LOCAL_STORAGE_REFERENCE");
  });

  it("does NOT count localStorage in a comment or a regex literal", () => {
    const result = audit({
      "/audit/a.ts": `
        // sessionStorage, not localStorage, on purpose: the identity is session scoped.
        /** Another mention of localStorage in a doc comment. */
        export const FORBIDDEN = /localStorage|sessionStorage/i;
        export const NAMED = "localStorage";
      `,
    });
    expect(result.findings).toEqual([]);
  });

  it("refuses a DYNAMIC storage key, so a new bucket cannot appear unreviewed", () => {
    const result = audit({
      "/audit/a.ts": `
        export function save(suffix: string): void {
          sessionStorage.setItem("xenios.cart." + suffix, "value");
        }
      `,
    });
    expect(codes(result)).toContain("UNKNOWN_STORAGE_KEY");
  });

  it("refuses an unrecognized literal key", () => {
    const result = audit({
      "/audit/a.ts": `
        export function save(): void {
          sessionStorage.setItem("xenios.somethingNew.v1", "value");
        }
      `,
    });
    expect(codes(result)).toContain("UNKNOWN_STORAGE_KEY");
  });

  it("refuses a payload it cannot prove instead of assuming it is safe", () => {
    const result = audit({
      "/audit/a.ts": `
        import { build } from "./elsewhere";
        export function save(): void {
          sessionStorage.setItem("${CART_KEY}", JSON.stringify(build()));
        }
      `,
    });
    expect(codes(result)).toContain("UNPROVABLE_PAYLOAD");
  });

  it("refuses a structured object written to a scalar recovery pointer", () => {
    const result = audit({
      "/audit/a.ts": `
        export function save(): void {
          sessionStorage.setItem("${ATTEMPT_KEY}", JSON.stringify({ version: 1 }));
        }
      `,
    });
    expect(codes(result)).toContain("FORBIDDEN_PAYLOAD_FIELD");
  });

  it("refuses an extra key in history.state", () => {
    const result = audit({
      "/audit/a.ts": `
        export function go(step: string, email: string): void {
          window.history.pushState({ earlyAccess: true, step, email }, "", "/x");
        }
      `,
    });
    expect(codes(result)).toContain("FORBIDDEN_HISTORY_FIELD");
  });

  it("accepts history.state carrying exactly earlyAccess and step", () => {
    const result = audit({
      "/audit/a.ts": `
        export function go(step: string): void {
          window.history.replaceState({ earlyAccess: true, step }, "", "/x");
        }
      `,
    });
    expect(result.findings).toEqual([]);
    expect(result.historyWrites).toBe(1);
  });
});

describe("the real Early Access persistence path", () => {
  // The integration assertion. It runs the auditor over the actual shipped
  // sources, so a forbidden field or a stray localStorage added tomorrow is a
  // red test today, not a discovery in production.
  it("stores nothing forbidden, references localStorage nowhere, and every write is proven", () => {
    const repoRoot = resolve(import.meta.dirname, "..");
    const result = auditStoragePolicy({
      root: resolve(repoRoot, EARLY_ACCESS_STORAGE_ROOT),
      repoRoot,
    });
    expect(result.findings).toEqual([]);
    // The scan must have actually read the path and proven real writes; a pass
    // over zero files or zero writes would be vacuous.
    expect(result.scannedFiles.length).toBeGreaterThan(10);
    expect(result.storageWrites).toBeGreaterThanOrEqual(5);
    expect(result.historyWrites).toBeGreaterThanOrEqual(2);
  });
});
