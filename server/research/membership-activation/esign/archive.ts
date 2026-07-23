import crypto from "crypto";
import { Buffer } from "node:buffer";
import { isSafeStoragePath } from "../../media-provider";
import { getSupabaseAdmin } from "../../../supabase";
import type {
  ArchiveRecord,
  EsignAccessGrant,
  EsignMediaPort,
  EsignProviderResult,
  EsignUploadGrant,
  FetchedFile,
} from "./contracts";
import { buildZip, type ZipEntry } from "./zip";

// ---------------------------------------------------------------------------
// xenios research e-signature: the completed-document archive.
//
// After a provider completion event is verified server-side, the signed PDF and
// the completion certificate are fetched and INGESTED into xenios private
// storage, so xenios holds its own copy of the legal record rather than
// trusting a provider drive to keep it. This module owns:
//   - the EsignMediaPort implementations (in-memory for tests, Supabase for
//     production), mirroring the identity-documents media provider posture;
//   - the path-safe storage-path builders for the record hierarchy;
//   - ingestCompletedDocuments, what the signing webhook processor calls once a
//     completion is verified;
//   - buildMemberPacketZip, which assembles a member's signed documents and
//     certificates into a single, dependency-free .zip.
//
// HARD RULES encoded here:
// - The esign bucket is a DISTINCT private bucket. It never shares a bucket with
//   member media or identity documents, so a signed legal packet can never be
//   reached through another lane's code path.
// - No public URLs. Access is a short-lived signed URL only.
// - Raw government-ID images and raw payment-evidence images are EXCLUDED from
//   the member packet by default. This builder only ever reads esign legal
//   documents and certificates; identity and payment evidence require a separate
//   authorization and are added by the caller at the extension point below.
// ---------------------------------------------------------------------------

// The esign archive bucket MUST be its own private bucket, separate from member
// media (RESEARCH_MEDIA_BUCKET) and identity documents (RESEARCH_IDENTITY_BUCKET).
export const RESEARCH_ESIGN_BUCKET = "RESEARCH_ESIGN_BUCKET";

const REQUIRED_ESIGN_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", RESEARCH_ESIGN_BUCKET] as const;

export function missingEsignMediaEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return REQUIRED_ESIGN_ENV.filter((name) => !env[name]);
}

// ---------------------------------------------------------------------------
// Storage-path builders (pure, path-safe)
// ---------------------------------------------------------------------------

// The record hierarchy from the legal directive, section 7:
//   research-member-records/{memberId}/legal/{packetOrDocumentId}/{version}/signed.pdf
//   .../completion-certificate.pdf
//   .../metadata.json
const ESIGN_RECORD_ROOT = "research-member-records";

// One path segment, restricted to the safe charset and never a traversal token.
// A segment made only of dots (".", "..", "...") is rejected outright, and any
// character outside [A-Za-z0-9._-] throws rather than being silently rewritten,
// so an unsafe id can never reach the storage layer as a real object key.
const SAFE_ESIGN_SEGMENT = /^[A-Za-z0-9._-]+$/;

export class EsignArchivePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EsignArchivePathError";
  }
}

function safeSegment(value: string, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    throw new EsignArchivePathError(`The ${label} is not safe for an esign storage path.`);
  }
  if (/^\.+$/.test(value) || !SAFE_ESIGN_SEGMENT.test(value)) {
    throw new EsignArchivePathError(`The ${label} is not safe for an esign storage path.`);
  }
  return value;
}

function legalVersionBase(memberId: string, packetOrDocumentId: string, version: string): string {
  return [
    ESIGN_RECORD_ROOT,
    safeSegment(memberId, "member id"),
    "legal",
    safeSegment(packetOrDocumentId, "packet or document id"),
    safeSegment(version, "version"),
  ].join("/");
}

export function esignSignedPdfPath(memberId: string, packetOrDocumentId: string, version: string): string {
  return `${legalVersionBase(memberId, packetOrDocumentId, version)}/signed.pdf`;
}

export function esignCertificatePath(memberId: string, packetOrDocumentId: string, version: string): string {
  return `${legalVersionBase(memberId, packetOrDocumentId, version)}/completion-certificate.pdf`;
}

export function esignMetadataPath(memberId: string, packetOrDocumentId: string, version: string): string {
  return `${legalVersionBase(memberId, packetOrDocumentId, version)}/metadata.json`;
}

// ---------------------------------------------------------------------------
// Hashing (node crypto only)
// ---------------------------------------------------------------------------

