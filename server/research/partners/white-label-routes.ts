import type { Express, NextFunction, Request, Response } from "express";
import type {
  WhiteLabelApplicationInput,
  WhiteLabelBrandInput,
  WhiteLabelFulfillmentInput,
  WhiteLabelPackagingReviewInput,
  WhiteLabelQuoteRequestInput,
  WhiteLabelSelectionInput,
  WhiteLabelSupportInput,
} from "@shared/research/partners/white-label";
import type { WhiteLabelPartnerService, WhiteLabelResult } from "./white-label";

export type WhiteLabelMemberGuard = (req: Request, res: Response, next: NextFunction) => unknown;

function privateHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Robots-Tag", "noindex, nofollow");
  next();
}

export function whiteLabelMemberId(req: Request): string | null {
  const member = (req as Request & { researchMember?: Record<string, unknown> }).researchMember;
  const value = member?.id ?? member?.member_id ?? member?.memberId;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function statusFor(result: WhiteLabelResult<unknown>): number {
  if (result.ok) return 200;
  if (result.code === "white_label_not_found") return 404;
  if (result.code === "white_label_forbidden" || result.code === "white_label_not_approved") return 403;
  if (result.code === "white_label_version_conflict") return 409;
  if (result.code === "white_label_unavailable") return 503;
  return 400;
}

function send<T>(res: Response, result: WhiteLabelResult<T>, key: string): void {
  if (result.ok) {
    res.status(200).json({ ok: true, [key]: result.value });
    return;
  }
  res.status(statusFor(result)).json({ ok: false, code: result.code, message: result.message });
}

function withMember(
  serviceCall: (memberId: string, req: Request) => Promise<WhiteLabelResult<unknown>>,
  key: string,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const memberId = whiteLabelMemberId(req);
    if (!memberId) {
      res.status(403).json({ ok: false, code: "white_label_forbidden" });
      return;
    }
    try {
      send(res, await serviceCall(memberId, req), key);
    } catch {
      res.status(503).json({ ok: false, code: "white_label_unavailable" });
    }
  };
}

export function registerWhiteLabelPartnerRoutes(
  app: Express,
  service: WhiteLabelPartnerService,
  requireMember: WhiteLabelMemberGuard,
): void {
  const base = "/api/research/partner/organizations/white-label";

  app.get(base, privateHeaders, requireMember, withMember((memberId) => service.get(memberId), "workspace"));

  app.get(
    `${base}/variants`,
    privateHeaders,
    requireMember,
    withMember(async (memberId) => {
      const result = await service.get(memberId);
      return result.ok ? { ok: true, value: result.value.variants } : result;
    }, "variants"),
  );

  app.post(
    `${base}/application`,
    privateHeaders,
    requireMember,
    withMember((memberId, req) => service.apply(memberId, req.body as WhiteLabelApplicationInput), "result"),
  );

  app.patch(
    `${base}/brand`,
    privateHeaders,
    requireMember,
    withMember((memberId, req) => service.updateBrand(memberId, req.body as WhiteLabelBrandInput), "result"),
  );

  app.post(
    `${base}/selections`,
    privateHeaders,
    requireMember,
    withMember((memberId, req) => service.selectVariant(memberId, req.body as WhiteLabelSelectionInput), "result"),
  );

  app.post(
    `${base}/quotes`,
    privateHeaders,
    requireMember,
    withMember((memberId, req) => service.requestQuote(memberId, req.body as WhiteLabelQuoteRequestInput), "result"),
  );

  app.post(
    `${base}/packaging-review`,
    privateHeaders,
    requireMember,
    withMember(
      (memberId, req) => service.submitPackaging(memberId, req.body as WhiteLabelPackagingReviewInput),
      "result",
    ),
  );

  app.patch(
    `${base}/fulfillment`,
    privateHeaders,
    requireMember,
    withMember((memberId, req) => service.setFulfillment(memberId, req.body as WhiteLabelFulfillmentInput), "result"),
  );

  app.post(
    `${base}/support`,
    privateHeaders,
    requireMember,
    withMember((memberId, req) => service.openSupport(memberId, req.body as WhiteLabelSupportInput), "result"),
  );
}
