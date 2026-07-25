import type { Express, NextFunction, Request, Response } from "express";
import type { ProductMaster } from "./model";
import { summarizeFamilies } from "./product-master";
import type { ExactLotCertificateService } from "./coa";
import type {
  MetabolicInterestService,
  MetabolicPathwayConfig,
  MetabolicPathwayRepository,
} from "./metabolic-care";
import type {
  BiomarkerService,
  SuperpowerOfferRepository,
} from "./diagnostics";
import { SUPPLEMENT_PLACEHOLDERS } from "./supplements";
import {
  STORAGE_ACCESSORY_BOUNDARY,
  STORAGE_AND_ORGANIZATION_ACCESSORIES,
  SUPPORT_CENTER_CATEGORIES,
} from "./support-and-storage";
import { Website3ValidationError } from "./errors";

type Guard = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

export interface Website3Guards {
  requireActiveMember: Guard;
  requireAdmin: Guard;
}

export interface Website3ApiDependencies {
  productMaster: ProductMaster;
  certificates: ExactLotCertificateService;
  pathways: MetabolicPathwayRepository;
  interests: MetabolicInterestService;
  superpower: SuperpowerOfferRepository;
  biomarkers: BiomarkerService;
}

type ResearchRequest = Request & {
  researchMember?: { id?: string; memberId?: string };
  adminEmail?: string;
};

function memberId(req: Request): string | null {
  const member = (req as ResearchRequest).researchMember;
  return member?.id ?? member?.memberId ?? null;
}

function noStore(res: Response): void {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
}

function validation(res: Response, message: string): void {
  res.status(400).json({ ok: false, code: "validation_failed", message });
}

function mutationFailure(res: Response, error: unknown): void {
  if (error instanceof Website3ValidationError) {
    validation(res, error.message);
    return;
  }
  res.status(503).json({
    ok: false,
    code: "persistence_failed",
    message: "The update could not be saved. No successful update was reported.",
  });
}

