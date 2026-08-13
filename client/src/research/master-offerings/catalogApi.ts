import type {
  MasterOfferingCatalogDetailResponse,
  MasterOfferingCatalogErrorCode,
  MasterOfferingCatalogListResponse,
  MasterOfferingCatalogQuery,
  MasterOfferingFamily,
} from "@shared/research/master-offerings/contract";
import { apiGet, type ApiResult } from "../lib/api";
import {
  masterOfferingCatalogUrl,
  masterOfferingDetailUrl,
} from "./integration-packet";

/**
 * The read adapter for the v2 catalog.
 *
 * These routes are prepared and deliberately unmounted until the composition
 * root owner mounts them. An unmounted path falls through to the SPA catch-all
 * and returns the app shell as HTML with 200, which `apiGet` already normalizes
 * to `unavailable`. So a surface wired to this adapter today renders its
 * designed pending state rather than an error or, worse, an empty catalog that
 * reads as "we sell nothing".
 */

export function getMasterOfferingCatalog(
  token: string | null,
  query: MasterOfferingCatalogQuery = {},
): Promise<ApiResult<MasterOfferingCatalogListResponse>> {
  return apiGet(masterOfferingCatalogUrl(query), token);
}

export function getMasterOfferingDetail(
  token: string | null,
  family: MasterOfferingFamily,
  slug: string,
): Promise<ApiResult<MasterOfferingCatalogDetailResponse>> {
  return apiGet(masterOfferingDetailUrl(family, slug), token);
}

/**
 * What a catalog surface may be in. `restricted` is separate from
 * `unauthorized` on purpose: a signed-in member outside the founder launch
 * scope is not signed out, and telling them to sign in again would be a lie.
 */
export type MasterOfferingSurfaceState =
  | "loading"
  | "ok"
  | "unauthorized"
  | "restricted"
  | "not_found"
  | "unavailable"
  | "error";

const STATE_BY_CODE: Readonly<
  Record<MasterOfferingCatalogErrorCode, MasterOfferingSurfaceState>
> = {
  master_offerings_disabled: "unavailable",
  master_offerings_auth_required: "unauthorized",
  master_offerings_launch_restricted: "restricted",
  master_offerings_invalid_request: "error",
  master_offerings_not_found: "not_found",
  master_offerings_unavailable: "unavailable",
  master_offerings_export_too_large: "error",
};

function isCatalogErrorCode(
  value: string | undefined,
): value is MasterOfferingCatalogErrorCode {
  return value !== undefined && value in STATE_BY_CODE;
}

/**
 * Map one API result onto a surface state, routing on the machine code and
 * never on a message. An unrecognized code is not guessed at: it becomes the
 * generic state its HTTP class already implies.
 */
export function toMasterOfferingSurfaceState(
  result: ApiResult<unknown>,
): MasterOfferingSurfaceState {
  switch (result.kind) {
    case "ok":
      return "ok";
    case "unauthorized":
      return isCatalogErrorCode(result.code)
        ? STATE_BY_CODE[result.code]
        : "unauthorized";
    case "denied":
    case "forbidden":
      return isCatalogErrorCode(result.code)
        ? STATE_BY_CODE[result.code]
        : "restricted";
    case "unavailable":
      return "unavailable";
    case "error":
      return isCatalogErrorCode(result.code)
        ? STATE_BY_CODE[result.code]
        : "error";
  }
}

/** Copy for each non-ok state. Neutral, and never blames the member. */
export const MASTER_OFFERING_STATE_COPY: Readonly<
  Record<
    Exclude<MasterOfferingSurfaceState, "ok" | "loading">,
    { title: string; body: string }
  >
> = {
  unauthorized: {
    title: "Please sign in to view the catalog.",
    body: "The full catalog is private to members.",
  },
  restricted: {
    title: "The full catalog is not open to your account yet.",
    body: "It is being rolled out gradually. Nothing is wrong with your account.",
  },
  not_found: {
    title: "That product is not in the catalog.",
    body: "It may have been renamed. Search the catalog to find it.",
  },
  unavailable: {
    title: "The full catalog is not available yet.",
    body: "It is being prepared. Nothing is wrong with your account.",
  },
  error: {
    title: "The catalog could not be loaded.",
    body: "Please try again.",
  },
};
