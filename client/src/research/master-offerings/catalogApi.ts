import type {
  MasterOfferingCatalogDetailResponse,
  MasterOfferingCatalogErrorCode,
  MasterOfferingCatalogListResponse,
  MasterOfferingCatalogQuery,
  MasterOfferingFamily,
} from "@shared/research/master-offerings/contract";
import type { MasterOfferingPriceListFormat } from "@shared/research/master-offerings/pricing-contract";
import { apiGet, type ApiResult } from "../lib/api";
import {
  masterOfferingCatalogUrl,
  masterOfferingDetailUrl,
  masterOfferingPriceListUrl,
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
 * THE PRICE LIST IS A FETCH, NOT A LINK.
 *
 * A plain `<a href download>` is a browser navigation, and a navigation cannot
 * carry an `Authorization: Bearer` header. The v2 routes authorize through
 * `resolveResearchMember`, which reads that header and has no cookie fallback,
 * so a link download resolves to no viewer at all and the browser saves the
 * refusal body to disk as the price list. The member gets a file that is an
 * error, and the surface looks like it worked.
 *
 * So the bytes are fetched with the token attached and handed to the browser
 * through an object URL, the same shape `fetchActivationReconciliationCsv` and
 * `downloadEsignPacket` already use in this repository. The content type is
 * checked before anything is saved, which is also what stops the SPA
 * catch-all's HTML shell (200, text/html on an unmounted route) from being
 * written to disk as a .csv.
 */
export type MasterOfferingPriceListFailure =
  | "unauthorized"
  | "restricted"
  | "too_large"
  | "unavailable"
  | "error";

export type MasterOfferingPriceListResult =
  | { ok: true; blob: Blob; filename: string }
  | { ok: false; failure: MasterOfferingPriceListFailure };

const EXPECTED_CONTENT_TYPE: Readonly<
  Record<MasterOfferingPriceListFormat, string>
> = {
  csv: "text/csv",
  json: "application/json",
};

/** Only a plain, extension-correct name is accepted from the server header. */
const SAFE_FILENAME = /^[A-Za-z0-9._-]{1,120}$/;

function filenameFromDisposition(
  header: string | null,
  format: MasterOfferingPriceListFormat,
): string {
  const fallback = `xenios-research-price-list.${format}`;
  const match = /filename="?([^";]+)"?/i.exec(header ?? "");
  const candidate = match?.[1]?.trim() ?? "";
  if (!SAFE_FILENAME.test(candidate)) return fallback;
  return candidate.endsWith(`.${format}`) ? candidate : fallback;
}

export async function fetchMasterOfferingPriceList(
  token: string | null,
  query: MasterOfferingCatalogQuery,
  format: MasterOfferingPriceListFormat,
  fetchImpl: typeof fetch = fetch,
): Promise<MasterOfferingPriceListResult> {
  if (!token || token.trim() !== token || /[\r\n]/.test(token)) {
    return { ok: false, failure: "unauthorized" };
  }
  try {
    const response = await fetchImpl(masterOfferingPriceListUrl(query, format), {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401) return { ok: false, failure: "unauthorized" };
    if (response.status === 403) return { ok: false, failure: "restricted" };
    if (response.status === 413) return { ok: false, failure: "too_large" };
    if ([404, 501, 503].includes(response.status)) {
      return { ok: false, failure: "unavailable" };
    }
    if (!response.ok) return { ok: false, failure: "error" };
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes(EXPECTED_CONTENT_TYPE[format])) {
      // An unmounted route answers the app shell as HTML with 200. That is a
      // route that is not there yet, not a price list, and it must never be
      // saved as one.
      return { ok: false, failure: "unavailable" };
    }
    return {
      ok: true,
      blob: await response.blob(),
      filename: filenameFromDisposition(
        response.headers.get("content-disposition"),
        format,
      ),
    };
  } catch {
    return { ok: false, failure: "error" };
  }
}

/** Hand a fetched blob to the browser as a download, then release the URL. */
export function saveMasterOfferingPriceList(
  blob: Blob,
  filename: string,
  doc: Document = document,
): void {
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  doc.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}

/** Plain-language copy for a refused download. Never a raw code. */
export const MASTER_OFFERING_PRICE_LIST_FAILURE_COPY: Readonly<
  Record<MasterOfferingPriceListFailure, string>
> = {
  unauthorized: "Please sign in again to download the price list.",
  restricted: "The price list is not open to your account yet.",
  too_large:
    "That price list is too large to export. Narrow the filters and try again.",
  unavailable: "The price list is not available yet. Please try again later.",
  error: "The price list could not be downloaded. Please try again.",
};

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
