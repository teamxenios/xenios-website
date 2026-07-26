import type { Express, NextFunction, Request, Response } from "express";
import type { ProductMaster } from "./model";
import { summarizeFamilies } from "./product-master";
import type {
  CertificateAccessActor,
  CertificateAccessResult,
} from "./coa";
import type {
  MetabolicInterestService,
  MetabolicPathwayConfig,
  PublicMetabolicPathway,
} from "./metabolic-care";
import type {
  BiomarkerService,
  PublicSuperpowerOffer,
  SuperpowerOfferConfig,
} from "./diagnostics";
import type {
  SupplementPlaceholderCategory,
  SupplementPlaceholder,
  SupplementPlaceholderConfig,
} from "./supplements";
import {
  STORAGE_ACCESSORY_BOUNDARY,
  STORAGE_AND_ORGANIZATION_ACCESSORIES,
  STORAGE_SOURCE_CARDS,
  SUPPORT_CENTER_CATEGORIES,
  RESEARCH_EDUCATION_BOUNDARY,
  RESEARCH_EDUCATION_TOPICS,
} from "./support-and-storage";
import { Website3ValidationError } from "./errors";

type Guard = (req: Request, res: Response, next: NextFunction) => unknown;

export interface Website3Guards {
  requireActiveMember: Guard;
  requireAdmin: Guard;
}

export interface Website3ApiDependencies {
  capabilities: {
    certificateAccess: boolean;
    biomarkerReportUpload: boolean;
  };
  productMaster: ProductMaster;
  certificates: {
    requestAccess(input: {
      actor: CertificateAccessActor;
      sku: string;
      lotCode: string;
    }): Promise<CertificateAccessResult>;
  };
  pathways: {
    listPublic(): PublicMetabolicPathway[] | Promise<PublicMetabolicPathway[]>;
    searchAdmin(query: string): MetabolicPathwayConfig[] | Promise<MetabolicPathwayConfig[]>;
    update(
      pathwayId: MetabolicPathwayConfig["pathwayId"],
      patch: Partial<
        Pick<
          MetabolicPathwayConfig,
          "publicName" | "publicStatus" | "publicCopy" | "actions" | "internalSearchAliases"
        >
      >,
      actor: string,
      at: string,
    ): Promise<MetabolicPathwayConfig>;
  };
  interests: MetabolicInterestService;
  supplements: {
    listPublic():
      | SupplementPlaceholder[]
      | Promise<SupplementPlaceholder[]>;
    listAdmin():
      | SupplementPlaceholderConfig[]
      | Promise<SupplementPlaceholderConfig[]>;
    update(
      category: SupplementPlaceholderCategory,
      patch: Partial<
        Pick<
          SupplementPlaceholderConfig,
          "label" | "description" | "channelMetadata" | "launchInterestHref"
        >
      >,
      actor: string,
      at: string,
    ): Promise<SupplementPlaceholderConfig>;
  };
  superpower: {
    readPublic(): PublicSuperpowerOffer | Promise<PublicSuperpowerOffer>;
    readAdmin(): SuperpowerOfferConfig | Promise<SuperpowerOfferConfig>;
    update(
      patch: Partial<
        Pick<
          SuperpowerOfferConfig,
          | "label"
          | "summary"
          | "status"
          | "availability"
          | "collectionMethod"
          | "priceCents"
          | "priceEffectiveDate"
          | "lastVerificationDate"
          | "lastReviewedDate"
          | "verifiedPriceDate"
          | "disclosure"
          | "interest"
          | "affiliate"
        >
      >,
      actor: string,
      at: string,
    ): Promise<SuperpowerOfferConfig>;
  };
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

  app.get("/api/research/product-platform", active, async (_req, res) => {
    noStore(res);
    try {
      res.json({
        ok: true,
        capabilities: {
          certificateAccess: deps.capabilities.certificateAccess,
          biomarkerReportUpload: deps.capabilities.biomarkerReportUpload,
        },
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
        supplements: await deps.supplements.listPublic(),
        storageAndOrganization: {
          accessories: STORAGE_AND_ORGANIZATION_ACCESSORIES,
          boundary: STORAGE_ACCESSORY_BOUNDARY,
        },
        supportCategories: SUPPORT_CENTER_CATEGORIES,
        education: {
          topics: RESEARCH_EDUCATION_TOPICS,
          storageSources: STORAGE_SOURCE_CARDS,
          boundary: RESEARCH_EDUCATION_BOUNDARY,
        },
      });
    } catch (error) {
      mutationFailure(res, error);
    }
  });

