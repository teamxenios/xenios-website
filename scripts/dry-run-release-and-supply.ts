/**
 * DRY RUN. Produces the exact rows the founder-release and supply
 * initialization would create, and writes nothing anywhere.
 *
 * It runs the REAL seed functions against recording stubs, so the manifest is
 * what the seeds actually emit rather than a hand-written restatement of them.
 * There is no database connection in this file and no network call.
 */

import { ProductControlDeclaredFactsReader } from "../server/research/early-access/catalog/declared-facts-source";
import {
  ProductControlCatalogSource,
  resolveEarlyAccessSettlementCurrency,
} from "../server/research/early-access/catalog/product-control-source";
import { InMemorySupplierConfirmationStore } from "../server/research/early-access/ops/supplier-confirmation";
import {
  NO_RECORDED_LOTS_INVENTORY,
  canonicalReviewProducts,
} from "../server/research/early-access/release/first-release-canonical-source";
import { InMemoryEarlyAccessReleaseLedger } from "../server/research/early-access/release/founder-release";
import { seedFounderFirstRelease } from "../server/research/early-access/release/founder-first-release-seed";
import { seedRawPeptidesConfirmations } from "../server/research/early-access/release/founder-supply-seed";
import { buildEarlyAccessStorefront } from "../server/research/early-access/release/storefront-view";

/**
 * Wraps a REAL collaborator and records every call, delegating each one
 * unchanged. A subclass that overrode these methods altered behaviour and
 * produced a false manifest, so nothing here substitutes for the real object.
 */
function recording<T extends object>(target: T, log: { method: string; args: unknown[] }[]): T {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        log.push({ method: String(prop), args });
        return (value as (...a: unknown[]) => unknown).apply(obj, args);
      };
    },
  });
}

