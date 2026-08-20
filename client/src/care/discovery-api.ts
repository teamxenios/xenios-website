import {
  CARE_DISCOVERY_NEXT_PATH,
  CARE_ROUTE_CONTRACTS,
  type ResearchToCareDiscoveryRequest,
  type ResearchToCareDiscoveryResponse,
} from "@shared/care/contracts";
import { careApiFetch } from "./api";

/**
 * Sends the deliberately closed Research-to-Care discovery request.
 *
 * The literal-true input makes consent an explicit caller decision. The
 * runtime guard prevents a future untyped caller from turning false or a
 * truthy object into a request. Identity and rail facts are server-derived;
 * product, order, price, and clinical context have no place in this body.
 */
export async function requestCareDiscovery(consent: true): Promise<Response> {
  if (consent !== true) {
    throw new Error("care_discovery_consent_required");
  }

  const body: ResearchToCareDiscoveryRequest = { consent: true };
  return careApiFetch(CARE_ROUTE_CONTRACTS.discovery, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function isCareDiscoverySuccess(
  body: unknown,
): body is ResearchToCareDiscoveryResponse {
  if (!body || typeof body !== "object") return false;
  const candidate = body as Partial<ResearchToCareDiscoveryResponse>;
  const discovery = candidate.discovery;
  return (
    candidate.ok === true &&
    candidate.nextPath === CARE_DISCOVERY_NEXT_PATH &&
    !!discovery &&
    discovery.sourceRail === "research" &&
    discovery.destinationRail === "care" &&
    discovery.intent === "learn_about_care" &&
    typeof discovery.subjectId === "string" &&
    discovery.subjectId.length > 0 &&
    typeof discovery.consentedAt === "string" &&
    discovery.consentedAt.length > 0
  );
}
