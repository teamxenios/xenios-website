import { Buffer } from "node:buffer";

// ---------------------------------------------------------------------------
// xenios research e-signature: a pure, dependency-free ZIP archive writer.
//
// The repository has no zip library and must not add one, so the completed
// document packet is assembled here with node built-ins only. Every entry is
// stored with compression method 0 (STORE, no compression): the simplest form
// that is still fully spec compliant, which keeps this writer small and easy to
// audit for a package that will hold signed legal agreements.
//
// The output is DETERMINISTIC. There is no clock anywhere: the DOS date and
// time fields are fixed constants, so the same input entries always produce a
// byte-identical archive. That matters for a legal record, where a hash of the
// packet should depend only on its contents, never on when it was built.
//
// Structure written, per the ZIP APPNOTE:
//   [ local file header + name + raw bytes ] for each entry, in order
//   [ central directory file header + name ] for each entry, in order
//   [ end of central directory record ]
// ---------------------------------------------------------------------------

/** One file inside the archive: a safe relative name plus its raw bytes. */
export interface ZipEntry {
  name: string;
  bytes: Buffer;
}

// ZIP record signatures (little-endian on disk).
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

// Version 2.0 is the floor that supports the STORE method and folders.
const ZIP_VERSION = 20;
// STORE: stored, no compression.
const METHOD_STORE = 0;
// Fixed DOS time and date. A real timestamp would make the output depend on the
// clock and break determinism; 0 is accepted by every extractor we target.
const FIXED_DOS_TIME = 0;
const FIXED_DOS_DATE = 0;

const LOCAL_HEADER_FIXED_SIZE = 30;
const CENTRAL_HEADER_FIXED_SIZE = 46;
const END_OF_CENTRAL_DIRECTORY_SIZE = 22;

// ---------------------------------------------------------------------------
// Entry-name safety
// ---------------------------------------------------------------------------

// Reject any entry name that could escape the archive root on extraction: path
// traversal (".." segments), absolute paths (a leading "/"), Windows separators
// or drive-style backslashes, empty segments (a leading, trailing, or doubled
// "/"), and a "." or all-dots segment. Forward-slash directory separators for
// nested folders are allowed, which is how the packet groups its documents.
export function isSafeZipEntryName(name: string): boolean {
  if (typeof name !== "string" || name.length === 0 || name.length > 512) return false;
  if (name.includes("\\")) return false;
  if (name.includes("\0")) return false;
  if (name.startsWith("/")) return false;
  const segments = name.split("/");
  for (const segment of segments) {
    if (segment.length === 0) return false; // leading, trailing, or doubled slash
    if (/^\.+$/.test(segment)) return false; // ".", "..", "...": never a real name
  }
  return true;
}

// ---------------------------------------------------------------------------
// CRC-32 (IEEE 802.3, polynomial 0xEDB88320), the checksum the ZIP format uses
// ---------------------------------------------------------------------------

const CRC32_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 of a byte buffer, returned as an unsigned 32-bit integer. */
export function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// The archive writer
// ---------------------------------------------------------------------------

/**
 * Build a valid .zip archive from the given entries using the STORE method.
 * Throws on an unsafe entry name so a traversal or absolute path can never be
 * written into the package. The result is deterministic: identical input always
 * yields a byte-identical Buffer.
 */
export function buildZip(entries: readonly ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    if (!isSafeZipEntryName(entry.name)) {
      // Never echo the offending name back; a hostile name should not travel.
      throw new Error("A zip entry name is not safe for an archive.");
    }
    const nameBytes = Buffer.from(entry.name, "utf8");
    const data = entry.bytes;
    const size = data.length;
    const checksum = crc32(data);

    const local = Buffer.alloc(LOCAL_HEADER_FIXED_SIZE);
    local.writeUInt32LE(LOCAL_FILE_HEADER_SIGNATURE, 0);
    local.writeUInt16LE(ZIP_VERSION, 4); // version needed to extract
    local.writeUInt16LE(0, 6); // general purpose bit flag
    local.writeUInt16LE(METHOD_STORE, 8); // compression method
    local.writeUInt16LE(FIXED_DOS_TIME, 10);
    local.writeUInt16LE(FIXED_DOS_DATE, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(size, 18); // compressed size == uncompressed (STORE)
    local.writeUInt32LE(size, 22); // uncompressed size
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    localParts.push(local, nameBytes, data);

    const central = Buffer.alloc(CENTRAL_HEADER_FIXED_SIZE);
    central.writeUInt32LE(CENTRAL_DIRECTORY_SIGNATURE, 0);
    central.writeUInt16LE(ZIP_VERSION, 4); // version made by
    central.writeUInt16LE(ZIP_VERSION, 6); // version needed to extract
    central.writeUInt16LE(0, 8); // general purpose bit flag
    central.writeUInt16LE(METHOD_STORE, 10); // compression method
    central.writeUInt16LE(FIXED_DOS_TIME, 12);
    central.writeUInt16LE(FIXED_DOS_DATE, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(size, 20); // compressed size
    central.writeUInt32LE(size, 24); // uncompressed size
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30); // extra field length
    central.writeUInt16LE(0, 32); // file comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal file attributes
    central.writeUInt32LE(0, 38); // external file attributes
    central.writeUInt32LE(localOffset, 42); // offset of local header
    centralParts.push(central, nameBytes);

    localOffset += local.length + nameBytes.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const centralDirectorySize = centralDirectory.length;
  const centralDirectoryOffset = localOffset;

  const end = Buffer.alloc(END_OF_CENTRAL_DIRECTORY_SIZE);
  end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  end.writeUInt16LE(0, 4); // number of this disk
  end.writeUInt16LE(0, 6); // disk where the central directory starts
  end.writeUInt16LE(entries.length, 8); // central directory records on this disk
  end.writeUInt16LE(entries.length, 10); // total central directory records
  end.writeUInt32LE(centralDirectorySize, 12);
  end.writeUInt32LE(centralDirectoryOffset, 16);
  end.writeUInt16LE(0, 20); // archive comment length

  return Buffer.concat([...localParts, centralDirectory, end]);
}
