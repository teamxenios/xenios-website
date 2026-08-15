import type { AssistedOrderDocumentStore } from "./ports";

export type SupabaseStorageSignedUploadResponse = Readonly<{
  data: null | Readonly<{ signedUrl: string; path?: string; token?: string }>;
  error: null | Readonly<{ message: string }>;
}>;

export type SupabaseStorageSignedDownloadResponse = Readonly<{
  data: null | Readonly<{ signedUrl: string }>;
  error: null | Readonly<{ message: string }>;
}>;

export type SupabaseStorageBucket = Readonly<{
  createSignedUploadUrl(path: string): Promise<SupabaseStorageSignedUploadResponse>;
  createSignedUrl(
    path: string,
    expiresIn: number,
  ): Promise<SupabaseStorageSignedDownloadResponse>;
}>;

export type SupabaseStorageClient = Readonly<{
  from(bucket: string): SupabaseStorageBucket;
}>;

export class SupabaseAssistedOrderDocumentStore
  implements AssistedOrderDocumentStore
{
  public constructor(
    private readonly storage: SupabaseStorageClient,
    private readonly bucketName: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async createUpload(input: {
    objectPath: string;
    mimeType: string;
    sizeBytes: number;
    expiresInSeconds: number;
  }): Promise<{
    documentId: string;
    uploadUrl: string;
    objectPath: string;
    expiresAt: string;
    requiredHeaders: Readonly<Record<string, string>>;
  }> {
    const result = await this.storage
      .from(this.bucketName)
      .createSignedUploadUrl(input.objectPath);
    if (result.error || !result.data?.signedUrl) {
      throw new Error(
        `Unable to create a private document upload: ${
          result.error?.message ?? "missing signed URL"
        }`,
      );
    }
    return Object.freeze({
      documentId: "assigned-by-service",
      uploadUrl: result.data.signedUrl,
      objectPath: input.objectPath,
      expiresAt: new Date(
        this.now().getTime() + input.expiresInSeconds * 1_000,
      ).toISOString(),
      requiredHeaders: Object.freeze({
        "content-type": input.mimeType,
        "x-upsert": "false",
      }),
    });
  }

  public async createDownload(input: {
    objectPath: string;
    expiresInSeconds: number;
  }): Promise<{ url: string; expiresAt: string }> {
    const result = await this.storage
      .from(this.bucketName)
      .createSignedUrl(input.objectPath, input.expiresInSeconds);
    if (result.error || !result.data?.signedUrl) {
      throw new Error(
        `Unable to create a private document download: ${
          result.error?.message ?? "missing signed URL"
        }`,
      );
    }
    return Object.freeze({
      url: result.data.signedUrl,
      expiresAt: new Date(
        this.now().getTime() + input.expiresInSeconds * 1_000,
      ).toISOString(),
    });
  }
}
