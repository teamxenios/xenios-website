import { useState } from "react";
import type { ReviewedProductMedia } from "@shared/research/master-offerings/approved-content";
import media from "./product-media-format.generated.json";

const formatLabels = {
  vial: "vial",
  capsule: "capsule",
  tablet: "tablet",
  topical: "topical formulation",
  liquid: "liquid formulation",
  unknown: "format unconfirmed",
} as const;

type MediaFormat = keyof typeof formatLabels;
const formats: Readonly<Partial<Record<string, string>>> =
  media.formatByVariantId;
function sharedFormat(variantIds: readonly string[]): MediaFormat {
  const first = formats[variantIds[0]];
  if (!first || !Object.prototype.hasOwnProperty.call(formatLabels, first)) return "unknown";
  return variantIds.every((id) => formats[id] === first) ? first as MediaFormat : "unknown";
}

/** Representative artwork keyed to the existing catalog variant, never a purchase signal. */
export function ProductMedia({
  productName,
  variantIds,
  detail = false,
  reviewedMedia,
}: {
  productName: string;
  variantIds: readonly string[];
  detail?: boolean;
  reviewedMedia?: ReviewedProductMedia;
}) {
  const mapped = sharedFormat(variantIds);
  const [failedFormat, setFailedFormat] = useState<MediaFormat | null>(null);
  const format = mapped === failedFormat ? "unknown" : mapped;
  const [failedPackshot, setFailedPackshot] = useState<string | null>(null);
  const candidate = reviewedMedia?.primary;
  const packshot = candidate?.href === failedPackshot ? undefined : candidate;
  const labelPreview = packshot && reviewedMedia?.labelPreview;

  return (
    <figure className={"m-0 grid w-full min-w-0 gap-1" + (detail ? " max-w-[26rem]" : "")}>
      <div className={"relative grid aspect-[4/3] min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] place-items-center overflow-hidden rounded-xl" + (packshot ? " bg-[#f1f1f4]" : " bg-[#141329] p-3")}>
        <img
          key={packshot?.href}
          src={packshot?.href ?? "/research/product-media/" + format + ".svg"}
          alt={packshot?.altText ?? productName + " illustration, " + formatLabels[format]}
          width={packshot?.width ?? 128}
          height={packshot?.height ?? 128}
          loading={detail ? "eager" : "lazy"}
          decoding="async"
          className={packshot
            ? "absolute inset-0 block h-full w-full object-contain"
            : "block h-full min-h-0 max-h-52 w-full min-w-0 max-w-52 object-contain"}
          data-testid="product-media-image"
          onError={packshot ? () => setFailedPackshot(packshot.href)
            : format === "unknown" ? undefined : () => setFailedFormat(format)}
        />
      </div>
      {packshot && reviewedMedia?.packagingDesign && (
        <figcaption className="body-s min-w-0 break-words text-ink-mute">
          Packaging design shown. Current packaging may differ.
        </figcaption>
      )}
      {detail && labelPreview && (
        <a href={labelPreview.href} target="_blank" rel="noreferrer" className="body-s text-ink underline">
          View front label artwork
        </a>
      )}
    </figure>
  );
}
