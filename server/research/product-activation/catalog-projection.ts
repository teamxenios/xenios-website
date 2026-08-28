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
//   - every section, key and value is parsed exactly; malformed entries and
//     duplicate keys reject the complete projection instead of being repaired
//     or silently dropped.
//   - every non-null groupId must join exactly one overlay entry. A stale or
//     ambiguous mapping rejects the complete projection.
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
import type { CatalogPriorityPort } from "../customer-account/ports";

const DEFAULT_PROJECTION_RELATIVE = "config/research/catalog-priority-projection-20260826.json";

class MalformedCatalogProjectionError extends Error {
  constructor(where: string, problem: string) {
    super(
      `catalog-priority projection is malformed at ${where}: ${problem}. ` +
        "Refusing the complete projection; no entry is repaired or silently dropped.",
    );
    this.name = "MalformedCatalogProjectionError";
  }
}

function recordFrom(raw: unknown, where: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new MalformedCatalogProjectionError(where, "must be an object");
  }
  return raw as Record<string, unknown>;
}

function assertExactKeys(
  source: Record<string, unknown>,
  where: string,
  allowed: readonly string[],
  required: readonly string[] = allowed,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(source)) {
    if (!allowedSet.has(key)) {
      throw new MalformedCatalogProjectionError(where, `unknown field "${key}"`);
    }
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      throw new MalformedCatalogProjectionError(where, `required field "${key}" is missing`);
    }
  }
}

function exactNonEmptyString(raw: unknown, where: string): string {
  if (typeof raw !== "string" || raw.trim() === "" || raw !== raw.trim()) {
    throw new MalformedCatalogProjectionError(
      where,
      "must be a non-empty, whitespace-canonical string",
    );
  }
  return raw;
}

function strictDate(raw: unknown, where: string): string {
  const value = exactNonEmptyString(raw, where);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new MalformedCatalogProjectionError(where, "must be a YYYY-MM-DD date");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new MalformedCatalogProjectionError(where, "must be a real calendar date");
  }
  return value;
}

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
  const parsed = recordFrom(
    JSON.parse(readFileSync(join(rootDir, relativePath), "utf8")) as unknown,
    "root",
  );
  assertExactKeys(
    parsed,
    "root",
    ["$comment", "schemaVersion", "recordedOn", "entries"],
    ["schemaVersion", "recordedOn", "entries"],
  );
  if (parsed.schemaVersion !== 1) {
    throw new MalformedCatalogProjectionError("schemaVersion", "must be exactly 1");
  }
  strictDate(parsed.recordedOn, "recordedOn");
  if (parsed.$comment !== undefined) {
    if (!Array.isArray(parsed.$comment) || !parsed.$comment.every((line) => typeof line === "string")) {
      throw new MalformedCatalogProjectionError(
        "$comment",
        "must be an array of strings when present",
      );
    }
  }
  if (!Array.isArray(parsed.entries)) {
    throw new MalformedCatalogProjectionError("entries", "must be an array");
  }

  const statuses: Record<string, ProductActivationStatus> = {};
  const keys = new Set<string>();
  for (let index = 0; index < parsed.entries.length; index += 1) {
    const raw = parsed.entries[index];
    const where = `entries[${index}]`;
    const entry = recordFrom(raw, where);
    assertExactKeys(entry, where, ["key", "baseStatus", "groupId", "evidence"]);
    const key = exactNonEmptyString(entry.key, `${where}.key`);
    if (keys.has(key)) {
      throw new MalformedCatalogProjectionError(where, `duplicate key "${key}"`);
    }
    keys.add(key);
    if (!isActivationStatus(entry.baseStatus)) {
      throw new MalformedCatalogProjectionError(where, "baseStatus is not recognized");
    }
    exactNonEmptyString(entry.evidence, `${where}.evidence`);
    const groupId =
      entry.groupId === null
        ? null
        : exactNonEmptyString(entry.groupId, `${where}.groupId`);
    if (groupId === null) {
      statuses[key] = entry.baseStatus;
      continue;
    }
    const overlayEntry = overlayEntryFor(resolvedOverlay, groupId);
    if (overlayEntry === null) {
      throw new MalformedCatalogProjectionError(
        `${where}.groupId`,
        `mapped groupId "${groupId}" has no overlay entry`,
      );
    }
    statuses[key] = resolveActivationStatus(entry.baseStatus, overlayEntry);
  }

  const queueKeys = new Set<string>();
  const queue: CatalogPriorityQueueItemDto[] = resolvedOverlay.queue.map((item, index) => {
    const key = exactNonEmptyString(item.queueId, `overlay.queue[${index}].queueId`);
    if (queueKeys.has(key)) {
      throw new MalformedCatalogProjectionError(
        `overlay.queue[${index}]`,
        `duplicate queueId "${key}"`,
      );
    }
    queueKeys.add(key);
    const title = exactNonEmptyString(item.label, `overlay.queue[${index}].label`);
    if (
      item.status !== "verbally_confirmed_pending_documentation" &&
      item.status !== "pending_pharmacy_activation" &&
      item.status !== "unavailable"
    ) {
      throw new MalformedCatalogProjectionError(
        `overlay.queue[${index}].status`,
        "queue status must be structurally non-orderable",
      );
    }
    return { key, title, status: item.status };
  });
  return { statuses, queue };
}

/**
 * The composition-root port: loads once (both files are static per deploy) and
 * keeps failing closed — a load error propagates on every request until the
 * config is readable, and is never cached as a permissive answer.
 */
export function createCatalogPriorityPort(rootDir: string): CatalogPriorityPort {
  let cache: CatalogPriorityDto | null = null;
  return {
    async catalogPriorityFor() {
      if (cache === null) cache = loadCatalogPriorityProjection(rootDir);
      return cache;
    },
  };
}
