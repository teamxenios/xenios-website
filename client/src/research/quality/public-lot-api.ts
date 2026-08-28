import {
  normalizePublicLotCode,
  publicLotApiResponseSchema,
  type PublicLotApiResponse,
} from "@shared/research/quality/public-lot";

const INVALID_REQUEST: PublicLotApiResponse = {
  kind: "invalid_request",
  code: "invalid_lot_code",
  message: "Enter the lot code exactly as it appears on the label.",
};

const UNAVAILABLE: PublicLotApiResponse = {
  kind: "unavailable",
  code: "quality_source_unavailable",
  message: "Public lot verification is temporarily unavailable. No lot status has been inferred.",
};

// A valid lookup can spend up to 4 x 1,000 ms in the public-read guard and
// 3 x 1,500 ms in the quality API's clock/source/audit authorities. Keep the
// browser deadline above that composed server envelope so an in-contract
// response is not converted into a client-side outage.
export const PUBLIC_LOT_COMPOSED_SERVER_LOOKUP_MAX_MS = 8_500;
export const PUBLIC_LOT_FETCH_TIMEOUT_MARGIN_MS = 3_500;
export const PUBLIC_LOT_FETCH_TIMEOUT_MS =
  PUBLIC_LOT_COMPOSED_SERVER_LOOKUP_MAX_MS + PUBLIC_LOT_FETCH_TIMEOUT_MARGIN_MS;

function abortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("The public lot request was aborted.", "AbortError");
  }
  const error = new Error("The public lot request was aborted.");
  error.name = "AbortError";
  return error;
}

/**
 * Reads only the strict public projection. Unknown keys, source URLs, private
 * identifiers, and malformed status/document combinations fail closed.
 */
export async function fetchPublicLot(
  rawLotCode: string,
  signal?: AbortSignal,
  timeoutMs = PUBLIC_LOT_FETCH_TIMEOUT_MS,
): Promise<PublicLotApiResponse> {
  const lotCode = normalizePublicLotCode(rawLotCode);
  if (lotCode === null) return INVALID_REQUEST;
  if (signal?.aborted) throw abortError();

  const requestController = new AbortController();
  let callerAbort: (() => void) | undefined;
  const callerAborted = new Promise<never>((_resolve, reject) => {
    callerAbort = () => {
      requestController.abort();
      reject(abortError());
    };
    signal?.addEventListener("abort", callerAbort, { once: true });
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<PublicLotApiResponse>((resolve) => {
    timer = setTimeout(() => {
      requestController.abort();
      resolve(UNAVAILABLE);
    }, Number.isSafeInteger(timeoutMs) && timeoutMs > 0
      ? Math.min(timeoutMs, PUBLIC_LOT_FETCH_TIMEOUT_MS)
      : PUBLIC_LOT_FETCH_TIMEOUT_MS);
  });

  try {
    const request = fetch(
      `/api/research/quality/lots/${encodeURIComponent(lotCode)}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: requestController.signal,
      },
    ).then(async (response): Promise<PublicLotApiResponse> => {
      const payload = await response.json().catch(() => null);
      const parsed = publicLotApiResponseSchema.safeParse(payload);
      if (!parsed.success) return UNAVAILABLE;

      const expectedStatus = {
        ok: 200,
        partial: 200,
        not_found: 404,
        unavailable: 503,
        rate_limited: 429,
        invalid_request: 400,
      }[parsed.data.kind];
      if (response.status !== expectedStatus) return UNAVAILABLE;
      if (
        (parsed.data.kind === "ok" || parsed.data.kind === "partial")
        && parsed.data.lot.lotCode !== lotCode
      ) return UNAVAILABLE;
      return parsed.data;
    });

    return await Promise.race([request, timedOut, callerAborted]);
  } catch {
    if (signal?.aborted) throw abortError();
    return UNAVAILABLE;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (callerAbort) signal?.removeEventListener("abort", callerAbort);
  }
}
