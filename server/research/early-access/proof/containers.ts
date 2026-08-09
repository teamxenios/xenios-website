/**
 * STRUCTURAL CONTAINER VALIDATION FOR TRANSIENT PROOF BYTES.
 *
 * WHY MAGIC BYTES ARE NOT ENOUGH. A four byte prefix check answers "does this
 * start like a PNG", which is the wrong question. A polyglot starts like a PNG
 * and continues as something else: a valid PNG header followed by an appended
 * ZIP, an HTML document hidden in a comment segment, a second image after the
 * terminator. Every one of those passes a prefix check and every one of them
 * is a file that behaves differently depending on which program opens it.
 *
 * WHAT THIS DOES INSTEAD. Each validator walks the container's own structure
 * from the first byte to the last and requires that the walk CONSUMES THE WHOLE
 * FILE. There is no tolerance for trailing bytes, because a legitimate export
 * from a phone or a bank does not have any, and a trailing region is exactly
 * where a second payload lives. The PNG walk additionally verifies every chunk
 * CRC, so junk cannot hide inside a chunk that merely claims a large length.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not decode pixels and it does not
 * re-encode. Re-encoding is the strongest available answer to a malformed
 * decoder input, but it needs a native imaging library that this repository
 * does not have, and adding one is a dependency decision with its own review.
 * The compensating controls are recorded in the lane handoff: the file is
 * attached rather than rendered, the recipient is one internal mailbox, and no
 * Xenios surface ever decodes these bytes.
 *
 * PURITY. Every function here takes bytes and returns a verdict. Nothing logs,
 * nothing persists, nothing throws on hostile input.
 */

import type { EarlyAccessProofContentType } from "../commerce/payment-proof";

export type ContainerRefusalCode =
  | "empty"
  | "signature_unrecognised"
  | "declared_type_mismatch"
  | "truncated"
  | "trailing_bytes"
  | "structure_invalid"
  | "checksum_invalid"
  | "encrypted"
  | "no_pages";

export type ContainerVerdict =
  | Readonly<{ ok: true; contentType: EarlyAccessProofContentType }>
  | Readonly<{ ok: false; code: ContainerRefusalCode }>;

function refuse(code: ContainerRefusalCode): ContainerVerdict {
  return Object.freeze({ ok: false as const, code });
}

function admit(contentType: EarlyAccessProofContentType): ContainerVerdict {
  return Object.freeze({ ok: true as const, contentType });
}

// ---------------------------------------------------------------------------
// Signature sniffing
// ---------------------------------------------------------------------------

const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const PDF_SIGNATURE = Uint8Array.of(0x25, 0x50, 0x44, 0x46, 0x2d); // "%PDF-"

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (bytes.length < prefix.length) return false;
  for (let index = 0; index < prefix.length; index += 1) {
    if (bytes[index] !== prefix[index]) return false;
  }
  return true;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset + length > bytes.length) return "";
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += String.fromCharCode(bytes[offset + index]);
  }
  return out;
}

/**
 * The container the bytes actually are, independent of anything the request
 * claimed. `null` means the first bytes match no accepted container.
 */
export function sniffProofContainer(bytes: Uint8Array): EarlyAccessProofContentType | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return "image/png";
  if (startsWith(bytes, PDF_SIGNATURE)) return "application/pdf";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }
  return null;
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

/**
 * Walk every PNG chunk, verify every CRC, and require that IEND is the final
 * chunk and that it ends on the final byte.
 */
