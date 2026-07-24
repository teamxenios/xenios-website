import { Buffer } from "node:buffer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PDFFont, PDFPage } from "pdf-lib";
import type {
  CompletionCertificatePdfInput,
  PdfGenerator,
  SignedAgreementPdfInput,
} from "./contracts";

// ---------------------------------------------------------------------------
// xenios research native e-signature: signed-agreement PDF + completion
// certificate generator, built on pdf-lib (MIT).
//
// This module is PURE over its inputs. It reads no environment, touches no
// filesystem, opens no network, imports no config, and logs nothing. The only
// values that reach a generated document are the fields on the two input
// interfaces, so a secret, key, token, url, or connection string can never
// appear in a rendered PDF unless a caller literally passes one as agreement
// text (the callers never do). The generator introduces none of its own.
//
// Text safety: every string that is drawn is routed through sanitizeForPdf,
// which folds smart quotes, dashes, and other non-encodable characters down to
// the WinAnsi range the standard fonts support. pdf-lib throws on an
// unencodable glyph, so this sanitizer is what keeps a real member name or a
// pasted agreement body from crashing generation.
//
// Determinism: no wall-clock value is stamped. Only input.signedAt is rendered.
// (pdf-lib records a CreationDate on save; that is acceptable and does not
// affect the page structure a caller depends on.)
// ---------------------------------------------------------------------------

// US Letter, in points.
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54; // 0.75 inch on every edge.
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LINE_RATIO = 1.32;

// Type scale.
const SIZE_TITLE = 18;
const SIZE_WORDMARK = 11;
const SIZE_HEADING = 13;
const SIZE_BODY = 10.5;
const SIZE_META = 9;

const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.36, 0.36, 0.4);
const RULE = rgb(0.74, 0.74, 0.78);

// --- text sanitization -----------------------------------------------------
// Fold common non-WinAnsi characters to safe ASCII, then replace anything left
// outside printable ASCII with "?". This guarantees pdf-lib never sees a glyph
// its standard-font WinAnsi encoding cannot represent. Order matters: multi
// character replacements (em dash to "--") run before the single-char filter.
//
// Patterns use unicode escapes so this source file stays pure ascii: no literal
// smart quote or dash appears anywhere in xenios source.
const CHAR_FOLDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/[\u2018\u2019\u201A\u2032\u02BC\u2035]/g, "'"], // single quotes, prime
  [/[\u201C\u201D\u201E\u2033\u2036]/g, '"'], // double quotes, double prime
  [/[\u2014\u2015]/g, "--"], // em dash, horizontal bar
  [/[\u2013\u2010\u2011\u2212]/g, "-"], // en dash, hyphen variants, minus
  [/\u2026/g, "..."], // ellipsis
  [/[\u2022\u00B7\u25CF\u25AA]/g, "*"], // bullets
  [/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " "], // unicode spaces
  [/\t/g, "    "], // tab to spaces
  [/[\u00AD\u200B\u200C\u200D\uFEFF]/g, ""], // soft hyphen, zero-width, bom
];

/**
 * Render any string down to characters the standard-font WinAnsi encoding can
 * draw. Non-encodable input is folded to an ASCII equivalent or "?", never left
 * to throw inside pdf-lib. Idempotent: sanitizing sanitized text is a no-op.
 */
export function sanitizeForPdf(input: string): string {
  let s = typeof input === "string" ? input : String(input ?? "");
  for (const [pattern, replacement] of CHAR_FOLDS) {
    s = s.replace(pattern, replacement);
  }
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 10 || cp === 13) {
      // A stray newline inside a single drawn line collapses to a space; real
      // paragraph breaks are handled by the caller splitting on newlines first.
      out += " ";
    } else if (cp >= 32 && cp <= 126) {
      out += ch;
    } else {
      out += "?";
    }
  }
  return out;
}

// --- word wrap + long-token breaking ---------------------------------------

/** Break a single token wider than maxWidth into pieces that each fit. */
function breakLongToken(word: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) {
    return [word];
  }
  const pieces: string[] = [];
  let current = "";
  for (const ch of word) {
    const candidate = current + ch;
    if (current.length > 0 && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      pieces.push(current);
      current = ch;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) {
    pieces.push(current);
  }
  return pieces.length > 0 ? pieces : [word];
}

/**
 * Wrap text to maxWidth, preserving explicit newlines as paragraph breaks.
 * Returns the sanitized, wrapped lines.
 */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = String(text ?? "").split(/\r?\n/);
  for (const paragraph of paragraphs) {
    const clean = sanitizeForPdf(paragraph);
    const words = clean.split(" ").filter((w) => w.length > 0);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        const candidate = line.length === 0 ? word : `${line} ${word}`;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          line = candidate;
        } else {
          if (line.length > 0) {
            lines.push(line);
          }
          line = word;
        }
      } else {
        // Unbreakable token wider than the column: flush, then hard-break it.
        if (line.length > 0) {
          lines.push(line);
          line = "";
        }
        const pieces = breakLongToken(word, font, size, maxWidth);
        for (let i = 0; i < pieces.length - 1; i += 1) {
          lines.push(pieces[i] as string);
        }
        line = pieces[pieces.length - 1] as string;
      }
    }
    lines.push(line);
  }
  return lines;
}

