/**
 * PREVIEW ONLY. Real-browser release gate for the Step 1 Early Access order
 * request flow.
 *
 * The production SPA, Early Access session/logout implementation, assisted
 * order descriptor table, Express adapter and service are real. Only external
 * infrastructure is replaced with deterministic in-memory ports and four
 * clearly synthetic catalog rows. No provider, email, storage or database
 * request can leave this process.
 */

import express, { type RequestHandler } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assistedOrderActionGroupFor,
  type AssistedOrderCatalogItem,
} from "../shared/research/assisted-order/contract";
import {
  assistedOrderExpressHandler,
  createAssistedOrderViewerResolvers,
  type ExpressAssistedOrderRequest,
} from "../server/research/assisted-order/express";
import { createAssistedOrderRouteTable } from "../server/research/assisted-order/http";
import { InMemoryAssistedOrderRepository } from "../server/research/assisted-order/memory-repository";
import type { AssistedOrderDocumentStore } from "../server/research/assisted-order/ports";
import { createAssistedOrderProductionComposition } from "../server/research/assisted-order/production";
import { registerResearchApi, researchPageGate } from "../server/research/index";
import {
  ProductControlCatalogSource,
  resolveEarlyAccessSettlementCurrency,
} from "../server/research/early-access/catalog/product-control-source";
import { ProductControlDeclaredFactsReader } from "../server/research/early-access/catalog/declared-facts-source";
import {
  NO_RECORDED_LOTS_INVENTORY,
  canonicalReviewProducts,
} from "../server/research/early-access/release/first-release-canonical-source";
import { InMemoryEarlyAccessReleaseLedger } from "../server/research/early-access/release/founder-release";
import { seedFounderFirstRelease } from "../server/research/early-access/release/founder-first-release-seed";
import { seedRawPeptidesConfirmations } from "../server/research/early-access/release/founder-supply-seed";
import { InMemorySupplierConfirmationStore } from "../server/research/early-access/ops/supplier-confirmation";
import {
  registerPrivateEarlyAccessApi,
  type EarlyAccessRegistrationOptions,
} from "../server/research/early-access/register";
import type { EarlyAccessAgreementGate } from "../server/research/early-access/routes/ports";
import type { EarlyAccessAgreementRecorder } from "../server/research/early-access/routes/agreement-routes";
import {
  EARLY_ACCESS_TEST_CONFIG,
  EARLY_ACCESS_TEST_PASSWORD,
} from "../server/research/early-access/routes/route-fixtures";

export const STEP1_PREVIEW_PASSWORD = EARLY_ACCESS_TEST_PASSWORD;
export const STEP1_PREVIEW_ENABLE_ENV = "XENIOS_STEP1_PREVIEW_ENABLED";
export const STEP1_PREVIEW_REQUIRED_AGREEMENT = Object.freeze({
  // The existing Early Access client posts this canonical pair. Keeping the
  // preview on that exact pair proves the same acceptance can unlock the
  // outer catalog and the assisted-order submission standing.
  kind: "early_access_terms",
  version: "v1",
});

const QA_CATALOG_VERSION = "step1-browser-qa-v1";

