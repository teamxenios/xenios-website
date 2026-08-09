import { describe, expect, it } from "vitest";
import {
  sniffProofContainer,
  validateJpegStructure,
  validatePdfStructure,
  validatePngStructure,
  validateProofContainer,
  validateWebpStructure,
  type PdfStructuralParser,
} from "./containers";
import { flipByte, pdfBytes, validJpeg, validPng, validWebp, withTrailing } from "./test-fixtures";

const acceptingPdfParser: PdfStructuralParser = { async pageCount() { return 1; } };

describe("sniffProofContainer", () => {
  it("names each accepted container from its real signature", () => {
    expect(sniffProofContainer(validPng())).toBe("image/png");
    expect(sniffProofContainer(validJpeg())).toBe("image/jpeg");
    expect(sniffProofContainer(validWebp())).toBe("image/webp");
    expect(sniffProofContainer(pdfBytes())).toBe("application/pdf");
  });

  it("refuses anything else, including an executable and a ZIP", () => {
    expect(sniffProofContainer(Uint8Array.of(0x4d, 0x5a, 0x90, 0x00))).toBeNull();
    expect(sniffProofContainer(Uint8Array.of(0x50, 0x4b, 0x03, 0x04))).toBeNull();
    expect(sniffProofContainer(new Uint8Array(0))).toBeNull();
  });
});

describe("PNG structure", () => {
  it("accepts a well formed file", () => {
    expect(validatePngStructure(validPng())).toEqual({ ok: true, contentType: "image/png" });
  });

  it("refuses a payload appended after IEND, which is the polyglot shape", () => {
    const verdict = validatePngStructure(withTrailing(validPng(), "<script>alert(1)</script>"));
    expect(verdict).toEqual({ ok: false, code: "trailing_bytes" });
  });

  it("refuses a corrupted chunk by its CRC, not by its length", () => {
    const png = validPng();
    // Inside the IDAT payload: lengths still agree, only the checksum breaks.
    const verdict = validatePngStructure(flipByte(png, png.length - 20));
    expect(verdict).toEqual({ ok: false, code: "checksum_invalid" });
  });

  it("refuses a truncated file", () => {
    expect(validatePngStructure(validPng().slice(0, 30))).toEqual({ ok: false, code: "truncated" });
  });

  it("refuses a file whose first chunk is not IHDR", () => {
    const png = validPng();
    const wrongType = new Uint8Array(png);
    wrongType.set(Uint8Array.from("IDAT", (c) => c.charCodeAt(0)), 12);
    expect(validatePngStructure(wrongType).ok).toBe(false);
  });
});

describe("JPEG structure", () => {
  it("accepts a well formed file, walking the entropy coded scan", () => {
    expect(validateJpegStructure(validJpeg())).toEqual({ ok: true, contentType: "image/jpeg" });
  });

  it("refuses bytes appended after EOI", () => {
    expect(validateJpegStructure(withTrailing(validJpeg(), "PK\u0003\u0004junk"))).toEqual({
      ok: false,
      code: "trailing_bytes",
    });
  });

  it("refuses a file with no EOI", () => {
    const jpeg = validJpeg();
    expect(validateJpegStructure(jpeg.slice(0, jpeg.length - 2)).ok).toBe(false);
  });

  it("refuses a segment whose declared length runs past the file", () => {
    const jpeg = validJpeg();
    const broken = new Uint8Array(jpeg);
    broken[4] = 0x7f;
    expect(validateJpegStructure(broken)).toEqual({ ok: false, code: "truncated" });
  });
});

describe("WEBP structure", () => {
  it("accepts a well formed file", () => {
    expect(validateWebpStructure(validWebp())).toEqual({ ok: true, contentType: "image/webp" });
  });

  it("refuses appended bytes through the RIFF size disagreement", () => {
    expect(validateWebpStructure(withTrailing(validWebp(), "appended"))).toEqual({
      ok: false,
      code: "trailing_bytes",
    });
  });

  it("refuses a first chunk that is not an image chunk", () => {
    const webp = validWebp();
    const broken = new Uint8Array(webp);
    broken.set(Uint8Array.from("XMP ", (c) => c.charCodeAt(0)), 12);
    expect(broken.length).toBe(webp.length);
    expect(validateWebpStructure(broken)).toEqual({ ok: false, code: "structure_invalid" });
  });
});

describe("PDF structure", () => {
  it("accepts a document the parser can read", async () => {
    await expect(validatePdfStructure(pdfBytes(), acceptingPdfParser)).resolves.toEqual({
      ok: true,
      contentType: "application/pdf",
    });
  });

  it("refuses an encrypted document rather than accepting one nobody can open", async () => {
    const parser: PdfStructuralParser = {
      async pageCount() {
        throw new Error("Input document to `PDFDocument.load` is encrypted.");
      },
    };
    await expect(validatePdfStructure(pdfBytes(), parser)).resolves.toEqual({
      ok: false,
      code: "encrypted",
    });
  });

  it("refuses a document the parser cannot structurally read", async () => {
    const parser: PdfStructuralParser = {
      async pageCount() {
        throw new Error("Failed to parse PDF document");
      },
    };
    await expect(validatePdfStructure(pdfBytes(), parser)).resolves.toEqual({
      ok: false,
      code: "structure_invalid",
    });
  });

  it("refuses a document with no pages", async () => {
    const parser: PdfStructuralParser = { async pageCount() { return 0; } };
    await expect(validatePdfStructure(pdfBytes(), parser)).resolves.toEqual({
      ok: false,
      code: "no_pages",
    });
  });
});

describe("validateProofContainer", () => {
  it("refuses when the declared type disagrees with the real bytes", async () => {
    await expect(
      validateProofContainer({
        bytes: validPng(),
        declaredContentType: "application/pdf",
        pdfParser: acceptingPdfParser,
      }),
    ).resolves.toEqual({ ok: false, code: "declared_type_mismatch" });
  });

  it("does not choose the validator from the declaration", async () => {
    // PDF bytes declared as PNG must be caught as a mismatch, which is only
    // possible because the container is sniffed first.
    await expect(
      validateProofContainer({
        bytes: pdfBytes(),
        declaredContentType: "image/png",
        pdfParser: acceptingPdfParser,
      }),
    ).resolves.toEqual({ ok: false, code: "declared_type_mismatch" });
  });

  it("refuses an empty upload", async () => {
    await expect(
      validateProofContainer({
        bytes: new Uint8Array(0),
        declaredContentType: "image/png",
        pdfParser: acceptingPdfParser,
      }),
    ).resolves.toEqual({ ok: false, code: "empty" });
  });
});