// --- a small paginating cursor ---------------------------------------------

interface TextOptions {
  font: PDFFont;
  size?: number;
  color?: ReturnType<typeof rgb>;
  indent?: number;
}

/**
 * A cursor over a growing multi-page document. It owns the current page and the
 * vertical position, adds a new page when the bottom margin is reached, and
 * sanitizes every string at the drawing boundary so no path can bypass it.
 */
class PageCursor {
  readonly doc: PDFDocument;
  page: PDFPage;
  y: number;

  constructor(doc: PDFDocument) {
    this.doc = doc;
    this.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  newPage(): void {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  private ensure(height: number): void {
    if (this.y - height < MARGIN) {
      this.newPage();
    }
  }

  /** Draw one already-wrapped line and advance the cursor. */
  line(text: string, opts: TextOptions): void {
    const size = opts.size ?? SIZE_BODY;
    const lineHeight = size * LINE_RATIO;
    this.ensure(lineHeight);
    this.page.drawText(sanitizeForPdf(text), {
      x: MARGIN + (opts.indent ?? 0),
      y: this.y - size,
      size,
      font: opts.font,
      color: opts.color ?? INK,
    });
    this.y -= lineHeight;
  }

  /** Wrap text to the content column and draw it, paginating as needed. */
  paragraph(text: string, opts: TextOptions): void {
    const size = opts.size ?? SIZE_BODY;
    const indent = opts.indent ?? 0;
    const maxWidth = CONTENT_WIDTH - indent;
    for (const wrapped of wrapText(text, opts.font, size, maxWidth)) {
      this.line(wrapped, opts);
    }
  }

  gap(height: number): void {
    this.y -= height;
  }

  rule(): void {
    this.ensure(SIZE_BODY);
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - 2,
      width: CONTENT_WIDTH,
      height: 0.75,
      color: RULE,
    });
    this.y -= SIZE_BODY;
  }

  /** Reserve vertical space for a block, moving to a fresh page if needed. */
  reserve(height: number): void {
    if (this.y - height < MARGIN) {
      this.newPage();
    }
  }
}

// --- base64 / png helpers --------------------------------------------------

/** Strip an optional data-uri prefix and decode base64 to bytes. */
function decodeBase64Png(base64: string): Buffer {
  const stripped = base64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "").trim();
  return Buffer.from(stripped, "base64");
}

// --- the generator ---------------------------------------------------------

export class XeniosPdfGenerator implements PdfGenerator {
  async generateSignedAgreementPdf(input: SignedAgreementPdfInput): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.setProducer("xenios research esign");
    doc.setCreator("xenios research esign");
    doc.setTitle(sanitizeForPdf(input.agreementTitle));

    const helv = await doc.embedFont(StandardFonts.Helvetica);
    const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const helvOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

    const cursor = new PageCursor(doc);

    // Header: wordmark, title, metadata block.
    cursor.line("xenios research", { font: helvBold, size: SIZE_WORDMARK, color: MUTED });
    cursor.gap(4);
    cursor.paragraph(input.agreementTitle, { font: helvBold, size: SIZE_TITLE });
    cursor.gap(6);
    cursor.rule();
    cursor.gap(2);

    cursor.paragraph(`semantic version: ${input.semver}`, {
      font: helv,
      size: SIZE_META,
      color: MUTED,
    });
    cursor.paragraph(`xenios document version id: ${input.documentVersionId}`, {
      font: helv,
      size: SIZE_META,
      color: MUTED,
    });
    cursor.paragraph(`source content hash: ${input.sourceContentHash}`, {
      font: helv,
      size: SIZE_META,
      color: MUTED,
    });
    cursor.paragraph(`signing request id: ${input.signingRequestId}`, {
      font: helv,
      size: SIZE_META,
      color: MUTED,
    });
    cursor.gap(8);
    cursor.rule();
    cursor.gap(10);

    // Body: the exact published agreement content, wrapped and paginated.
    cursor.line("Agreement", { font: helvBold, size: SIZE_HEADING });
    cursor.gap(4);
    cursor.paragraph(input.agreementContent, { font: helv, size: SIZE_BODY });

    // Signature block, kept together on its own page if it does not fit.
    cursor.gap(18);
    cursor.reserve(170);
    cursor.rule();
    cursor.gap(4);
    cursor.line("Signature", { font: helvBold, size: SIZE_HEADING });
    cursor.gap(6);
    cursor.paragraph(`Signed by (typed legal name): ${input.typedLegalName}`, {
      font: helv,
      size: SIZE_BODY,
    });
    cursor.paragraph(`Signed at: ${input.signedAt}`, { font: helv, size: SIZE_BODY });
    cursor.paragraph(`Signature method: ${input.signatureMethod}`, { font: helv, size: SIZE_BODY });
    cursor.gap(8);

    await this.renderSignatureMark(doc, cursor, helvOblique, helv, input);

