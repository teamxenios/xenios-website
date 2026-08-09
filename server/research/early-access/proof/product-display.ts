/**
 * THE AUTHORITATIVE PRODUCT DISPLAY FOR THE INTERNAL ORDER EMAIL.
 *
 * WHAT THIS FIXES. `ProductDisplayPort` had no production implementation, so
 * the one place it is consumed (`buildInternalOrderPacket`) had nothing to ask
 * and every line of the operational email would have carried the packet's
 * unresolved marker. The accelerator's version of this email was worse: it
 * printed the variant UUID where the strength belongs, and an operator reading
 * `a3f1c2de-...` cannot check an order against a payment.
 *
 * ONE CATALOGUE, NOT A SECOND ONE. The names come from
 * `createProductionProductControlReader()`, the same Product Control reader the
 * pricing adapter, the member catalogue and the Early Access catalogue
 * projection already read (server/index.ts, member-catalog-service.ts,
 * catalog/product-control-source.ts). Nothing here holds its own table of
 * product names, reads a static file, or accepts a name from a request. A name
 * that is not in Product Control is not a name this port will print.
 *
 * IT NEVER PRINTS AN IDENTIFIER AS AN IDENTITY. Every candidate string is
 * checked against the ids it is meant to describe and against the shape of a
 * UUID, so a record whose display name was filled in with its own id resolves
 * to nothing rather than to a plausible looking line. `describe` returning null
 * is the fail-closed answer, and the packet already renders it as an explicit
 * "PRODUCT NAME UNRESOLVED (check by SKU)" instead of guessing.
 *
 * WHY A SHORT MEMO. `LiveProductControlReader.readCatalog()` is deliberately
 * paranoid: it lists, re-reads each product twice, and then re-lists to prove
 * the snapshot did not move under it. That is right for a catalogue read and
 * wrong to repeat once per line of one email, where a five line cart would
 * spend hundreds of round trips inside the send timeout. So one read is shared
 * for a short window. It is safe to share because this is DISPLAY ONLY: no
 * price, no availability, no authority to sell is taken from it, and the packet
 * carries the SKU beside every name. A failed read is never memoized, so the
 * next submission retries rather than inheriting an outage.
 */

import type { AdminProductDetail, AdminProductVariant } from "@shared/research/product-admin";
import { createProductionProductControlReader } from "../../catalog/product-control-reader";
import type { ProductDisplayPort } from "./internal-order-email";

/** The catalogue surface this port needs. The live reader satisfies it as is. */
export interface ProductDisplayCatalogReader {
  readCatalog(): Promise<AdminProductDetail[]>;
}

/**
 * What the line says when Product Control names the unit but records no
 * strength, presentation, size or label for it.
 *
 * An explicit sentence rather than a blank or an id. The operator still has the
 * product name and the SKU, which is enough to act, and nothing on the line
 * pretends to be a strength that was never recorded.
 */
export const STRENGTH_NOT_RECORDED = "strength not recorded";

/** How long one catalogue read is shared. Display only, see the header. */
export const PRODUCT_DISPLAY_MEMO_MS = 30_000;

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * True when a candidate string is an identifier rather than language.
 *
 * Both checks matter. The id comparison catches a record whose name field was
 * populated with its own key, and the UUID shape catches the same mistake made
 * with any other key, which is the form the accelerator's bug actually took.
 */
function isIdentifier(candidate: string, ...ids: readonly string[]): boolean {
  if (UUID_SHAPE.test(candidate)) return true;
  return ids.some((id) => id.length > 0 && candidate === id);
}

/** The product name a human uses, or null when the record carries none. */
export function productDisplayNameFor(product: AdminProductDetail): string | null {
  for (const candidate of [clean(product.displayName), clean(product.canonicalName)]) {
    if (candidate.length === 0) continue;
    if (isIdentifier(candidate, product.id, product.slug)) continue;
    return candidate;
  }
  return null;
}

/**
 * The strength or unit label for one exact variant.
 *
 * Ordered by how specific the field is about what is in the vial. Never the
 * variant id, and never the SKU: the SKU is already printed on its own line, so
 * repeating it as a strength would tell an operator nothing new while looking
 * like it had.
 */
