import { useEffect } from "react";
import { EARLY_ACCESS_SOCIAL_IDENTITY, HOME_SOCIAL_IDENTITY } from "../../../shared/research/social-metadata";

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

// The site default, matching the literal static tag in client/index.html.
// Kept as a hardcoded constant (rather than read from the DOM at module
// load) so an indexable page always gets this exact directive regardless of
// whether the static tag happened to load first; the two are asserted to
// match by a dedicated test rather than relying on load order.
export const DEFAULT_ROBOTS = "index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1";

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
    const entry = /^\/earlyaccess\/?(?:[?#]|$)/.test(path) ? EARLY_ACCESS_SOCIAL_IDENTITY : null;
    const identity = entry ?? (/^\/(?:[?#]|$)/.test(path) ? HOME_SOCIAL_IDENTITY : null);
    const selectedTitle = identity?.title ?? title;
    const selectedDescription = identity?.description ?? description;
    const selectedRobots = entry ? "noindex,nofollow,noarchive" : robots;
    document.title = selectedTitle;
    const url = identity?.url ?? `${SITE}${path}`;

    ensureMeta('meta[name="description"]', { name: "description", content: selectedDescription });
    ensureMeta('meta[property="og:title"]', { property: "og:title", content: selectedTitle });
    ensureMeta('meta[property="og:description"]', { property: "og:description", content: selectedDescription });
    ensureMeta('meta[property="og:url"]', { property: "og:url", content: url });
    ensureMeta('meta[property="og:type"]', { property: "og:type", content: "website" });
    ensureMeta('meta[property="og:image"]', { property: "og:image", content: identity?.image ?? OG_IMAGE });
    ensureMeta('meta[property="og:image:width"]', { property: "og:image:width", content: "1200" });
    ensureMeta('meta[property="og:image:height"]', { property: "og:image:height", content: "630" });
    ensureMeta('meta[property="og:image:type"]', { property: "og:image:type", content: "image/png" });
    ensureMeta('meta[property="og:image:alt"]', { property: "og:image:alt", content: identity?.imageAlt ?? selectedTitle });
    ensureMeta('meta[property="og:site_name"]', { property: "og:site_name", content: "xenios" });
    ensureMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    ensureMeta('meta[name="twitter:site"]', { name: "twitter:site", content: "@officialxenios" });
    ensureMeta('meta[name="twitter:title"]', { name: "twitter:title", content: selectedTitle });
    ensureMeta('meta[name="twitter:description"]', { name: "twitter:description", content: selectedDescription });
    ensureMeta('meta[name="twitter:image"]', { name: "twitter:image", content: identity?.image ?? OG_IMAGE });
    ensureMeta('meta[name="twitter:image:alt"]', { name: "twitter:image:alt", content: identity?.imageAlt ?? selectedTitle });

    if (selectedRobots) {
      // A noindex page should not also endorse a canonical URL for search
      // engines to index, so skip canonical/hreflang and clear any that a
      // prior page left behind in this SPA session.
      ensureMeta('meta[name="robots"]', { name: "robots", content: selectedRobots });
      removeEl('link[rel="canonical"]');
      removeEl('link[rel="alternate"][hreflang="en-us"]');
      removeEl('link[rel="alternate"][hreflang="x-default"]');
    } else {
      // Restore the site default rather than deleting the tag: an indexable
      // page must never end up with NO robots meta at all, which would
      // silently drop max-image-preview:large (and the rest of the default
      // directive) sitewide.
      ensureMeta('meta[name="robots"]', { name: "robots", content: DEFAULT_ROBOTS });
      ensureLink("canonical", url);
      ensureLink("alternate", url, { hreflang: "en-us" });
      ensureLink("alternate", url, { hreflang: "x-default" });
    }

    if (entry) {
      document.head.querySelectorAll('script[type="application/ld+json"]').forEach(node => node.remove());
      return;
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
      description: HOME_SOCIAL_IDENTITY.description,
    });
  }, [title, description, path, robots]);

  return null;
}