    if (input.separateAcknowledgment) {
      cursor.gap(6);
      cursor.paragraph("Separate acknowledgment recorded for this document.", {
        font: helv,
        size: SIZE_BODY,
      });
    }

    // Integrity footer on the last page. This is the SOURCE content hash, a
    // deterministic value of what was signed, not a hash of this PDF.
    cursor.gap(16);
    cursor.rule();
    cursor.gap(2);
    cursor.paragraph(
      `Integrity hash (SHA-256 of this document's source content): ${input.sourceContentHash}`,
      { font: helv, size: SIZE_META, color: MUTED },
    );

    return Buffer.from(await doc.save());
  }

  /**
   * Render the signature representation. A drawn signature embeds the submitted
   * PNG; if that PNG cannot be decoded, or for a typed signature, the typed
   * legal name is rendered in an oblique face as the signature mark.
   */
  private async renderSignatureMark(
    doc: PDFDocument,
    cursor: PageCursor,
    obliqueFont: PDFFont,
    bodyFont: PDFFont,
    input: SignedAgreementPdfInput,
  ): Promise<void> {
    if (input.signatureMethod === "drawn" && input.drawnPngBase64) {
      try {
        const bytes = decodeBase64Png(input.drawnPngBase64);
        const image = await doc.embedPng(bytes);
        const boxW = 200;
        const boxH = 80;
        const scale = Math.min(boxW / image.width, boxH / image.height, 1);
        const drawW = image.width * scale;
        const drawH = image.height * scale;
        cursor.reserve(drawH + 8);
        cursor.page.drawImage(image, {
          x: MARGIN,
          y: cursor.y - drawH,
          width: drawW,
          height: drawH,
        });
        cursor.y -= drawH + 8;
        cursor.paragraph("(drawn signature)", { font: bodyFont, size: SIZE_META, color: MUTED });
        return;
      } catch {
        // PNG failed to decode: fall through to the typed representation below.
        cursor.line(sanitizeForPdf(input.typedLegalName), { font: obliqueFont, size: 16 });
        cursor.paragraph("typed signature", { font: bodyFont, size: SIZE_META, color: MUTED });
        return;
      }
    }
    // Typed signature (or drawn with no image): render the typed legal name.
    cursor.line(sanitizeForPdf(input.typedLegalName), { font: obliqueFont, size: 16 });
    cursor.paragraph("typed signature", { font: bodyFont, size: SIZE_META, color: MUTED });
  }

  async generateCompletionCertificatePdf(input: CompletionCertificatePdfInput): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.setProducer("xenios research esign");
    doc.setCreator("xenios research esign");
    doc.setTitle("Xenios Research - Certificate of Completion");

    const helv = await doc.embedFont(StandardFonts.Helvetica);
    const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const cursor = new PageCursor(doc);

    cursor.line("xenios research", { font: helvBold, size: SIZE_WORDMARK, color: MUTED });
    cursor.gap(4);
    cursor.paragraph("Xenios Research - Certificate of Completion", {
      font: helvBold,
      size: SIZE_TITLE,
    });
    cursor.gap(6);
    cursor.rule();
    cursor.gap(8);

    const field = (label: string, value: string): void => {
      cursor.paragraph(`${label}: ${value}`, { font: helv, size: SIZE_BODY });
    };

    field("Member identifier", input.memberId);
    field("Signer email", input.signerEmail);
    field("Signing request id", input.signingRequestId);
    field("Signed at", input.signedAt);
    field("Signature method", input.signatureMethod);
    field("Hashed IP", input.ipHash ?? "not recorded");
    field("Hashed user agent", input.userAgentHash ?? "not recorded");

    cursor.gap(10);
    cursor.line("Documents", { font: helvBold, size: SIZE_HEADING });
    cursor.gap(4);
    if (input.documents.length === 0) {
      cursor.paragraph("No documents recorded.", { font: helv, size: SIZE_BODY, color: MUTED });
    }
    let index = 1;
    for (const document of input.documents) {
      cursor.paragraph(`${index}. ${document.title}`, { font: helvBold, size: SIZE_BODY });
      cursor.paragraph(`version id: ${document.documentVersionId}`, {
        font: helv,
        size: SIZE_META,
        color: MUTED,
        indent: 14,
      });
      cursor.paragraph(`content hash: ${document.contentHash}`, {
        font: helv,
        size: SIZE_META,
        color: MUTED,
        indent: 14,
      });
      cursor.gap(3);
      index += 1;
    }

    cursor.gap(10);
    cursor.line("Signed document integrity", { font: helvBold, size: SIZE_HEADING });
    cursor.gap(4);
    cursor.paragraph(`Signed PDF SHA-256: ${input.signedPdfSha256}`, {
      font: helv,
      size: SIZE_BODY,
    });

    cursor.gap(12);
    cursor.rule();
    cursor.gap(2);
    cursor.paragraph(
      "IP address and user agent are stored as SHA-256 hashes only, never as raw values.",
      { font: helv, size: SIZE_META, color: MUTED },
    );

    return Buffer.from(await doc.save());
  }
}