export function sha256Hex(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

// ---------------------------------------------------------------------------
// In-memory media provider (test and dev)
// ---------------------------------------------------------------------------

function refusedUnsafePath<T>(): EsignProviderResult<T> {
  return { ok: false, code: "REFUSED", message: "That storage path is not one this system generates." };
}

// Deterministic, in-memory EsignMediaPort. Bytes live in a Map keyed by
// storagePath; every call is recorded so a test can prove the service drove the
// provider. Unsafe paths are refused in the same shape the real adapter uses.
export class InMemoryEsignMediaProvider implements EsignMediaPort {
  readonly objects = new Map<string, { bytes: Buffer; contentType: string }>();
  readonly calls: Array<{ method: string; storagePath: string }> = [];

  reset(): void {
    this.objects.clear();
    this.calls.length = 0;
  }

  async putObject(input: {
    storagePath: string;
    bytes: Buffer;
    contentType: string;
  }): Promise<EsignProviderResult<EsignUploadGrant>> {
    this.calls.push({ method: "putObject", storagePath: input.storagePath });
    if (!isSafeStoragePath(input.storagePath)) return refusedUnsafePath();
    // Copy the bytes so a later mutation of the caller's buffer cannot alter the
    // stored object.
    this.objects.set(input.storagePath, {
      bytes: Buffer.from(input.bytes),
      contentType: input.contentType,
    });
    return { ok: true, value: { storagePath: input.storagePath, bytesWritten: input.bytes.length } };
  }

  async createAccessUrl(input: {
    storagePath: string;
    expiresInSeconds: number;
    now: Date;
  }): Promise<EsignProviderResult<EsignAccessGrant>> {
    this.calls.push({ method: "createAccessUrl", storagePath: input.storagePath });
    if (!isSafeStoragePath(input.storagePath)) return refusedUnsafePath();
    if (!this.objects.has(input.storagePath)) {
      return { ok: false, code: "PROVIDER_ERROR", message: "No stored object exists for that path." };
    }
    const token = crypto.randomBytes(12).toString("hex");
    return {
      ok: true,
      value: {
        signedUrl: `https://esign-signed/${input.storagePath}?token=${token}`,
        expiresAt: new Date(input.now.getTime() + input.expiresInSeconds * 1000).toISOString(),
      },
    };
  }

  async getObject(storagePath: string): Promise<EsignProviderResult<FetchedFile>> {
    this.calls.push({ method: "getObject", storagePath });
    if (!isSafeStoragePath(storagePath)) return refusedUnsafePath();
    const found = this.objects.get(storagePath);
    if (!found) {
      return { ok: false, code: "PROVIDER_ERROR", message: "No stored object exists for that path." };
    }
    return { ok: true, value: { bytes: Buffer.from(found.bytes), contentType: found.contentType } };
  }
}

export const inMemoryEsignMediaProvider = new InMemoryEsignMediaProvider();

// ---------------------------------------------------------------------------
// Supabase media provider (the real adapter)
// ---------------------------------------------------------------------------

export class EsignMediaNotConfigured extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`E-signature archive storage is not configured: ${missing.join(", ")}`);
    this.name = "EsignMediaNotConfigured";
    this.missing = missing;
  }
}

// The minimal structural slice of Supabase's StorageFileApi this adapter needs.
// It deliberately has NO getPublicUrl: every read is a signed URL with a short
// expiry, so a public link cannot be minted through this seam. The bucket handle
// is injected (a factory), so tests drive a fake with no network.
export type EsignStorageBucketApi = {
  upload(
    path: string,
    body: Buffer | Uint8Array,
    options?: { contentType?: string; upsert?: boolean },
  ): Promise<{ data: { path: string } | null; error: { message: string } | null }>;
  createSignedUrl(
    path: string,
    expiresInSeconds: number,
  ): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
  download(
    path: string,
  ): Promise<{
    data: { arrayBuffer(): Promise<ArrayBuffer>; type?: string } | null;
    error: { message: string } | null;
  }>;
  remove(paths: string[]): Promise<{ data: unknown[] | null; error: { message: string } | null }>;
};

export type EsignStorageBucketFactory = (bucket: string) => EsignStorageBucketApi;

// Production default: the service-role client, resolved lazily inside a call so
// importing this module without credentials cannot crash.
const serviceRoleBucketFactory: EsignStorageBucketFactory = (bucket) =>
  getSupabaseAdmin().storage.from(bucket) as unknown as EsignStorageBucketApi;

export class SupabaseEsignMediaProvider implements EsignMediaPort {
  private readonly bucketFactory: EsignStorageBucketFactory;

