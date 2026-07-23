import crypto from "crypto";
import type { PrivateMediaKind } from "@shared/research/member-platform";
import { capabilityEnabled } from "./capabilities";
import { getSupabaseAdmin } from "../supabase";

// ---------------------------------------------------------------------------
// xenios research member platform: the private media storage provider seam
// (Website 2 lane, Wave 4; real Supabase Storage bodies in the launch lane).
//
// The provider is the ONE place that knows about buckets, object keys, and
// signed URLs; the media service above it never builds a URL or a storage
// path by hand, so a disabled or unconfigured capability can never leak a
// fabricated link. The real adapter talks to Supabase Storage through the
// service-role client, injected as a bucket factory so tests drive a fake
// client and never touch a network.
//
// Selection is capability-driven (selectMediaProvider):
//   private_media off        -> DisabledMediaProvider (every call refuses)
//   NODE_ENV === "test"      -> TestMediaProvider (deterministic, in memory)
//   otherwise                -> SupabaseStorageProvider (the real adapter)
//
// HARD RULES encoded here and enforced by the service:
// - No facial recognition, anywhere. A "face_blurred" derivative is image
//   processing only. No face templates, embeddings, or descriptors are
//   computed, stored, or compared, and there is no identity match of any kind.
// - No public URLs. Every access is a short-lived signed URL minted per
//   request against an authenticated member, never a durable public link.
// - No advertising or analytics egress. Media bytes, derived artifacts, and
//   transcripts never leave this system for a marketing or measurement
//   destination.
// ---------------------------------------------------------------------------

export const MEDIA_ACCESS_VARIANTS = ["raw", "face_blurred", "transcript"] as const;
export type MediaAccessVariant = (typeof MEDIA_ACCESS_VARIANTS)[number];

// DISABLED: the capability is off. NOT_CONFIGURED: credentials or bucket are
// missing. REFUSED: the provider's own validation rejected the input (an
// unlisted content type, an oversize declaration, or an unsafe identifier);
// deterministic and safe to surface, never retried. PROVIDER_ERROR: the
// adapter itself failed. The service maps the first two to capability_disabled
// (truthful) and the rest to a 500.
export type ProviderErrorCode = "DISABLED" | "NOT_CONFIGURED" | "REFUSED" | "PROVIDER_ERROR";

export type ProviderResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ProviderErrorCode; message?: string };

export type CreateUploadUrlInput = {
  mediaId: string;
  memberId: string;
  kind: PrivateMediaKind;
  contentType: string;
  contentLengthBytes: number;
  maxBytes: number;
  expiresInSeconds: number;
  now: Date; // every timestamp comes from the caller's clock, never Date.now()
};

export type CreateUploadUrlValue = {
  uploadUrl: string;
  storagePath: string;
  expiresAt: string;
  maxBytes: number;
};

// storagePath is null for the transcript variant of a record whose objects are
// already gone (a voice note kept only as text under the delete-raw election).
// The provider owns URL construction for every variant, so the service never
// invents a path.
export type CreateAccessUrlInput = {
  mediaId: string;
  memberId: string;
  storagePath: string | null;
  variant: MediaAccessVariant;
  expiresInSeconds: number;
  now: Date;
};

export type CreateAccessUrlValue = {
  signedUrl: string;
  expiresAt: string;
};

// Existence and size as storage reports them, for reconciliation sweeps and
// upload-completion checks. Never a URL: stat answers "is it there", it never
// grants access.
export type ObjectStat = {
  exists: boolean;
  sizeBytes: number | null;
  contentType: string | null;
};

export interface PrivateMediaProvider {
  createUploadUrl(input: CreateUploadUrlInput): Promise<ProviderResult<CreateUploadUrlValue>>;
  createAccessUrl(input: CreateAccessUrlInput): Promise<ProviderResult<CreateAccessUrlValue>>;
  deleteObject(storagePath: string): Promise<ProviderResult<void>>;
  statObject(storagePath: string): Promise<ProviderResult<ObjectStat>>;
  scanForMalware(storagePath: string): Promise<ProviderResult<{ clean: boolean }>>;
}

