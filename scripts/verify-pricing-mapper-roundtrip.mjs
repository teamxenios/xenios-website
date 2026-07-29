// XCA-W8 cross-lane assembly, Task 4: the mapper-to-database roundtrip.
//
// Proves the REAL pricing chain's output is accepted by the REAL database
// shape. In one process it runs
//
//   AuthoritativePriceResolver -> bindCartPrice -> recomputeCheckout
//     -> snapshotOrderLinesFromQuote -> toOrderLinePriceColumns
//
// over a PricingProductSource fixture (the only fake), then boots a
// DISPOSABLE Docker postgres:16 database, applies the repo's existing
// disposable bootstrap (which applies the reviewed Product Control
// migrations), creates the dormant Track B order tables (the same verbatim
// replica the pricing-lineage verifier uses), applies the
// 20260729000000_research_pricing_lineage migration, and INSERTS the mapper's
// unmodified column output into research_order_lines. It asserts the insert
// succeeds, the all-or-nothing coherence CHECK holds (a partial snapshot is
// rejected by name), and a join to research_product_prices on price_id
// reconciles version, amount, audience, and currency.
//
// The container carries a unique xca-w8-roundtrip-<random> name, publishes no
// ports, and is force-removed afterward. No other container and no remote
// database is ever touched.
//
// Usage: node scripts/verify-pricing-mapper-roundtrip.mjs
//
// Deliberately NO shebang on this file: under the repo's vitest/vite SSR
// transform a leading shebang survives into the module-runner compile and
// breaks any test that imports the script (see the XCA-W8 finding on
// scripts/import-price-decisions.mjs). This script is only ever run via
// "node scripts/...", where a shebang buys nothing.

import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Fixture constants (mirrored into the seeded authority rows)
// ---------------------------------------------------------------------------

const AT = "2026-07-29T12:00:00+00:00";
const PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VARIANT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRICE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ORDER_ID = "40000000-0000-4000-8000-0000000000aa";
const LINE_ID = "41000000-0000-4000-8000-0000000000aa";
const SKU = "XCA-RT-SKU-A";
const PRODUCT_SKU = "XCA-RT-PROD-A";
const DISPLAY_NAME = "Roundtrip Research Standard vial";
const AMOUNT_CENTS = 12900;
const PRICE_VERSION = 3;
const QUANTITY = 2;
const EFFECTIVE_AT = "2026-07-01T00:00:00+00:00";

