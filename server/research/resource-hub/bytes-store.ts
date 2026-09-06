// ---------------------------------------------------------------------------
// Byte storage for Resource Hub versions. Same discipline as the Document
// Center's DocumentBytesStore: object keys never leave the server, bytes are
// written once per version and never overwritten, and an unconfigured store
// REFUSES rather than pretending.
// ---------------------------------------------------------------------------

export type StoredResourceBytes = { bytes: Uint8Array; contentType: string };

export interface ResourceBytesStore {
  /** Writes exactly once; a second write to the same key must fail. */
  put(storageKey: string, stored: StoredResourceBytes): Promise<void>;
  get(storageKey: string): Promise<StoredResourceBytes | null>;
}

export class ResourceStoreNotConfigured extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceStoreNotConfigured";
  }
}

export function isResourceStoreNotConfigured(error: unknown): boolean {
  return error instanceof Error && error.name === "ResourceStoreNotConfigured";
}

export function createMemoryResourceBytesStore(): ResourceBytesStore & { clear(): void; keys(): string[] } {
  const objects = new Map<string, StoredResourceBytes>();
  return {
    async put(storageKey, stored) {
      if (objects.has(storageKey)) throw new Error("resource bytes are immutable: key already exists");
      objects.set(storageKey, { bytes: new Uint8Array(stored.bytes), contentType: stored.contentType });
    },
    async get(storageKey) {
      const found = objects.get(storageKey);
      return found ? { bytes: new Uint8Array(found.bytes), contentType: found.contentType } : null;
    },
    clear() {
      objects.clear();
    },
    keys() {
      return [...objects.keys()];
    },
  };
}

export const notConfiguredResourceBytesStore: ResourceBytesStore = {
  async put() {
    throw new ResourceStoreNotConfigured("Resource byte storage is not wired.");
  },
  async get() {
    throw new ResourceStoreNotConfigured("Resource byte storage is not wired.");
  },
};

/** The subset of the Supabase Storage client this store uses; injected for tests. */
export interface SupabaseStorageLike {
  from(bucket: string): {
    upload(
      path: string,
      body: Uint8Array | Buffer,
      options: { contentType: string; upsert: boolean },
    ): Promise<{ error: { message: string } | null }>;
    download(path: string): Promise<{ data: Blob | null; error: { message: string } | null }>;
  };
}

/**
 * Private-bucket adapter. No public URL and no signed URL is ever minted here:
 * bytes are read server-side with the service-role client and streamed by the
 * authorized application route.
 */
export function createSupabaseResourceBytesStore(input: {
  bucket: string;
  storage: () => SupabaseStorageLike;
}): ResourceBytesStore {
  return {
    async put(storageKey, stored) {
      const result = await input.storage().from(input.bucket).upload(storageKey, Buffer.from(stored.bytes), {
        contentType: stored.contentType,
        upsert: false,
      });
      if (result.error) throw new Error(`resource bytes write failed: ${result.error.message}`);
    },
    async get(storageKey) {
      const result = await input.storage().from(input.bucket).download(storageKey);
      if (result.error || !result.data) return null;
      const buffer = new Uint8Array(await result.data.arrayBuffer());
      return { bytes: buffer, contentType: result.data.type || "application/pdf" };
    },
  };
}
