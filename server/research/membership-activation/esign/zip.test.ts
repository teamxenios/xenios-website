import { describe, expect, it } from "vitest";
import { buildZip, crc32, isSafeZipEntryName, type ZipEntry } from "./zip";

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const END_OF_CENTRAL_DIRECTORY_SIZE = 22;

function entry(name: string, text: string): ZipEntry {
  return { name, bytes: Buffer.from(text, "utf8") };
}

// The archive comment length is always 0 here, so the end-of-central-directory
// record is exactly the last 22 bytes. This is the reader the tests use to
// inspect the structure the writer produced.
function readEocd(zip: Buffer) {
  const start = zip.length - END_OF_CENTRAL_DIRECTORY_SIZE;
  return {
    signature: zip.readUInt32LE(start),
    recordsOnDisk: zip.readUInt16LE(start + 8),
    totalRecords: zip.readUInt16LE(start + 10),
    centralDirectorySize: zip.readUInt32LE(start + 12),
    centralDirectoryOffset: zip.readUInt32LE(start + 16),
    commentLength: zip.readUInt16LE(start + 20),
  };
}

describe("crc32", () => {
  it("matches the canonical vector for 123456789", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("is 0 for an empty buffer", () => {
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });

  it("returns an unsigned 32-bit value", () => {
    const value = crc32(Buffer.from("the quick brown fox"));
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(0xffffffff);
  });
});

describe("isSafeZipEntryName", () => {
  it("accepts plain and nested forward-slash names", () => {
    expect(isSafeZipEntryName("manifest.txt")).toBe(true);
    expect(isSafeZipEntryName("Signed Agreements/doc-1.pdf")).toBe(true);
    expect(isSafeZipEntryName("Completion Certificates/doc-1.pdf")).toBe(true);
  });

  it("rejects traversal, absolute, backslash, and empty-segment names", () => {
    expect(isSafeZipEntryName("../secret.pdf")).toBe(false);
    expect(isSafeZipEntryName("a/../b.pdf")).toBe(false);
    expect(isSafeZipEntryName("/etc/passwd")).toBe(false);
    expect(isSafeZipEntryName("a\\b.pdf")).toBe(false);
    expect(isSafeZipEntryName("a//b.pdf")).toBe(false);
    expect(isSafeZipEntryName("trailing/")).toBe(false);
    expect(isSafeZipEntryName(".")).toBe(false);
    expect(isSafeZipEntryName("..")).toBe(false);
    expect(isSafeZipEntryName("")).toBe(false);
    expect(isSafeZipEntryName("has\0null")).toBe(false);
  });
});

describe("buildZip", () => {
  const entries = [
    entry("manifest.txt", "packet manifest"),
    entry("Signed Agreements/doc-1.pdf", "signed agreement bytes"),
    entry("Completion Certificates/doc-1.pdf", "certificate bytes"),
  ];

  it("starts with the local file header magic bytes", () => {
    const zip = buildZip(entries);
    expect(zip.readUInt32LE(0)).toBe(LOCAL_FILE_HEADER_SIGNATURE);
  });

  it("writes an end-of-central-directory whose count matches the entries", () => {
    const zip = buildZip(entries);
    const eocd = readEocd(zip);
    expect(eocd.signature).toBe(END_OF_CENTRAL_DIRECTORY_SIGNATURE);
    expect(eocd.commentLength).toBe(0);
    expect(eocd.recordsOnDisk).toBe(entries.length);
    expect(eocd.totalRecords).toBe(entries.length);
  });

  it("places the central directory where the EOCD points, with the right signature", () => {
    const zip = buildZip(entries);
    const eocd = readEocd(zip);
    // The central directory starts at the recorded offset and is followed by
    // exactly the EOCD record.
    expect(zip.readUInt32LE(eocd.centralDirectoryOffset)).toBe(CENTRAL_DIRECTORY_SIGNATURE);
    expect(eocd.centralDirectoryOffset + eocd.centralDirectorySize).toBe(
      zip.length - END_OF_CENTRAL_DIRECTORY_SIZE,
    );
  });

  it("records the correct CRC-32 for each entry in its local header", () => {
    const single = [entry("only.txt", "123456789")];
    const zip = buildZip(single);
    // Local header CRC-32 sits at offset 14; the known vector proves the bytes
    // were stored and checksummed, not mangled.
    expect(zip.readUInt32LE(14)).toBe(0xcbf43926);
  });

  it("stores the raw bytes uncompressed (compressed size == uncompressed size)", () => {
    const single = [entry("only.txt", "hello world")];
    const zip = buildZip(single);
    // Method at offset 8 is STORE (0); both sizes at 18 and 22 equal the length.
    expect(zip.readUInt16LE(8)).toBe(0);
    expect(zip.readUInt32LE(18)).toBe(Buffer.byteLength("hello world"));
    expect(zip.readUInt32LE(22)).toBe(Buffer.byteLength("hello world"));
    // And the raw bytes follow the 30-byte header plus the 8-byte name.
    const nameLength = zip.readUInt16LE(26);
    const dataStart = 30 + nameLength;
    expect(zip.subarray(dataStart, dataStart + 11).toString("utf8")).toBe("hello world");
  });

  it("is deterministic: identical input yields a byte-identical Buffer", () => {
    const a = buildZip(entries);
    const b = buildZip([
      entry("manifest.txt", "packet manifest"),
      entry("Signed Agreements/doc-1.pdf", "signed agreement bytes"),
      entry("Completion Certificates/doc-1.pdf", "certificate bytes"),
    ]);
    expect(a.equals(b)).toBe(true);
  });

  it("throws on an unsafe entry name", () => {
    expect(() => buildZip([entry("../escape.pdf", "x")])).toThrow();
    expect(() => buildZip([entry("/absolute.pdf", "x")])).toThrow();
    expect(() => buildZip([entry("a\\b.pdf", "x")])).toThrow();
  });

  it("builds an empty archive with zero records", () => {
    const zip = buildZip([]);
    const eocd = readEocd(zip);
    expect(eocd.signature).toBe(END_OF_CENTRAL_DIRECTORY_SIGNATURE);
    expect(eocd.totalRecords).toBe(0);
    expect(eocd.centralDirectoryOffset).toBe(0);
  });
});