export function variantStrengthFor(variant: AdminProductVariant): string {
  for (const candidate of [
    clean(variant.strength),
    clean(variant.presentation),
    clean(variant.size),
    clean(variant.label),
  ]) {
    if (candidate.length === 0) continue;
    if (isIdentifier(candidate, variant.id, variant.productId)) continue;
    return candidate;
  }
  return STRENGTH_NOT_RECORDED;
}

/**
 * The production `ProductDisplayPort`.
 *
 * Every refusal is a null, and every null is the packet's explicit unresolved
 * line. There is no branch that returns a name derived from the input.
 */
export class ProductControlProductDisplay implements ProductDisplayPort {
  private readonly catalog: ProductDisplayCatalogReader;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private memo: Readonly<{ at: number; catalog: Promise<AdminProductDetail[]> }> | null = null;

  constructor(deps: {
    readonly catalog: ProductDisplayCatalogReader;
    readonly ttlMs?: number;
    readonly now?: () => number;
  }) {
    this.catalog = deps.catalog;
    this.ttlMs = deps.ttlMs ?? PRODUCT_DISPLAY_MEMO_MS;
    this.now = deps.now ?? (() => Date.now());
  }

  private read(): Promise<AdminProductDetail[]> {
    const at = this.now();
    const memo = this.memo;
    if (memo !== null && at - memo.at < this.ttlMs) return memo.catalog;

    const pending = this.catalog.readCatalog();
    this.memo = Object.freeze({ at, catalog: pending });
    // A rejected read is dropped immediately, so an outage is never cached and
    // the next submission asks the catalogue again.
    pending.catch(() => {
      if (this.memo?.catalog === pending) this.memo = null;
    });
    return pending;
  }

  async describe(input: {
    readonly productId: string;
    readonly variantId: string;
  }): Promise<Readonly<{ displayName: string; strength: string }> | null> {
    const productId = clean(input?.productId);
    const variantId = clean(input?.variantId);
    if (productId.length === 0 || variantId.length === 0) return null;

    let products: readonly AdminProductDetail[];
    try {
      products = await this.read();
    } catch {
      // The catalogue could not be read. The email still goes, with the line
      // marked unresolved, because an operator with a SKU and no product name
      // can act and an operator with no email at all cannot.
      return null;
    }

    const matches = products.filter((product) => product.id === productId);
    // Two records for one id disagree about something, and a record that
    // disagrees with itself is not a source of truth. Picking one would be
    // picking which unverified claim to print.
    if (matches.length !== 1) return null;
    const product = matches[0];

    const variants = (product.variants ?? []).filter(
      (variant) => variant.id === variantId && variant.productId === productId,
    );
    if (variants.length !== 1) return null;

    const displayName = productDisplayNameFor(product);
    if (displayName === null) return null;

    return Object.freeze({
      displayName,
      strength: variantStrengthFor(variants[0]),
    });
  }
}

/**
 * The production wiring.
 *
 * Built from the same reader factory server/index.ts already uses, so a
 * deployment cannot end up with an Early Access email naming products out of a
 * catalogue nothing else in the process reads.
 *
 * THE READER IS CONSTRUCTED ON FIRST USE, NOT HERE. Its constructor reaches for
 * the Supabase admin client and throws when the process has none, and this
 * factory is called from the Early Access composition root at module load. An
 * eager construction would therefore turn a missing credential into a crash
 * during registration, taking down every unrelated surface on the way past,
 * instead of into an unresolved product name on one email. Every other adapter
 * in this lane already has this property: it takes an injected query seam and
 * touches nothing at construction.
 */
export function createProductionProductDisplayPort(): ProductControlProductDisplay {
  let reader: ProductDisplayCatalogReader | null = null;
  return new ProductControlProductDisplay({
    catalog: {
      async readCatalog(): Promise<AdminProductDetail[]> {
        reader ??= createProductionProductControlReader();
        return reader.readCatalog();
      },
    },
  });
}
