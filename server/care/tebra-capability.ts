import type { CareCapabilityStatus } from "@shared/care/contracts";

/**
 * The stored Care capability check, shared by every connector path.
 *
 * The environment switches CARE_ENABLED and CARE_ENABLE_APPROVED are the two
 * runtime approvals. They are not the whole gate. Care also carries a stored
 * capability row, and production-deps.ts already downgrades that row to
 * pending_qa unless it is enabled AND approved by a named person AND both
 * switches are on. A background poller that consulted only the environment
 * would keep synchronizing after Care had been pulled back in the database,
 * which is exactly the state an operator reaches for first in an incident.
 *
 * So the connector reads the same stored capability the existing scheduling
 * seam reads, with the same strictness: exactly enabled, or refuse.
 */
export type LoadCareCapability = () => Promise<CareCapabilityStatus>;

/**
 * Fails closed on anything unexpected. A capability lookup that throws is
 * treated as Care being unavailable, never as permission to continue.
 */
export async function careCapabilityAllowsTebra(
  load: LoadCareCapability,
): Promise<boolean> {
  try {
    const capability = await load();
    return (
      capability?.rail === "care" &&
      capability.state === "enabled" &&
      capability.enabled === true
    );
  } catch {
    return false;
  }
}