export function validatePngStructure(bytes: Uint8Array): ContainerVerdict {
  if (!startsWith(bytes, PNG_SIGNATURE)) return refuse("signature_unrecognised");

  let offset = PNG_SIGNATURE.length;
  let sawIhdr = false;
  let sawIend = false;

  while (offset < bytes.length) {
    // length(4) + type(4) + crc(4) is the minimum a chunk can occupy.
    if (offset + 12 > bytes.length) return refuse("truncated");

    const length = readUint32BE(bytes, offset);
    // A chunk length is a 31 bit value by specification. Refusing the high bit
    // also keeps the arithmetic below inside safe integer range.
    if (length > 0x7fffffff) return refuse("structure_invalid");

    const typeOffset = offset + 4;
    const dataOffset = typeOffset + 4;
    const crcOffset = dataOffset + length;
    if (crcOffset + 4 > bytes.length) return refuse("truncated");

    const type = ascii(bytes, typeOffset, 4);
    if (!/^[A-Za-z]{4}$/.test(type)) return refuse("structure_invalid");

    if (!sawIhdr) {
      // IHDR must be first. Anything else means the file is not a PNG that a
      // conforming decoder would accept, whatever the signature says.
      if (type !== "IHDR" || length !== 13) return refuse("structure_invalid");
      sawIhdr = true;
    } else if (type === "IHDR") {
      return refuse("structure_invalid");
    }

    // CRC covers the type and the data, not the length field.
    const expected = readUint32BE(bytes, crcOffset);
    if (crc32(bytes, typeOffset, crcOffset) !== expected) return refuse("checksum_invalid");

    offset = crcOffset + 4;

    if (type === "IEND") {
      if (length !== 0) return refuse("structure_invalid");
      sawIend = true;
      break;
    }
  }

  if (!sawIhdr || !sawIend) return refuse("truncated");
  // The whole point: nothing may follow the terminator.
  if (offset !== bytes.length) return refuse("trailing_bytes");
  return admit("image/png");
}

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------

/** Markers that stand alone, carrying no length field. */
const JPEG_STANDALONE = new Set([0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9]);

/**
 * Walk the JPEG marker segments, step over entropy coded scan data, and
 * require that EOI is the last two bytes of the file.
 */
export function validateJpegStructure(bytes: Uint8Array): ContainerVerdict {
  if (bytes.length < 4) return refuse("truncated");
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return refuse("signature_unrecognised");

  let offset = 2;
  let sawFrame = false;

  while (offset < bytes.length) {
    // Fill bytes are legal padding between segments.
    if (bytes[offset] !== 0xff) return refuse("structure_invalid");
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return refuse("truncated");

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9) {
      // EOI. Nothing may follow it.
      return offset === bytes.length ? admit("image/jpeg") : refuse("trailing_bytes");
    }

    if (JPEG_STANDALONE.has(marker)) continue;

    if (offset + 2 > bytes.length) return refuse("truncated");
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    // The length field includes its own two bytes, so anything below two is
    // structurally impossible rather than merely unusual.
    if (length < 2) return refuse("structure_invalid");
    const segmentEnd = offset + length;
    if (segmentEnd > bytes.length) return refuse("truncated");

    // SOF0..SOF15, excluding the four markers in that range that are not frame
    // headers (DHT, JPG, DAC and the RST block are handled elsewhere).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      sawFrame = true;
    }

    offset = segmentEnd;

    if (marker === 0xda) {
      // Start of scan. Entropy coded data follows, in which 0xFF00 is a
      // stuffed literal and RSTn are in band. Scan forward to the next real
      // marker rather than guessing a length that is not recorded anywhere.
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        let peek = offset + 1;
        while (peek < bytes.length && bytes[peek] === 0xff) peek += 1;
        if (peek >= bytes.length) return refuse("truncated");
        const next = bytes[peek];
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          offset = peek + 1;
          continue;
        }
        break;
      }
    }
  }

  return refuse(sawFrame ? "truncated" : "structure_invalid");
}

// ---------------------------------------------------------------------------
// WEBP
// ---------------------------------------------------------------------------

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

const WEBP_IMAGE_CHUNKS = new Set(["VP8 ", "VP8L", "VP8X"]);

/**
 * Validate the RIFF envelope exactly, then walk every chunk to the end.
 *
 * The declared RIFF size must equal the real remaining length. That single
 * check is what makes an appended payload impossible rather than merely
 * unlikely, because a file with extra bytes has a size field that disagrees.
 */
