import { useEffect, useState } from "react";
import {
  parseProductMedia, PRODUCT_MEDIA_FALLBACK, type ProductMediaDescriptor,
} from "@shared/research/product-media";
import "./product-media.css";

function MediaSlot({ media, loading }: {
  media: ProductMediaDescriptor | null; loading: "lazy" | "eager";
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!media?.expiresAt) return;
    const delay = Date.parse(media.expiresAt) - Date.now();
    if (delay <= 0) { setFailed(true); return; }
    const timer = window.setTimeout(() => setFailed(true), delay);
    return () => window.clearTimeout(timer);
  }, [media?.expiresAt]);
  const visible = !failed && media !== null;
  return (
    <figure className="xenios-product-media" data-media-id={visible ? media.mediaId : undefined}
      data-content-sha256={visible ? media.contentSha256 : undefined}>
      <div className="xenios-product-media__square">
        {visible ? (
          <img src={media.href} alt={media.altText} width={media.width} height={media.height}
            loading={loading} decoding="async" referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            onLoad={(event) => {
              if (event.currentTarget.naturalWidth !== media.width ||
                event.currentTarget.naturalHeight !== media.height) setFailed(true);
            }} />
        ) : <p className="xenios-product-media__fallback">{PRODUCT_MEDIA_FALLBACK}</p>}
      </div>
      {visible && media.illustrative && <figcaption>Illustrative image</figcaption>}
    </figure>
  );
}

/** No commerce inputs or callbacks: this component can only display or fall back. */
export function ProductMedia({ media, productId, variantId, loading = "lazy" }: {
  media?: unknown; productId: string; variantId?: string | null; loading?: "lazy" | "eager";
}) {
  const parsed = parseProductMedia(media, { productId, variantId });
  // A late error from a replaced image cannot poison the next descriptor.
  const identity = parsed ? JSON.stringify(parsed) : "fallback";
  return <MediaSlot key={identity} media={parsed} loading={loading} />;
}