function publicBiomarker(record: Awaited<ReturnType<BiomarkerService["getOrCreate"]>>) {
  return {
    biomarkerRecordId: record.biomarkerRecordId,
    state: record.state,
    partnerReference: record.partnerReference,
    reportFilename: record.reportFilename,
    consentVersion: record.consentVersion,
    consentedAt: record.consentedAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Isolated Website 3 registration entry point. It receives the merged guards
 * from the integration owner and never defines a parallel authentication path.
 */
export function registerProductsDiagnosticsApi(
  app: Express,
  deps: Website3ApiDependencies,
  guards: Website3Guards,
): void {
  const active = guards.requireActiveMember;
  const admin = guards.requireAdmin;

  app.get("/api/research/product-platform", active, (_req, res) => {
    noStore(res);
    res.json({
      ok: true,
      families: summarizeFamilies(deps.productMaster),
      products: deps.productMaster.products.map((product) => {
        const commerce = deps.productMaster.commerce.find(
          (record) => record.productId === product.productId,
        );
        return {
          ...product,
          truthState: commerce?.truthState ?? "under_review",
          priceCents: commerce?.priceCents ?? null,
          purchasable: commerce?.purchasable ?? false,
        };
      }),
      supplements: SUPPLEMENT_PLACEHOLDERS,
      storageAndOrganization: {
        accessories: STORAGE_AND_ORGANIZATION_ACCESSORIES,
        boundary: STORAGE_ACCESSORY_BOUNDARY,
      },
      supportCategories: SUPPORT_CENTER_CATEGORIES,
    });
  });

  app.post("/api/research/products/:sku/certificates/access", active, async (req, res) => {
    noStore(res);
    const id = memberId(req);
    if (!id) return res.status(401).json({ ok: false, code: "membership_required" });
    const lotCode = typeof req.body?.lotCode === "string" ? req.body.lotCode.trim() : "";
    if (!lotCode) return validation(res, "lotCode is required");
    const result = await deps.certificates.requestAccess({
      actor: { memberId: id, active: true },
      sku: String(req.params.sku),
      lotCode,
    });
    res.status(result.ok ? 200 : result.code === "lot_not_found" ? 404 : 409).json(result);
  });

  app.get("/api/research/metabolic-pathways", active, (_req, res) => {
    noStore(res);
    res.json({ ok: true, pathways: deps.pathways.listPublic() });
  });

  app.post("/api/research/metabolic-interest", active, async (req, res) => {
    noStore(res);
    const id = memberId(req);
    if (!id) return res.status(401).json({ ok: false, code: "membership_required" });
    try {
      const joined = await deps.interests.join(id, {
        pathwayId: req.body?.pathwayId,
        currentState: String(req.body?.currentState ?? "").toUpperCase(),
        generalGoalCategory: req.body?.generalGoalCategory,
        preferredContact: req.body?.preferredContact,
        interestDate: String(req.body?.interestDate ?? ""),
        attributionSource: String(req.body?.attributionSource ?? "unknown"),
        idempotencyKey: String(req.body?.idempotencyKey ?? ""),
      });
      res.status(joined.created ? 201 : 200).json({
        ok: true,
        created: joined.created,
        interest: {
          interestId: joined.record.interestId,
          pathwayId: joined.record.pathwayId,
          interestDate: joined.record.interestDate,
        },
      });
    } catch (error) {
      validation(res, (error as Error).message);
    }
  });

  app.get("/api/research/diagnostics/superpower", active, (_req, res) => {
    noStore(res);
    res.json({ ok: true, offer: deps.superpower.readPublic() });
  });

  app.get("/api/research/diagnostics/biomarker", active, async (req, res) => {
    noStore(res);
    const id = memberId(req);
    if (!id) return res.status(401).json({ ok: false, code: "membership_required" });
    res.json({ ok: true, biomarker: publicBiomarker(await deps.biomarkers.getOrCreate(id)) });
  });

  app.post("/api/research/diagnostics/biomarker/report-upload", active, async (req, res) => {
    noStore(res);
    const id = memberId(req);
    if (!id) return res.status(401).json({ ok: false, code: "membership_required" });
    const contentType = req.body?.contentType;
    if (!["application/pdf", "image/jpeg", "image/png"].includes(contentType)) {
      return validation(res, "contentType must be PDF, JPEG, or PNG");
    }
    const result = await deps.biomarkers.createReportUpload({
      memberId: id,
      activeMember: true,
      filename: String(req.body?.filename ?? ""),
      contentType,
      sizeBytes: Number(req.body?.sizeBytes),
      consentAccepted: req.body?.consentAccepted === true,
      consentVersion: String(req.body?.consentVersion ?? ""),
    });
    res.status(result.ok ? 201 : 409).json(
      result.ok
        ? {
            ok: true,
            uploadId: result.uploadId,
            uploadUrl: result.uploadUrl,
            expiresAt: result.expiresAt,
            biomarker: publicBiomarker(result.record),
          }
        : result,
    );
  });

  app.post(
    "/api/research/diagnostics/biomarker/report-upload/confirm",
    active,
    async (req, res) => {
      noStore(res);
      const id = memberId(req);
      if (!id) return res.status(401).json({ ok: false, code: "membership_required" });
      const result = await deps.biomarkers.confirmReportUpload({
        memberId: id,
        activeMember: true,
        uploadId: String(req.body?.uploadId ?? ""),
      });
      const status = result.ok
        ? 200
        : result.code === "upload_not_found"
          ? 404
          : 409;
      res.status(status).json(
        result.ok
          ? { ok: true, biomarker: publicBiomarker(result.record) }
          : result,
      );
    },
  );

  app.get("/api/admin/research/metabolic-pathways", admin, (req, res) => {
    noStore(res);
    const query = typeof req.query.q === "string" ? req.query.q : "";
    res.json({ ok: true, pathways: deps.pathways.searchAdmin(query) });
  });

  app.put("/api/admin/research/metabolic-pathways/:pathwayId", admin, async (req, res) => {
    noStore(res);
    try {
      const pathway = await deps.pathways.update(
        String(req.params.pathwayId) as MetabolicPathwayConfig["pathwayId"],
        req.body ?? {},
        (req as ResearchRequest).adminEmail ?? "admin",
        new Date().toISOString(),
      );
      res.json({ ok: true, pathway });
    } catch (error) {
      mutationFailure(res, error);
    }
  });

  app.get("/api/admin/research/superpower-offer", admin, (_req, res) => {
    noStore(res);
    res.json({ ok: true, offer: deps.superpower.readAdmin() });
  });

  app.put("/api/admin/research/superpower-offer", admin, async (req, res) => {
    noStore(res);
    try {
      const offer = await deps.superpower.update(
        req.body ?? {},
        (req as ResearchRequest).adminEmail ?? "admin",
        new Date().toISOString(),
      );
      res.json({ ok: true, offer });
    } catch (error) {
      mutationFailure(res, error);
    }
  });
}
