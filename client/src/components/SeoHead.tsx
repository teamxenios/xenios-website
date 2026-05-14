import { useEffect } from "react";

interface Props {
  title: string;
  description: string;
  path: string;
}

const SITE = "https://xeniostechnology.com";

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

export default function SeoHead({ title, description, path }: Props) {
  useEffect(() => {
    document.title = title;
    const url = `${SITE}${path}`;

    ensureMeta('meta[name="description"]', { name: "description", content: description });
    ensureMeta('meta[property="og:title"]', { property: "og:title", content: title });
    ensureMeta('meta[property="og:description"]', { property: "og:description", content: description });
    ensureMeta('meta[property="og:url"]', { property: "og:url", content: url });
    ensureMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title });
    ensureMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });

    ensureLink("canonical", url);
    ensureLink("alternate", url, { hreflang: "en-us" });
    ensureLink("alternate", url, { hreflang: "x-default" });
  }, [title, description, path]);

  return null;
}