  app.post("/api/research/products/:sku/certificates/access", active, async (req, res) => {
    noStore(res);
    const id = memberId(req);
    if (!id) return res.status(401).json({ ok: false, code: "membership_required" });
    const lotCode = typeof req.body?.lotCode === "string" ? req.body.lotCode.trim() : "";
    if (!lotCode) return validation(res, "lotCode is required");
    try {
      const result = await deps.certificates.requestAccess({
        actor: { memberId: id, active: true },
        sku: String(req.params.sku),
        lotCode,
      });
      res.status(result.ok ? 200 : result.code === "lot_not_found" ? 404 : 409).json(result);
    } catch (error) {
      mutationFailure(res, error);
    }
  });

  app.get("/api/research/metabolic-pathways", active, async (_req, res) => {
    noStore(res);
    try {
      res.json({ ok: true, pathways: await deps.pathways.listPublic() });
    } catch (error) {
      mutationFailure(res, error);
    }
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
      mutationFailure(res, error);
    }
  });

  app.get("/api/research/diagnostics/superpower", active, async (_req, res) => {
    noStore(res);
    try {
      res.json({ ok: true, offer: await deps.superpower.readPublic() });
    } catch (error) {
      mutationFailure(res, error);
    }
  });

  app.get("/api/research/diagnostics/biomarker", active, async (req, res) => {
    noStore(res);
    const id = memberId(req);
    if (!id) return res.status(401).json({ ok: false, code: "membership_required" });
    try {
      res.json({
        ok: true,
        reportUploadEnabled: deps.capabilities.biomarkerReportUpload,
        biomarker: publicBiomarker(await deps.biomarkers.getOrCreate(id)),
      });
    } catch (error) {
      mutationFailure(res, error);
    }
  });

  app.post("/api/research/diagnostics/biomarker/report-upload", active, async (req, res) => {
    noStore(res);
    const id = memberId(req);
    if (!id) return res.status(401).json({ ok: false, code: "membership_required" });
    const contentType = req.body?.contentType;
    if (!["application/pdf", "image/jpeg", "image/png"].includes(contentType)) {
      return validation(res, "contentType must be PDF, JPEG, or PNG");
    }
    try {
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
    } catch (error) {
      mutationFailure(res, error);
    }
  });

  app.post(
    "/api/research/diagnostics/biomarker/report-upload/confirm",
    active,
    async (req, res) => {
      noStore(res);
      const id = memberId(req);
      if (!id) return res.status(401).json({ ok: false, code: "membership_required" });
      try {
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
      } catch (error) {
        mutationFailure(res, error);
      }
    },
  );

  app.get("/api/admin/research/metabolic-pathways", admin, async (req, res) => {
    noStore(res);
    const query = typeof req.query.q === "string" ? req.query.q : "";
    try {
      res.json({ ok: true, pathways: await deps.pathways.searchAdmin(query) });
    } catch (error) {
      mutationFailure(res, error);
    }
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

  app.get("/api/admin/research/superpower-offer", admin, async (_req, res) => {
    noStore(res);
    try {
      res.json({ ok: true, offer: await deps.superpower.readAdmin() });
    } catch (error) {
      mutationFailure(res, error);
    }
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

  app.get("/api/admin/research/supplement-placeholders", admin, async (_req, res) => {
    noStore(res);
    try {
      res.json({ ok: true, supplements: await deps.supplements.listAdmin() });
    } catch (error) {
      mutationFailure(res, error);
    }
  });

  app.put(
    "/api/admin/research/supplement-placeholders/:category",
    admin,
    async (req, res) => {
      noStore(res);
      try {
        const supplement = await deps.supplements.update(
          String(req.params.category) as SupplementPlaceholderCategory,
          req.body ?? {},
          (req as ResearchRequest).adminEmail ?? "admin",
          new Date().toISOString(),
        );
        res.json({ ok: true, supplement });
      } catch (error) {
        mutationFailure(res, error);
      }
    },
  );
}
