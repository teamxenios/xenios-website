import { useState } from "react";
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
const bpc157PackshotVariantId = "mov_ca3e45ae9712aee91430";
const bpc157Packshot = "/research/product-media/bpc-157-packshot.webp";

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
}: {
  productName: string;
  variantIds: readonly string[];
  detail?: boolean;
}) {
  const mapped = sharedFormat(variantIds);
  const [failedFormat, setFailedFormat] = useState<MediaFormat | null>(null);
  const format = mapped === failedFormat ? "unknown" : mapped;
  const [failedPackshot, setFailedPackshot] = useState(false);
  const showPackshot = !failedPackshot && variantIds.length === 1 && variantIds[0] === bpc157PackshotVariantId;

  return (
    <figure className={"m-0 grid w-full min-w-0 gap-1" + (detail ? " max-w-[26rem]" : "")}>
      <div className={"grid aspect-[4/3] min-w-0 place-items-center overflow-hidden rounded-xl" + (showPackshot ? " bg-[#f1f1f4]" : " bg-[#141329] p-3")}>
        <img
          key={showPackshot ? bpc157Packshot : undefined}
          src={showPackshot ? bpc157Packshot : "/research/product-media/" + format + ".svg"}
          alt={productName + " illustration, " + formatLabels[format]}
          width={128}
          height={128}
          loading={detail ? "eager" : "lazy"}
          decoding="async"
          className="block h-full max-h-52 w-full max-w-52 object-contain"
          data-testid="product-media-image"
          onError={showPackshot ? () => setFailedPackshot(true)
            : format === "unknown" ? undefined : () => setFailedFormat(format)}
        />
      </div>
      <figcaption className="body-s min-w-0 break-words text-ink-mute">
        {format === "unknown" ? "Illustration · format unconfirmed" : "Representative illustration"}
        {showPackshot && " · Conceptual packaging"}
      </figcaption>
    </figure>
  );
}
