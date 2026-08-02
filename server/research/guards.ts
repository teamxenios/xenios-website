import type { Express } from "express";
import { requireActiveMember } from "./member-auth";
import { buildCatalogResponse } from "./catalog-response";

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
    // B7. This alias served the priced array while commerce.research reported
    // false, so the amounts the sibling door withheld were still reachable one
    // path over. Both doors now build the body in one place.
    res.json(buildCatalogResponse());
  });
}
