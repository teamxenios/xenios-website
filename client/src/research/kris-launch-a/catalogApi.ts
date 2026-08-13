import type {
  KrisCatalogDetailView,
  KrisCatalogErrorResponse,
  KrisCatalogPage,
  KrisCatalogQuery,
  KrisFamily,
} from "@shared/research/kris-launch-a/contract";
import { apiGet, type ApiResult } from "../lib/api";
import { krisCatalogUrl, krisDetailUrl } from "./integration-packet";

/**
 * The read adapter for Launch A.
 *
 * The routes are being built in a sibling lane and are not mounted yet. An
 * unmounted path falls through to the SPA catch-all and answers the app shell
 * as HTML with 200, which `apiGet` already normalizes to `unavailable`, so a
 * surface wired to this adapter today renders its designed "not available yet"
 * state rather than an error or, worse, an empty catalog that reads as "we
 * have nothing".
 */

export function getKrisCatalog(
  token: string | null,
  query: KrisCatalogQuery = {},
): Promise<ApiResult<KrisCatalogPage>> {
  return apiGet(krisCatalogUrl(query), token);
}

export function getKrisDetail(
  token: string | null,
  family: KrisFamily,
  slug: string,
): Promise<ApiResult<KrisCatalogDetailView>> {
  return apiGet(krisDetailUrl(family, slug), token);
}

/**
 * What a Launch A surface may be in.
 *
 * `unavailable` and an empty result set are different states with different
 * copy and different recovery, and keeping them apart is the point. The server
 * answers an honest 503 when no artifact is configured; that is "the catalog is
 * not there", and it must never be rendered as "nothing matches your filters",
 * which would tell a member their search was wrong when the catalog was down.
 *
 * `restricted` is separate from `unauthorized` for the same reason: a signed in
 * member outside the launch scope is not signed out, and telling them to sign
 * in again would be a lie.
 */
export type KrisSurfaceState =
  | "loading"
  | "ok"
  | "unauthorized"
  | "restricted"
  | "not_found"
  | "unavailable"
  | "error";

const STATE_BY_CODE: Readonly<
  Record<KrisCatalogErrorResponse["code"], KrisSurfaceState>
> = {
  kris_catalog_disabled: "unavailable",
  kris_catalog_auth_required: "unauthorized",
  kris_catalog_forbidden: "restricted",
  kris_catalog_invalid_request: "error",
  kris_catalog_not_found: "not_found",
  kris_catalog_unavailable: "unavailable",
};

function isKrisErrorCode(
  value: string | undefined,
): value is KrisCatalogErrorResponse["code"] {
  return value !== undefined && value in STATE_BY_CODE;
}

/**
 * Map one API result onto a surface state, routing on the machine code and
 * never on a message. An unrecognized code is not guessed at: it becomes the
 * generic state its HTTP class already implies.
 */
export function toKrisSurfaceState(result: ApiResult<unknown>): KrisSurfaceState {
  switch (result.kind) {
    case "ok":
      return "ok";
    case "unauthorized":
      return isKrisErrorCode(result.code) ? STATE_BY_CODE[result.code] : "unauthorized";
    case "denied":
    case "forbidden":
      return isKrisErrorCode(result.code) ? STATE_BY_CODE[result.code] : "restricted";
    case "unavailable":
      return "unavailable";
    case "error":
      return isKrisErrorCode(result.code) ? STATE_BY_CODE[result.code] : "error";
  }
}

/** Copy for each non-ok state. Neutral, and never blames the member. */
export const KRIS_STATE_COPY: Readonly<
  Record<Exclude<KrisSurfaceState, "ok" | "loading">, { title: string; body: string }>
> = {
  unauthorized: {
    title: "Please sign in to view this catalog.",
    body: "This catalog and its prices are private to your account.",
  },
  restricted: {
    title: "This catalog is not open to your account yet.",
    body: "Nothing is wrong with your account. Your access is being set up.",
  },
  not_found: {
    title: "That item is not in this catalog.",
    body: "It may have been renamed. Search the catalog to find it.",
  },
  unavailable: {
    title: "This catalog is not available right now.",
    body: "It is being prepared, and no items are missing from it. Please try again shortly.",
  },
  error: {
    title: "The catalog could not be loaded.",
    body: "Please try again.",
  },
};

/**
 * The empty result state, which is NOT a failure.
 *
 * Held next to the failure copy on purpose, so the difference is visible in one
 * place: an empty filter result offers to widen the filters, an unavailable
 * catalog offers to try again.
 */
export const KRIS_EMPTY_RESULT_COPY = {
  title: "Nothing matches these filters.",
  body: "Clear the search, or widen the family and access filters.",
} as const;