  constructor(bucketFactory: EsignStorageBucketFactory = serviceRoleBucketFactory) {
    this.bucketFactory = bucketFactory;
  }

  private bucket(): EsignStorageBucketApi {
    const missing = missingEsignMediaEnv();
    if (missing.length > 0) throw new EsignMediaNotConfigured(missing);
    return this.bucketFactory(process.env[RESEARCH_ESIGN_BUCKET] as string);
  }

  private failed(method: string, detail?: string): EsignProviderResult<never> {
    return {
      ok: false,
      code: "PROVIDER_ERROR",
      message: `E-signature archive storage ${method} failed${detail ? `: ${detail}` : "."}`,
    };
  }

  async putObject(input: {
    storagePath: string;
    bytes: Buffer;
    contentType: string;
  }): Promise<EsignProviderResult<EsignUploadGrant>> {
    if (!isSafeStoragePath(input.storagePath)) return refusedUnsafePath();
    try {
      const { data, error } = await this.bucket().upload(input.storagePath, input.bytes, {
        contentType: input.contentType,
        upsert: true,
      });
      if (error || !data) return this.failed("upload", error?.message);
      return { ok: true, value: { storagePath: input.storagePath, bytesWritten: input.bytes.length } };
    } catch (err) {
      return this.failed("upload", err instanceof Error ? err.message : undefined);
    }
  }

  async createAccessUrl(input: {
    storagePath: string;
    expiresInSeconds: number;
    now: Date;
  }): Promise<EsignProviderResult<EsignAccessGrant>> {
    if (!isSafeStoragePath(input.storagePath)) return refusedUnsafePath();
    try {
      const { data, error } = await this.bucket().createSignedUrl(input.storagePath, input.expiresInSeconds);
      if (error || !data) return this.failed("createSignedUrl", error?.message);
      return {
        ok: true,
        value: {
          signedUrl: data.signedUrl,
          expiresAt: new Date(input.now.getTime() + input.expiresInSeconds * 1000).toISOString(),
        },
      };
    } catch (err) {
      return this.failed("createSignedUrl", err instanceof Error ? err.message : undefined);
    }
  }

  async getObject(storagePath: string): Promise<EsignProviderResult<FetchedFile>> {
    if (!isSafeStoragePath(storagePath)) return refusedUnsafePath();
    try {
      const { data, error } = await this.bucket().download(storagePath);
      if (error || !data) return this.failed("download", error?.message);
      const bytes = Buffer.from(await data.arrayBuffer());
      const contentType = typeof data.type === "string" && data.type.length > 0 ? data.type : null;
      return { ok: true, value: { bytes, contentType } };
    } catch (err) {
      return this.failed("download", err instanceof Error ? err.message : undefined);
    }
  }
}

// ---------------------------------------------------------------------------
// Ingest a completed document set into private storage
// ---------------------------------------------------------------------------

export class EsignArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EsignArchiveError";
  }
}

export interface IngestCompletedDocumentsInput {
  memberId: string;
  packetOrDocumentId: string;
  version: string;
  signedPdf: FetchedFile;
  certificate: FetchedFile;
  media: EsignMediaPort;
  provider: string;
  completedAt: string;
}

export interface IngestCompletedDocumentsResult {
  signedPdfRef: string;
  signedPdfHash: string;
  certificateRef: string;
  certificateHash: string;
  metadataRef: string;
}

