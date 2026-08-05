// ---------------------------------------------------------------------------
// Private Early Access catalogue, read from the mounted API.
//
// Session-cookie authenticated, not bearer: the customer already unlocked the
// private area and the server resolves them from that session. No token is
// passed, and passing one would not change the answer, because the route reads
// the customer from the session resolver and never from the request body.
//
// THIS ADAPTER DECIDES NOTHING. It fetches, it validates the shape, and it hands
// rows to the one mapping seam. Availability and price both arrive already
// decided by the server.
// ---------------------------------------------------------------------------

import { apiGet, type ApiResult } from "../lib/api";
import {
  toCardProducts,
  type EarlyAccessCatalogRowView,
} from "../early-access/earlyAccessCatalogView";
import type { EarlyAccessCardProduct } from "../early-access/EarlyAccessProductCard";

export const EARLY_ACCESS_CATALOG_PATH = "/api/research/early-access/catalog";

/** What the mounted route answers with. Only the parts the storefront reads. */
type CatalogResponse = {
  units?: unknown;
  rows?: unknown;
  products?: unknown;
};

export type EarlyAccessCatalogLoad =
  | {
      kind: "ok";
      products: EarlyAccessCardProduct[];
      /** Rows the server sent that could not be rendered truthfully. */
      dropped: number;
      /** How many rows the server actually returned, before any dropping. */
      received: number;
    }
  /** Not signed in, or the private session lapsed. */
  | { kind: "locked" }
  /** The server answered, but not with a catalogue this browser can read. */
  | { kind: "unreadable"; reason: string }
  | { kind: "error"; message: string };

function rowsOf(body: CatalogResponse): readonly unknown[] | null {
  // `units` is what the mounted route actually answers with, and it is checked
  // first for that reason. `rows` and `products` are earlier names for the same
  // projection, kept so an older payload is still read rather than reported
  // unreadable. Each is an array under a KNOWN key, never a guess at an
  // arbitrary shape. `earlyAccessCatalog.contract.test.ts` pins the live key
  // against the server's own response so this list cannot silently fall behind
  // a rename again.
  if (Array.isArray(body.units)) return body.units;
  if (Array.isArray(body.rows)) return body.rows;
  if (Array.isArray(body.products)) return body.products;
  return null;
}

/**
 * Load the catalogue.
 *
 * A response that is not a recognisable catalogue returns `unreadable` rather
 * than an empty list. An empty catalogue and a broken response look identical to
 * a customer, and only one of them should be reported as "no products".
 */
export async function loadEarlyAccessCatalog(
  get: <T>(path: string) => Promise<ApiResult<T>> = (path) => apiGet(path),
): Promise<EarlyAccessCatalogLoad> {
  const result = await get<CatalogResponse>(EARLY_ACCESS_CATALOG_PATH);

  if (result.kind === "unauthorized" || result.kind === "forbidden") return { kind: "locked" };
  if (result.kind === "unavailable") {
    return { kind: "unreadable", reason: "The catalogue is not available yet." };
  }
  if (result.kind === "denied") {
    return { kind: "unreadable", reason: result.message ?? result.code };
  }
  if (result.kind === "error") return { kind: "error", message: result.message };

  const rows = rowsOf(result.data ?? {});
  if (rows === null) {
    return { kind: "unreadable", reason: "The catalogue response was not in a readable shape." };
  }

  const { products, dropped } = toCardProducts(rows as readonly EarlyAccessCatalogRowView[]);
  return { kind: "ok", products, dropped, received: rows.length };
}
