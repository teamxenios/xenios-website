import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notConfirmed, type CatalogProduct } from "@shared/research/catalog";
import {
  DisabledPrivateCertificateProvider,
  ExactLotCertificateService,
  MemoryCertificateAudit,
} from "./coa";
import {
  MemoryMetabolicInterestStore,
  MetabolicInterestService,
  MetabolicPathwayRepository,
} from "./metabolic-care";
import {
  BiomarkerService,
  DisabledBiomarkerUploadProvider,
  MemoryBiomarkerStore,
  SuperpowerOfferRepository,
  type BiomarkerUploadProvider,
} from "./diagnostics";
import { buildProductMaster } from "./product-master";
import { SupplementPlaceholderRepository } from "./supplements";
import {
  registerProductsDiagnosticsApi,
  type Website3ApiDependencies,
} from "./routes";

const source: CatalogProduct = {
  sku: "P001",
  slug: "alpha",
  displayName: "Alpha Research Vial",
  lane: "research_material",
  laneDecision: "decided",
  nameAliases: [],
  availability: "documentation_review",
  commerceApproval: "blocked_pending_written_approval",
  fulfillmentOwner: "mitch",
  facts: {
    composition: notConfirmed(),
    strength: notConfirmed(),
    format: notConfirmed(),
    priceCents: notConfirmed(),
    shelfLife: notConfirmed(),
    storage: notConfirmed(),
    coa: notConfirmed(),
  },
  guideState: "guide_in_development",
  qualityDocumentState: "missing",
  storageDataState: "missing",
  shippingProfileState: "missing",
  goalMappings: [],
  relatedGuideSlugs: [],
  prohibitedClaims: [],
  subscriptionEligible: false,
  lastReviewed: "2026-07-25",
  openSupplierQuestions: [],
};

function active(req: Request, _res: Response, next: NextFunction) {
  (req as Request & { researchMember: { id: string } }).researchMember = {
    id: "member_1",
  };
  next();
}

function admin(req: Request, _res: Response, next: NextFunction) {
  (req as Request & { adminEmail: string }).adminEmail = "admin@example.com";
  next();
}

function dependencies(): Website3ApiDependencies {
  const productMaster = buildProductMaster(
    [source],
    "2026-07-25T12:00:00.000Z",
    [{ sku: source.sku, purchasable: false, priceCents: null }],
  );
  return {
    productMaster,
    certificates: new ExactLotCertificateService(
      productMaster.variants,
      productMaster.lots,
      productMaster.certificates,
      new DisabledPrivateCertificateProvider(),
      new MemoryCertificateAudit(),
    ),
    pathways: new MetabolicPathwayRepository(),
    interests: new MetabolicInterestService(new MemoryMetabolicInterestStore()),
    supplements: new SupplementPlaceholderRepository(),
    superpower: new SuperpowerOfferRepository(),
    biomarkers: new BiomarkerService(
      new MemoryBiomarkerStore(),
      new DisabledBiomarkerUploadProvider(),
    ),
  };
}

