/**
 * REAL CONTAINER BYTES FOR THE PROOF TESTS.
 *
 * These build genuinely well formed PNG, JPEG and WEBP files rather than
 * stubbing the validators. A test that feeds a validator a hand-waved buffer
 * proves nothing about a validator whose entire job is structural, so the
 * fixtures compute real chunk lengths and real CRCs, and the mutation helpers
 * then break exactly one thing at a time.
 */

const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function be32(value: number): Uint8Array {
  return Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function le32(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function asciiBytes(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0) & 0xff);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeAndData = concat([asciiBytes(type), data]);
  return concat([be32(data.length), typeAndData, be32(crc32(typeAndData))]);
}

/** A structurally complete one pixel PNG with correct CRCs. */
export function validPng(payloadBytes = 16): Uint8Array {
  const ihdr = concat([
    be32(1), // width
    be32(1), // height
    Uint8Array.of(8, 6, 0, 0, 0), // bit depth, colour type, compression, filter, interlace
  ]);
  return concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", new Uint8Array(payloadBytes).fill(0x42)),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

/** A minimal but structurally walkable JPEG: SOI, APP0, SOF0, SOS, scan, EOI. */
export function validJpeg(scanBytes = 24): Uint8Array {
  const app0Payload = concat([asciiBytes("JFIF\0"), Uint8Array.of(1, 1, 0, 0, 1, 0, 1, 0, 0)]);
  const app0 = concat([
    Uint8Array.of(0xff, 0xe0),
    Uint8Array.of(((app0Payload.length + 2) >> 8) & 0xff, (app0Payload.length + 2) & 0xff),
    app0Payload,
  ]);
  const sofPayload = Uint8Array.of(8, 0, 1, 0, 1, 1, 1, 0x11, 0);
  const sof0 = concat([
    Uint8Array.of(0xff, 0xc0),
    Uint8Array.of(((sofPayload.length + 2) >> 8) & 0xff, (sofPayload.length + 2) & 0xff),
    sofPayload,
  ]);
  const sosPayload = Uint8Array.of(1, 1, 0, 0, 63, 0);
  const sos = concat([
    Uint8Array.of(0xff, 0xda),
    Uint8Array.of(((sosPayload.length + 2) >> 8) & 0xff, (sosPayload.length + 2) & 0xff),
    sosPayload,
  ]);
  // Entropy data with one stuffed 0xFF00 so the scan walker is genuinely
  // exercised rather than stepping over plain bytes.
  const scan = concat([new Uint8Array(scanBytes).fill(0x7d), Uint8Array.of(0xff, 0x00, 0x3c)]);
  return concat([Uint8Array.of(0xff, 0xd8), app0, sof0, sos, scan, Uint8Array.of(0xff, 0xd9)]);
}

/** A structurally complete simple-lossy WEBP envelope. */
export function validWebp(payloadBytes = 20): Uint8Array {
  const payload = new Uint8Array(payloadBytes).fill(0x11);
  const padded = payload.length % 2 === 1 ? concat([payload, Uint8Array.of(0)]) : payload;
  const chunk = concat([asciiBytes("VP8 "), le32(payload.length), padded]);
  const body = concat([asciiBytes("WEBP"), chunk]);
  return concat([asciiBytes("RIFF"), le32(body.length), body]);
}

/** Bytes that begin with the PDF signature. Structure comes from the parser. */
export function pdfBytes(body = "1 0 obj\n<<>>\nendobj\n%%EOF\n"): Uint8Array {
  return concat([asciiBytes("%PDF-1.7\n"), asciiBytes(body)]);
}

/** Append a payload after the container's terminator. The polyglot shape. */
export function withTrailing(bytes: Uint8Array, trailing: string): Uint8Array {
  return concat([bytes, asciiBytes(trailing)]);
}

/** Flip one byte, to break a checksum without changing any length. */
export function flipByte(bytes: Uint8Array, offset: number): Uint8Array {
  const copy = new Uint8Array(bytes);
  copy[offset] = copy[offset] ^ 0xff;
  return copy;
}
