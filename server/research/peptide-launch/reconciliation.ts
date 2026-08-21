import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * PEPTIDE LAUNCH RECONCILIATION.
 *
 * Answers one question from the three artifacts that already ship, and answers
 * it the same way every time: **which research peptides can a customer
 * actually order directly today, and what stands between the rest and the
 * founder's launch target?**
 *
 * It reads and decides nothing else. Pathway policy belongs to
 * `shared/research/early-access/customer-pathway.ts`, which another writer
 * owns; this module deliberately re-implements none of it. What it does is
 * measure the DATA those rules will run against, because the launch target is
 * a claim about data ("141 rows, 112 confirmed RUO") and nobody had checked
 * whether the shipped artifacts can support it.
 *
 * The three inputs are the ones production actually serves:
 *   - the member-safe catalog artifact (what exists, and its display state)
 *   - the commerce binding artifact (whether a row has a Product Control id)
 *   - the captured production price snapshot (whether it has an approved price)
 *
 * Read as data through `fs`, never imported as modules: the catalog lane owns
 * those directories and a boundary test pins that only the composition root
 * imports its code.
 */

/** Classification-pending is carried as this display state, on either level. */
const PENDING_STATE = "approval_required";

/** The one family approved for direct Early Access peptide purchase. */
export const DIRECT_PEPTIDE_FAMILY = "research_peptides_materials";

/**
 * The ONE explicitly held formulation, per the founder decision of 2026-08-21.
 *
 * NARROW ON PURPOSE, and it was wrong before. The first version of this matched
 * any label containing "with DAC", which flagged the standalone
 * `CJC-1295 WITH DAC 2 mg` and `5 mg` rows. Those are confirmed RUO, priced,
 * and the founder has ruled them DIRECT. The hold covers only the COMBINATION
 * product, whose component split is unresolved:
 *
 *     GRP-0422 · CJC-1295 + Ipamorelin WITH DAC · 5 mg total · $99
 *
 * So the rule is the conjunction that actually identifies it — CJC **and**
 * Ipamorelin **and** with-DAC — rather than the with-DAC substring alone. The
 * founder's instruction was explicit: do not broaden this hold. A standalone
 * with-DAC row must not match, and the tests sweep every shape both ways.
 *
 * The SKU is checked too, so the hold binds to the exact row the moment that
 * product is generated into the catalog (it is absent from the shipped
 * artifact today) and stops depending on label wording at all.
 */
const HELD_SKUS = new Set(["GRP-0422"]);

function labelIsHeldCombination(label: string): boolean {
  const value = label.toLowerCase();
  const withDac = /with\s*[-_ ]?\s*dac/.test(value);
  if (!withDac) return false;
  // The combination, not the standalone. Both components must be named.
  return /cjc/.test(value) && /ipamorelin/.test(value);
}

export function isFormulationBlocked(label: string, sku?: string | null): boolean {
  if (sku !== undefined && sku !== null && HELD_SKUS.has(sku.toUpperCase())) {
    return true;
  }
  return labelIsHeldCombination(label);
}

export interface PeptideRow {
  productName: string;
  slug: string;
  variantLabel: string;
  /** Classification not yet confirmed, so it is a Request Order row. */
  classificationPending: boolean;
  /** Has a Product Control commerce identity. */
  bound: boolean;
  /** Approved, active, member-eligible, positive amount. */
  sellable: boolean;
  amountCents: number | null;
  sku: string | null;
  formulationBlocked: boolean;
}

export interface PeptideReconciliation {
  rows: PeptideRow[];
  totalVariants: number;
  /** Confirmed classification AND sellable: orderable directly today. */
  directToday: number;
  classificationPending: number;
  /**
   * Pending rows that are already fully commerce-ready, so classification is
   * the ONLY thing standing between them and direct purchase.
   */
  pendingButCommerceReady: number;
  /** Pending, commerce-ready, and safe to promote (not formulation-blocked). */
  pendingPromotable: number;
  /** Pending rows that must not be promoted regardless of classification. */
  pendingFormulationBlocked: PeptideRow[];
  /** Confirmed rows that still cannot be sold, with the reason. */
  confirmedNotSellable: PeptideRow[];
  /**
   * Rows that are formulation-blocked AND already confirmed and sellable, so
   * they go on direct sale the moment direct peptide purchase is enabled.
   * Reported rather than judged: whether a given formulation is blocked is a
   * founder decision, and this module's job is to make the exposure visible.
   */
  formulationBlockedButSellable: PeptideRow[];
}

