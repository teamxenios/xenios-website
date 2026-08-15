/**
 * Plan, and on explicit authorization execute, the general Product Control
 * initialization for the 420-row MASTER CATALOG workbook: the data half of
 * Phase 0. Products and variants enter Product Control through the same
 * governed choreography the Early Access initializer proved
 * (create, walk each variant draft to approved and active, then publish the
 * product), and every member base price enters as a draft that is approved
 * through the audited RPC pair, so each amount is versioned, windowed, and
 * attributable. This file issues no SQL.
 *
 * Usage:
 *   npx tsx scripts/research/initialize-general-product-control.ts \
 *     .local/research/kris-launch-a/private-intake.json           # dry-run plan
 *   XENIOS_ALLOW_GENERAL_PC_INITIALIZATION=YES npx tsx ... --execute
 *
 * WHAT IT PLANS, exactly:
 *   - PRICED unit rows (417): the 418 rows with a usable Suggested Sell Price
 *     minus the FedEx per-shipment row, which the founder directive models as
 *     a shipping service, never a normal product. It is EXCLUDED here and
 *     named in the reconciliation, so no row is lost silently.
 *   - Products group by (Family, Product); each source row is one variant
 *     (label = the normalized specification, memberEligible, sku GEN-<GroupID>).
 *   - One member-audience USD price per variant from Suggested Sell Price,
 *     created as a draft and approved in the same run. The price is for the
 *     exact normalized listed unit; MOQ and pack basis remain display facts
 *     carried by the catalog dataset, never multipliers applied here.
 *   - The 2 price-pending rows (BAM15 500 mcg; Syringes & Alcohol Swabs) get
 *     NO price row of any kind: a missing price never becomes an amount.
 *
 * IDEMPOTENT RE-RUN: an existing productCode is loaded rather than recreated,
 * an existing sku is skipped, and a variant that already carries an active
 * member price is left alone, so a crashed run resumes instead of duplicating.
 *
 * The run report includes the sku-to-Product-Control identity map that the
 * binding-store generator consumes; bindings are a separate reviewed artifact.
 */

import fs from "node:fs";
import path from "node:path";
import type {
  CreateAdminPriceInput,
  CreateAdminProductInput,
  CreateAdminVariantInput,
} from "@shared/research/product-admin";
import type { ProductLane } from "@shared/research/catalog";

const PRICE_PENDING_OK = new Set(["BAM15 500 mcg", "Syringes & Alcohol Swabs"]);
const SHIPPING_SERVICE_PRODUCTS = new Set(["FedEx Standard Overnight"]);

const LANE_BY_CHANNEL: Readonly<Record<string, ProductLane>> = {
  "Clinical / Provider Only": "future_clinical",
  "RUO Research": "research_material",
  "Supplier Catalog / Classification Pending": "research_material",
  Supplement: "supplement",
  "Nonclinical / Topical": "supplement",
};

interface IntakeRow {
  readonly sheetRow: number;
  readonly [column: string]: unknown;
}

interface PlannedVariantRow {
  readonly sheetRow: number;
  readonly groupId: string;
  readonly family: string;
  readonly productName: string;
  readonly specification: string;
  readonly sku: string;
  readonly input: CreateAdminVariantInput;
  readonly priceCents: number | null;
  readonly quoteBasis: string | null;
  readonly moq: number | null;
}

interface PlannedProductGroup {
  readonly key: string;
  readonly create: CreateAdminProductInput;
  readonly variants: PlannedVariantRow[];
}

function text(row: IntakeRow, column: string): string {
  const value = row[column];
  return typeof value === "string" ? value.trim() : "";
}

function numeric(value: unknown): number | null {
  // The stdlib exporter serializes every cell as text, so "200", "$1,234.50"
  // and 200 are the same fact. Anything that does not parse to a positive
  // finite number is not a usable value, never a zero.
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/[$,\s]/g, ""))
        : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function money(row: IntakeRow, column: string): number | null {
  const amount = numeric(row[column]);
  return amount === null ? null : Math.round(amount * 100);
}

function slugPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export interface GeneralPlan {
  readonly groups: readonly PlannedProductGroup[];
  readonly accounting: {
    sourceRows: number;
    pricedUnitRows: number;
    pricePendingRows: number;
    shippingServiceRows: number;
    products: number;
    variants: number;
    unknown: number;
  };
  readonly excluded: readonly string[];
}

