import type { Express, NextFunction, Request, Response } from "express";
import type { ProductLane } from "@shared/research/catalog";
import { MEMBER_CATALOG_SORTS, type MemberCatalogQuery } from "@shared/research/member-catalog";
import type { MemberRow } from "../member-auth";
import type { MemberCatalogService } from "./member-catalog-service";

type MemberGuard = (
  req: Request,
  res: Response,
  next: NextFunction,
) => unknown;

function privateHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Robots-Tag", "noindex, nofollow");
  next();
}

function memberFrom(req: Request): MemberRow | null {
  return (
    (req as Request & { researchMember?: MemberRow }).researchMember ?? null
  );
}

function queryFrom(req: Request): MemberCatalogQuery {
  const query: MemberCatalogQuery = {};
  if (typeof req.query.query === "string") query.query = req.query.query;
  if (typeof req.query.category === "string") {
    query.category = req.query.category;
  }
  if (typeof req.query.lane === "string") {
    query.lane = req.query.lane as ProductLane | "all";
  }
  if (
    typeof req.query.sort === "string" &&
    (MEMBER_CATALOG_SORTS as readonly string[]).includes(req.query.sort)
  ) {
    query.sort = req.query.sort as MemberCatalogQuery["sort"];
  }
  return query;
}

function unavailable(res: Response): void {
  res.status(503).json({ ok: false, code: "member_catalog_unavailable" });
}

export function registerMemberCatalogApi(
  app: Express,
  service: MemberCatalogService,
  requireActiveMember: MemberGuard,
): void {
  app.get(
    "/api/research/member/products",
    privateHeaders,
    requireActiveMember,
    async (req, res) => {
      const member = memberFrom(req);
      if (!member) {
        res.status(403).json({ ok: false, code: "membership_inactive" });
        return;
      }
      try {
        const catalog = await service.list({
          member,
          query: queryFrom(req),
        });
        res.json({ ok: true, catalog });
      } catch {
        unavailable(res);
      }
    },
  );

  app.get(
    "/api/research/member/products/:slug",
    privateHeaders,
    requireActiveMember,
    async (req, res) => {
      const member = memberFrom(req);
      if (!member) {
        res.status(403).json({ ok: false, code: "membership_inactive" });
        return;
      }
      try {
        const product = await service.detail({
          member,
          slug: String(req.params.slug),
        });
        if (product === null) {
          res.status(404).json({ ok: false, code: "product_not_found" });
          return;
        }
        res.json({ ok: true, product });
      } catch {
        unavailable(res);
      }
    },
  );
}
