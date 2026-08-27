// Loads the product-activation overlay config and projects activation
// statuses. Read-only composition over the catalog authorities.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EMPTY_ACTIVATION_CHECKLIST,
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

function checklistFrom(raw: unknown, where: string): ActivationChecklist {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new MalformedOverlayError(where, "checklist must be an object");
  }
  const source = raw as Record<string, unknown>;
  const out: Record<string, string | null> = { ...EMPTY_ACTIVATION_CHECKLIST };
  for (const key of Object.keys(source)) {
    if (!(key in EMPTY_ACTIVATION_CHECKLIST)) {
      throw new MalformedOverlayError(where, `unknown checklist field "${key}"`);
    }
  }
  for (const key of Object.keys(EMPTY_ACTIVATION_CHECKLIST)) {
    const value = source[key];
    if (value === undefined || value === null) {
      out[key] = null;
    } else if (typeof value === "string") {
      out[key] = value.trim() === "" ? null : value;
    } else {
      throw new MalformedOverlayError(where, `checklist field "${key}" must be a string`);
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
  const parsed = JSON.parse(readFileSync(join(rootDir, relativePath), "utf8")) as Record<string, unknown>;
  const entries: ActivationOverlayEntry[] = [];
  if (parsed.entries !== undefined && !Array.isArray(parsed.entries)) {
    throw new MalformedOverlayError("entries", "must be an array when present");
  }
  if (Array.isArray(parsed.entries)) {
    parsed.entries.forEach((raw, index) => {
      const where = `entries[${index}]`;
      if (typeof raw !== "object" || raw === null) {
        throw new MalformedOverlayError(where, "must be an object");
      }
      const e = raw as Record<string, unknown>;
      if (typeof e.groupId !== "string" || e.groupId.trim() === "") {
        throw new MalformedOverlayError(where, "groupId must be a non-empty string");
      }
      if (typeof e.label !== "string" || e.label.trim() === "") {
        throw new MalformedOverlayError(where, "label must be a non-empty string");
      }
      if (typeof e.held !== "boolean") {
        // A hold someone typed as "true"/1/"yes" is a hold someone MEANT.
        throw new MalformedOverlayError(where, "held must be a boolean");
      }
      const approval = e.founderActivationApproval;
      if (approval !== null && approval !== undefined) {
        const a = approval as Record<string, unknown>;
        if (typeof approval !== "object" || typeof a.approvedBy !== "string" || typeof a.approvedAt !== "string") {
          throw new MalformedOverlayError(where, "founderActivationApproval must be null or {approvedBy, approvedAt}");
        }
      }
      entries.push({
        groupId: e.groupId,
        label: e.label,
        confirmationBasis: basisFrom(e.confirmationBasis, where),
        confirmedBy: typeof e.confirmedBy === "string" ? e.confirmedBy : null,
        confirmedAt: typeof e.confirmedAt === "string" ? e.confirmedAt : null,
        checklist: checklistFrom(e.checklist, where),
        founderActivationApproval:
          approval === null || approval === undefined
            ? null
            : {
                approvedBy: (approval as Record<string, string>).approvedBy,
                approvedAt: (approval as Record<string, string>).approvedAt,
              },
        held: e.held,
      });
    });
  }
  const queue: ActivationQueueItem[] = [];
  if (parsed.activationQueue !== undefined && !Array.isArray(parsed.activationQueue)) {
    throw new MalformedOverlayError("activationQueue", "must be an array when present");
  }
  if (Array.isArray(parsed.activationQueue)) {
    parsed.activationQueue.forEach((raw, index) => {
      const where = `activationQueue[${index}]`;
      if (typeof raw !== "object" || raw === null) {
        throw new MalformedOverlayError(where, "must be an object");
      }
      const q = raw as Record<string, unknown>;
      if (typeof q.queueId !== "string" || typeof q.label !== "string") {
        throw new MalformedOverlayError(where, "queueId and label must be strings");
      }
      const basis = basisFrom(q.basis, where);
      queue.push({
        queueId: q.queueId,
        label: q.label,
        demandMentions: typeof q.demandMentions === "number" ? q.demandMentions : 0,
        basis,
        status:
          basis === "verbal"
            ? "verbally_confirmed_pending_documentation"
            : basis === "documented"
              ? "pending_pharmacy_activation"
              : "unavailable",
      });
    });
  }
  return {
    recordedOn: typeof parsed.recordedOn === "string" ? parsed.recordedOn : "unknown",
    entries,
    queue,
  };
}

export function overlayEntryFor(
  overlay: ActivationOverlay,
  groupId: string,
): ActivationOverlayEntry | null {
  return overlay.entries.find((e) => e.groupId === groupId) ?? null;
}

/** Convenience projection used by admin surfaces and (later) catalog badges. */
export function activationStatusFor(
  overlay: ActivationOverlay,
  groupId: string,
  baseStatus: ProductActivationStatus,
): ProductActivationStatus {
  return resolveActivationStatus(baseStatus, overlayEntryFor(overlay, groupId));
}
