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
export function registerMemberAccessApi(app: Express) {
  app.get("/api/research/member/catalog", requireActiveMember, (_req, res) => {
    res.set("Cache-Control", "no-store");
    const body: CatalogResponse = {
      products,
      commerce: {
        research: process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED === "true",
        consumer: process.env.NEXT_PUBLIC_CONSUMER_COMMERCE_ENABLED === "true",
      },
      email: "research@xeniostechnology.com",
    };
    res.json(body);
  });
}