describe("Website 3 route registration", () => {
  let app: express.Express;
  let deps: Website3ApiDependencies;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    deps = dependencies();
    registerProductsDiagnosticsApi(app, deps, {
      requireActiveMember: active,
      requireAdmin: admin,
    });
  });

  it("registers the product platform without duplicating unsafe facts", async () => {
    const response = await request(app).get("/api/research/product-platform");
    expect(response.status).toBe(200);
    expect(response.body.products[0]).toMatchObject({
      slug: "alpha",
      truthState: "under_review",
      priceCents: null,
      purchasable: false,
    });
    expect(response.body.products[0]).not.toHaveProperty("lots");
    expect(response.body.families).toHaveLength(10);
  });

  it("returns all metabolic cards publicly without the internal alias", async () => {
    const response = await request(app).get("/api/research/metabolic-pathways");
    expect(response.status).toBe(200);
    expect(response.body.pathways).toHaveLength(3);
    expect(JSON.stringify(response.body)).not.toContain("GLP-3");
  });

  it("creates an idempotent member interest record with a minimal response", async () => {
    const input = {
      pathwayId: "glp_1_pathway",
      currentState: "IL",
      generalGoalCategory: "care_pathway_updates",
      preferredContact: "email",
      interestDate: "2026-07-25",
      attributionSource: "glp_cards",
      idempotencyKey: "interest-key-123456",
    };
    const first = await request(app).post("/api/research/metabolic-interest").send(input);
    const duplicate = await request(app).post("/api/research/metabolic-interest").send(input);
    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.created).toBe(false);
    expect(JSON.stringify(first.body)).not.toContain("member_1");
  });

  it("does not report interest success when durable persistence rejects", async () => {
    vi.spyOn(deps.interests, "join").mockRejectedValue(
      new Error("database unavailable"),
    );
    const response = await request(app)
      .post("/api/research/metabolic-interest")
      .send({
        pathwayId: "glp_1_pathway",
        currentState: "IL",
        generalGoalCategory: "care_pathway_updates",
        preferredContact: "email",
        interestDate: "2026-07-25",
        attributionSource: "glp_cards",
        idempotencyKey: "interest-key-123456",
      });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      ok: false,
      code: "persistence_failed",
      message: "The update could not be saved. No successful update was reported.",
    });
  });

  it("keeps Superpower disabled and Biomarker upload private-provider gated", async () => {
    const offer = await request(app).get("/api/research/diagnostics/superpower");
    expect(offer.body.offer).toMatchObject({
      status: "coming_soon",
      affiliateUrl: null,
    });
    const upload = await request(app)
      .post("/api/research/diagnostics/biomarker/report-upload")
      .send({
        filename: "report.pdf",
        contentType: "application/pdf",
        sizeBytes: 100,
        consentAccepted: true,
        consentVersion: "v1",
      });
    expect(upload.status).toBe(409);
    expect(upload.body).toMatchObject({
      ok: false,
      code: "private_upload_unavailable",
    });
  });

  it("returns a safe failure when biomarker persistence rejects", async () => {
    vi.spyOn(deps.biomarkers, "getOrCreate").mockRejectedValue(
      new Error("database unavailable"),
    );
    const response = await request(app).get(
      "/api/research/diagnostics/biomarker",
    );
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      ok: false,
      code: "persistence_failed",
    });
    expect(JSON.stringify(response.body)).not.toContain("database unavailable");
  });

  it("confirms a biomarker report only after private object verification", async () => {
    const provider: BiomarkerUploadProvider = {
      async createPrivateUpload() {
        return {
          ok: true,
          uploadUrl: "https://signed.example/upload",
          expiresAt: "2026-07-25T12:10:00.000Z",
        };
      },
      async verifyPrivateUpload() {
        return { ok: true };
      },
    };
    deps.biomarkers = new BiomarkerService(
      new MemoryBiomarkerStore(),
      provider,
      () => new Date("2026-07-25T12:00:00.000Z"),
    );
    const isolated = express();
    isolated.use(express.json());
    registerProductsDiagnosticsApi(isolated, deps, {
      requireActiveMember: active,
      requireAdmin: admin,
    });

    const prepared = await request(isolated)
      .post("/api/research/diagnostics/biomarker/report-upload")
      .send({
        filename: "report.pdf",
        contentType: "application/pdf",
        sizeBytes: 100,
        consentAccepted: true,
        consentVersion: "v1",
      });
    expect(prepared.status).toBe(201);
    expect(prepared.body.biomarker).toMatchObject({
      state: "not_started",
      reportFilename: null,
    });

    const confirmed = await request(isolated)
      .post("/api/research/diagnostics/biomarker/report-upload/confirm")
      .send({ uploadId: prepared.body.uploadId });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.biomarker).toMatchObject({
      state: "report_uploaded",
      reportFilename: "report.pdf",
    });
  });

  it("requires an exact lot for a certificate", async () => {
    const response = await request(app)
      .post("/api/research/products/P001/certificates/access")
      .send({ lotCode: "UNKNOWN" });
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ ok: false, code: "lot_not_found" });
  });

  it("lets administrators search the internal alias without leaking it publicly", async () => {
    const response = await request(app).get(
      "/api/admin/research/metabolic-pathways?q=GLP-3",
    );
    expect(response.status).toBe(200);
    expect(response.body.pathways).toHaveLength(1);
    expect(response.body.pathways[0].internalSearchAliases).toContain(
      "GLP-3 placeholder",
    );
  });

  it("does not report pathway success when durable persistence rejects", async () => {
    vi.spyOn(deps.pathways, "update").mockRejectedValue(
      new Error("database unavailable"),
    );
    const response = await request(app)
      .put("/api/admin/research/metabolic-pathways/glp_1_pathway")
      .send({ publicStatus: "Available" });
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      ok: false,
      code: "persistence_failed",
    });
  });

  it("does not report Superpower success when durable persistence rejects", async () => {
    vi.spyOn(deps.superpower, "update").mockRejectedValue(
      new Error("database unavailable"),
    );
    const response = await request(app)
      .put("/api/admin/research/superpower-offer")
      .send({ status: "paused" });
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      ok: false,
      code: "persistence_failed",
    });
  });

  it("lets administrators edit supplement placeholders without publishing partner references", async () => {
    const updated = await request(app)
      .put("/api/admin/research/supplement-placeholders/foundational")
      .send({ label: "Foundational supplements under review" });
    expect(updated.status).toBe(200);
    expect(updated.body.supplement).toMatchObject({
      category: "foundational",
      label: "Foundational supplements under review",
      status: "coming_soon",
      priceCents: null,
    });

    const platform = await request(app).get("/api/research/product-platform");
    expect(platform.body.supplements).toHaveLength(4);
    expect(platform.body.supplements[0]).not.toHaveProperty("updatedBy");
  });

  it("does not report supplement success when durable persistence rejects", async () => {
    vi.spyOn(deps.supplements, "update").mockRejectedValue(
      new Error("database unavailable"),
    );
    const response = await request(app)
      .put("/api/admin/research/supplement-placeholders/performance")
      .send({ label: "Performance supplements in review" });
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      ok: false,
      code: "persistence_failed",
    });
  });
});
