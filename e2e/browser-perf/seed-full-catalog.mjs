// Seed the browser-perf local Supabase with the FULL canonical catalog scale:
// every product/variant UUID from the committed binding artifact, display data
// from the member-safe offerings artifact, retail prices from the founder CSV.
// Output: one SQL file to apply with psql. No production data involved.
import fs from "node:fs";

const ROOT = process.env.XENIOS_REPO_ROOT ?? process.cwd();
const bindingsFile = JSON.parse(fs.readFileSync(`${ROOT}/server/research/master-offerings/data/master-offering-bindings.generated.json`, "utf8"));
const bindings = Array.isArray(bindingsFile) ? bindingsFile : bindingsFile.bindings;
const offerings = JSON.parse(fs.readFileSync(`${ROOT}/server/research/master-offerings/data/member-safe-master-offerings.generated.json`, "utf8"));
const csvRaw = fs.readFileSync(`${ROOT}/docs/research-launch/XENIOS_FULL_CURRENT_RETAIL_PRICING_426_VARIANTS_2026-08-19.csv`, "utf8");

// --- CSV parse (quoted fields) ---
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const csv = parseCsv(csvRaw.replace(/^\uFEFF/, ""));
const header = csv[0];
const gi = header.indexOf("Group ID");
const pi = header.indexOf("Current Retail Price");
const priceByGrp = new Map();
for (const r of csv.slice(1)) {
  if (!r[gi]) continue;
  const n = Number.parseFloat(r[pi]);
  if (Number.isFinite(n) && n > 0) priceByGrp.set(r[gi].trim(), Math.round(n * 100));
}

// --- offerings lookup ---
const offById = new Map();
const varById = new Map();
for (const p of offerings.products) {
  offById.set(p.id, p);
  for (const v of p.variants) varById.set(v.id, { product: p, variant: v });
}

const esc = (s) => s == null ? "null" : `'${String(s).replaceAll("'", "''")}'`;

// --- build rows ---
const products = new Map(); // productId -> row
const variants = [];
const prices = [];
let missingOffering = 0, missingPrice = 0;

for (const b of bindings) {
  const grp = b.productControlSku.replace(/^GEN-/, "");
  const found = varById.get(b.offeringVariantId);
  const off = found?.product ?? offById.get(b.offeringId);
  const label = found?.variant?.label ?? b.productControlSku;
  if (!off) { missingOffering++; continue; }

  if (!products.has(b.productId)) {
    products.set(b.productId, {
      id: b.productId,
      sku: `MO-${b.offeringId}`,
      slug: `${off.slug}`.slice(0, 200),
      display_name: off.displayName,
      canonical_name: off.canonicalName ?? off.displayName,
      category: off.category,
      classification: off.family,
      lane: String(off.family ?? "").includes("clinical") ? "future_clinical" : "research_material",
      aliases: (off.aliases ?? []).slice(0, 6),
    });
  }
  variants.push({
    id: b.variantId,
    product_id: b.productId,
    sku: b.productControlSku,
    label,
    strength: label,
  });
  const cents = priceByGrp.get(grp);
  if (cents === undefined) { missingPrice++; continue; }
  for (const audience of ["retail", "member"]) {
    prices.push({ product_id: b.productId, variant_id: b.variantId, audience, cents });
  }
}

let sql = `begin;
-- full-scale catalog seed (browser-perf stack only)
truncate table public.research_product_prices cascade;
truncate table public.research_product_variants cascade;
truncate table public.research_products cascade;
`;

for (const p of products.values()) {
  const aliases = `array[${p.aliases.map(esc).join(",") || esc(p.display_name)}]::text[]`;
  sql += `insert into public.research_products (id, sku, slug, display_name, canonical_name, category, product_classification, lane, lane_decision, admin_status, active_state, visibility_state, published_at, published_by, name_aliases, created_by, updated_by, version)
values (${esc(p.id)}, ${esc(p.sku)}, ${esc(p.slug)}, ${esc(p.display_name)}, ${esc(p.canonical_name)}, ${esc(p.category)}, ${esc(p.classification)}, ${esc(p.lane)}, 'decided', 'published', true, 'public', now(), 'browser-perf-seeder', ${aliases}, 'browser-perf-seeder', 'browser-perf-seeder', 1)
on conflict (id) do nothing;
`;
}
for (const v of variants) {
  sql += `insert into public.research_product_variants (id, product_id, sku, label, strength, member_eligible, status, active, sort_order, version, created_by, updated_by)
values (${esc(v.id)}, ${esc(v.product_id)}, ${esc(v.sku)}, ${esc(v.label)}, ${esc(v.strength)}, true, 'approved', true, 0, 1, 'browser-perf-seeder', 'browser-perf-seeder')
on conflict (id) do nothing;
`;
}
for (const pr of prices) {
  sql += `insert into public.research_product_prices (product_id, variant_id, audience, amount_cents, currency, effective_at, status, version, created_by, approved_by, approved_at)
values (${esc(pr.product_id)}, ${esc(pr.variant_id)}, ${esc(pr.audience)}, ${pr.cents}, 'USD', now(), 'active', 1, 'browser-perf-seeder', 'browser-perf-seeder', now())
on conflict (variant_id, audience, version) do nothing;
`;
}
sql += "commit;\n";

fs.writeFileSync(process.argv[2] ?? "seed-full-catalog.sql", sql);
console.log(JSON.stringify({
  products: products.size,
  variants: variants.length,
  priceRows: prices.length,
  missingOffering,
  missingPrice,
}, null, 2));
