import SeoHead from "@/components/SeoHead";
import { StorefrontCatalogSurface } from "./StorefrontCatalogSurface";

/**
 * The routed entry point for the public catalog.
 *
 * It exists so the section router stays one lazy line, and it holds no token:
 * this surface is for signed-out visitors and authenticates nothing.
 *
 * NO CLIENT FEATURE FLAG. The authority is the server, which fails closed:
 * RESEARCH_PUBLIC_STOREFRONT_ENABLED must be exactly "true" or every
 * storefront door answers its refusal, and the surface renders the "not open
 * yet" state that copy was written for. A second switch in the browser could
 * only hide a surface the server had already opened.
 *
 * The research tree is still noindex (SEN-0027): the section router asserts
 * the meta tag and production sends the x-robots-tag header. This page is
 * publicly REACHABLE, not publicly indexed.
 */
export default function StorefrontCatalogRoute() {
  return (
    <>
      <SeoHead
        title="Research catalog, xenios research"
        description="Browse the Xenios Research catalog."
        path="/research/catalog"
        robots="noindex, nofollow"
      />
      <StorefrontCatalogSurface />
    </>
  );
}
