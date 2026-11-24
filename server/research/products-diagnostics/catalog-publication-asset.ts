import { createHash } from "node:crypto";
import type { Request, Response } from "express";

const UUID = "[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}";
const ASSET_PATH = new RegExp(`^/api/research/catalog-media/(${UUID})/(${UUID})$`);
const UUID_VALUE = new RegExp(`^${UUID}$`);
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_BYTES = 10 * 1024 * 1024;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const uuid = (value: unknown): value is string => typeof value === "string" && UUID_VALUE.test(value) && value !== NIL_UUID;

export interface CatalogAssetSubject {
  readonly offeringId: string;
  readonly offeringVariantId: string;
  readonly productId: string;
  readonly variantId: string;
}
export interface CatalogAssetSelection extends CatalogAssetSubject {
  readonly revisionId: string;
  readonly assetId: string;
}

/** Byte verification is not publication or rights authority. */
export interface CatalogAssetBytes {
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly bytes: Uint8Array;
}

export function parseCatalogAssetPath(raw: unknown): { revisionId: string; assetId: string } | null {
  if (typeof raw !== "string") return null;
  const match = ASSET_PATH.exec(raw);
  return match && uuid(match[1]) && uuid(match[2]) ? { revisionId: match[1], assetId: match[2] } : null;
}

function validSubject(value: CatalogAssetSubject): boolean {
  return /^mo_[0-9a-f]+$/.test(value.offeringId) && /^mov_[0-9a-f]+$/.test(value.offeringVariantId)
    && uuid(value.productId) && uuid(value.variantId);
}

function signature(type: string, bytes: Uint8Array): boolean {
  if (type === "image/png") return [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b);
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/webp") return bytes.length >= 12
    && Buffer.from(bytes.subarray(0,4)).toString("ascii") === "RIFF"
    && Buffer.from(bytes.subarray(8,12)).toString("ascii") === "WEBP";
  return false;
}

/** Copies before hashing/sending; mutable storage buffers cannot change the verified response. */
export function verifyCatalogAssetBytes(value: CatalogAssetBytes): { contentType: string; bytes: Buffer } | null {
  if (!value || !["image/jpeg","image/png","image/webp"].includes(value.contentType)
    || !Number.isSafeInteger(value.sizeBytes) || value.sizeBytes <= 0 || value.sizeBytes > MAX_BYTES
    || typeof value.sha256 !== "string" || !SHA256.test(value.sha256)
    || !(value.bytes instanceof Uint8Array) || value.bytes.byteLength !== value.sizeBytes
    || typeof SharedArrayBuffer !== "undefined" && value.bytes.buffer instanceof SharedArrayBuffer) return null;
  const bytes = Buffer.from(value.bytes);
  if (!signature(value.contentType, bytes) || createHash("sha256").update(bytes).digest("hex") !== value.sha256) return null;
  return { contentType: value.contentType, bytes };
}

export function catalogAssetHeaders(res: Response): void {
  res.set({ "Cache-Control": "no-store", "Pragma": "no-cache", "Expires": "0",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow", "Content-Security-Policy": "default-src 'none'; sandbox" });
}

/** Result of the storage owner's fresh current-publication + rights read. */
export interface PublishedCatalogAsset extends CatalogAssetBytes {
  readonly identity: Readonly<CatalogAssetSubject>;
  readonly revisionId: string;
  readonly generation: number;
  readonly assetId: string;
  readonly mediaId: string;
  readonly mediaVersion: number;
  readonly width: number;
  readonly height: number;
  readonly rightsApprovalSha256: string;
}
export interface CatalogAssetDelivery {
  /** Four IDs selected by composition, never by browser params/query/body. */
  readonly selected: Readonly<CatalogAssetSubject> | null;
  /**
   * Must read current publication/rights on every call and recheck them after
   * private download. Null includes withdrawn, superseded, rolled-back URLs,
   * changed media/rights/binding, or unavailable authority. Never memoize.
   */
  readPublishedAsset(input: Readonly<CatalogAssetSelection>): Promise<PublishedCatalogAsset | null>;
}

function sameSubject(a: CatalogAssetSubject | undefined, b: CatalogAssetSubject): boolean {
  return a?.offeringId === b.offeringId && a.offeringVariantId === b.offeringVariantId
    && a.productId === b.productId && a.variantId === b.variantId;
}
function positive(value: number, maximum = Number.MAX_SAFE_INTEGER): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= maximum;
}

/** Unmounted first-party handler. No bucket, key, redirect or action input is public. */
export function createCatalogAssetHandler(deps: CatalogAssetDelivery) {
  const selected = deps.selected ? Object.freeze({ offeringId: deps.selected.offeringId,
    offeringVariantId: deps.selected.offeringVariantId, productId: deps.selected.productId,
    variantId: deps.selected.variantId }) : null;
  return async (req: Request, res: Response): Promise<void> => {
    catalogAssetHeaders(res);
    // Use end(), not Express send(): conditional requests must never become304
    // and Express must not synthesize an ETag after the fresh authority check.
    const refuse = (status: number) => { res.status(status).end(); };
    if (req.method !== "GET" && req.method !== "HEAD") { res.set("Allow", "GET, HEAD"); refuse(405); return; }
    const path = parseCatalogAssetPath(req.originalUrl);
    if (!path) { refuse(404); return; }
    if (!selected || !validSubject(selected)) { refuse(404); return; }
    const selector = Object.freeze({ ...selected, ...path });
    try {
      const asset = await deps.readPublishedAsset(selector);
      if (!asset || !sameSubject(asset.identity, selected) || asset.revisionId !== path.revisionId
        || asset.assetId !== path.assetId || !uuid(asset.mediaId) || !positive(asset.generation)
        || !positive(asset.mediaVersion) || !positive(asset.width,20000) || !positive(asset.height,20000)
        || typeof asset.rightsApprovalSha256 !== "string" || !SHA256.test(asset.rightsApprovalSha256)) { refuse(404); return; }
      const checked = verifyCatalogAssetBytes(asset);
      if (!checked) { refuse(404); return; }
      res.status(200);
      res.set({ "Content-Type": checked.contentType, "Content-Length": String(checked.bytes.length),
        "Content-Disposition": "inline" });
      res.end(req.method === "HEAD" ? undefined : checked.bytes);
    } catch {
      // No backend errors, paths, object identifiers or rights details escape.
      refuse(503);
    }
  };
}