async function main(): Promise<void> {
  const confirmationCalls: { method: string; args: unknown[] }[] = [];
  const realConfirmations = new InMemorySupplierConfirmationStore();
  const confirmations = recording(realConfirmations, confirmationCalls);
  const source = new ProductControlCatalogSource({
    catalog: { readCatalog: async () => canonicalReviewProducts() },
    declaredFacts: new ProductControlDeclaredFactsReader({
      inventory: NO_RECORDED_LOTS_INVENTORY,
      currency: resolveEarlyAccessSettlementCurrency(),
      supplierConfirmations: confirmations,
    }),
  } as never);

  const at = new Date("2026-08-05T00:00:00.000Z");
  const context = { earlyAccessCustomer: { customerRef: "cus_dry_run" } };

  const before = await source.load(at, context);
  await seedRawPeptidesConfirmations({ rows: before.rows as never, store: confirmations });
  const confirmed = await source.load(at, context);
  const ledgerCalls: { method: string; args: unknown[] }[] = [];
  const ledger = recording(new InMemoryEarlyAccessReleaseLedger(), ledgerCalls);
  const outcome = await seedFounderFirstRelease({ rows: confirmed.rows as never, ledger });

  const line = (s: string) => process.stdout.write(`${s}\n`);

  line("=".repeat(78));
  line("DRY RUN. NOTHING WAS WRITTEN. No database connection, no network call.");
  line("=".repeat(78));

  line("");
  const stored = (await ledger.all()) as unknown as Record<string, unknown>[];
  const storefront = buildEarlyAccessStorefront({
    projection: confirmed,
    releases: stored as never,
    scope: "released_units",
    founderHeldUnits: outcome.founderHeldUnits,
  } as never);
  line(`SECTION 1. FOUNDER RELEASE ROWS THAT WOULD BE CREATED: ${stored.length}`);
  line("-".repeat(78));
  line(
    ["#", "releaseId", "productId", "variantId", "price", "qty", "status"]
      .map((h, i) => h.padEnd([4, 40, 10, 30, 10, 5, 9][i]))
      .join(""),
  );
  stored.forEach((r, i) => {
    const cents = Number(r.approvedPriceCents);
    line(
      [
        String(i + 1).padEnd(4),
        String(r.releaseId).padEnd(40),
        String(r.productId).padEnd(10),
        String(r.variantId).padEnd(30),
        `$${(cents / 100).toFixed(2)}`.padEnd(10),
        String(r.approvedQuantityLimit).padEnd(5),
        String(r.status).padEnd(9),
      ].join(""),
    );
  });

  const first = stored[0] ?? {};
  line("");
  line("Common fields on every release row:");
  line(`  actor      : ${String(first.actor)}`);
  line(`  reason     : ${String(first.reason)}`);
  line(`  currency   : ${String(first.currency)}`);
  line(`  expiresAt  : ${String(first.expiresAt)}`);
  line(`  recordedAt : ${String(first.recordedAt)}`);
  line(
    `  waivedBlockers: ${JSON.stringify(
      Array.from(new Set(stored.flatMap((r) => (r.waivedBlockers as string[]) ?? []))),
    )}`,
  );

  line("");
  line(`SECTION 2. UNITS DELIBERATELY GIVEN NO RELEASE: ${outcome.founderHeld.length}`);
  line("-".repeat(78));
  for (const held of outcome.founderHeld as Record<string, unknown>[]) {
    line(`  ${JSON.stringify(held)}`);
  }

  line("");
  // `insert` is the only write on the store. Reads must not appear here.
  const confRows = confirmationCalls
    .filter((c) => c.method === "insert")
    .map((c) => c.args[0] as Record<string, unknown>);
  line(`SECTION 3. SUPPLIER CONFIRMATION ROWS THAT WOULD BE CREATED: ${confRows.length}`);
  line("-".repeat(78));
  confRows.forEach((c, i) => {
    line(
      `${String(i + 1).padEnd(4)}${String(c.variantId ?? c.sku).padEnd(32)}` +
        `${String(c.supplierName ?? c.supplier ?? c.supplierId ?? "").padEnd(16)}` +
        `expires=${String(c.expiresAt ?? c.holdsUntil ?? "")}`,
    );
  });
  const c0 = confRows[0];
  if (c0) {
    line("");
    line("Full field set of the first confirmation row, verbatim:");
    line(`  ${JSON.stringify(c0, null, 2).split("\n").join("\n  ")}`);
  }

  line("");
  line(`SECTION 4. UNRESOLVED (would NOT be created): ${outcome.unresolved.length}`);
  line("-".repeat(78));
  if (outcome.unresolved.length === 0) line("  none");
  for (const u of outcome.unresolved as { name?: string; reason?: string }[]) {
    line(`  ${String(u.name)}  ${String(u.reason)}`);
  }

  line("");
  line("SECTION 5. RESULTING PROJECTION");
  line("-".repeat(78));
  const products = new Set(storefront.units.map((u) => u.productId));
  const purchasable = storefront.units.filter((u) => u.purchasable);
  const held = storefront.units.filter((u) => !u.purchasable);
  line(`  products        : ${products.size}   (expected 19)`);
  line(`  visible units   : ${storefront.units.length}   (expected 22)`);
  line(`  purchasable     : ${purchasable.length}   (expected 18)`);
  line(`  held            : ${held.length}   (expected 4)`);
  line("");
  line("  Held units after both actions:");
  for (const u of held) {
    line(
      `    ${u.sku.padEnd(32)} ${String(u.availability).padEnd(20)} hold=${String(u.hold)}` +
        `${(u.productControlBlockers as string[]).includes("STRENGTH_DISPUTE_UNRESOLVED") ? "  [strength dispute]" : ""}`,
    );
  }
  line("");
  const nad = storefront.units.find((u) => u.sku === "R360-NAD-1000MG-VIAL");
  line(
    `  NAD+ 1000 mg    : ${String(nad?.availability)}  ` +
      `$${((nad?.priceCents ?? 0) / 100).toFixed(2)}  (expected AVAILABLE $100.75)`,
  );

  const ok =
    products.size === 19 &&
    storefront.units.length === 22 &&
    purchasable.length === 18 &&
    held.length === 4 &&
    nad?.availability === "AVAILABLE" &&
    nad?.priceCents === 10_075;
  line("");
  line(`  VERDICT: ${ok ? "PASS, matches the accepted opening set" : "FAIL, does not match"}`);
  line("");
  line("=".repeat(78));
  line("END OF DRY RUN. Nothing was written.");
  line("=".repeat(78));
}

void main();
