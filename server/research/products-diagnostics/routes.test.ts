import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
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
} from "./diagnostics";
import { buildProductMaster } from "./product-master";
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
  const productMaster = buildProductMaster([source], "2026-07-25T12:00:00.000Z");
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
    superpower: new SuperpowerOfferRepository(),
    biomarkers: new BiomarkerService(
      new MemoryBiomarkerStore(),
      new DisabledBiomarkerUploadProvider(),
    ),
  };
}

describe("Website 3 route registration", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerProductsDiagnosticsApi(app, dependencies(), {
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
});

