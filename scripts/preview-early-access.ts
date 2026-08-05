/**
 * PREVIEW ONLY. Browser-verification harness for Private Early Access.
 *
 * WHY THIS EXISTS. The release audit requires proving in a real browser that a
 * founder-held row renders with no price and no purchase controls, and that the
 * catalogue shows exactly the accepted units. The production entry point cannot
 * boot without Supabase credentials, and this machine holds none, so there is no
 * other way to put the real React bundle in front of a real browser.
 *
 * WHAT IT PROVES. DOM, accessibility tree, rendered controls, routing, and
 * responsive behaviour, against the REAL registration, the REAL storefront
 * projection and the REAL client bundle. The catalogue rows come from the same
 * founder seed the mounted-API test uses.
 *
 * WHAT IT DOES NOT PROVE. Anything about the production database. The stores
 * here are in-memory by construction.
 *
 * IT CANNOT RUN IN PRODUCTION. It refuses to start when NODE_ENV is production,
 * and it is never imported by server/index.ts, so no production route reaches
 * it. `server/research/early-access/preview-harness.guard.test.ts` pins that
 * refusal (tests under scripts/ are not collected by vitest).
 */

import express from "express";

import { registerPrivateEarlyAccessApi } from "../server/research/early-access/register";
import { registerResearchApi, researchPageGate } from "../server/research/index";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  InMemoryEarlyAccessCustomerRepository,
  createEarlyAccessCustomer,
  transitionEarlyAccessCustomer,
} from "../server/research/early-access/identity/early-access-customer";
import { InMemorySessionBindingStore } from "../server/research/early-access/identity/identity-verification";
import { createEarlyAccessSessionIdReader } from "../server/research/early-access/private-access-routes";
import { InMemoryPrivateAccessSessionRepository } from "../server/research/early-access/private-access-session-repository";
import {
  EARLY_ACCESS_TEST_CONFIG,
  EARLY_ACCESS_TEST_PASSWORD,
} from "../server/research/early-access/routes/route-fixtures";

/** The route fixtures' own config, so the harness cannot drift from the
 *  configuration the suite already proves works. */
export const PREVIEW_PASSWORD = EARLY_ACCESS_TEST_PASSWORD;
const PREVIEW_CUSTOMER_ID = "cus_preview_browser";

/** FAIL CLOSED. A production process must never reach this harness. */
export function refuseInProduction(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === "production") {
    throw new Error(
      "preview-early-access: refusing to start with NODE_ENV=production. " +
        "This harness serves fixture data and must never answer a customer.",
    );
  }
}

export async function buildPreviewApp() {
  refuseInProduction();

  // The outer research wall stands in front of every /api/research route, so
  // the browser must clear it before Early Access is reachable. Configuring it
  // here (never in production, which refuseInProduction has already ruled out)
  // reproduces the production door rather than removing it.
  process.env.RESEARCH_ACCESS_PASSWORD ??= PREVIEW_PASSWORD;
  process.env.RESEARCH_SESSION_SECRET ??= "preview-early-access-research-secret-not-production";

  const confirmations = new InMemorySupplierConfirmationStore();
  const source = new ProductControlCatalogSource({
    catalog: { readCatalog: async () => canonicalReviewProducts() },
    declaredFacts: new ProductControlDeclaredFactsReader({
      inventory: NO_RECORDED_LOTS_INVENTORY,
      currency: resolveEarlyAccessSettlementCurrency(),
      supplierConfirmations: confirmations,
    }),
  } as never);

  const now = Date.now();
  const context = { earlyAccessCustomer: { customerRef: PREVIEW_CUSTOMER_ID } };

  // Same order the founder seed runs in production preparation: confirm
  // supply, re-project, then release against the confirmed world.
  const before = await source.load(new Date(now), context);
  await seedRawPeptidesConfirmations({ rows: before.rows as never, store: confirmations });
  const confirmed = await source.load(new Date(now), context);
  const ledger = new InMemoryEarlyAccessReleaseLedger();
  const releases = await seedFounderFirstRelease({ rows: confirmed.rows as never, ledger });

  const customers = new InMemoryEarlyAccessCustomerRepository();
  const sessionBindings = new InMemorySessionBindingStore();
  const created = createEarlyAccessCustomer({
    id: PREVIEW_CUSTOMER_ID,
    email: "preview@example.invalid",
    legalName: "Preview Browser Customer",
    phone: "+1 555 0000",
    now: new Date(now).toISOString(),
  });
  if (!created.ok) throw new Error(`preview customer invalid: ${created.code}`);
  const approved = transitionEarlyAccessCustomer({
    customer: created.value,
    to: "APPROVED",
    by: "Samuel Boadu",
    reason: "Browser verification harness",
    now: new Date(now).toISOString(),
  });
  if (!approved.ok) throw new Error(`preview approval invalid: ${approved.code}`);
  await customers.insert(approved.value);

  const config = EARLY_ACCESS_TEST_CONFIG;

  const app = express();
  app.use(express.json());
  // Production order, from server/index.ts: the page gate and the research API
  // mount BEFORE Early Access, so the harness inherits the same shadowing
  // behaviour a real request meets.
  app.use(researchPageGate);
  registerResearchApi(app);
  // Bind every preview session to the approved customer, so the browser
  // reaches the catalogue without an email door that this harness does not
  // mount. The binding is the WEAK provenance, exactly as a typed email is.
  const readSessionId = createEarlyAccessSessionIdReader({
    config,
    repository: new InMemoryPrivateAccessSessionRepository(),
    now: () => Date.now(),
    randomToken: () => "unused",
  } as never);
  app.use((req, _res, next) => {
    const sessionId = readSessionId(req.headers.cookie);
    if (sessionId !== null) void sessionBindings.bind(sessionId, PREVIEW_CUSTOMER_ID);
    next();
  });

  registerPrivateEarlyAccessApi(app, {
    config,
    catalog: source,
    releases: ledger,
    customers,
    sessionBindings,
    supplierConfirmations: confirmations,
    founderHeldUnits: releases.founderHeldUnits,
    now: () => Date.now(),
  });

  // The REAL client bundle, served directly rather than through
  // server/static.ts, which resolves __dirname and is CommonJS-only.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(here, "..", "dist", "public");
  app.use(express.static(clientDist));
  // Express 5 rejects the bare "*" path; a regex catch-all is the SPA fallback.
  app.get(/.*/, (_req, res) => res.sendFile(path.resolve(clientDist, "index.html")));
  return { app, releases };
}

const isDirectRun = process.argv[1]?.includes("preview-early-access");
if (isDirectRun) {
  const port = Number(process.env.PORT ?? 5199);
  buildPreviewApp()
    .then(({ app, releases }) => {
      app.listen(port, () => {
        // eslint-disable-next-line no-console
        console.log(
          `[preview-early-access] listening on http://localhost:${port} — ` +
            `${releases.seeded.length} released, ${releases.founderHeld.length} founder-held, ` +
            `password "${PREVIEW_PASSWORD}"`,
        );
      });
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error("[preview-early-access] failed to start:", error);
      process.exit(1);
    });
}