export const STEP1_PREVIEW_ASSISTED_CATALOG: readonly AssistedOrderCatalogItem[] =
  Object.freeze([
    Object.freeze({
      productId: "qa-research-direct",
      variantId: "qa-research-direct-5mg",
      productName: "QA Research Direct",
      family: "Research",
      channel: "Step 1 browser QA",
      specification: "5 mg vial",
      format: "Synthetic fixture",
      packBasis: "Single unit",
      minimumQuantity: 1,
      maximumQuantity: 100,
      quantityIncrement: 1,
      unitPriceCents: 3350,
      currency: "USD",
      workflowMode: "direct_order_request",
      actionLabel: "Add to order request",
      accessNotice: "Synthetic local release-gate fixture.",
      researchUseOnly: true,
      catalogVersion: QA_CATALOG_VERSION,
      priceVersion: "qa-price-direct-v1",
    }),
    Object.freeze({
      productId: "qa-research-request",
      variantId: "qa-research-request-10mg",
      productName: "QA Research Request",
      family: "Research",
      channel: "Step 1 browser QA",
      specification: "10 mg vial",
      format: "Synthetic fixture",
      packBasis: "Single unit",
      minimumQuantity: 1,
      maximumQuantity: 100,
      quantityIncrement: 1,
      unitPriceCents: 9900,
      currency: "USD",
      workflowMode: "request_activation",
      actionLabel: "Request Order",
      accessNotice: "Synthetic local release-gate fixture.",
      researchUseOnly: true,
      catalogVersion: QA_CATALOG_VERSION,
      priceVersion: "qa-price-request-v1",
    }),
    Object.freeze({
      productId: "qa-wellness-care",
      variantId: "qa-wellness-care-standard",
      productName: "QA Wellness Care",
      family: "Wellness",
      channel: "Step 1 browser QA",
      specification: "Provider pathway",
      format: "Synthetic fixture",
      packBasis: null,
      minimumQuantity: 1,
      maximumQuantity: 100,
      quantityIncrement: 1,
      unitPriceCents: null,
      currency: "USD",
      workflowMode: "provider_request",
      actionLabel: "Continue through Care",
      accessNotice: "Synthetic local release-gate fixture.",
      researchUseOnly: false,
      catalogVersion: QA_CATALOG_VERSION,
      priceVersion: null,
    }),
    Object.freeze({
      productId: "qa-wellness-held",
      variantId: "qa-wellness-held-standard",
      productName: "QA Wellness Held",
      family: "Wellness",
      channel: "Step 1 browser QA",
      specification: "Held for review",
      format: "Synthetic fixture",
      packBasis: null,
      minimumQuantity: 1,
      maximumQuantity: 100,
      quantityIncrement: 1,
      unitPriceCents: null,
      currency: "USD",
      workflowMode: "availability_review",
      actionLabel: "Temporarily Unavailable",
      accessNotice: "Synthetic local release-gate fixture.",
      researchUseOnly: false,
      catalogVersion: QA_CATALOG_VERSION,
      priceVersion: null,
    }),
  ] satisfies readonly AssistedOrderCatalogItem[]);

/** FAIL CLOSED. This fixture process must never answer production traffic. */
export function refuseStep1PreviewInProduction(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (
    env.NODE_ENV === "production" ||
    env[STEP1_PREVIEW_ENABLE_ENV] !== "true"
  ) {
    throw new Error(
      "preview-step1-hotfix: refusing to start without an explicit local preview opt-in. " +
        "This synthetic harness requires non-production NODE_ENV and " +
        `${STEP1_PREVIEW_ENABLE_ENV}=true.`,
    );
  }
}

const PREVIEW_API_DOORS = new Set([
  "GET /api/research/me",
  "POST /api/research/access",
  "POST /api/research/logout",
  "GET /api/research/policies",
  "POST /api/research/early-access/unlock",
  "GET /api/research/early-access/session",
  "POST /api/research/early-access/logout",
  "GET /api/research/early-access/catalog",
  "GET /api/research/early-access/agreements",
  "POST /api/research/early-access/agreements/accept",
  "GET /api/research/early-access/assisted-orders/config",
  "GET /api/research/early-access/assisted-orders/catalog",
  "POST /api/research/early-access/assisted-orders",
]);

const PREVIEW_ASSISTED_STATUS =
  /^GET \/api\/research\/early-access\/assisted-orders\/XRR-\d{8}-[0-9A-F]{10}$/;

/**
 * Deny every API that is not part of this exact browser gate before any broad
 * application router is registered. A shell containing real provider keys
 * therefore cannot turn this fixture process into a path to Supabase, email,
 * storage, admin, member, payment, or fulfillment handlers.
 */
