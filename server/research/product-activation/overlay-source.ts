// Loads the product-activation overlay config and projects activation
// statuses. Read-only composition over the catalog authorities.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EMPTY_ACTIVATION_CHECKLIST,
  isValidActivationApproval,
  resolveActivationStatus,
  type ActivationChecklist,
  type ActivationOverlayEntry,
  type ProductActivationStatus,
  type SupplyConfirmationBasis,
} from "@shared/research/product-activation/contract";

export type ActivationQueueItem = Readonly<{
  queueId: string;
  label: string;
  demandMentions: number;
  basis: SupplyConfirmationBasis;
  /** Queue items are never orderable; their status is fixed by their basis. */
  status: Extract<
    ProductActivationStatus,
    "verbally_confirmed_pending_documentation" | "pending_pharmacy_activation" | "unavailable"
  >;
}>;

export type ActivationOverlay = Readonly<{
  recordedOn: string;
  entries: readonly ActivationOverlayEntry[];
  queue: readonly ActivationQueueItem[];
}>;

const DEFAULT_CONFIG_RELATIVE = "config/research/product-activation-overlay-20260826.json";

class MalformedOverlayError extends Error {
  constructor(where: string, problem: string) {
    super(`product-activation overlay is malformed at ${where}: ${problem}. ` +
      "Refusing to serve any activation projection from a config that cannot " +
      "be read exactly — fix the config; nothing degrades to a default.");
    this.name = "MalformedOverlayError";
  }
}

function recordFrom(raw: unknown, where: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new MalformedOverlayError(where, "must be an object");
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
      throw new MalformedOverlayError(where, `unknown field "${key}"`);
    }
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      throw new MalformedOverlayError(where, `required field "${key}" is missing`);
    }
  }
}

function exactNonEmptyString(raw: unknown, where: string): string {
  if (typeof raw !== "string" || raw.trim() === "" || raw !== raw.trim()) {
    throw new MalformedOverlayError(where, "must be a non-empty, whitespace-canonical string");
  }
  return raw;
}

function nullableExactString(raw: unknown, where: string): string | null {
  return raw === null ? null : exactNonEmptyString(raw, where);
}

const STRICT_UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function strictUtcInstant(raw: unknown, where: string): string {
  const value = exactNonEmptyString(raw, where);
  if (!STRICT_UTC_INSTANT.test(value)) {
    throw new MalformedOverlayError(where, "must be a strict ISO-8601 UTC instant");
  }
  const parsed = new Date(value);
  const canonical = value.includes(".")
    ? value.replace(/\.(\d{1,3})Z$/, (_, ms: string) => `.${ms.padEnd(3, "0")}Z`)
    : value.replace("Z", ".000Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== canonical) {
    throw new MalformedOverlayError(where, "must be a real calendar instant");
  }
  return value;
}

function strictDate(raw: unknown, where: string): string {
  const value = exactNonEmptyString(raw, where);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new MalformedOverlayError(where, "must be a YYYY-MM-DD date");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new MalformedOverlayError(where, "must be a real calendar date");
  }
  return value;
}

function checklistFrom(raw: unknown, where: string): ActivationChecklist {
  const source = recordFrom(raw, `${where}.checklist`);
  const out: Record<string, string | null> = { ...EMPTY_ACTIVATION_CHECKLIST };
  assertExactKeys(
    source,
    `${where}.checklist`,
    Object.keys(EMPTY_ACTIVATION_CHECKLIST),
    [],
  );
  for (const key of Object.keys(EMPTY_ACTIVATION_CHECKLIST)) {
    const value = source[key];
    if (value === undefined || value === null) {
      out[key] = null;
    } else {
      out[key] = exactNonEmptyString(value, `${where}.checklist.${key}`);
    }
  }
  return out as ActivationChecklist;
}

function basisFrom(raw: unknown, where: string): SupplyConfirmationBasis {
  // FAIL CLOSED (P1-7): a basis that is not EXACTLY one of the three known
  // strings is refused loudly. Degrading a typo to "none" turned an intended
  // restriction into a no-op — the config author meant something, and the
  // safe reading of "we cannot tell what" is to serve nothing at all.
  if (raw === "none" || raw === "verbal" || raw === "documented") return raw;
  throw new MalformedOverlayError(where, `confirmationBasis ${JSON.stringify(raw)} is not one of none|verbal|documented`);
}

/**
 * Parse the overlay config STRICTLY. Any malformed entry, basis, hold flag,
 * checklist, or queue item throws MalformedOverlayError: the projection that
 * composes over this loader then refuses to answer, which is the fail-closed
 * behavior — a config that cannot be read exactly serves NOTHING, neither a
 * degraded default nor a silently-dropped restriction.
 */
