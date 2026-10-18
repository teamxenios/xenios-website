import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
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
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function ipv6Words(hostname: string): number[] | null {
  const value = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(value) !== 6 || value.includes(".")) return null;
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = halves.length === 2 ? 8 - left.length - right.length : 0;
  if (missing < 0 || (halves.length === 1 && left.length !== 8)) return null;
  const words = [...left, ...Array(missing).fill("0"), ...right].map((part) => Number.parseInt(part, 16));
  return words.length === 8 && words.every((word) => Number.isInteger(word) && word >= 0 && word <= 0xffff)
    ? words
    : null;
}

function isPrivateOrReservedIpv6(hostname: string): boolean {
  const words = ipv6Words(hostname);
  if (!words) return true;
  const [first, second, third] = words;
  const ipv4Mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  if (ipv4Mapped) return true;
  if (words.slice(0, 7).every((word) => word === 0) && (words[7] === 0 || words[7] === 1)) return true;
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xffc0) === 0xfec0) return true;
  if ((first & 0xff00) === 0xff00) return true;

  // Fail closed: public IPv6 download targets must be global unicast (2000::/3),
  // excluding the IETF special-purpose and documentation blocks below.
  if ((first & 0xe000) !== 0x2000) return true;
  if (first === 0x2001 && (second & 0xfe00) === 0) return true;
  if (first === 0x2001 && second === 0x0db8) return true;
  if (first === 0x2001 && second === 0x0002 && third === 0) return true;
  if (first === 0x2002 || (first & 0xfff0) === 0x3ff0) return true;
  return false;
}

export function assertPublicImageUrl(value: string): URL {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (url.protocol !== "https:") throw new Error("Image URL must use HTTPS");
  if (url.username || url.password) throw new Error("Image URL must not contain credentials");
  const ipVersion = isIP(hostname);
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    (ipVersion === 4 && isPrivateIpv4(hostname)) ||
    (ipVersion === 6 && isPrivateOrReservedIpv6(hostname))
  ) {
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
  if (!rightsAllowIngestion(input.record.rights)) {
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