export const step1PreviewApiBoundary: RequestHandler = (req, res, next) => {
  const normalizedPath = req.path.toLowerCase();
  if (!normalizedPath.startsWith("/api/")) return next();
  // Express routes are case-insensitive by default. Detect `/API/...` here,
  // then let the exact original-path allowlist below reject non-canonical
  // route casing while preserving the uppercase XRR identifier format.
  const door = `${req.method.toUpperCase()} ${req.path}`;
  if (PREVIEW_API_DOORS.has(door) || PREVIEW_ASSISTED_STATUS.test(door)) {
    return next();
  }
  res.status(404).json({
    error: "step1_preview_route_not_available",
    message: "This API is outside the local Step 1 browser gate.",
  });
};

function agreementMemory() {
  const accepted = new Map<string, Set<string>>();
  const pairKey = (kind: string, version: string) => `${kind}\u0000${version}`;
  const requiredKey = pairKey(
    STEP1_PREVIEW_REQUIRED_AGREEMENT.kind,
    STEP1_PREVIEW_REQUIRED_AGREEMENT.version,
  );
  const gate: EarlyAccessAgreementGate = {
    accepted: async (customerRef) => accepted.get(customerRef)?.has(requiredKey) === true,
  };
  const recorder: EarlyAccessAgreementRecorder = {
    record: async ({ customerRef, kind, version }) => {
      const entries = accepted.get(customerRef) ?? new Set<string>();
      const key = pairKey(kind, version);
      const alreadyAccepted = entries.has(key);
      entries.add(key);
      accepted.set(customerRef, entries);
      return alreadyAccepted ? "already_on_file" : "recorded";
    },
  };
  return Object.freeze({ gate, recorder });
}

function previewDocuments(): AssistedOrderDocumentStore {
  return {
    createUpload: async (input) => ({
      documentId: "preview-document",
      uploadUrl: "https://upload.example.invalid/preview",
      objectPath: input.objectPath,
      expiresAt: "2026-08-25T23:59:00.000Z",
      requiredHeaders: { "content-type": input.mimeType },
    }),
    createDownload: async () => ({
      url: "https://download.example.invalid/preview",
      expiresAt: "2026-08-25T23:59:00.000Z",
    }),
  };
}

type DoorSources = Parameters<
  NonNullable<EarlyAccessRegistrationOptions["onDoorSources"]>
>[0];

