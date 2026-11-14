import type { CatalogAdmissionApi, CatalogAdmissionView } from "./PreCatalogContact";
import { REQUEST_INTENT_API_PATH } from "../assisted-order/request-intent-api";

/** Owner supplies the same token getter as createRequestIntentApi; no new auth or identity. */
export function createCatalogAdmissionApi(
  memberToken: () => string | null = () => null,
  transport: (path: string, init: RequestInit) => Promise<Response> = (path, init) => fetch(path, init),
): CatalogAdmissionApi {
  const path = REQUEST_INTENT_API_PATH + "/admission";
  async function call(signal: AbortSignal, body?: Parameters<CatalogAdmissionApi["record"]>[0]): Promise<CatalogAdmissionView> {
    const token = memberToken();
    const response = await transport(path, {
      method: body ? "POST" : "GET", credentials: "include", cache: "no-store", signal,
      headers: { accept: "application/json", ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify({
        fullLegalName: body.fullLegalName,
        email: body.email,
        postalAddress: {
          line1: body.postalAddress.line1,
          line2: body.postalAddress.line2,
          city: body.postalAddress.city,
          region: body.postalAddress.region,
          postalCode: body.postalAddress.postalCode,
          countryCode: body.postalAddress.countryCode,
        },
        policyRevision: body.policyRevision,
      }) } : {}),
    });
    if (!response.ok) throw new Error("Catalog access could not be confirmed.");
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Catalog access could not be confirmed.");
    const {admitted, policyRevision, retentionSeconds} = result as Partial<CatalogAdmissionView>;
    if (typeof admitted !== "boolean" || typeof policyRevision !== "string" || !/^[a-f0-9]{64}$/.test(policyRevision))
      throw new Error("Catalog access could not be confirmed.");
    return {
      admitted, policyRevision,
      ...(typeof retentionSeconds === "number" && { retentionSeconds }),
    };
  }
  return {status: signal => call(signal),record: (body,signal) => call(signal,body)};
}
