import type {
  TebraSyncCursor,
  TebraSyncEntity,
  TebraSyncOutcome,
  TebraSyncSummary,
} from "@shared/care/tebra";
import type { TebraPracticeClient, TebraRemotePage } from "./tebra-client";
import type { TebraConfiguration } from "./tebra-config";
import type { TebraLinkStore } from "./tebra-link-store";
import { assertTebraDetailIsSafe, safeTebraErrorCode } from "./tebra-redaction";

/**
 * Incremental polling.
 *
 * Public Tebra guidance does not offer patient-change webhooks, so changes are
 * discovered by asking for records modified inside a window. The window is
 * owned here rather than taken from the practice client, so a client that
 * reports a rewound or widened range cannot move the cursor for us. Only the
 * continuation token comes back from the client.
 */

export interface TebraSyncDependencies {
  config: TebraConfiguration;
  client: TebraPracticeClient;
  links: TebraLinkStore;
  owner: string;
  audit?: (event: string, detail: Record<string, unknown>) => Promise<void>;
  now?: () => Date;
}

export function tebraSyncLeaseKey(entity: TebraSyncEntity): string {
  return `care:tebra:sync:${entity}`;
}

/**
 * A window always reaches slightly further back than the last one ended.
 * Practice systems stamp last-modified at a coarse resolution, so a window that
 * begins exactly where the previous one closed can drop a record that changed
 * on the boundary.
 */
function openWindow(
  entity: TebraSyncEntity,
  previous: TebraSyncCursor | null,
  config: Extract<TebraConfiguration, { state: "ready" }>,
  now: Date,
): TebraSyncCursor {
  if (previous?.continuationToken) {
    // A previous run stopped part way through a window. Finish it before
    // opening a new one, otherwise the untouched remainder is never scanned.
    return previous;
  }

  const overlapMs = config.overlapSeconds * 1_000;
  const from = previous
    ? new Date(Date.parse(previous.toModifiedAt) - overlapMs)
    : new Date(now.getTime() - config.pollIntervalMinutes * 60_000 - overlapMs);

  return {
    entity,
    fromModifiedAt: from.toISOString(),
    toModifiedAt: now.toISOString(),
    continuationToken: null,
  };
}

function listPage(
  client: TebraPracticeClient,
  entity: TebraSyncEntity,
  cursor: TebraSyncCursor,
): Promise<TebraRemotePage> {
  return entity === "patient"
    ? client.listPatientsModified(cursor)
    : client.listAppointmentsModified(cursor);
}

/**
 * One polling pass for one entity. Returns counts only. Nothing about the
 * records themselves is retained, reported, or logged, so a sync summary is
 * safe to show an operator and safe to put in a handoff.
 */
export async function runTebraSyncCycle(
  deps: TebraSyncDependencies & { entity: TebraSyncEntity },
): Promise<TebraSyncOutcome> {
  const { entity, config, links } = deps;
  const now = deps.now ?? (() => new Date());

  if (config.state !== "ready") {
    return { entity, skipped: true, reason: "not_ready" };
  }

  const startedAt = now();
  const leaseKey = tebraSyncLeaseKey(entity);
  // The lease outlives one interval so a slow run is not overtaken by the next
  // scheduled one, and expires on its own if the holder dies mid-run.
  const expiresAt = new Date(
    startedAt.getTime() + config.pollIntervalMinutes * 60_000,
  ).toISOString();

  const acquired = await links.acquireLease({
    leaseKey,
    owner: deps.owner,
    expiresAt,
    now: startedAt.toISOString(),
  });
  if (!acquired) return { entity, skipped: true, reason: "lease_held" };

  let pages = 0;
  let scanned = 0;
  let reconciled = 0;
  let unlinked = 0;
  let failed = 0;
  let cursorAdvanced = false;
  let cursor = openWindow(entity, await links.loadCursor(entity), config, startedAt);

  try {
    while (pages < config.maxPagesPerRun) {
      let page: TebraRemotePage;
      try {
        page = await listPage(deps.client, entity, cursor);
      } catch (error) {
        failed += 1;
        await emit(deps, "care.tebra.sync_failed", {
          entity,
          code: safeTebraErrorCode(error),
          pages,
          scanned,
        });
        break;
      }

      pages += 1;
      scanned += page.records.length;

      for (const remote of page.records) {
        // A remote record with no external id, or one Xenios has never linked,
        // belongs to the practice and is not ours to touch. It is counted so
        // an operator can see the divergence, and otherwise left alone.
        if (!remote.externalId) {
          unlinked += 1;
          continue;
        }
        const existing = await links.findByExternalId(entity, remote.externalId);
        if (!existing || existing.tebraId !== remote.tebraId) {
          unlinked += 1;
          continue;
        }
        await links.saveLink({ ...existing, lastSeenAt: now().toISOString() });
        reconciled += 1;
      }

      const token = page.hasMore ? (page.nextCursor.continuationToken ?? null) : null;
      cursor = { ...cursor, continuationToken: token };
      await links.saveCursor(cursor);
      cursorAdvanced = true;

      if (!page.hasMore) break;
      if (token === null) {
        // The client says there is more but gave nothing to resume from.
        // Stopping here keeps the window open for the next run rather than
        // looping on the same page.
        failed += 1;
        break;
      }
    }
  } finally {
    await links.releaseLease({ leaseKey, owner: deps.owner });
  }

  const summary: TebraSyncSummary = {
    entity,
    ranAt: startedAt.toISOString(),
    pages,
    scanned,
    reconciled,
    unlinked,
    failed,
    cursorAdvanced,
    cursor,
  };

  await emit(deps, "care.tebra.sync_completed", {
    entity,
    pages,
    scanned,
    reconciled,
    unlinked,
    failed,
    cursorAdvanced,
  });

  return summary;
}

async function emit(
  deps: TebraSyncDependencies,
  event: string,
  detail: Record<string, unknown>,
): Promise<void> {
  if (!deps.audit) return;
  assertTebraDetailIsSafe(detail);
  try {
    await deps.audit(event, detail);
  } catch {
    // A sync summary is operational telemetry rather than an access decision.
    // Losing it must not abort a pass that is otherwise making progress.
  }
}