export function planGeneralProductControl(rows: readonly IntakeRow[]): GeneralPlan {
  const groups = new Map<string, PlannedProductGroup>();
  const excluded: string[] = [];
  let pricePendingRows = 0;
  let shippingServiceRows = 0;
  let unknown = 0;
  let variants = 0;

  for (const row of rows) {
    const family = text(row, "Family");
    const channel = text(row, "Channel");
    const productName = text(row, "Product");
    const specification = text(row, "Normalized Specification");
    const groupId = text(row, "Group ID");
    const priceCents = money(row, "Suggested Sell Price");

    if (!family || !channel || !productName || !specification || !groupId) {
      unknown += 1;
      excluded.push(`sheet row ${row.sheetRow}: incomplete identity, refused`);
      continue;
    }
    if (SHIPPING_SERVICE_PRODUCTS.has(productName)) {
      shippingServiceRows += 1;
      excluded.push(
        `sheet row ${row.sheetRow}: ${productName} is a shipping service by founder directive, modeled as a fee in the commerce phase, not a product`,
      );
      continue;
    }
    if (priceCents === null) {
      if (!PRICE_PENDING_OK.has(specification) && !PRICE_PENDING_OK.has(productName)) {
        unknown += 1;
        excluded.push(
          `sheet row ${row.sheetRow}: no usable price and not a known price-pending row, refused`,
        );
        continue;
      }
      pricePendingRows += 1;
      excluded.push(
        `sheet row ${row.sheetRow}: ${productName} is price pending; it enters Product Control with NO price row when priced by the founder, not before`,
      );
      continue;
    }

    const lane = LANE_BY_CHANNEL[channel];
    if (!lane) {
      unknown += 1;
      excluded.push(`sheet row ${row.sheetRow}: unknown channel "${channel}", refused`);
      continue;
    }

    // Case-insensitive: the workbook carries case variants of one product
    // name ("Aod-9604" and "AOD-9604"); they are one product whose
    // specifications are separate variants, and reconciling them is the
    // duplicate detection the ingestion contract requires.
    const key = `${family} ${productName}`.toLowerCase();
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        create: {
          productCode: `GEN-${slugPart(family).toUpperCase().slice(0, 10)}-${slugPart(productName).toUpperCase().slice(0, 40)}`,
          slug: slugPart(`${family} ${productName}`),
          displayName: productName,
          canonicalName: productName,
          aliases: [productName],
          lane,
          category: family,
          classification: channel,
        },
        variants: [],
      };
      groups.set(key, group);
    }
    variants += 1;
    const dosageForm = text(row, "Dosage Form") || null;
    const moqValue = numeric(row["MOQ"]);
    group.variants.push({
      sheetRow: row.sheetRow,
      groupId,
      family,
      productName,
      specification,
      sku: `GEN-${groupId}`,
      input: {
        sku: `GEN-${groupId}`,
        label: specification,
        strength: specification,
        format: dosageForm,
        memberEligible: true,
        sortOrder: group.variants.length,
      },
      priceCents,
      quoteBasis: text(row, "Quote Basis") || null,
      moq: moqValue,
    });
  }

  const groupList = Array.from(groups.values());
  return {
    groups: groupList,
    accounting: {
      sourceRows: rows.length,
      pricedUnitRows: variants,
      pricePendingRows,
      shippingServiceRows,
      products: groupList.length,
      variants,
      unknown,
    },
    excluded,
  };
}

// ---------------------------------------------------------------------------
// Direct run
// ---------------------------------------------------------------------------

