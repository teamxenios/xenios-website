import type { PrivateMediaKind } from "@shared/research/member-platform";
import { capabilityEnabled } from "./capabilities";

// ---------------------------------------------------------------------------
// xenios research member platform: the private media storage provider seam
// (Website 2 lane, Wave 4).
//
// Nothing in this file talks to a network. The provider is the ONE place that
// knows about buckets, object keys, and signed URLs; the media service above
// it never builds a URL or a storage path by hand, so a disabled or
// unconfigured capability can never leak a fabricated link.
//
// Selection is capability-driven (selectMediaProvider):
//   private_media off        -> DisabledMediaProvider (every call refuses)
//   NODE_ENV === "test"      -> TestMediaProvider (deterministic, in memory)
//   otherwise                -> SupabaseStorageProvider (the real adapter shell)
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
// missing. PROVIDER_ERROR: the adapter itself failed. The service maps the
// first two to capability_disabled (truthful) and the last to a 500.
export type ProviderErrorCode = "DISABLED" | "NOT_CONFIGURED" | "PROVIDER_ERROR";

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

export interface PrivateMediaProvider {
  createUploadUrl(input: CreateUploadUrlInput): Promise<ProviderResult<CreateUploadUrlValue>>;
  createAccessUrl(input: CreateAccessUrlInput): Promise<ProviderResult<CreateAccessUrlValue>>;
  deleteObject(storagePath: string): Promise<ProviderResult<void>>;
  scanForMalware(storagePath: string): Promise<ProviderResult<{ clean: boolean }>>;
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
  async scanForMalware() {
    return { ok: false, code: "DISABLED", message: "Private media storage is disabled." };
  },
};

// ---------------------------------------------------------------------------
// Test (deterministic, in memory, no network)
// ---------------------------------------------------------------------------

export type TestProviderCall = {
  method: "createUploadUrl" | "createAccessUrl" | "deleteObject" | "scanForMalware";
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

  // Deterministic stand-in for the real scanner: a path containing "infected"
  // is the unclean fixture, everything else is clean.
  async scanForMalware(storagePath: string): Promise<ProviderResult<{ clean: boolean }>> {
    this.calls.push({ method: "scanForMalware", storagePath });
    return { ok: true, value: { clean: !storagePath.includes("infected") } };
  }
}

export const testMediaProvider = new TestMediaProvider();

// ---------------------------------------------------------------------------
// Supabase storage (the real adapter SHELL)
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

// The seam where Supabase Storage signed uploads, signed downloads, object
// deletion, and the malware scan hook get wired. It is deliberately inert: it
// throws MediaProviderNotConfigured without a bucket and a service role, and
// returns a truthful PROVIDER_ERROR once configured, because the storage
// adapter body is a later wave. It never performs network I/O, so nothing can
// write a member's photo to a bucket by accident before that wave lands.
export class SupabaseStorageProvider implements PrivateMediaProvider {
  private requireConfig() {
    const missing = missingMediaEnv();
    if (missing.length > 0) throw new MediaProviderNotConfigured(missing);
  }

  private notWired(method: string): ProviderResult<never> {
    return {
      ok: false,
      code: "PROVIDER_ERROR",
      message: `The Supabase storage adapter is not wired yet (${method}).`,
    };
  }

  async createUploadUrl(_input: CreateUploadUrlInput): Promise<ProviderResult<CreateUploadUrlValue>> {
    this.requireConfig();
    return this.notWired("createUploadUrl");
  }

  async createAccessUrl(_input: CreateAccessUrlInput): Promise<ProviderResult<CreateAccessUrlValue>> {
    this.requireConfig();
    return this.notWired("createAccessUrl");
  }

  async deleteObject(_storagePath: string): Promise<ProviderResult<void>> {
    this.requireConfig();
    return this.notWired("deleteObject");
  }

  async scanForMalware(_storagePath: string): Promise<ProviderResult<{ clean: boolean }>> {
    this.requireConfig();
    return this.notWired("scanForMalware");
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