function fail(message) {
  console.error(`ROUNDTRIP FAIL: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

// ---------------------------------------------------------------------------
// Phase 1: the in-process chain over the REAL classes
// ---------------------------------------------------------------------------

async function loadPricingModules() {
  // Register the repo's existing tsx loader BEFORE the first import of any
  // TypeScript module. Never probe with a raw import first: node caches a
  // failed ESM module job by specifier, so a retry after register() would
  // receive the same cached ERR_UNKNOWN_FILE_EXTENSION rejection. Same
  // pattern as scripts/import-price-decisions.mjs.
  const { register } = await import("tsx/esm/api");
  register();
  const specifier = (relative) =>
    pathToFileURL(path.join(REPO_ROOT, relative)).href;
  const resolverModule = await import(
    specifier("server/research/pricing/authoritative-price-resolver.ts")
  );
  const bindingModule = await import(
    specifier("server/research/pricing/cart-price-binding.ts")
  );
  const checkoutModule = await import(
    specifier("server/research/pricing/checkout-recompute.ts")
  );
  const orderModule = await import(
    specifier("server/research/pricing/order-price-snapshot.ts")
  );
  return { resolverModule, bindingModule, checkoutModule, orderModule };
}

function detailFixture() {
  return {
    id: PRODUCT_ID,
    productCode: "XCA-RT-A",
    slug: "xca-rt-a",
    displayName: "Roundtrip Research",
    canonicalName: "Roundtrip",
    aliases: [],
    lane: "research_material",
    category: "Research",
    classification: "Research material",
    status: "published",
    active: true,
    visibility: "public",
    availability: "in_stock",
    commerceApproval: "approved",
    qualityDocumentState: "approved",
    variantCount: 1,
    approvedVariantCount: 1,
    missingInputCount: 0,
    updatedAt: AT,
    publishedAt: AT,
    content: {
      shortDescription: "Roundtrip fixture.",
      longDescription: null,
      overview: null,
      specifications: null,
      researchInformation: null,
      storageInformation: null,
      handlingInformation: null,
      shippingInformation: null,
      returnInformation: null,
      disclaimers: null,
      citations: [],
      reviewDate: null,
    },
    variants: [
      {
        id: VARIANT_ID,
        productId: PRODUCT_ID,
        sku: SKU,
        catalogNumber: null,
        label: "Standard vial",
        strength: null,
        size: null,
        format: "Vial",
        presentation: null,
        shippingClass: "standard",
        memberEligible: true,
        status: "approved",
        active: true,
        sortOrder: 0,
        createdAt: AT,
        updatedAt: AT,
      },
    ],
    prices: [
      {
        id: PRICE_ID,
        productId: PRODUCT_ID,
        variantId: VARIANT_ID,
        audience: "retail",
        amountCents: AMOUNT_CENTS,
        currency: "USD",
        effectiveAt: EFFECTIVE_AT,
        expiresAt: null,
        status: "active",
        approvalNote: "Approved",
        version: PRICE_VERSION,
        createdBy: "admin",
        approvedBy: "reviewer",
        createdAt: AT,
        updatedAt: AT,
      },
    ],
    media: [],
    history: [],
  };
}

async function runInProcessChain() {
  const { resolverModule, bindingModule, checkoutModule, orderModule } =
    await loadPricingModules();
  const product = detailFixture();
  const source = {
    async readProductForPricing(productId) {
      return productId === product.id ? product : null;
    },
  };
  const resolver = resolverModule.createAuthoritativePriceResolver(source);
  const deps = {
    variants: {
      async findVariantBySku(sku) {
        const matches = product.variants.filter((variant) => variant.sku === sku);
        if (matches.length !== 1) return null;
        const variant = matches[0];
        return {
          productId: variant.productId,
          variantId: variant.id,
          sku: variant.sku,
          displayName: DISPLAY_NAME,
        };
      },
    },
    priceResolver: resolver,
  };
  const authorized = resolverModule.authorizeAudienceFromServerIdentity({
    audience: "retail",
    sourceVersion: "session-v1",
    evaluatedAt: AT,
  });
  assert(authorized !== null, "audience authorization failed");

  const bound = await bindingModule.bindCartPrice(
    { sku: SKU, quantity: QUANTITY, authenticatedAudience: authorized, currency: "USD", at: AT },
    deps,
  );
  assert(bound.state === "bound", `bindCartPrice: ${JSON.stringify(bound)}`);

  const recompute = await checkoutModule.recomputeCheckout(
    {
      serverLines: [{ sku: SKU, quantity: QUANTITY }],
      presented: {
        lines: [
          {
            sku: SKU,
            quantity: QUANTITY,
            unitAmountCents: bound.snapshot.unitAmountCents,
            lineTotalCents: bound.snapshot.lineTotalCents,
            priceVersion: bound.snapshot.priceVersion,
          },
        ],
        subtotalCents: bound.snapshot.lineTotalCents,
        currency: "USD",
      },
      authenticatedAudience: authorized,
      currency: "USD",
      at: AT,
    },
    deps,
  );
  assert(
    recompute.state === "quoted",
    `recomputeCheckout: ${JSON.stringify(recompute)}`,
  );

  const snapshots = orderModule.snapshotOrderLinesFromQuote(recompute.quote);
  assert(
    snapshots.state === "complete",
    `snapshotOrderLinesFromQuote: ${JSON.stringify(snapshots)}`,
  );

  const mapping = orderModule.toOrderLinePriceColumns(snapshots.lines[0]);
  assert(
    mapping.state === "mapped",
    `toOrderLinePriceColumns: ${JSON.stringify(mapping)}`,
  );
  const columns = mapping.columns;

  // The chain output must match the seeded authority facts exactly; the
  // database join below re-proves this against the real tables.
  assert(columns.price_id === PRICE_ID, "chain drifted: price_id");
  assert(columns.price_version === PRICE_VERSION, "chain drifted: price_version");
  assert(columns.audience === "retail", "chain drifted: audience");
  assert(columns.unit_amount_cents === AMOUNT_CENTS, "chain drifted: unit_amount_cents");
  assert(columns.currency === "USD", "chain drifted: currency");
  assert(columns.priced_at === AT, "chain drifted: priced_at");

  return { columns, lineTotalCents: bound.snapshot.lineTotalCents };
}

// ---------------------------------------------------------------------------
// Phase 2: the disposable database
// ---------------------------------------------------------------------------

function docker(args, options = {}) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error) fail(`docker ${args[0]}: ${result.error.message}`);
  return result;
}

function dockerOrFail(args, label, options = {}) {
  const result = docker(args, options);
  if (result.status !== 0) {
    console.error(result.stdout ?? "");
    console.error(result.stderr ?? "");
    fail(`${label} exited ${result.status}`);
  }
  return result;
}

function psql(containerName, args, label, input) {
  return dockerOrFail(
    [
      "exec",
      ...(input === undefined ? [] : ["-i"]),
      containerName,
      "psql",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "--no-psqlrc",
      ...args,
    ],
    label,
    input === undefined ? {} : { input },
  );
}

async function waitForPostgres(containerName) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = docker([
      "exec",
      containerName,
      "pg_isready",
      "-U",
      "postgres",
    ]);
    if (ready.status === 0) {
      // pg_isready can pass during the initdb double-start; require a real query.
      const probe = docker([
        "exec", containerName, "psql", "-U", "postgres", "-Atc", "select 1",
      ]);
      if (probe.status === 0 && probe.stdout.trim() === "1") return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  fail("postgres did not become ready within 60s");
}

// Verbatim replica of the dormant Track B order tables, the same convergence
// device supabase/verification/research-pricing-lineage.verify.sql section [2]
// uses (research_orders, research_order_lines, indexes, enable-RLS posture).
const TRACK_B_ORDER_TABLES_SQL = `
\\set ON_ERROR_STOP on
create table if not exists public.research_orders (
  id                      uuid primary key default gen_random_uuid(),
  member_id               uuid not null,
  state                   text not null default 'draft'
                            check (state in ('draft','checkout_pending','payment_authorized',
                                             'manual_review','approved','payment_captured',
                                             'processing','partially_fulfilled','fulfilled',
                                             'delivered','exception','cancelled','refunded','replaced')),
  subtotal_cents          bigint not null check (subtotal_cents >= 0),
  shipping_cents          bigint not null default 0 check (shipping_cents >= 0),
  store_credit_applied_cents bigint not null default 0 check (store_credit_applied_cents >= 0),
  total_cents             bigint not null check (total_cents >= 0),
  authorized_amount_cents bigint check (authorized_amount_cents >= 0),
  captured_amount_cents   bigint check (captured_amount_cents >= 0),
  refunded_cents          bigint not null default 0 check (refunded_cents >= 0),
  payment_reference       text,
  checkout_idempotency_key text,
  last_idempotency_key    text,
  review_triggers         text[] not null default '{}',
  placed_at               timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint research_orders_paid_needs_provider_reference
    check (state not in ('payment_authorized','payment_captured','refunded')
           or payment_reference is not null),
  constraint research_orders_capture_within_authorization
    check (captured_amount_cents is null
           or authorized_amount_cents is null
           or captured_amount_cents <= authorized_amount_cents),
  constraint research_orders_refund_within_capture
    check (captured_amount_cents is null or refunded_cents <= captured_amount_cents),
  constraint research_orders_idempotency_unique unique (member_id, checkout_idempotency_key)
);
create index if not exists research_orders_member_idx on public.research_orders (member_id);
create index if not exists research_orders_state_idx on public.research_orders (state);
create index if not exists research_orders_review_idx
  on public.research_orders (created_at) where state = 'manual_review';

create table if not exists public.research_order_lines (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.research_orders (id) on delete cascade,
  sku              text not null,
  display_name     text not null,
  quantity         integer not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  line_total_cents bigint not null check (line_total_cents >= 0),
  fulfillment_owner text not null check (fulfillment_owner in ('mitch','xenios'))
);
create index if not exists research_order_lines_order_idx on public.research_order_lines (order_id);

alter table public.research_orders      enable row level security;
alter table public.research_order_lines enable row level security;
`;

// The seed + candidate insert + assertions. psql variables carry the REAL
// mapper output; session GUCs carry them into the DO-block assertions.
const ROUNDTRIP_SQL = `
\\set ON_ERROR_STOP on

-- Seed the authority rows mirroring the in-process fixture.
insert into public.research_products (id, sku, display_name, canonical_name)
values (:'product_id', :'product_sku', 'Roundtrip Research', 'Roundtrip Research');
insert into public.research_product_variants (id, product_id, sku, label, created_by, updated_by)
values (:'variant_id', :'product_id', :'sku', 'Standard vial', 'roundtrip', 'roundtrip');
insert into public.research_product_prices (
  id, product_id, variant_id, audience, amount_cents, currency,
  effective_at, status, version, created_by
) values (
  :'price_id', :'product_id', :'variant_id', :'audience', :amount, :'currency',
  :'effective_at', 'active', :price_version, 'roundtrip'
);

-- The order shell the candidate line belongs to.
insert into public.research_orders (id, member_id, subtotal_cents, total_cents)
values (:'order_id', '00000000-0000-4000-8000-000000000001', :line_total, :line_total);

-- THE candidate insert: the real toOrderLinePriceColumns output, unmodified.
insert into public.research_order_lines (
  id, order_id, sku, display_name, quantity,
  unit_price_cents, line_total_cents, fulfillment_owner,
  price_id, price_version, audience, unit_amount_cents, currency, priced_at
) values (
  :'line_id', :'order_id', :'sku', :'display_name', :quantity,
  :amount, :line_total, 'xenios',
  :'price_id', :price_version, :'audience', :amount, :'currency', :'priced_at'
);
\\echo PASS mapper-output INSERT accepted

select set_config('roundtrip.line_id', :'line_id', false);
select set_config('roundtrip.price_id', :'price_id', false);
select set_config('roundtrip.priced_at', :'priced_at', false);
select set_config('roundtrip.order_id', :'order_id', false);

do $$
declare
  -- v_ prefixes so plpgsql variable substitution never collides with the
  -- price_id / priced_at column names inside the queries below.
  v_line_id uuid := current_setting('roundtrip.line_id')::uuid;
  v_price_id uuid := current_setting('roundtrip.price_id')::uuid;
  v_priced_at timestamptz := current_setting('roundtrip.priced_at')::timestamptz;
begin
  -- [A] The stored line is the all-six-non-null coherent shape.
  if not exists (
    select 1 from public.research_order_lines line
     where line.id = v_line_id
       and line.price_id is not null
       and line.price_version is not null
       and line.audience is not null
       and line.unit_amount_cents is not null
       and line.currency is not null
       and line.priced_at is not null
  ) then
    raise exception 'candidate line is not the all-six-non-null snapshot shape';
  end if;
  if not exists (
    select 1 from public.research_order_lines line
     where line.id = v_line_id and line.priced_at = v_priced_at
  ) then
    raise exception 'priced_at did not roundtrip through timestamptz';
  end if;

  -- [B] The coherence CHECK exists and actively rejects a partial snapshot.
  if not exists (
    select 1 from pg_constraint
     where conname = 'research_order_lines_price_snapshot_coherent'
       and conrelid = 'public.research_order_lines'::regclass
  ) then
    raise exception 'coherence CHECK is missing: was the lineage migration a no-op?';
  end if;
  begin
    insert into public.research_order_lines (
      order_id, sku, display_name, quantity,
      unit_price_cents, line_total_cents, fulfillment_owner,
      price_id
    ) values (
      current_setting('roundtrip.order_id')::uuid, 'PARTIAL-SKU', 'Partial snapshot probe', 1,
      100, 100, 'xenios',
      v_price_id
    );
    raise exception 'partial snapshot insert was accepted; coherence CHECK did not fire';
  exception
    when check_violation then
      if sqlerrm not like '%research_order_lines_price_snapshot_coherent%' then
        raise exception 'partial snapshot rejected by the wrong constraint: %', sqlerrm;
      end if;
  end;

  -- [C] The captured lineage reconciles against the governed price row.
  if not exists (
    select 1
      from public.research_order_lines line
      join public.research_product_prices price on price.id = line.price_id
     where line.id = v_line_id
       and price.id = v_price_id
       and price.version = line.price_version
       and price.amount_cents = line.unit_amount_cents
       and price.audience = line.audience
       and price.currency = line.currency
  ) then
    raise exception 'price_id join does not reconcile version/amount/audience/currency';
  end if;
end;
$$;
\\echo PASS coherence CHECK holds and the price_id join reconciles
`;

async function runDatabaseRoundtrip(columns, lineTotalCents) {
  const containerName = `xca-w8-roundtrip-${randomBytes(4).toString("hex")}`;
  const supabaseMount = `${REPO_ROOT.replace(/\\/g, "/")}/supabase:/xenios-supabase:ro`;
  console.log(`Starting disposable container ${containerName} (postgres:16, no ports)`);
  dockerOrFail(
    [
      "run",
      "-d",
      "--name",
      containerName,
      "-e",
      "POSTGRES_PASSWORD=postgres",
      "-v",
      supabaseMount,
      "postgres:16",
    ],
    "docker run",
  );
  try {
    await waitForPostgres(containerName);

    console.log("Applying the disposable pricing-lineage bootstrap (repo migrations included)");
    const bootstrap = psql(
      containerName,
      ["-f", "/xenios-supabase/verification/research-pricing-lineage-disposable-bootstrap.sql"],
      "bootstrap",
    );
    process.stdout.write(bootstrap.stderr ?? "");

    console.log("Creating the dormant Track B order tables (verifier-verbatim replica)");
    psql(containerName, ["-f", "-"], "track B order tables", TRACK_B_ORDER_TABLES_SQL);

    console.log("Applying 20260729000000_research_pricing_lineage.sql");
    psql(
      containerName,
      ["-f", "/xenios-supabase/migrations/20260729000000_research_pricing_lineage.sql"],
      "lineage migration",
    );

    console.log("Inserting the real mapper output and asserting coherence + join");
    const roundtrip = psql(
      containerName,
      [
        "-v", `product_id=${PRODUCT_ID}`,
        "-v", `variant_id=${VARIANT_ID}`,
        "-v", `price_id=${columns.price_id}`,
        "-v", `order_id=${ORDER_ID}`,
        "-v", `line_id=${LINE_ID}`,
        "-v", `sku=${SKU}`,
        "-v", `product_sku=${PRODUCT_SKU}`,
        "-v", `display_name=${DISPLAY_NAME}`,
        "-v", `audience=${columns.audience}`,
        "-v", `amount=${columns.unit_amount_cents}`,
        "-v", `currency=${columns.currency}`,
        "-v", `price_version=${columns.price_version}`,
        "-v", `priced_at=${columns.priced_at}`,
        "-v", `effective_at=${EFFECTIVE_AT}`,
        "-v", `quantity=${QUANTITY}`,
        "-v", `line_total=${lineTotalCents}`,
        "-f", "-",
      ],
      "roundtrip insert + assertions",
      ROUNDTRIP_SQL,
    );
    const output = `${roundtrip.stdout ?? ""}\n${roundtrip.stderr ?? ""}`;
    process.stdout.write(roundtrip.stdout ?? "");
    assert(
      output.includes("PASS mapper-output INSERT accepted"),
      "missing PASS marker for the candidate insert",
    );
    assert(
      output.includes("PASS coherence CHECK holds and the price_id join reconciles"),
      "missing PASS marker for coherence + join",
    );
  } finally {
    console.log(`Removing container ${containerName}`);
    docker(["rm", "-f", containerName]);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

try {
  const { columns, lineTotalCents } = await runInProcessChain();
  console.log("In-process chain complete. Real mapper output:");
  console.log(JSON.stringify(columns, null, 2));
  await runDatabaseRoundtrip(columns, lineTotalCents);
  console.log("ROUNDTRIP PASS: the real chain output was accepted, coherent, and reconciled.");
} catch (cause) {
  if (process.exitCode !== 1) {
    console.error(`Unexpected failure: ${cause?.stack ?? cause}`);
    process.exitCode = 1;
  }
}
