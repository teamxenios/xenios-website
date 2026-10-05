/** Presentation only. Product Control approval is checked by the server. */
export const PRODUCT_MEDIA_DELIVERY_SIZE = 1024;
export const PRODUCT_MEDIA_ALT_MAX_LENGTH = 500;
export const PRODUCT_MEDIA_MAX_SIGNED_LIFETIME_MS = 300_000;
export const PRODUCT_MEDIA_FALLBACK = "An approved product image is not available.";

export type ProductMediaDescriptor = {
  mediaId: string;
  productId: string;
  variantId: string;
  href: string;
  altText: string;
  filename: string;
  width: number;
  height: number;
  contentSha256: string;
  sourceVersion: string;
  policy: "xenios_public_media_v1" | "xenios_signed_storage_v1";
  illustrative: boolean;
  expiresAt: string | null;
};

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value === value.trim() &&
    value.length > 0 && value.length <= maximum && !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value);
}

export function validProductMediaMetadata(value: {
  variantId?: unknown; width?: unknown; height?: unknown;
  contentSha256?: unknown; illustrative?: unknown; altText?: unknown;
}): boolean {
  return boundedText(value.variantId, 128) &&
    value.width === PRODUCT_MEDIA_DELIVERY_SIZE &&
    value.height === PRODUCT_MEDIA_DELIVERY_SIZE &&
    typeof value.contentSha256 === "string" && /^[a-f0-9]{64}$/.test(value.contentSha256) &&
    typeof value.illustrative === "boolean" &&
    boundedText(value.altText, PRODUCT_MEDIA_ALT_MAX_LENGTH);
}

/** A bad/legacy descriptor removes only the image, never the surrounding item. */
export function parseProductMedia(
  value: unknown,
  expected: {
    productId: string; variantId?: string | null; now?: number;
    /** Only the browser renderer disables this: its clock cannot judge signing lifetime. */
    enforceSigningLifetime?: boolean;
  },
): ProductMediaDescriptor | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const media = value as Record<string, unknown>;
  if (!validProductMediaMetadata(media) || media.productId !== expected.productId ||
    (expected.variantId !== undefined && media.variantId !== expected.variantId) ||
    !boundedText(media.productId, 128) || !boundedText(media.mediaId, 128) ||
    !boundedText(media.sourceVersion, 256) ||
    typeof media.filename !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(media.filename) ||
    typeof media.href !== "string" || media.href.length > 4096) return null;
  try {
    const url = new URL(media.href);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port) return null;
    if (media.policy === "xenios_public_media_v1") {
      if (!(url.hostname === "xeniostechnology.com" || url.hostname.endsWith(".xeniostechnology.com")) ||
        url.search || media.expiresAt !== null) return null;
    } else if (media.policy === "xenios_signed_storage_v1") {
      const expiry = typeof media.expiresAt === "string" ? Date.parse(media.expiresAt) : NaN;
      const now = expected.now ?? Date.now();
      if (!Number.isFinite(now) || !Number.isFinite(expiry) ||
        new Date(expiry).toISOString() !== media.expiresAt || expiry <= now ||
        (expected.enforceSigningLifetime !== false &&
          expiry > now + PRODUCT_MEDIA_MAX_SIGNED_LIFETIME_MS)) return null;
      const prefix = "/storage/v1/object/sign/research-product-media-production/";
      const objectPath = decodeURIComponent(url.pathname.slice(prefix.length));
      if (url.origin !== "https://yvzeduaxbwgcwllhywff.supabase.co" || !url.pathname.startsWith(prefix) ||
        objectPath !== `${media.productId}/${media.mediaId}/${media.filename}` || objectPath.includes("\\") ||
        objectPath.split("/").some((part) => part === "." || part === "..") ||
        Array.from(url.searchParams.keys()).join(",") !== "token" ||
        !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(url.searchParams.get("token") ?? "")) return null;
    } else return null;
  } catch { return null; }
  return {
    mediaId: media.mediaId, productId: media.productId, variantId: media.variantId as string,
    href: media.href, altText: media.altText as string, filename: media.filename,
    width: media.width as number, height: media.height as number,
    contentSha256: media.contentSha256 as string, sourceVersion: media.sourceVersion,
    policy: media.policy, illustrative: media.illustrative as boolean,
    expiresAt: media.expiresAt as string | null,
  };
}
