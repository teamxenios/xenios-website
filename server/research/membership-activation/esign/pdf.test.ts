import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";
import zlib from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { XeniosPdfGenerator, sanitizeForPdf } from "./pdf";
import type { CompletionCertificatePdfInput, SignedAgreementPdfInput } from "./contracts";

// A real, minimal 1x1 transparent PNG (base64, no data-uri prefix).
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

// A 64-hex-ish source hash stand-in.
const HASH = "a".repeat(64);
const PDF_HASH = "b".repeat(64);

function signedInput(overrides: Partial<SignedAgreementPdfInput> = {}): SignedAgreementPdfInput {
  return {
    agreementTitle: "Founding Membership Agreement",
    agreementContent: "This is the agreement body that the member read and signed.",
    semver: "1.4.0",
    documentVersionId: "docver_abc123",
    sourceContentHash: HASH,
    typedLegalName: "Samuel Boadu",
    signatureMethod: "typed",
    drawnPngBase64: null,
    signedAt: "2026-07-23T12:00:00.000Z",
    separateAcknowledgment: false,
    signingRequestId: "sreq_0001",
    ...overrides,
  };
}

function certificateInput(
  overrides: Partial<CompletionCertificatePdfInput> = {},
): CompletionCertificatePdfInput {
  return {
    memberId: "member_0001",
    signerEmail: "member@example.com",
    documents: [
      { title: "Founding Membership Agreement", documentVersionId: "docver_abc123", contentHash: HASH },
      { title: "Arbitration Acknowledgment", documentVersionId: "docver_def456", contentHash: "c".repeat(64) },
    ],
    signingRequestId: "sreq_0001",
    signedAt: "2026-07-23T12:00:00.000Z",
    ipHash: "d".repeat(64),
    userAgentHash: "e".repeat(64),
    signatureMethod: "typed",
    signedPdfSha256: PDF_HASH,
    ...overrides,
  };
}

function latin1(bytes: Buffer): string {
  return bytes.toString("latin1");
}

/**
 * Extract the rendered text of a generated PDF. pdf-lib flate-compresses each
 * page content stream and writes drawn text as hex-string operands, so a raw
 * latin1 scan cannot see it. This helper inflates every stream, then decodes
 * the hex string tokens back to their characters, proving what was actually
 * drawn onto the page. Offline: node zlib only, no network, no new dependency.
 */
function extractPdfText(bytes: Buffer): string {
  const raw = bytes.toString("latin1");
  let inflated = "";
  let from = 0;
  while (true) {
    const i = raw.indexOf("stream", from);
    if (i === -1) break;
    if (raw.substr(i, 9) === "endstream") {
      from = i + 9;
      continue;
    }
    let dataStart = i + "stream".length;
    if (raw[dataStart] === "\r") dataStart += 1;
    if (raw[dataStart] === "\n") dataStart += 1;
    const end = raw.indexOf("endstream", dataStart);
    if (end === -1) break;
    try {
      inflated += zlib.inflateSync(bytes.subarray(dataStart, end)).toString("latin1");
    } catch {
      // not a flate stream; ignore for text extraction.
    }
    from = end + "endstream".length;
  }
  let text = "";
  const hexToken = /<([0-9A-Fa-f]+)>/g;
  let match: RegExpExecArray | null;
  while ((match = hexToken.exec(inflated)) !== null) {
    const hex = match[1];
    if (hex.length % 2 !== 0) continue;
    text += `${Buffer.from(hex, "hex").toString("latin1")} `;
  }
  return text;
}