const isDirectRun = process.argv[1]?.includes("initialize-general-product-control");
if (isDirectRun) {
  void (async () => {
    const inputArgument = process.argv[2];
    if (!inputArgument) {
      console.error("usage: initialize-general-product-control.ts <private-intake.json> [--execute]");
      process.exit(1);
    }
    const intake = JSON.parse(fs.readFileSync(path.resolve(inputArgument), "utf8")) as {
      privateIntake: true;
      masterRows: IntakeRow[];
    };
    if (intake.privateIntake !== true || !Array.isArray(intake.masterRows)) {
      console.error("REFUSED: input is not the private intake");
      process.exit(1);
    }
    const plan = planGeneralProductControl(intake.masterRows);
    console.log(JSON.stringify(plan.accounting, null, 2));
    for (const line of plan.excluded) console.log(`EXCLUDED: ${line}`);

    const emitSqlIndex = process.argv.indexOf("--emit-sql");
    if (emitSqlIndex !== -1) {
      // Emit guarded plpgsql batches for execution through the Supabase MCP
      // when this host holds no service credentials. Reads are SELECT guards
      // for idempotency; every WRITE goes through the same SECURITY DEFINER
      // admin RPCs the HTTP path uses, so audit rows land identically.
      const outDir = path.resolve(process.argv[emitSqlIndex + 1] ?? ".local/research/gpc-batches");
      fs.mkdirSync(outDir, { recursive: true });
      const ACTOR = "general-catalog-initializer (founder-directed Phase 0)";
      const BATCH = 20;
      const j = (value: unknown): string => `$gpc$${JSON.stringify(value)}$gpc$::jsonb`;
      const s = (value: string): string => `$gpc$${value}$gpc$`;
      let batchIndex = 0;
      for (let start = 0; start < plan.groups.length; start += BATCH) {
        const slice = plan.groups.slice(start, start + BATCH);
        const blocks = slice.map((group) => {
          const variantBlocks = group.variants
            .map(
              (variant) => `
  select id, status, active into v_variant, v_status, v_active
    from public.research_product_variants where sku = ${s(variant.sku)};
  if v_variant is null then
    v_variant := public.research_admin_create_product_variant(v_product, ${j(variant.input)}, ${s(ACTOR)}, now());
    v_status := 'draft'; v_active := false;
  end if;
  if v_status <> 'approved' or not v_active then
    perform public.research_admin_update_product_variant(v_product, v_variant, '{"status":"approved","active":true}'::jsonb, ${s(ACTOR)}, now());
  end if;
  if not exists (
    select 1 from public.research_product_prices
    where variant_id = v_variant and audience = 'member' and status in ('approved','active')
  ) then
    v_price := public.research_admin_create_product_price(
      v_product,
      jsonb_build_object(
        'variantId', v_variant, 'audience', 'member',
        'amountCents', ${variant.priceCents}, 'currency', 'USD',
        'effectiveAt', now(),
        'approvalNote', ${s("Founder base price from XENIOS_MASTER_CATALOG_ONLY_2026-08-13 Suggested Sell Price, per exact listed unit")}
      ),
      ${s(ACTOR)}, now());
    perform public.research_admin_approve_product_price(v_product, v_price, ${s(ACTOR)}, now());
  end if;`,
            )
            .join("\n");
          return `
  select id into v_product from public.research_products where sku = ${s(group.create.productCode)};
  if v_product is null then
    v_product := public.research_admin_create_product(${j(group.create)}, ${s(ACTOR)}, now());
  end if;
${variantBlocks}
  if not exists (
    select 1 from public.research_products
    where id = v_product and admin_status = 'published' and active_state and visibility_state = 'public'
  ) then
    perform public.research_admin_transition_product(v_product, 'published', true, 'public', ${s(ACTOR)}, now(), ${s("General catalog initialization: founder-directed Phase 0 publication")});
  end if;`;
        });
        const sql = `do $do$\ndeclare\n  v_product uuid; v_variant uuid; v_price uuid; v_status text; v_active boolean;\nbegin${blocks.join("\n")}\nend\n$do$;\n`;
        batchIndex += 1;
        fs.writeFileSync(path.join(outDir, `batch-${String(batchIndex).padStart(2, "0")}.sql`), sql);
      }
      console.log(`\nEMITTED ${batchIndex} SQL batches to ${outDir}. Nothing was written to any database.`);
      return;
    }

    const emitChunksIndex = process.argv.indexOf("--emit-mcp-chunks");
    if (emitChunksIndex !== -1) {
      // Compact data-driven batches for the Supabase MCP: one fixed plpgsql
      // wrapper loops a jsonb array of rows, so the payload is data, not
      // repeated procedure text. Guards are SELECT reads; every write goes
      // through the same SECURITY DEFINER admin RPCs.
      const outDir = path.resolve(process.argv[emitChunksIndex + 1] ?? ".local/research/gpc-chunks");
      fs.mkdirSync(outDir, { recursive: true });
      const rowsOut: Array<Record<string, unknown>> = [];
      for (const group of plan.groups) {
        group.variants.forEach((variant, index) => {
          rowsOut.push({
            pc: group.create.productCode,
            ...(index === 0 ? { p: group.create } : {}),
            vs: variant.sku,
            v: variant.input,
            cents: variant.priceCents,
          });
        });
      }
      const CHUNK = 40;
      let chunkIndex = 0;
      for (let start = 0; start < rowsOut.length; start += CHUNK) {
        const data = JSON.stringify(rowsOut.slice(start, start + CHUNK));
        const sql = `do $do$
declare
  r jsonb; v_product uuid; v_variant uuid; v_price uuid; v_status text; v_active boolean;
  actor text := 'general-catalog-initializer (founder-directed Phase 0)';
  note text := 'Founder base price from XENIOS_MASTER_CATALOG_ONLY_2026-08-13 Suggested Sell Price, per exact listed unit';
  rows jsonb := $data$${data}$data$::jsonb;
begin
  for r in select * from jsonb_array_elements(rows) loop
    select id into v_product from public.research_products where sku = r->>'pc';
    if v_product is null then
      if r->'p' is null then
        raise exception 'row for % arrived before its product definition', r->>'pc';
      end if;
      v_product := public.research_admin_create_product(r->'p', actor, now());
    end if;
    select id, status, active into v_variant, v_status, v_active
      from public.research_product_variants where sku = r->>'vs';
    if v_variant is null then
      -- Every admin RPC returns the PRODUCT id for the repository's re-fetch
      -- pattern, so entity ids are re-selected after creation, never assumed.
      perform public.research_admin_create_product_variant(v_product, r->'v', actor, now());
      select id, status, active into v_variant, v_status, v_active
        from public.research_product_variants where sku = r->>'vs';
      if v_variant is null then
        raise exception 'variant % did not land', r->>'vs';
      end if;
    end if;
    if v_status = 'draft' then
      perform public.research_admin_update_product_variant(v_product, v_variant, '{"status":"in_review"}'::jsonb, actor, now());
      v_status := 'in_review';
    end if;
    if v_status = 'in_review' then
      perform public.research_admin_update_product_variant(v_product, v_variant, '{"status":"approved"}'::jsonb, actor, now());
      v_status := 'approved';
    end if;
    if v_status = 'approved' and not coalesce(v_active, false) then
      perform public.research_admin_update_product_variant(v_product, v_variant, '{"active":true}'::jsonb, actor, now());
    end if;
    if not exists (
      select 1 from public.research_product_prices
      where variant_id = v_variant and audience = 'member' and status in ('approved','active')
    ) then
      perform public.research_admin_create_product_price(
        v_product,
        jsonb_build_object('variantId', v_variant, 'audience', 'member',
          'amountCents', (r->>'cents')::integer, 'currency', 'USD',
          'effectiveAt', now(), 'approvalNote', note),
        actor, now());
      select id into v_price from public.research_product_prices
        where variant_id = v_variant and audience = 'member' and status = 'draft'
        order by created_at desc limit 1;
      if v_price is null then
        raise exception 'price draft for % did not land', r->>'vs';
      end if;
      perform public.research_admin_approve_product_price(v_product, v_price, actor, now());
    end if;
    if not exists (
      select 1 from public.research_products
      where id = v_product and admin_status = 'published' and active_state and visibility_state = 'public'
    ) then
      perform public.research_admin_transition_product(v_product, 'published', true, 'public', actor, now(), 'General catalog initialization: founder-directed Phase 0 publication');
    end if;
  end loop;
end
$do$;
`;
        chunkIndex += 1;
        fs.writeFileSync(path.join(outDir, `chunk-${String(chunkIndex).padStart(2, "0")}.sql`), sql);
      }
      console.log(
        `\nEMITTED ${chunkIndex} MCP chunks (${rowsOut.length} rows) to ${outDir}. Nothing was written to any database.`,
      );
      return;
    }

    const execute = process.argv.includes("--execute");
    if (!execute) {
      console.log("\nDRY RUN ONLY. Nothing was written. Pass --execute with");
      console.log("XENIOS_ALLOW_GENERAL_PC_INITIALIZATION=YES to write production.");
      return;
    }
    if (process.env.XENIOS_ALLOW_GENERAL_PC_INITIALIZATION !== "YES") {
      console.error("REFUSED: --execute requires XENIOS_ALLOW_GENERAL_PC_INITIALIZATION=YES");
      process.exit(77);
    }

    const { SupabaseProductAdminRepository } = await import(
      "../../server/research/products-diagnostics/product-admin-production"
    );
    const repository = new SupabaseProductAdminRepository();
    const actor = "general-catalog-initializer (founder-directed Phase 0)";
    const at = new Date().toISOString();
    const skuToIdentity: Record<string, { productId: string; variantId: string }> = {};
    let productsCreated = 0;
    let productsExisting = 0;
    let variantsCreated = 0;
    let pricesApproved = 0;

    for (const group of plan.groups) {
      // Idempotency: an existing productCode is loaded, never recreated.
      const listed = await repository.list({ q: group.create.productCode });
      const existing = listed.find(
        (item: { productCode: string; id: string }) =>
          item.productCode === group.create.productCode,
      );
      let detail =
        existing !== undefined
          ? await repository.get(existing.id)
          : await repository.create(group.create, actor, at);
      if (existing !== undefined) productsExisting += 1;
      else productsCreated += 1;
      if (!detail) throw new Error(`product vanished: ${group.create.productCode}`);

      for (const planned of group.variants) {
        let variant = detail.variants.find((item: { sku: string }) => item.sku === planned.sku);
        if (!variant) {
          detail = await repository.createVariant(detail.id, planned.input, actor, at);
          variant = detail.variants.find((item: { sku: string }) => item.sku === planned.sku);
          if (!variant) throw new Error(`variant did not land: ${planned.sku}`);
          variantsCreated += 1;
        }
        if (variant.status !== "approved" || !variant.active) {
          detail = await repository.updateVariant(
            detail.id,
            variant.id,
            { status: "approved", active: true },
            actor,
            at,
          );
          variant = detail.variants.find((item: { sku: string }) => item.sku === planned.sku);
        }
        skuToIdentity[planned.sku] = { productId: detail.id, variantId: variant.id };

        const hasActiveMemberPrice = (detail.prices ?? []).some(
          (price: { variantId: string; audience: string; status: string }) =>
            price.variantId === variant.id &&
            price.audience === "member" &&
            (price.status === "active" || price.status === "approved"),
        );
        if (!hasActiveMemberPrice && planned.priceCents !== null) {
          const priceInput: CreateAdminPriceInput = {
            variantId: variant.id,
            audience: "member",
            amountCents: planned.priceCents,
            currency: "USD",
            effectiveAt: at,
            approvalNote:
              "Founder base price from XENIOS_MASTER_CATALOG_ONLY_2026-08-13 Suggested Sell Price, per exact listed unit",
          };
          detail = await repository.createPrice(detail.id, priceInput, actor, at);
          const draft = (detail.prices ?? []).find(
            (price: { variantId: string; audience: string; status: string; id: string }) =>
              price.variantId === variant.id &&
              price.audience === "member" &&
              price.status === "draft",
          );
          if (!draft) throw new Error(`price draft did not land: ${planned.sku}`);
          detail = await repository.approvePrice(detail.id, draft.id, actor, at);
          pricesApproved += 1;
        }
      }

      if (detail.status !== "published" || !detail.active) {
        await repository.setLifecycle(
          detail.id,
          { status: "published", active: true, visibility: "public" },
          actor,
          at,
          "General catalog initialization: founder-directed Phase 0 publication",
        );
      }
      console.log(`DONE ${group.create.productCode} (${group.variants.length} variants)`);
    }

    const outDir = path.resolve(".local/research/master-offerings");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, "general-pc-identities.json"),
      `${JSON.stringify({ generatedAt: at, skuToIdentity }, null, 1)}\n`,
    );
    console.log(
      JSON.stringify({
        ok: true,
        productsCreated,
        productsExisting,
        variantsCreated,
        pricesApproved,
        identities: Object.keys(skuToIdentity).length,
      }),
    );
  })().catch((error) => {
    console.error(`\nREFUSED: ${(error as Error).message}`);
    process.exit(1);
  });
}