export function loadActivationOverlay(rootDir: string, relativePath = DEFAULT_CONFIG_RELATIVE): ActivationOverlay {
  const parsed = recordFrom(
    JSON.parse(readFileSync(join(rootDir, relativePath), "utf8")) as unknown,
    "root",
  );
  assertExactKeys(
    parsed,
    "root",
    ["$comment", "schemaVersion", "recordedOn", "recordedBy", "entries", "activationQueue"],
    ["schemaVersion", "recordedOn", "recordedBy", "entries", "activationQueue"],
  );
  if (parsed.schemaVersion !== 1) {
    throw new MalformedOverlayError("schemaVersion", "must be exactly 1");
  }
  const recordedOn = strictDate(parsed.recordedOn, "recordedOn");
  exactNonEmptyString(parsed.recordedBy, "recordedBy");
  if (parsed.$comment !== undefined) {
    if (!Array.isArray(parsed.$comment) || !parsed.$comment.every((line) => typeof line === "string")) {
      throw new MalformedOverlayError("$comment", "must be an array of strings when present");
    }
  }
  if (!Array.isArray(parsed.entries)) {
    throw new MalformedOverlayError("entries", "must be an array");
  }
  if (!Array.isArray(parsed.activationQueue)) {
    throw new MalformedOverlayError("activationQueue", "must be an array");
  }

  const entries: ActivationOverlayEntry[] = [];
  const groupIds = new Set<string>();
  parsed.entries.forEach((raw, index) => {
      const where = `entries[${index}]`;
      const e = recordFrom(raw, where);
      assertExactKeys(e, where, [
        "groupId",
        "label",
        "confirmationBasis",
        "confirmedBy",
        "confirmedAt",
        "checklist",
        "founderActivationApproval",
        "held",
      ]);
      const groupId = exactNonEmptyString(e.groupId, `${where}.groupId`);
      if (groupIds.has(groupId)) {
        throw new MalformedOverlayError(where, `duplicate groupId "${groupId}"`);
      }
      groupIds.add(groupId);
      const label = exactNonEmptyString(e.label, `${where}.label`);
      if (typeof e.held !== "boolean") {
        // A hold someone typed as "true"/1/"yes" is a hold someone MEANT.
        throw new MalformedOverlayError(where, "held must be a boolean");
      }
      const confirmationBasis = basisFrom(e.confirmationBasis, where);
      const confirmedBy = nullableExactString(e.confirmedBy, `${where}.confirmedBy`);
      const confirmedAt = e.confirmedAt === null
        ? null
        : strictUtcInstant(e.confirmedAt, `${where}.confirmedAt`);
      if ((confirmedBy === null) !== (confirmedAt === null)) {
        throw new MalformedOverlayError(where, "confirmedBy and confirmedAt must both be present or both be null");
      }
      if (confirmationBasis === "none" && (confirmedBy !== null || confirmedAt !== null)) {
        throw new MalformedOverlayError(where, "basis none cannot carry confirmation provenance");
      }
      if (confirmationBasis !== "none" && (confirmedBy === null || confirmedAt === null)) {
        throw new MalformedOverlayError(where, "verbal/documented basis requires confirmation provenance");
      }
      const approval = e.founderActivationApproval;
      if (approval !== null) {
        const a = recordFrom(approval, `${where}.founderActivationApproval`);
        assertExactKeys(a, `${where}.founderActivationApproval`, ["approvedBy", "approvedAt"]);
        const approvedBy = exactNonEmptyString(
          a.approvedBy,
          `${where}.founderActivationApproval.approvedBy`,
        );
        const approvedAt = strictUtcInstant(
          a.approvedAt,
          `${where}.founderActivationApproval.approvedAt`,
        );
        // P1-E: an approval that is PRESENT but not real evidence (empty or
        // whitespace approver, non-ISO / impossible / out-of-era timestamp)
        // refuses the whole load. The resolver would already treat it as
        // no-approval; failing loudly here means a config that CLAIMS an
        // approval it cannot substantiate never serves anything at all.
        if (
          !isValidActivationApproval({ approvedBy, approvedAt })
        ) {
          throw new MalformedOverlayError(
            where,
            "founderActivationApproval is not valid evidence (approvedBy must be substantive; approvedAt must be a strict, real, in-era ISO-8601 UTC instant)",
          );
        }
      }
      entries.push({
        groupId,
        label,
        confirmationBasis,
        confirmedBy,
        confirmedAt,
        checklist: checklistFrom(e.checklist, where),
        founderActivationApproval:
          approval === null
            ? null
            : {
                approvedBy: (approval as Record<string, string>).approvedBy,
                approvedAt: (approval as Record<string, string>).approvedAt,
              },
        held: e.held,
      });
    });

  const queue: ActivationQueueItem[] = [];
  const queueIds = new Set<string>();
  parsed.activationQueue.forEach((raw, index) => {
      const where = `activationQueue[${index}]`;
      const q = recordFrom(raw, where);
      assertExactKeys(q, where, ["queueId", "label", "demandMentions", "basis"]);
      const queueId = exactNonEmptyString(q.queueId, `${where}.queueId`);
      if (queueIds.has(queueId)) {
        throw new MalformedOverlayError(where, `duplicate queueId "${queueId}"`);
      }
      queueIds.add(queueId);
      const label = exactNonEmptyString(q.label, `${where}.label`);
      if (
        typeof q.demandMentions !== "number" ||
        !Number.isSafeInteger(q.demandMentions) ||
        q.demandMentions < 0
      ) {
        throw new MalformedOverlayError(where, "demandMentions must be a non-negative safe integer");
      }
      const basis = basisFrom(q.basis, where);
      queue.push({
        queueId,
        label,
        demandMentions: q.demandMentions,
        basis,
        status:
          basis === "verbal"
            ? "verbally_confirmed_pending_documentation"
            : basis === "documented"
              ? "pending_pharmacy_activation"
              : "unavailable",
      });
    });
  return {
    recordedOn,
    entries,
    queue,
  };
}

export function overlayEntryFor(
  overlay: ActivationOverlay,
  groupId: string,
): ActivationOverlayEntry | null {
  const matches = overlay.entries.filter((entry) => entry.groupId === groupId);
  if (matches.length > 1) {
    throw new MalformedOverlayError("entries", `groupId "${groupId}" is ambiguous`);
  }
  return matches[0] ?? null;
}

/** Convenience projection used by admin surfaces and (later) catalog badges. */
export function activationStatusFor(
  overlay: ActivationOverlay,
  groupId: string,
  baseStatus: ProductActivationStatus,
): ProductActivationStatus {
  return resolveActivationStatus(baseStatus, overlayEntryFor(overlay, groupId));
}