// Called by the signing webhook processor once a completion is verified: hash
// each fetched file, store the signed PDF, the certificate, and a metadata.json
// beside them, and return the storage refs plus hashes so the durable record can
// point at them. Hashing is done here so the record's integrity is xenios-owned,
// not a provider claim. A failed store throws (nothing partially "succeeds"
// silently); the caller records ingest_failed on the archive record.
export async function ingestCompletedDocuments(
  input: IngestCompletedDocumentsInput,
): Promise<IngestCompletedDocumentsResult> {
  const signedPdfRef = esignSignedPdfPath(input.memberId, input.packetOrDocumentId, input.version);
  const certificateRef = esignCertificatePath(input.memberId, input.packetOrDocumentId, input.version);
  const metadataRef = esignMetadataPath(input.memberId, input.packetOrDocumentId, input.version);

  const signedPdfHash = sha256Hex(input.signedPdf.bytes);
  const certificateHash = sha256Hex(input.certificate.bytes);

  const metadata = {
    memberId: input.memberId,
    packetOrDocumentId: input.packetOrDocumentId,
    version: input.version,
    provider: input.provider,
    completedAt: input.completedAt,
    signedPdf: {
      ref: signedPdfRef,
      sha256: signedPdfHash,
      contentType: input.signedPdf.contentType,
      bytes: input.signedPdf.bytes.length,
    },
    certificate: {
      ref: certificateRef,
      sha256: certificateHash,
      contentType: input.certificate.contentType,
      bytes: input.certificate.bytes.length,
    },
  };
  const metadataBytes = Buffer.from(JSON.stringify(metadata, null, 2), "utf8");

  const storedSigned = await input.media.putObject({
    storagePath: signedPdfRef,
    bytes: input.signedPdf.bytes,
    contentType: input.signedPdf.contentType ?? "application/pdf",
  });
  if (!storedSigned.ok) {
    throw new EsignArchiveError(`Could not store the signed document: ${storedSigned.message ?? storedSigned.code}`);
  }

  const storedCertificate = await input.media.putObject({
    storagePath: certificateRef,
    bytes: input.certificate.bytes,
    contentType: input.certificate.contentType ?? "application/pdf",
  });
  if (!storedCertificate.ok) {
    throw new EsignArchiveError(
      `Could not store the completion certificate: ${storedCertificate.message ?? storedCertificate.code}`,
    );
  }

  const storedMetadata = await input.media.putObject({
    storagePath: metadataRef,
    bytes: metadataBytes,
    contentType: "application/json",
  });
  if (!storedMetadata.ok) {
    throw new EsignArchiveError(
      `Could not store the archive metadata: ${storedMetadata.message ?? storedMetadata.code}`,
    );
  }

  return { signedPdfRef, signedPdfHash, certificateRef, certificateHash, metadataRef };
}

// ---------------------------------------------------------------------------
// Build a member's document packet as a .zip
// ---------------------------------------------------------------------------

export interface BuildMemberPacketZipInput {
  records: readonly ArchiveRecord[];
  media: EsignMediaPort;
  include: { rawIdentity?: boolean; paymentEvidence?: boolean };
}

// Turn an id into a safe, single-segment zip entry key: only [A-Za-z0-9._-]
// survives, and any leading dots are neutralized so no key can become a "." or
// ".." traversal token once placed under a folder.
function zipEntryKey(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "_");
  return cleaned.length > 0 ? cleaned : "document";
}

// Assemble a member's completed legal documents into one .zip: the signed
// agreements, the completion certificates, and a plain-text manifest.
//
// RAW GOVERNMENT-ID IMAGES AND RAW PAYMENT-EVIDENCE IMAGES ARE EXCLUDED BY
// DEFAULT. This builder only reads the esign legal documents and certificates it
// is given; it has no access to the identity or payment buckets, so nothing from
// those lanes can appear here. The include.rawIdentity / include.paymentEvidence
// flags are the seam a separately-authorized caller uses at the extension point
// below; this builder never adds that content itself.
export async function buildMemberPacketZip(input: BuildMemberPacketZipInput): Promise<Buffer> {
  const entries: ZipEntry[] = [];
  const manifestLines: string[] = [
    "xenios research member document packet",
    "contents: signed agreements and completion certificates only",
    "",
  ];

  for (const record of input.records) {
    const key = zipEntryKey(record.documentVersionId ?? record.packetOrDocumentId);

    if (record.signedPdfRef) {
      const fetched = await input.media.getObject(record.signedPdfRef);
      if (fetched.ok) {
        const name = `Signed Agreements/${key}.pdf`;
        entries.push({ name, bytes: fetched.value.bytes });
        manifestLines.push(`signed agreement: ${name}  sha256=${record.signedPdfHash ?? "unknown"}`);
      }
    }

    if (record.certificateRef) {
      const fetched = await input.media.getObject(record.certificateRef);
      if (fetched.ok) {
        const name = `Completion Certificates/${key}.pdf`;
        entries.push({ name, bytes: fetched.value.bytes });
        manifestLines.push(`completion certificate: ${name}  sha256=${record.certificateHash ?? "unknown"}`);
      }
    }
  }

  // EXTENSION POINT (separate authorization required, NOT implemented here):
  // when a caller is explicitly authorized to include raw identity documents or
  // raw payment evidence, they fetch those from their OWN lane's private bucket
  // and push additional entries below. This esign builder deliberately never
  // reaches into the identity or payment buckets, so the default packet can
  // never leak that content.
  void input.include.rawIdentity;
  void input.include.paymentEvidence;

  entries.push({ name: "manifest.txt", bytes: Buffer.from(`${manifestLines.join("\n")}\n`, "utf8") });

  return buildZip(entries);
}