interface DatasetVariant { id: string; label: string; displayState: string }
interface DatasetProduct {
  slug: string;
  displayName: string;
  family: string;
  displayState: string;
  variants: DatasetVariant[];
}

function readJson<T>(...segments: string[]): T {
  return JSON.parse(readFileSync(path.resolve(...segments), "utf8")) as T;
}

export interface ReconciliationSources {
  datasetPath: string;
  bindingsPath: string;
  priceSnapshotPath: string;
}

export function defaultSources(repoRoot: string): ReconciliationSources {
  return {
    datasetPath: path.join(
      repoRoot,
      "server/research/master-offerings/data/member-safe-master-offerings.generated.json",
    ),
    bindingsPath: path.join(
      repoRoot,
      "server/research/master-offerings/data/master-offering-bindings.generated.json",
    ),
    priceSnapshotPath: path.join(
      repoRoot,
      "docs/research-launch/PRODUCTION_MEMBER_PRICES_SNAPSHOT_2026-08-19.json",
    ),
  };
}

export function reconcilePeptideLaunch(
  sources: ReconciliationSources,
): PeptideReconciliation {
  const dataset = readJson<{ products: DatasetProduct[] }>(sources.datasetPath);
  const bindingsRaw = readJson<
    { bindings?: unknown[] } | unknown[]
  >(sources.bindingsPath);
  const snapshot = readJson<{
    prices: {
      variant_id: string;
      amount_cents: number;
      variant_status: string;
      variant_active: boolean;
      member_eligible: boolean;
    }[];
  }>(sources.priceSnapshotPath);

  const bindingList = (
    Array.isArray(bindingsRaw)
      ? bindingsRaw
      : (bindingsRaw.bindings ?? [])
  ) as { offeringVariantId: string; variantId: string; productControlSku?: string }[];
  const bindingByOfferingVariant = new Map(
    bindingList.map((b) => [b.offeringVariantId, b]),
  );
  const priceByVariantId = new Map(snapshot.prices.map((p) => [p.variant_id, p]));

  const rows: PeptideRow[] = [];
  for (const product of dataset.products) {
    if (product.family !== DIRECT_PEPTIDE_FAMILY) continue;
    for (const variant of product.variants) {
      const binding = bindingByOfferingVariant.get(variant.id);
      const price = binding ? priceByVariantId.get(binding.variantId) : undefined;
      rows.push({
        productName: product.displayName,
        slug: product.slug,
        variantLabel: variant.label,
        classificationPending:
          variant.displayState === PENDING_STATE ||
          product.displayState === PENDING_STATE,
        bound: binding !== undefined,
        sellable:
          price !== undefined &&
          price.amount_cents > 0 &&
          price.variant_status === "approved" &&
          price.variant_active === true &&
          price.member_eligible === true,
        amountCents: price?.amount_cents ?? null,
        sku: binding?.productControlSku ?? null,
        formulationBlocked: isFormulationBlocked(
          variant.label,
          binding?.productControlSku,
        ),
      });
    }
  }

  const pending = rows.filter((r) => r.classificationPending);
  const confirmed = rows.filter((r) => !r.classificationPending);
  const pendingReady = pending.filter((r) => r.sellable);

  return {
    rows,
    totalVariants: rows.length,
    directToday: confirmed.filter((r) => r.sellable && !r.formulationBlocked)
      .length,
    classificationPending: pending.length,
    pendingButCommerceReady: pendingReady.length,
    pendingPromotable: pendingReady.filter((r) => !r.formulationBlocked).length,
    pendingFormulationBlocked: pending.filter((r) => r.formulationBlocked),
    confirmedNotSellable: confirmed.filter((r) => !r.sellable),
    formulationBlockedButSellable: confirmed.filter(
      (r) => r.formulationBlocked && r.sellable,
    ),
  };
}