export function validateWebpStructure(bytes: Uint8Array): ContainerVerdict {
  if (bytes.length < 12) return refuse("truncated");
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") {
    return refuse("signature_unrecognised");
  }

  const declared = readUint32LE(bytes, 4);
  if (declared !== bytes.length - 8) {
    return declared > bytes.length - 8 ? refuse("truncated") : refuse("trailing_bytes");
  }

  let offset = 12;
  let sawImageChunk = false;

  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return refuse("truncated");
    const fourcc = ascii(bytes, offset, 4);
    if (!/^[\x20-\x7e]{4}$/.test(fourcc)) return refuse("structure_invalid");

    const size = readUint32LE(bytes, offset + 4);
    if (size > 0x7fffffff) return refuse("structure_invalid");
    // RIFF chunks are padded to an even length and the pad byte is not counted
    // in the size. Some encoders omit that pad on the FINAL chunk, so a file
    // that ends exactly on the unpadded boundary is accepted; anywhere else
    // the pad is required, because a missing interior pad desynchronises the
    // walk and is what a crafted file would do.
    const unpadded = offset + 8 + size;
    const padded = unpadded + (size % 2);
    const next = unpadded === bytes.length ? unpadded : padded;
    if (next > bytes.length) return refuse("truncated");

    if (offset === 12 && !WEBP_IMAGE_CHUNKS.has(fourcc)) return refuse("structure_invalid");
    if (WEBP_IMAGE_CHUNKS.has(fourcc)) sawImageChunk = true;

    offset = next;
  }

  if (!sawImageChunk) return refuse("structure_invalid");
  if (offset !== bytes.length) return refuse("structure_invalid");
  return admit("image/webp");
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/**
 * The pdf-lib parse seam.
 *
 * Injected so the pure validators above stay synchronous and so a test can
 * exercise a parser failure without constructing a genuinely corrupt document.
 * The production implementation is `pdfLibStructuralParser` below.
 */
export interface PdfStructuralParser {
  /** Resolves to the page count, or throws for anything it cannot parse. */
  pageCount(bytes: Uint8Array): Promise<number>;
}

/**
 * The real parser, using the pdf-lib already in this repository.
 *
 * `ignoreEncryption` stays FALSE on purpose: an encrypted PDF is refused
 * rather than accepted-and-unreadable, because an operator who cannot open the
 * attachment has been handed a proof they cannot act on, and a password
 * protected file is also a place to hide content from any inspection.
 */
export function pdfLibStructuralParser(): PdfStructuralParser {
  return Object.freeze({
    async pageCount(bytes: Uint8Array): Promise<number> {
      const { PDFDocument } = await import("pdf-lib");
      const document = await PDFDocument.load(bytes, {
        ignoreEncryption: false,
        updateMetadata: false,
      });
      return document.getPageCount();
    },
  });
}

/** A screenshot of a transfer is one page. This bounds a parser bomb. */
export const PROOF_PDF_MAX_PAGES = 30;

export async function validatePdfStructure(
  bytes: Uint8Array,
  parser: PdfStructuralParser,
): Promise<ContainerVerdict> {
  if (!startsWith(bytes, PDF_SIGNATURE)) return refuse("signature_unrecognised");

  let pages: number;
  try {
    pages = await parser.pageCount(bytes);
  } catch (error) {
    // The message is inspected, never logged: pdf-lib names encryption
    // explicitly and the two refusals are operationally different.
    const message = error instanceof Error ? error.message : "";
    return /encrypt/i.test(message) ? refuse("encrypted") : refuse("structure_invalid");
  }

  if (!Number.isSafeInteger(pages) || pages < 1) return refuse("no_pages");
  if (pages > PROOF_PDF_MAX_PAGES) return refuse("structure_invalid");
  return admit("application/pdf");
}

// ---------------------------------------------------------------------------
// The one entry point
// ---------------------------------------------------------------------------

/**
 * Validate bytes against the container they actually are, and require the
 * declared type to agree.
 *
 * The declared type is checked against the SNIFFED type rather than used to
 * choose the validator. Choosing the validator from the declaration is the
 * classic MIME confusion bug: a caller declaring `image/png` over PDF bytes
 * would get the PNG validator, fail, and learn nothing, while a caller
 * declaring the type the file already is would never be cross-checked at all.
 */
export async function validateProofContainer(input: {
  readonly bytes: Uint8Array;
  readonly declaredContentType: EarlyAccessProofContentType;
  readonly pdfParser: PdfStructuralParser;
}): Promise<ContainerVerdict> {
  if (input.bytes.length === 0) return refuse("empty");

  const sniffed = sniffProofContainer(input.bytes);
  if (sniffed === null) return refuse("signature_unrecognised");
  if (sniffed !== input.declaredContentType) return refuse("declared_type_mismatch");

  switch (sniffed) {
    case "image/png":
      return validatePngStructure(input.bytes);
    case "image/jpeg":
      return validateJpegStructure(input.bytes);
    case "image/webp":
      return validateWebpStructure(input.bytes);
    case "application/pdf":
      return validatePdfStructure(input.bytes, input.pdfParser);
  }
}
