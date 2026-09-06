import crypto from "crypto";
import { getSupabaseAdmin, supabaseConfigured } from "../../supabase";
import {
  ResourceStoreNotConfigured,
  createMemoryResourceBytesStore,
  createSupabaseResourceBytesStore,
  notConfiguredResourceBytesStore,
  type ResourceBytesStore,
} from "./bytes-store";
import { createResourceHubService, type ResourceHubService } from "./service";
import { createInMemoryResourceHubStore, type ResourceHubStore } from "./store";
import { createSupabaseResourceHubStore } from "./supabase-store";

// ---------------------------------------------------------------------------
// Production composition. The hub is dark until BOTH are true:
//   * the candidate migration has been applied (tables + private bucket), and
//   * RESEARCH_RESOURCE_HUB_ENABLED=true is set for the service.
// Neither is assumed. With the flag off (the default) the admin list answers
// empty, item reads answer 404, every write and byte read answers 503
// resource_hub_unavailable, and the partner library is simply empty, which is
// what production reports today. Turning the flag on is a production
// environment change that needs its own approval; nothing here reads a flag
// it is not told about.
// ---------------------------------------------------------------------------

export const RESOURCE_HUB_ENABLED_ENV = "RESEARCH_RESOURCE_HUB_ENABLED";
export const RESOURCE_HUB_BUCKET = "research-resource-library";

export function resourceHubEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[RESOURCE_HUB_ENABLED_ENV] === "true";
}

/** One process-local composition for non-production previews and tests. */
let previewService: ResourceHubService | null = null;

export function resolveResourceHubService(env: NodeJS.ProcessEnv = process.env): ResourceHubService {
  const now = () => new Date();
  const newId = () => crypto.randomUUID();
  if (env.NODE_ENV === "production") {
    let store: ResourceHubStore;
    let bytes: ResourceBytesStore;
    if (resourceHubEnabled(env) && supabaseConfigured()) {
      store = createSupabaseResourceHubStore(() => getSupabaseAdmin() as never);
      bytes = createSupabaseResourceBytesStore({ bucket: RESOURCE_HUB_BUCKET, storage: () => getSupabaseAdmin().storage as never });
    } else {
      // Honest dark state: every byte read/write refuses; reads of rows are not
      // attempted either, so an unapplied migration cannot surface as an error.
      store = createDarkStore();
      bytes = notConfiguredResourceBytesStore;
    }
    return createResourceHubService({ store, bytes, now, newId });
  }
  if (!previewService) {
    previewService = createResourceHubService({ store: createInMemoryResourceHubStore(), bytes: createMemoryResourceBytesStore(), now, newId });
  }
  return previewService;
}

/** The store used while the hub is disabled: reads answer empty, writes refuse. */
function createDarkStore(): ResourceHubStore {
  const refuse = async (): Promise<never> => {
    throw new ResourceStoreNotConfigured("Resource hub is not enabled.");
  };
  return {
    async getResource() {
      return null;
    },
    async listResources() {
      return [];
    },
    insertResource: refuse,
    async listVersions() {
      return [];
    },
    async getVersion() {
      return null;
    },
    async findVersionByUploadKey() {
      return null;
    },
    insertVersion: refuse,
    updateVersion: refuse,
    publishVersion: refuse,
    withdrawVersion: refuse,
    async listPublished() {
      return [];
    },
    async recordDelivery() {
      // Nothing to record while dark; the request is refused as not found.
    },
    async listDeliveries() {
      return [];
    },
  };
}

/** Test seam: forget the preview composition. */
export function resetPreviewResourceHub(): void {
  previewService = null;
}
