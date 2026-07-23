import { describe, expect, it } from "vitest";
import crypto from "crypto";
import {
  buildMemberPacketZip,
  esignCertificatePath,
  esignMetadataPath,
  esignSignedPdfPath,
  ingestCompletedDocuments,
  InMemoryEsignMediaProvider,
  missingEsignMediaEnv,
  RESEARCH_ESIGN_BUCKET,
  sha256Hex,
  EsignArchivePathError,
} from "./archive";
import type { ArchiveRecord, FetchedFile } from "./contracts";

const NOW = new Date("2026-07-22T12:00:00.000Z");
const END_OF_CENTRAL_DIRECTORY_SIZE = 22;

function file(text: string, contentType: string | null = "application/pdf"): FetchedFile {
  return { bytes: Buffer.from(text, "utf8"), contentType };
}

function expectedSha256(text: string): string {
  return crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

// Read every entry name out of a STORE-method archive by walking the local file
// headers (signature 0x04034b50), so a test can assert exactly which files the
// packet contains.
function entryNames(zip: Buffer): string[] {
  const names: string[] = [];
  let offset = 0;
  while (offset + 4 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    names.push(zip.subarray(nameStart, nameStart + nameLength).toString("utf8"));
    offset = nameStart + nameLength + extraLength + compressedSize;
  }
  return names;
}

function totalRecords(zip: Buffer): number {
  return zip.readUInt16LE(zip.length - END_OF_CENTRAL_DIRECTORY_SIZE + 10);
}

function archiveRecord(overrides: Partial<ArchiveRecord>): ArchiveRecord {
  return {
    id: "arc-1",
    memberId: "member-1",
    packetOrDocumentId: "packet-1",
    documentVersionId: "doc-v1",
    provider: "opensign",
    providerDocumentId: "prov-doc-1",
    signedPdfRef: null,
    signedPdfHash: null,
    certificateRef: null,
    certificateHash: null,
    xeniosSourceHash: null,
    signerEmail: null,
    completedAt: NOW.toISOString(),
    retentionClass: "legal",
    accessClassification: "member_and_admin",
    archiveStatus: "stored",
    emailDeliveryStatus: "pending",
    localExportStatus: "not_exported",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe("missingEsignMediaEnv", () => {
  it("lists every missing required var, including a distinct esign bucket", () => {
    const missing = missingEsignMediaEnv({});
    expect(missing).toContain("SUPABASE_URL");
    expect(missing).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(missing).toContain(RESEARCH_ESIGN_BUCKET);
    expect(RESEARCH_ESIGN_BUCKET).toBe("RESEARCH_ESIGN_BUCKET");
  });

  it("reports nothing missing when all three are set", () => {
    const env = {
      SUPABASE_URL: "https://x.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      RESEARCH_ESIGN_BUCKET: "research-esign",
    } as NodeJS.ProcessEnv;
    expect(missingEsignMediaEnv(env)).toEqual([]);
  });
});

describe("storage-path builders", () => {
  it("build the section-7 hierarchy", () => {
    expect(esignSignedPdfPath("member-1", "packet-1", "v1")).toBe(
      "research-member-records/member-1/legal/packet-1/v1/signed.pdf",
    );
    expect(esignCertificatePath("member-1", "packet-1", "v1")).toBe(
      "research-member-records/member-1/legal/packet-1/v1/completion-certificate.pdf",
    );
    expect(esignMetadataPath("member-1", "packet-1", "v1")).toBe(
      "research-member-records/member-1/legal/packet-1/v1/metadata.json",
    );
  });

  it("reject unsafe segments (traversal, slashes, empty, bad charset)", () => {
    expect(() => esignSignedPdfPath("../etc", "packet-1", "v1")).toThrow(EsignArchivePathError);
    expect(() => esignSignedPdfPath("member-1", "..", "v1")).toThrow(EsignArchivePathError);
    expect(() => esignSignedPdfPath("member-1", "packet/1", "v1")).toThrow(EsignArchivePathError);
    expect(() => esignCertificatePath("member-1", "packet-1", "")).toThrow(EsignArchivePathError);
    expect(() => esignMetadataPath("mem ber", "packet-1", "v1")).toThrow(EsignArchivePathError);
    expect(() => esignSignedPdfPath("member-1", "packet-1", "v\\1")).toThrow(EsignArchivePathError);
  });
});

describe("ingestCompletedDocuments", () => {
  it("stores three objects with the correct sha256 hashes and returns their refs", async () => {
    const media = new InMemoryEsignMediaProvider();
    const signedText = "signed pdf bytes";
    const certText = "completion certificate bytes";

    const result = await ingestCompletedDocuments({
      memberId: "member-1",
      packetOrDocumentId: "packet-1",
      version: "v1",
      signedPdf: file(signedText),
      certificate: file(certText),
      media,
      provider: "opensign",
      completedAt: NOW.toISOString(),
    });

    // Three objects stored: signed pdf, certificate, metadata.
    expect(media.objects.size).toBe(3);
    expect(result.signedPdfRef).toBe("research-member-records/member-1/legal/packet-1/v1/signed.pdf");
    expect(result.certificateRef).toBe(
      "research-member-records/member-1/legal/packet-1/v1/completion-certificate.pdf",
    );
    expect(result.metadataRef).toBe("research-member-records/member-1/legal/packet-1/v1/metadata.json");

    // Hashes match a known sha256 of the exact bytes.
    expect(result.signedPdfHash).toBe(expectedSha256(signedText));
    expect(result.certificateHash).toBe(expectedSha256(certText));
    expect(sha256Hex(Buffer.from(signedText, "utf8"))).toBe(result.signedPdfHash);
  });

  it("writes a metadata.json carrying member, version, hashes, provider, and completedAt", async () => {
    const media = new InMemoryEsignMediaProvider();
    const result = await ingestCompletedDocuments({
      memberId: "member-1",
      packetOrDocumentId: "packet-1",
      version: "v1",
      signedPdf: file("a"),
      certificate: file("b"),
      media,
      provider: "opensign",
      completedAt: NOW.toISOString(),
    });

    const stored = media.objects.get(result.metadataRef);
    expect(stored).toBeDefined();
    const meta = JSON.parse((stored as { bytes: Buffer }).bytes.toString("utf8"));
    expect(meta.memberId).toBe("member-1");
    expect(meta.version).toBe("v1");
    expect(meta.provider).toBe("opensign");
    expect(meta.completedAt).toBe(NOW.toISOString());
    expect(meta.signedPdf.sha256).toBe(result.signedPdfHash);
    expect(meta.certificate.sha256).toBe(result.certificateHash);
  });

  it("round-trips stored bytes through getObject", async () => {
    const media = new InMemoryEsignMediaProvider();
    const result = await ingestCompletedDocuments({
      memberId: "member-1",
      packetOrDocumentId: "packet-1",
      version: "v1",
      signedPdf: file("the signed agreement"),
      certificate: file("the certificate"),
      media,
      provider: "opensign",
      completedAt: NOW.toISOString(),
    });

    const got = await media.getObject(result.signedPdfRef);
    expect(got.ok).toBe(true);
    if (got.ok) {
      expect(got.value.bytes.toString("utf8")).toBe("the signed agreement");
    }
  });

  it("throws when an unsafe member id would build an unsafe path", async () => {
    const media = new InMemoryEsignMediaProvider();
    await expect(
      ingestCompletedDocuments({
        memberId: "../escape",
        packetOrDocumentId: "packet-1",
        version: "v1",
        signedPdf: file("a"),
        certificate: file("b"),
        media,
        provider: "opensign",
        completedAt: NOW.toISOString(),
      }),
    ).rejects.toThrow(EsignArchivePathError);
    // Nothing was stored.
    expect(media.objects.size).toBe(0);
  });
});

describe("InMemoryEsignMediaProvider access URL", () => {
  it("mints a fake signed URL for a stored object and refuses unsafe paths", async () => {
    const media = new InMemoryEsignMediaProvider();
    await media.putObject({
      storagePath: "research-member-records/member-1/legal/packet-1/v1/signed.pdf",
      bytes: Buffer.from("x"),
      contentType: "application/pdf",
    });
    const grant = await media.createAccessUrl({
      storagePath: "research-member-records/member-1/legal/packet-1/v1/signed.pdf",
      expiresInSeconds: 300,
      now: NOW,
    });
    expect(grant.ok).toBe(true);
    if (grant.ok) {
      expect(grant.value.signedUrl).toContain("https://esign-signed/");
      expect(grant.value.expiresAt).toBe(new Date(NOW.getTime() + 300 * 1000).toISOString());
    }

    const unsafe = await media.getObject("../escape");
    expect(unsafe.ok).toBe(false);
  });
});

describe("buildMemberPacketZip", () => {
  async function seededMedia() {
    const media = new InMemoryEsignMediaProvider();
    await ingestCompletedDocuments({
      memberId: "member-1",
      packetOrDocumentId: "packet-1",
      version: "v1",
      signedPdf: file("signed one"),
      certificate: file("cert one"),
      media,
      provider: "opensign",
      completedAt: NOW.toISOString(),
    });
    return media;
  }

  it("produces a valid zip with the expected signed + certificate + manifest entries", async () => {
    const media = await seededMedia();
    const record = archiveRecord({
      documentVersionId: "doc-v1",
      signedPdfRef: esignSignedPdfPath("member-1", "packet-1", "v1"),
      signedPdfHash: "hash-signed",
      certificateRef: esignCertificatePath("member-1", "packet-1", "v1"),
      certificateHash: "hash-cert",
    });

    const zip = await buildMemberPacketZip({ records: [record], media, include: {} });

    // Valid archive: starts with a local file header, EOCD count matches.
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const names = entryNames(zip);
    expect(names).toEqual([
      "Signed Agreements/doc-v1.pdf",
      "Completion Certificates/doc-v1.pdf",
      "manifest.txt",
    ]);
    expect(totalRecords(zip)).toBe(names.length);
  });

  it("excludes anything identity or payment evidence by default", async () => {
    const media = await seededMedia();
    const record = archiveRecord({
      documentVersionId: "doc-v1",
      signedPdfRef: esignSignedPdfPath("member-1", "packet-1", "v1"),
      certificateRef: esignCertificatePath("member-1", "packet-1", "v1"),
    });

    // Even with the flags flipped on, this builder never reaches identity or
    // payment buckets, so no such entry can appear.
    const zip = await buildMemberPacketZip({
      records: [record],
      media,
      include: { rawIdentity: true, paymentEvidence: true },
    });

    const names = entryNames(zip);
    for (const name of names) {
      expect(name).not.toMatch(/identity/i);
      expect(name).not.toMatch(/payment/i);
      expect(name).not.toMatch(/evidence/i);
      expect(name).not.toMatch(/government/i);
    }
    // Only the two legal docs plus the manifest.
    expect(names).toHaveLength(3);
  });

  it("skips records with no signed pdf or certificate ref", async () => {
    const media = await seededMedia();
    const empty = archiveRecord({ signedPdfRef: null, certificateRef: null });
    const zip = await buildMemberPacketZip({ records: [empty], media, include: {} });
    // Only the manifest survives.
    expect(entryNames(zip)).toEqual(["manifest.txt"]);
  });
});