// ---------------------------------------------------------------------------
// Path and input safety (shared by every implementation)
// ---------------------------------------------------------------------------

// One segment of an object key: alphanumeric bounds, with dots, hyphens, and
// underscores inside. A leading dot is impossible, so "." and ".." can never
// be a segment and no traversal survives validation.
const SAFE_SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,118}[A-Za-z0-9])?$/;

// Identifiers that become path segments (member id, media id, kind) are held
// to a stricter charset with no dots at all.
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

export function isSafeIdentifier(value: string): boolean {
  return typeof value === "string" && SAFE_IDENTIFIER.test(value);
}

// A storage path this module itself generated. Anything else (traversal,
// absolute paths, backslashes, empty segments) is refused before it can reach
// a storage API.
export function isSafeStoragePath(path: string): boolean {
  if (typeof path !== "string" || path.length === 0 || path.length > 512) return false;
  if (path.includes("\\") || path.startsWith("/") || path.endsWith("/")) return false;
  const segments = path.split("/");
  if (segments.length === 0) return false;
  return segments.every((segment) => SAFE_SEGMENT.test(segment));
}

// The provider's own copy of the content-type allowlist, checked BEFORE any
// upload URL is minted, so an unlisted type is refused even if a caller above
// forgot its own validation. A drift-guard test asserts this stays identical
// to the service's CONTENT_TYPE_ALLOWLIST in media.ts.
export const PROVIDER_CONTENT_TYPE_ALLOWLIST: Record<PrivateMediaKind, readonly string[]> = {
  progress_photo: ["image/jpeg", "image/png", "image/webp"],
  voice_note: ["audio/webm", "audio/mpeg", "audio/mp4"],
  exercise_video: ["video/mp4", "video/webm"],
};

function refused(message: string): ProviderResult<never> {
  return { ok: false, code: "REFUSED", message };
}

