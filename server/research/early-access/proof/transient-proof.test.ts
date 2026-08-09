import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  assertNoProofBytes,
  ProofBytesRefused,
  TRANSIENT_PROOF_MAX_BYTES,
  validateTransientProof,
} from "./transient-proof";
import type { PdfStructuralParser } from "./containers";
import { pdfBytes, validJpeg, validPng, validWebp, withTrailing } from "./test-fixtures";
import { safeProofFilename } from "./filename";

const pdfParser: PdfStructuralParser = { async pageCount() { return 1; } };

describe("validateTransientProof", () => {
  it("reduces a valid upload to metadata and nothing else", async () => {
    const bytes = validPng();
    const result = await validateTransientProof({
      bytes,
      declaredContentType: "image/png",
      declaredFilename: "Zelle transfer.PNG",
      pdfParser,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.descriptor.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(result.descriptor.byteSize).toBe(bytes.length);
    expect(result.descriptor.contentType).toBe("image/png");
    expect(result.descriptor.persisted).toBe(false);

    // The descriptor is the object the rest of the system carries. It must have
    // no field capable of holding, or pointing at, the file.
    expect(Object.keys(result.descriptor).sort()).toEqual([
      "byteSize",
      "contentType",
      "filename",
      "filenameRewritten",
      "persisted",
      "sha256",
    ]);
    expect(() => assertNoProofBytes(result.descriptor)).not.toThrow();
  });

  it("accepts every allowed container", async () => {
    const cases = [
      { bytes: validPng(), type: "image/png" },
      { bytes: validJpeg(), type: "image/jpeg" },
      { bytes: validWebp(), type: "image/webp" },
      { bytes: pdfBytes(), type: "application/pdf" },
    ] as const;
    for (const testCase of cases) {
      const result = await validateTransientProof({
        bytes: testCase.bytes,
        declaredContentType: testCase.type,
        declaredFilename: "proof",
        pdfParser,
      });
      expect(result.ok, testCase.type).toBe(true);
    }
  });

  it("refuses a spoofed content type", async () => {
    const result = await validateTransientProof({
      bytes: validPng(),
      declaredContentType: "application/pdf",
      declaredFilename: "statement.pdf",
      pdfParser,
    });
    expect(result).toEqual({ ok: false, code: "declared_type_mismatch" });
  });

  it("refuses a type outside the allowlist before it looks at the bytes", async () => {
    const result = await validateTransientProof({
      bytes: validPng(),
      declaredContentType: "image/svg+xml",
      declaredFilename: "proof.svg",
      pdfParser,
    });
    expect(result).toEqual({ ok: false, code: "content_type_unsupported" });
  });

  it("refuses a polyglot carrying an appended payload", async () => {
    const result = await validateTransientProof({
      bytes: withTrailing(validPng(), "PK\u0003\u0004appended-archive"),
      declaredContentType: "image/png",
      declaredFilename: "proof.png",
      pdfParser,
    });
    expect(result).toEqual({ ok: false, code: "trailing_bytes" });
  });

  it("refuses an oversized upload without hashing it", async () => {
    const result = await validateTransientProof({
      bytes: new Uint8Array(TRANSIENT_PROOF_MAX_BYTES + 1),
      declaredContentType: "image/png",
      declaredFilename: "proof.png",
      pdfParser,
    });
    expect(result).toEqual({ ok: false, code: "too_large" });
  });

  it("refuses an empty upload", async () => {
    const result = await validateTransientProof({
      bytes: new Uint8Array(0),
      declaredContentType: "image/png",
      declaredFilename: "proof.png",
      pdfParser,
    });
    expect(result).toEqual({ ok: false, code: "bytes_missing" });
  });

  it("produces the same hash for the same file, which is what makes a retry one claim", async () => {
    const bytes = validJpeg();
    const first = await validateTransientProof({
      bytes,
      declaredContentType: "image/jpeg",
      declaredFilename: "a.jpg",
      pdfParser,
    });
    const second = await validateTransientProof({
      bytes: new Uint8Array(bytes),
      declaredContentType: "image/jpeg",
      declaredFilename: "different-name.jpeg",
      pdfParser,
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.descriptor.sha256).toBe(second.descriptor.sha256);
  });
});

describe("assertNoProofBytes", () => {
  it("refuses a record carrying bytes at the top level", () => {
    expect(() => assertNoProofBytes({ ok: true, bytes: new Uint8Array(4) })).toThrow(
      ProofBytesRefused,
    );
  });

  it("refuses a pointer to the bytes, which is as bad as the bytes", () => {
    expect(() => assertNoProofBytes({ signedUrl: "https://example.test/x" })).toThrow(
      ProofBytesRefused,
    );
    expect(() => assertNoProofBytes({ storageKey: "private/proofs/1" })).toThrow(ProofBytesRefused);
  });

  it("finds a violation nested inside a line item", () => {
    let thrown: unknown;
    try {
      assertNoProofBytes({ lines: [{ sku: "X" }, { sku: "Y", base64: "AAAA" }] });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ProofBytesRefused);
    expect((thrown as ProofBytesRefused).keys).toContain("base64");
  });

  it("survives a cyclic structure instead of hanging", () => {
    const node: Record<string, unknown> = { safe: true };
    node.self = node;
    expect(() => assertNoProofBytes(node)).not.toThrow();
  });

  it("allows a clean metadata record", () => {
    expect(() =>
      assertNoProofBytes({ sha256: "abc", filename: "proof.png", byteSize: 10 }),
    ).not.toThrow();
  });
});

describe("safeProofFilename", () => {
  it("strips a bidi override that would disguise the extension", () => {
    const safe = safeProofFilename("proof\u202egnp.exe", "image/png");
    expect(safe.value).not.toContain("\u202e");
    expect(safe.value.endsWith(".png")).toBe(true);
    expect(safe.value).toBe("proofgnp.png");
    expect(safe.rewritten).toBe(true);
  });

  it("removes path traversal entirely rather than escaping it", () => {
    const safe = safeProofFilename("../../../etc/passwd.png", "image/png");
    expect(safe.value).toBe("passwd.png");
  });

  it("drops a second extension", () => {
    expect(safeProofFilename("invoice.pdf.exe", "application/pdf").value).toBe("invoice.pdf.pdf");
  });

  it("removes control characters that could inject a header line", () => {
    const safe = safeProofFilename("a\r\nContent-Type: text/html\r\n.png", "image/png");
    expect(safe.value).not.toMatch(/[\r\n]/);
  });

  it("falls back rather than refusing when nothing survives", () => {
    expect(safeProofFilename("\u202e\u200b\u0000", "image/webp").value).toBe("payment-proof.webp");
  });

  it("prefixes a Windows device name", () => {
    expect(safeProofFilename("CON.png", "image/png").value).toBe("payment-proof-CON.png");
  });

  it("leaves an already safe name alone", () => {
    const safe = safeProofFilename("zelle-transfer.png", "image/png");
    expect(safe.value).toBe("zelle-transfer.png");
    expect(safe.rewritten).toBe(false);
  });

  it("bounds the length", () => {
    const safe = safeProofFilename(`${"a".repeat(500)}.png`, "image/png");
    expect(safe.value.length).toBeLessThanOrEqual(64 + ".png".length);
  });
});
