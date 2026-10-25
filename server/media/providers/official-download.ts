import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SupplementMediaRecord } from "../official-sources/contracts";
import type { FetchLike } from "../official-sources/http";
import { rightsAllowIngestion } from "../rights/policy";

const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024;
const MIME_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function isPrivateIpv4(hostname: string): boolean {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const [a, b] = match.slice(1).map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function assertPublicImageUrl(value: string): URL {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:") throw new Error("Image URL must use HTTPS");
  if (url.username || url.password) throw new Error("Image URL must not contain credentials");
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname === "::1" || isPrivateIpv4(hostname)) {
    throw new Error("Image URL must not target a local or private host");
  }
  url.hash = "";
  return url;
}

export function validateImageSignature(contentType: string, bytes: Uint8Array): void {
  if (contentType === "image/jpeg" && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return;
  if (contentType === "image/png" && bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index])) return;
  if (contentType === "image/webp" && bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return;
  throw new Error("Downloaded bytes do not match the declared image format");
}

export interface DownloadedOfficialOriginal {
  storagePath: string;
  sourceHash: string;
  contentType: string;
  sizeBytes: number;
  duplicateOf: string | null;
}

export async function downloadApprovedOfficialOriginal(input: {
  record: SupplementMediaRecord;
  outputDirectory: string;
  knownHashes?: ReadonlyMap<string, string>;
  fetcher?: FetchLike;
  write?: (filePath: string, bytes: Uint8Array) => Promise<void>;
}): Promise<DownloadedOfficialOriginal> {
  if (!rightsAllowIngestion(input.record.rights.status)) {
    throw new Error("Official original download is forbidden until media-use rights are approved");
  }
  if (!input.record.sourceImageUrl) throw new Error("Official source image URL is missing");
  let url = assertPublicImageUrl(input.record.sourceImageUrl);
  const fetcher = input.fetcher ?? globalThis.fetch;
  let response: Response | null = null;
  for (let redirects = 0; redirects <= 2; redirects += 1) {
    response = await fetcher(url, {
      method: "GET",
      redirect: "manual",
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg",
        "User-Agent": "XeniosOfficialMediaIngestion/1.0 (+authorized-source-audit)",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 2) throw new Error("Image redirect could not be followed safely");
      url = assertPublicImageUrl(new URL(location, url).toString());
      continue;
    }
    break;
  }
  if (!response?.ok) throw new Error(`Official image returned HTTP ${response?.status ?? "unknown"}`);
  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
  const extension = MIME_EXTENSIONS.get(contentType);
  if (!extension) throw new Error(`Unsupported official image content type: ${contentType || "missing"}`);
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_ORIGINAL_BYTES) throw new Error("Official image exceeds the 25 MB source limit");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_ORIGINAL_BYTES) throw new Error("Official image size is invalid");
  validateImageSignature(contentType, bytes);
  const sourceHash = createHash("sha256").update(bytes).digest("hex");
  const duplicateOf = input.knownHashes?.get(sourceHash) ?? null;
  const storagePath = path.join(input.outputDirectory, `${input.record.assetId}__official-original.${extension}`);
  if (!duplicateOf) {
    await mkdir(input.outputDirectory, { recursive: true });
    await (input.write ?? (async (filePath, value) => writeFile(filePath, value)))(storagePath, bytes);
  }
  return { storagePath, sourceHash, contentType, sizeBytes: bytes.length, duplicateOf };
}
