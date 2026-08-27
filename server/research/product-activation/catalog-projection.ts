// Member-facing catalog-priority projection: composes the reviewed base-status
// config with the audited activation overlay and serializes STATUSES ONLY.
//
// Privacy boundary (the client's account-portal-policy test pins the receiving
// side): demandMentions, confirmedBy, confirmedAt, checklist contents, and
// every other overlay field stay server-side. The wire shape carries a status
// per demand key and a status per queue item — nothing else.
//
// Fail-closed rules:
//   - config unreadable/malformed → throw; the route answers an error envelope.
//     An absent projection is never rendered as "all available".
//   - an entry with an unknown baseStatus or blank key is DROPPED, and a
//     dropped key projects "unavailable" through the client's
//     projectDemandDefinitions.
//   - resolveActivationStatus is monotonically restrictive, so a groupId join
//     can only make a card MORE cautious than its reviewed base — this module
//     cannot publish availability the catalog did not already grant.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PRODUCT_ACTIVATION_STATUSES,
  resolveActivationStatus,
  type CatalogPriorityDto,
  type CatalogPriorityQueueItemDto,
  type ProductActivationStatus,
} from "@shared/research/product-activation/contract";
import { loadActivationOverlay, overlayEntryFor, type ActivationOverlay } from "./overlay-source";

const DEFAULT_PROJECTION_RELATIVE = "config/research/catalog-priority-projection-20260826.json";

function isActivationStatus(value: unknown): value is ProductActivationStatus {
  return (PRODUCT_ACTIVATION_STATUSES as readonly string[]).includes(value as string);
}

/**
 * Load and resolve the member-facing projection. `overlay` is injectable for
 * tests; production omits it and both files are read from `rootDir`.
 */
export function loadCatalogPriorityProjection(
  rootDir: string,
  overlay?: ActivationOverlay,
  relativePath = DEFAULT_PROJECTION_RELATIVE,
): CatalogPriorityDto {
  const resolvedOverlay = overlay ?? loadActivationOverlay(rootDir);
  const parsed = JSON.parse(readFileSync(join(rootDir, relativePath), "utf8")) as Record<
    string,
    unknown
  >;
  const statuses: Record<string, ProductActivationStatus> = {};
  if (Array.isArray(parsed.entries)) {
    for (const raw of parsed.entries) {
      if (typeof raw !== "object" || raw === null) continue;
      const entry = raw as Record<string, unknown>;
      if (typeof entry.key !== "string" || entry.key.trim() === "") continue;
      if (!isActivationStatus(entry.baseStatus)) continue;
      const groupId =
        typeof entry.groupId === "string" && entry.groupId.trim() !== "" ? entry.groupId : null;
      statuses[entry.key] =
        groupId === null
          ? entry.baseStatus
          : resolveActivationStatus(entry.baseStatus, overlayEntryFor(resolvedOverlay, groupId));
    }
  }
  const queue: CatalogPriorityQueueItemDto[] = resolvedOverlay.queue.map((item) => ({
    key: item.queueId,
    title: item.label,
    status: item.status,
  }));
  return { statuses, queue };
}