describe("XeniosPdfGenerator.generateSignedAgreementPdf", () => {
  const gen = new XeniosPdfGenerator();

  it("returns a valid, loadable PDF buffer with at least one page", async () => {
    const bytes = await gen.generateSignedAgreementPdf(signedInput());
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(latin1(bytes).startsWith("%PDF-")).toBe(true);
    expect(bytes.length).toBeGreaterThan(500);
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("paginates a long agreement across multiple pages", async () => {
    const lorem =
      "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ";
    const longContent = lorem.repeat(80); // well over 8000 characters
    expect(longContent.length).toBeGreaterThan(8000);
    const bytes = await gen.generateSignedAgreementPdf(
      signedInput({ agreementContent: longContent }),
    );
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThan(1);
  });

  it("embeds a drawn signature PNG without throwing", async () => {
    const bytes = await gen.generateSignedAgreementPdf(
      signedInput({ signatureMethod: "drawn", drawnPngBase64: TINY_PNG }),
    );
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("accepts a drawn signature PNG with a data-uri prefix", async () => {
    const bytes = await gen.generateSignedAgreementPdf(
      signedInput({ signatureMethod: "drawn", drawnPngBase64: `data:image/png;base64,${TINY_PNG}` }),
    );
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("handles a typed signature with a null drawn PNG", async () => {
    const bytes = await gen.generateSignedAgreementPdf(
      signedInput({ signatureMethod: "typed", drawnPngBase64: null }),
    );
    expect(latin1(bytes).startsWith("%PDF-")).toBe(true);
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("does not throw on a malformed drawn PNG (falls back to typed)", async () => {
    const malformed = Buffer.from("this is definitely not a png image", "utf8").toString("base64");
    const bytes = await gen.generateSignedAgreementPdf(
      signedInput({ signatureMethod: "drawn", drawnPngBase64: malformed }),
    );
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("does not throw on an oversized garbage drawn PNG base64", async () => {
    const oversized = "A".repeat(200000); // large, not decodable as a PNG
    const bytes = await gen.generateSignedAgreementPdf(
      signedInput({ signatureMethod: "drawn", drawnPngBase64: oversized }),
    );
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("does not throw on smart quotes, em dashes, and non-latin characters", async () => {
    const tricky =
      "The coach’s “voice” — held faithfully – 你好 éè • … end.";
    const bytes = await gen.generateSignedAgreementPdf(
      signedInput({
        agreementTitle: `Agreement — ${tricky}`,
        agreementContent: `${tricky}\n${tricky}`,
        typedLegalName: "Renée “X”",
      }),
    );
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("renders the separate acknowledgment line when required", async () => {
    const bytes = await gen.generateSignedAgreementPdf(signedInput({ separateAcknowledgment: true }));
    expect(extractPdfText(bytes)).toContain("Separate acknowledgment recorded");
  });

  it("omits the separate acknowledgment line when not required", async () => {
    const bytes = await gen.generateSignedAgreementPdf(signedInput({ separateAcknowledgment: false }));
    expect(extractPdfText(bytes)).not.toContain("Separate acknowledgment recorded");
  });

  it("renders the source content hash faithfully in the document", async () => {
    const bytes = await gen.generateSignedAgreementPdf(signedInput());
    expect(extractPdfText(bytes)).toContain(HASH);
  });

  it("renders a canary passed as agreement content faithfully (no truncation)", async () => {
    const canary = "XENIOSCANARYTOKEN7788QZ";
    const bytes = await gen.generateSignedAgreementPdf(
      signedInput({ agreementContent: `Preamble. ${canary} Postamble.` }),
    );
    expect(extractPdfText(bytes)).toContain(canary);
  });

  it("introduces no supabase or service-role material of its own", async () => {
    const bytes = await gen.generateSignedAgreementPdf(signedInput());
    // The input carries none, so the generator must add none: check both the
    // raw bytes and the rendered (inflated + decoded) text.
    const raw = latin1(bytes);
    const rendered = extractPdfText(bytes);
    for (const haystack of [raw, rendered]) {
      expect(haystack).not.toContain("SUPABASE");
      expect(haystack).not.toContain("SERVICE_ROLE");
      expect(haystack.toLowerCase()).not.toContain("process.env");
    }
  });

  it("is deterministic in page count for the same input", async () => {
    const input = signedInput({ agreementContent: "Repeatable content. ".repeat(300) });
    const a = await gen.generateSignedAgreementPdf(input);
    const b = await gen.generateSignedAgreementPdf(input);
    const pagesA = (await PDFDocument.load(a)).getPageCount();
    const pagesB = (await PDFDocument.load(b)).getPageCount();
    expect(pagesA).toBe(pagesB);
  });
});

describe("XeniosPdfGenerator.generateCompletionCertificatePdf", () => {
  const gen = new XeniosPdfGenerator();

  it("returns a valid, loadable certificate PDF", async () => {
    const bytes = await gen.generateCompletionCertificatePdf(certificateInput());
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(latin1(bytes).startsWith("%PDF-")).toBe(true);
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("renders the hashed-only privacy statement and the signed PDF hash", async () => {
    const bytes = await gen.generateCompletionCertificatePdf(certificateInput());
    const text = extractPdfText(bytes);
    expect(text).toContain("SHA-256 hashes only");
    expect(text).toContain(PDF_HASH);
  });

  it("shows 'not recorded' when ip and user agent hashes are null", async () => {
    const bytes = await gen.generateCompletionCertificatePdf(
      certificateInput({ ipHash: null, userAgentHash: null }),
    );
    expect(extractPdfText(bytes)).toContain("not recorded");
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("handles an empty documents list without throwing", async () => {
    const bytes = await gen.generateCompletionCertificatePdf(certificateInput({ documents: [] }));
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("introduces no supabase or service-role material of its own", async () => {
    const bytes = await gen.generateCompletionCertificatePdf(certificateInput());
    const raw = latin1(bytes);
    const rendered = extractPdfText(bytes);
    for (const haystack of [raw, rendered]) {
      expect(haystack).not.toContain("SUPABASE");
      expect(haystack).not.toContain("SERVICE_ROLE");
    }
  });
});

describe("sanitizeForPdf", () => {
  it("folds smart punctuation to ascii", () => {
    expect(sanitizeForPdf("“hi”")).toBe('"hi"');
    expect(sanitizeForPdf("a—b")).toBe("a--b");
    expect(sanitizeForPdf("a–b")).toBe("a-b");
    expect(sanitizeForPdf("x…")).toBe("x...");
    expect(sanitizeForPdf("it’s")).toBe("it's");
  });

  it("replaces non-encodable characters with a question mark", () => {
    expect(sanitizeForPdf("你好")).toBe("??");
  });

  it("is idempotent", () => {
    const once = sanitizeForPdf("The “voice” — kept.");
    expect(sanitizeForPdf(once)).toBe(once);
  });

  it("keeps plain ascii unchanged", () => {
    expect(sanitizeForPdf("Samuel Boadu 12345")).toBe("Samuel Boadu 12345");
  });
});
