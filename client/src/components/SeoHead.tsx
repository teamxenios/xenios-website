import { useEffect } from "react";

interface Props {
  title: string;
  description: string;
  path: string;
  /**
   * Optional robots directive (e.g. "noindex, nofollow"). Omit for the
   * default indexable behavior. When set, the canonical and hreflang
   * alternates are skipped, since a page telling search engines not to
   * index it should not also be endorsing a canonical URL for indexing.
   */
  robots?: string;
}

const SITE = "https://xeniostechnology.com";
const OG_IMAGE = `${SITE}/og/xenios-og-image-v2.png`;

function ensureMeta(selector: string, attrs: Record<string, string>) {
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([k, v]) => el!.setAttribute(k, v));
}

function ensureLink(rel: string, href: string, extraAttrs: Record<string, string> = {}) {
  const sel = `link[rel="${rel}"]${extraAttrs.hreflang ? `[hreflang="${extraAttrs.hreflang}"]` : ""}`;
  let el = document.head.querySelector(sel) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
  Object.entries(extraAttrs).forEach(([k, v]) => el!.setAttribute(k, v));
}

function removeEl(selector: string) {
  document.head.querySelector(selector)?.remove();
}

function ensureJsonLd(id: string, data: Record<string, unknown>) {
  let el = document.head.querySelector(`script[data-jsonld="${id}"]`) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.dataset.jsonld = id;
    document.head.appendChild(el);
  }
  el.text = JSON.stringify(data);
}

export default function SeoHead({ title, description, path, robots }: Props) {
  useEffect(() => {
    document.title = title;
    const url = `${SITE}${path}`;

    ensureMeta('meta[name="description"]', { name: "description", content: description });
    ensureMeta('meta[property="og:title"]', { property: "og:title", content: title });
    ensureMeta('meta[property="og:description"]', { property: "og:description", content: description });
    ensureMeta('meta[property="og:url"]', { property: "og:url", content: url });
    ensureMeta('meta[property="og:type"]', { property: "og:type", content: "website" });
    ensureMeta('meta[property="og:image"]', { property: "og:image", content: OG_IMAGE });
    ensureMeta('meta[property="og:site_name"]', { property: "og:site_name", content: "xenios" });
    ensureMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    ensureMeta('meta[name="twitter:site"]', { name: "twitter:site", content: "@officialxenios" });
    ensureMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title });
    ensureMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
    ensureMeta('meta[name="twitter:image"]', { name: "twitter:image", content: OG_IMAGE });

    if (robots) {
      // A noindex page should not also endorse a canonical URL for search
      // engines to index, so skip canonical/hreflang and clear any that a
      // prior page left behind in this SPA session.
      ensureMeta('meta[name="robots"]', { name: "robots", content: robots });
      removeEl('link[rel="canonical"]');
      removeEl('link[rel="alternate"][hreflang="en-us"]');
      removeEl('link[rel="alternate"][hreflang="x-default"]');
    } else {
      removeEl('meta[name="robots"]');
      ensureLink("canonical", url);
      ensureLink("alternate", url, { hreflang: "en-us" });
      ensureLink("alternate", url, { hreflang: "x-default" });
    }

    ensureJsonLd("organization", {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Xenios Technologies, Inc.",
      alternateName: "xenios",
      url: SITE,
      email: "team@xeniostechnology.com",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Austin",
        addressRegion: "TX",
        addressCountry: "US",
      },
      sameAs: [
        "https://www.instagram.com/officialxenios/",
        "https://www.linkedin.com/company/officialxenios",
      ],
    });

    ensureJsonLd("website", {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "xenios",
      url: SITE,
      description: "AI workspace for health and performance professionals.",
    });
  }, [title, description, path, robots]);

  return null;
}