export async function buildStep1PreviewApp(
  previewEnv: NodeJS.ProcessEnv = process.env,
) {
  refuseStep1PreviewInProduction(previewEnv);
  // These globals are read by the legacy research page gate. Override them in
  // this preview process instead of inheriting any real shell value.
  process.env.RESEARCH_ACCESS_PASSWORD = STEP1_PREVIEW_PASSWORD;
  process.env.RESEARCH_SESSION_SECRET =
    "preview-step1-research-secret-not-production";
  process.env.RESEARCH_PUBLIC = "false";

  const confirmations = new InMemorySupplierConfirmationStore();
  const legacyCatalog = new ProductControlCatalogSource({
    catalog: { readCatalog: async () => canonicalReviewProducts() },
    declaredFacts: new ProductControlDeclaredFactsReader({
      inventory: NO_RECORDED_LOTS_INVENTORY,
      currency: resolveEarlyAccessSettlementCurrency(),
      supplierConfirmations: confirmations,
    }),
  } as never);
  const now = Date.now();
  const seedContext = {
    earlyAccessCustomer: { customerRef: "eac_step1_preview_seed" },
  };
  const before = await legacyCatalog.load(new Date(now), seedContext);
  await seedRawPeptidesConfirmations({ rows: before.rows as never, store: confirmations });
  const confirmed = await legacyCatalog.load(new Date(now), seedContext);
  const releases = new InMemoryEarlyAccessReleaseLedger();
  const releaseResult = await seedFounderFirstRelease({
    rows: confirmed.rows as never,
    ledger: releases,
  });

  const agreements = agreementMemory();
  let doorSources: DoorSources | null = null;
  const app = express();
  app.use(express.json());
  app.use(researchPageGate);
  app.use(step1PreviewApiBoundary);
  registerResearchApi(app);
  registerPrivateEarlyAccessApi(app, {
    config: EARLY_ACCESS_TEST_CONFIG,
    catalog: legacyCatalog,
    releases,
    supplierConfirmations: confirmations,
    founderHeldUnits: releaseResult.founderHeldUnits,
    sessionIdentity: true,
    env: Object.freeze({
      NODE_ENV: "development",
      XENIOS_STEP1_PREVIEW_ENABLED: "true",
    }),
    resolveMember: async () => null,
    requireAdmin: (_req, res) => {
      res.status(404).json({ error: "step1_preview_admin_unavailable" });
    },
    agreements: agreements.gate,
    agreementRecorder: agreements.recorder,
    requiredAgreements: [STEP1_PREVIEW_REQUIRED_AGREEMENT],
    now: () => Date.now(),
    onDoorSources: (sources) => {
      doorSources = sources;
    },
  });
  if (doorSources === null) {
    throw new Error("Step 1 preview could not observe the Early Access door sources.");
  }

  const repository = new InMemoryAssistedOrderRepository();
  const enqueued: unknown[] = [];
  const audited: unknown[] = [];
  const composition = createAssistedOrderProductionComposition({
    enabled: true,
    // preview harness: events are collected in memory, truthfully non-durable
    auditMode: "log_line_nondurable",
    legal: {
      requiredAgreements: async () => [STEP1_PREVIEW_REQUIRED_AGREEMENT],
    },
    submissionStanding: {
      accepted: async (viewer) => {
        const customerRef = viewer.earlyAccessCustomerRef?.trim() ?? "";
        return (
          viewer.actorType === "early_access_session" &&
          (viewer.earlyAccessSessionHash?.length ?? 0) > 0 &&
          customerRef.length > 0 &&
          (await agreements.gate.accepted(customerRef))
        );
      },
    },
    catalog: {
      list: async (_viewer, query) => {
        const search = query.search?.trim().toLocaleLowerCase() ?? "";
        const filtered = STEP1_PREVIEW_ASSISTED_CATALOG.filter((item) => {
          if (query.family && item.family !== query.family) return false;
          if (query.channel && item.channel !== query.channel) return false;
          if (
            query.actionGroup &&
            assistedOrderActionGroupFor(item.workflowMode) !== query.actionGroup
          ) {
            return false;
          }
          if (query.workflowMode && item.workflowMode !== query.workflowMode) {
            return false;
          }
          if (!search) return true;
          return [
            item.productName,
            item.family,
            item.channel,
            item.specification,
            item.format,
            item.packBasis,
          ].some((value) => value?.toLocaleLowerCase().includes(search));
        });
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 24;
        const start = (page - 1) * pageSize;
        return {
          items: filtered.slice(start, start + pageSize),
          total: filtered.length,
          page,
          pageSize,
          families: Array.from(
            new Set(STEP1_PREVIEW_ASSISTED_CATALOG.map((item) => item.family)),
          ),
          channels: Array.from(
            new Set(STEP1_PREVIEW_ASSISTED_CATALOG.map((item) => item.channel)),
          ),
          workflowModes: Array.from(
            new Set(STEP1_PREVIEW_ASSISTED_CATALOG.map((item) => item.workflowMode)),
          ),
        };
      },
      resolveLine: async (_viewer, requested) => {
        const item = STEP1_PREVIEW_ASSISTED_CATALOG.find(
          (candidate) =>
            candidate.productId === requested.productId &&
            candidate.variantId === requested.variantId,
        );
        if (!item) throw new Error("Synthetic catalog item is unavailable.");
        return {
          lineId: "assigned-by-service",
          productId: item.productId,
          variantId: item.variantId,
          productName: item.productName,
          specification: item.specification,
          format: item.format,
          packBasis: item.packBasis,
          quantity: requested.quantity,
          minimumQuantity: item.minimumQuantity,
          maximumQuantity: item.maximumQuantity,
          quantityIncrement: item.quantityIncrement,
          workflowMode: item.workflowMode,
          customerActionLabel: item.actionLabel,
          unitPriceCents: item.unitPriceCents,
          lineEstimateCents: null,
          currency: "USD",
          catalogVersion: item.catalogVersion,
          priceVersion: item.priceVersion,
          accessNotice: item.accessNotice,
          researchUseOnly: item.researchUseOnly,
          authoritativeFingerprint: `step1-preview:${item.productId}:${item.variantId}`,
        };
      },
    },
    repository,
    outbox: {
      enqueue: async (intent) => {
        enqueued.push(intent);
      },
    },
    audit: {
      record: async (event) => {
        audited.push(event);
      },
    },
    documents: previewDocuments(),
    adminNotificationEmail: "research@example.invalid",
  });
  if (composition.refusalReason !== null || !composition.service) {
    throw new Error(
      `Step 1 assisted-order preview refused: ${String(composition.refusalReason)}`,
    );
  }

  const sources = doorSources as DoorSources;
  const viewers = createAssistedOrderViewerResolvers({
    resolveMember: async () => null,
    earlyAccess: () => sources,
    earlyAccessBindings: () => null,
    adminEmail: () => "research@example.invalid",
  });
  const routes = createAssistedOrderRouteTable<ExpressAssistedOrderRequest>(
    composition.service,
    viewers,
  );
  const door = (
    method: "GET" | "POST" | "PATCH",
    routePath: string,
  ): RequestHandler => {
    const descriptor = routes.find(
      (candidate) =>
        candidate.method === method && candidate.path === routePath,
    );
    if (!descriptor) {
      throw new Error(`Step 1 preview descriptor missing: ${method} ${routePath}`);
    }
    return assistedOrderExpressHandler(descriptor);
  };

  app.get(
    "/api/research/early-access/assisted-orders/config",
    door("GET", "/api/research/early-access/assisted-orders/config"),
  );
  app.get(
    "/api/research/early-access/assisted-orders/catalog",
    door("GET", "/api/research/early-access/assisted-orders/catalog"),
  );
  app.post(
    "/api/research/early-access/assisted-orders",
    door("POST", "/api/research/early-access/assisted-orders"),
  );
  app.get(
    "/api/research/early-access/assisted-orders/:publicReference",
    door("GET", "/api/research/early-access/assisted-orders/:publicReference"),
  );

  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(here, "..", "dist", "public");
  app.use(express.static(clientDist));
  app.get(/.*/, (_req, res) =>
    res.sendFile(path.resolve(clientDist, "index.html")),
  );
  return Object.freeze({
    app,
    releases: releaseResult,
    assistedOrderEnqueued: enqueued,
    assistedOrderAudited: audited,
  });
}

const isDirectRun = process.argv[1]?.includes("preview-step1-hotfix");
if (isDirectRun) {
  const port = Number(process.env.PORT ?? 5219);
  buildStep1PreviewApp()
    .then(({ app }) => {
      app.listen(port, "127.0.0.1", () => {
        // eslint-disable-next-line no-console
        console.log(
          `[preview-step1-hotfix] listening on http://localhost:${port} — ` +
            `${STEP1_PREVIEW_ASSISTED_CATALOG.length} synthetic assisted-order pathways, ` +
            `password "${STEP1_PREVIEW_PASSWORD}"`,
        );
      });
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error("[preview-step1-hotfix] failed to start:", error);
      process.exit(1);
    });
}
