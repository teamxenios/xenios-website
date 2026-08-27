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

function checklistFrom(raw: unknown): ActivationChecklist {
  if (typeof raw !== "object" || raw === null) return EMPTY_ACTIVATION_CHECKLIST;
  const source = raw as Record<string, unknown>;
  const out: Record<string, string | null> = { ...EMPTY_ACTIVATION_CHECKLIST };
  for (const key of Object.keys(EMPTY_ACTIVATION_CHECKLIST)) {
    const value = source[key];
    out[key] = typeof value === "string" && value.trim() !== "" ? value : null;
  }
  return out as ActivationChecklist;
}

function basisFrom(raw: unknown): SupplyConfirmationBasis {
  return raw === "verbal" || raw === "documented" ? raw : "none";
}

/**
 * Parse the overlay config. Malformed entries are DROPPED, never repaired into
 * something more permissive: a record we cannot read is a record that grants
 * nothing.
 */
export function loadActivationOverlay(rootDir: string, relativePath = DEFAULT_CONFIG_RELATIVE): ActivationOverlay {
  const parsed = JSON.parse(readFileSync(join(rootDir, relativePath), "utf8")) as Record<string, unknown>;
  const entries: ActivationOverlayEntry[] = [];
  if (Array.isArray(parsed.entries)) {
    for (const raw of parsed.entries) {
      if (typeof raw !== "object" || raw === null) continue;
      const e = raw as Record<string, unknown>;
      if (typeof e.groupId !== "string" || typeof e.label !== "string") continue;
      const approval = e.founderActivationApproval;
      entries.push({
        groupId: e.groupId,
        label: e.label,
        confirmationBasis: basisFrom(e.confirmationBasis),
        confirmedBy: typeof e.confirmedBy === "string" ? e.confirmedBy : null,
        confirmedAt: typeof e.confirmedAt === "string" ? e.confirmedAt : null,
        checklist: checklistFrom(e.checklist),
        founderActivationApproval:
          typeof approval === "object" && approval !== null &&
          typeof (approval as Record<string, unknown>).approvedBy === "string" &&
          typeof (approval as Record<string, unknown>).approvedAt === "string"
            ? {
                approvedBy: (approval as Record<string, string>).approvedBy,
                approvedAt: (approval as Record<string, string>).approvedAt,
              }
            : null,
        held: e.held === true,
      });
    }
  }
  const queue: ActivationQueueItem[] = [];
  if (Array.isArray(parsed.activationQueue)) {
    for (const raw of parsed.activationQueue) {
      if (typeof raw !== "object" || raw === null) continue;
      const q = raw as Record<string, unknown>;
      if (typeof q.queueId !== "string" || typeof q.label !== "string") continue;
      const basis = basisFrom(q.basis);
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
    }
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
