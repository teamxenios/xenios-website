import type { Express } from "express";
import type { CatalogResponse } from "@shared/research/types";
import { requireActiveMember } from "./member-auth";
import { products } from "./products-data";

// ---------------------------------------------------------------------------
// Member-scoped access APIs (ACCOUNT-EMAIL-SYSTEMS-001). The ONE
// requireActiveMember implementation lives in member-auth.ts (shared with the
// member-authed research APIs: catalog, orders); it is re-exported here for
// this lane's importers.
// ---------------------------------------------------------------------------

export { requireActiveMember } from "./member-auth";

// Member-scoped catalog: the canonical member-route alias for the private
// catalog. Same guard, same data as GET /api/research/catalog (which PR #23
// moved behind active membership); this endpoint exists so member-facing
// clients can stay entirely on the /api/research/member/* contract.
//
// HELD, mirroring the primary door exactly (4c921ba, "Hold legacy Research
// catalog pricing and ordering"). That commit unconditionally withheld
// priceCents and compareAtCents and pinned commerce to false on
// GET /api/research/catalog, but this alias serves the SAME products-data
// array and was missed: an executed probe on the held main returned 15 priced
// products here, including the three units whose strength the signed supplier
// master contradicts (tesamorelin 20999, nad-plus 15999, ss-31 22999), while
// the sibling door withheld every amount. Two doors onto one array must
// disagree about nothing. The hold is deliberate and unconditional, not
// flag-driven; it lifts only when legacy pricing is retired for Product
// Control, where the dispute machinery applies.
export function registerMemberAccessApi(app: Express) {
  app.get("/api/research/member/catalog", requireActiveMember, (_req, res) => {
    // The canonical private-boundary header set (member-catalog-routes.ts
    // privateHeaders): member content must never be cached, leak a referrer,
    // or be indexed. CODEX-RM flagged the missing set on the partner surface
    // in the #243 disposition; the same rule holds here.
    res.set("Cache-Control", "no-store");
    res.set("Pragma", "no-cache");
    res.set("Referrer-Policy", "no-referrer");
    res.set("X-Robots-Tag", "noindex, nofollow");
    const body: CatalogResponse = {
      products: products.map((product) => ({ ...product, priceCents: null, compareAtCents: null })),
      commerce: { research: false, consumer: false },
      email: "research@xeniostechnology.com",
    };
    res.json(body);
  });
}