// Returns a refusal, or null when the upload input passes every check. The
// messages never echo the offending value: a hostile identifier should not
// travel further, not even inside an error string.
export function validateUploadInput(input: CreateUploadUrlInput): ProviderResult<never> | null {
  const allowed = PROVIDER_CONTENT_TYPE_ALLOWLIST[input.kind];
  if (!allowed) return refused("That media kind is not recognized.");
  if (!allowed.includes(input.contentType)) {
    return refused(`contentType for ${input.kind} must be one of: ${allowed.join(", ")}`);
  }
  if (!Number.isInteger(input.contentLengthBytes) || input.contentLengthBytes <= 0) {
    return refused("contentLengthBytes must be a positive integer.");
  }
  if (!Number.isInteger(input.maxBytes) || input.maxBytes <= 0) {
    return refused("maxBytes must be a positive integer.");
  }
  if (input.contentLengthBytes > input.maxBytes) {
    return refused(`contentLengthBytes for ${input.kind} must be at most ${input.maxBytes} bytes.`);
  }
  if (!isSafeIdentifier(input.memberId) || !isSafeIdentifier(input.mediaId) || !isSafeIdentifier(input.kind)) {
    return refused("The upload identifiers are not safe for an object name.");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Disabled
// ---------------------------------------------------------------------------

// The keys-later default. Every method refuses in the same shape, so a
// disabled capability is a truthful denial rather than a crash, a fake URL, or
// a silent success.
export const disabledMediaProvider: PrivateMediaProvider = {
  async createUploadUrl() {
    return { ok: false, code: "DISABLED", message: "Private media storage is disabled." };
  },
  async createAccessUrl() {
    return { ok: false, code: "DISABLED", message: "Private media storage is disabled." };
  },
  async deleteObject() {
    return { ok: false, code: "DISABLED", message: "Private media storage is disabled." };
  },
  async statObject() {
    return { ok: false, code: "DISABLED", message: "Private media storage is disabled." };
  },
  async scanForMalware() {
    return { ok: false, code: "DISABLED", message: "Private media storage is disabled." };
  },
};

// ---------------------------------------------------------------------------
// Test (deterministic, in memory, no network)
// ---------------------------------------------------------------------------

export type TestProviderCall = {
  method: "createUploadUrl" | "createAccessUrl" | "deleteObject" | "statObject" | "scanForMalware";
  mediaId?: string;
  memberId?: string;
  storagePath?: string | null;
  variant?: MediaAccessVariant;
};

export class TestMediaProvider implements PrivateMediaProvider {
  // Every call is recorded so tests can prove the service actually drove the
  // provider (a delete that never reaches storage is a bug worth catching).
  readonly calls: TestProviderCall[] = [];
  readonly deleted: string[] = [];

  reset() {
    this.calls.length = 0;
    this.deleted.length = 0;
  }

  callsTo(method: TestProviderCall["method"]): TestProviderCall[] {
    return this.calls.filter((call) => call.method === method);
  }

  async createUploadUrl(input: CreateUploadUrlInput): Promise<ProviderResult<CreateUploadUrlValue>> {
    this.calls.push({ method: "createUploadUrl", mediaId: input.mediaId, memberId: input.memberId });
    const storagePath = `test-media/${input.memberId}/${input.kind}/${input.mediaId}`;
    return {
      ok: true,
      value: {
        uploadUrl: `https://storage.test.invalid/upload/${input.mediaId}`,
        storagePath,
        expiresAt: new Date(input.now.getTime() + input.expiresInSeconds * 1000).toISOString(),
        maxBytes: input.maxBytes,
      },
    };
  }

  async createAccessUrl(input: CreateAccessUrlInput): Promise<ProviderResult<CreateAccessUrlValue>> {
    this.calls.push({
      method: "createAccessUrl",
      mediaId: input.mediaId,
      memberId: input.memberId,
      storagePath: input.storagePath,
      variant: input.variant,
    });
    return {
      ok: true,
      value: {
        signedUrl: `https://storage.test.invalid/signed/${input.variant}/${input.mediaId}`,
        expiresAt: new Date(input.now.getTime() + input.expiresInSeconds * 1000).toISOString(),
      },
    };
  }

  // Deterministic refusal fixture, same convention as the scanner below: a
  // path containing "undeletable" is refused, which is how tests exercise the
  // storage-refused branches (a refused delete must never let the service
  // erase the pointer, or the object is orphaned beyond recovery).
  async deleteObject(storagePath: string): Promise<ProviderResult<void>> {
    this.calls.push({ method: "deleteObject", storagePath });
    if (storagePath.includes("undeletable")) {
      return { ok: false, code: "PROVIDER_ERROR", message: "Storage refused the delete." };
    }
    this.deleted.push(storagePath);
    return { ok: true, value: undefined };
  }

  // Deterministic existence fixture: a path containing "missing" does not
  // exist, everything else does.
  async statObject(storagePath: string): Promise<ProviderResult<ObjectStat>> {
    this.calls.push({ method: "statObject", storagePath });
    if (storagePath.includes("missing")) {
      return { ok: true, value: { exists: false, sizeBytes: null, contentType: null } };
    }
    return { ok: true, value: { exists: true, sizeBytes: null, contentType: null } };
  }

  // Deterministic stand-in for the real scanner: a path containing "infected"
  // is the unclean fixture, everything else is clean.
  async scanForMalware(storagePath: string): Promise<ProviderResult<{ clean: boolean }>> {
    this.calls.push({ method: "scanForMalware", storagePath });
    return { ok: true, value: { clean: !storagePath.includes("infected") } };
  }
}

export const testMediaProvider = new TestMediaProvider();

// ---------------------------------------------------------------------------
// Supabase storage (the real adapter)
// ---------------------------------------------------------------------------

export class MediaProviderNotConfigured extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Private media storage is not configured: ${missing.join(", ")}`);
    this.name = "MediaProviderNotConfigured";
    this.missing = missing;
  }
}

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEARCH_MEDIA_BUCKET"] as const;

export function missingMediaEnv(): string[] {
  return REQUIRED_ENV.filter((name) => !process.env[name]);
}

// The structural slice of Supabase's StorageFileApi this adapter uses. The
// bucket handle is INJECTED (a factory, resolved per call), so tests drive a
// fake client with no network and the production default resolves the
// service-role client lazily. Note what is absent: there is no getPublicUrl
// here, by design. Every access is a signed URL with a short expiry; a public
// URL cannot be minted through this seam because the seam has no method for it.
export type StorageBucketApi = {
  createSignedUploadUrl(
    path: string,
  ): Promise<{
    data: { signedUrl: string; token: string; path: string } | null;
    error: { message: string } | null;
  }>;
  createSignedUrl(
    path: string,
    expiresInSeconds: number,
  ): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
  remove(paths: string[]): Promise<{ data: unknown[] | null; error: { message: string } | null }>;
  info(
    path: string,
  ): Promise<{
    data: { size?: number | null; contentType?: string | null } | null;
    error: { message: string; status?: number } | null;
  }>;
};

export type StorageBucketFactory = (bucket: string) => StorageBucketApi;

// Production default: the service-role client. Resolved lazily inside a call,
// never at import, so requiring this module without credentials cannot crash.
const serviceRoleBucketFactory: StorageBucketFactory = (bucket) =>
  getSupabaseAdmin().storage.from(bucket);

// The real Supabase Storage adapter. The bucket named by RESEARCH_MEDIA_BUCKET
// must be a PRIVATE bucket: nothing here ever creates or returns a public URL,
// uploads are signed single-object grants, and reads are signed URLs with the
// short expiry the service requested. Object names are always generated here
// from validated identifiers plus a random suffix; a caller-supplied path can
// never reach the storage API.
export class SupabaseStorageProvider implements PrivateMediaProvider {
  private readonly bucketFactory: StorageBucketFactory;

  constructor(bucketFactory: StorageBucketFactory = serviceRoleBucketFactory) {
    this.bucketFactory = bucketFactory;
  }

  private requireConfig(): string {
    const missing = missingMediaEnv();
    if (missing.length > 0) throw new MediaProviderNotConfigured(missing);
    return process.env.RESEARCH_MEDIA_BUCKET as string;
  }

  private bucket(): StorageBucketApi {
    return this.bucketFactory(this.requireConfig());
  }

  // A storage failure surfaced truthfully. The message carries the method and
  // the storage error text, never a key, a signed URL, or member content.
  private storageFailed(method: string, detail?: string): ProviderResult<never> {
    return {
      ok: false,
      code: "PROVIDER_ERROR",
      message: `Storage ${method} failed${detail ? `: ${detail}` : "."}`,
    };
  }

  async createUploadUrl(input: CreateUploadUrlInput): Promise<ProviderResult<CreateUploadUrlValue>> {
    // Validation runs BEFORE the configuration check, so an unsafe or
    // oversize request is refused as such whatever the deployment state says.
    const invalid = validateUploadInput(input);
    if (invalid) return invalid;
    const bucket = this.bucket();

    // The object name is generated, never supplied: validated identifiers plus
    // a random suffix, so names are unguessable and collisions are practically
    // impossible even for a retried mediaId.
    const suffix = crypto.randomBytes(8).toString("hex");
    const storagePath = `members/${input.memberId}/${input.kind}/${input.mediaId}-${suffix}`;

    try {
      const { data, error } = await bucket.createSignedUploadUrl(storagePath);
      if (error || !data) {
        return this.storageFailed("createSignedUploadUrl", error?.message);
      }
      return {
        ok: true,
        value: {
          uploadUrl: data.signedUrl,
          storagePath,
          // The contract TTL the service asked for. Supabase's signed upload
          // token has its own storage-side lifetime; the shorter of the two
          // governs in practice, and this is the one the client must honor.
          expiresAt: new Date(input.now.getTime() + input.expiresInSeconds * 1000).toISOString(),
          maxBytes: input.maxBytes,
        },
      };
    } catch (err) {
      return this.storageFailed("createSignedUploadUrl", err instanceof Error ? err.message : undefined);
    }
  }

  async createAccessUrl(input: CreateAccessUrlInput): Promise<ProviderResult<CreateAccessUrlValue>> {
    // A transcript kept only as text has no object behind it. There is nothing
    // in storage to sign, and minting a URL to nothing would be fabrication;
    // the service serves transcript text from the record itself.
    if (input.storagePath === null) {
      return refused("There is no stored object for this variant; the text lives on the record.");
    }
    if (!isSafeStoragePath(input.storagePath)) {
      return refused("That storage path is not one this system generates.");
    }
    const bucket = this.bucket();
    try {
      const { data, error } = await bucket.createSignedUrl(input.storagePath, input.expiresInSeconds);
      if (error || !data) {
        return this.storageFailed("createSignedUrl", error?.message);
      }
      return {
        ok: true,
        value: {
          signedUrl: data.signedUrl,
          expiresAt: new Date(input.now.getTime() + input.expiresInSeconds * 1000).toISOString(),
        },
      };
    } catch (err) {
      return this.storageFailed("createSignedUrl", err instanceof Error ? err.message : undefined);
    }
  }

  async deleteObject(storagePath: string): Promise<ProviderResult<void>> {
    if (!isSafeStoragePath(storagePath)) {
      return refused("That storage path is not one this system generates.");
    }
    const bucket = this.bucket();
    try {
      const { data, error } = await bucket.remove([storagePath]);
      if (error) return this.storageFailed("remove", error.message);
      // Supabase reports the objects it removed; an empty list means the
      // object was already gone. That is the deletion outcome the caller
      // wanted, so it is a success, and deletes stay idempotent.
      void data;
      return { ok: true, value: undefined };
    } catch (err) {
      return this.storageFailed("remove", err instanceof Error ? err.message : undefined);
    }
  }

  async statObject(storagePath: string): Promise<ProviderResult<ObjectStat>> {
    if (!isSafeStoragePath(storagePath)) {
      return refused("That storage path is not one this system generates.");
    }
    const bucket = this.bucket();
    try {
      const { data, error } = await bucket.info(storagePath);
      if (!error && data) {
        return {
          ok: true,
          value: {
            exists: true,
            sizeBytes: typeof data.size === "number" ? data.size : null,
            contentType: typeof data.contentType === "string" ? data.contentType : null,
          },
        };
      }
      // A definitive not-found is an answer, not a failure. Anything else
      // (an outage, a permission problem) must NOT masquerade as "absent",
      // because a reconciliation sweep would act on it.
      if (error && (error.status === 404 || error.status === 400)) {
        return { ok: true, value: { exists: false, sizeBytes: null, contentType: null } };
      }
      return this.storageFailed("info", error?.message);
    } catch (err) {
      return this.storageFailed("info", err instanceof Error ? err.message : undefined);
    }
  }

  // EXTERNAL INPUT REQUIRED: there is no malware scanner wired. This fails
  // CLOSED on purpose: completeProcessing treats a scan that cannot answer as
  // "not safe to process" (the file is neither processed nor deleted), so an
  // unscannable file never reaches a member. Wiring a real scanner (vendor
  // choice is Samuel's) replaces this body; nothing else changes.
  async scanForMalware(_storagePath: string): Promise<ProviderResult<{ clean: boolean }>> {
    this.requireConfig();
    return {
      ok: false,
      code: "PROVIDER_ERROR",
      message: "No malware scanner is configured; scans fail closed until one is wired.",
    };
  }
}

export const supabaseStorageProvider = new SupabaseStorageProvider();

// Resolved per call, never memoized at import: capability state depends on
// environment that can change between requests (and between tests).
export function selectMediaProvider(): PrivateMediaProvider {
  if (!capabilityEnabled("private_media")) return disabledMediaProvider;
  if (process.env.NODE_ENV === "test") return testMediaProvider;
  return supabaseStorageProvider;
}
