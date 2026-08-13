import type { TebraIntegrationStatus } from "@shared/care/tebra";
import type { CareAccessDependencies } from "./access";
import { createTebraAdminService, type TebraAdminService } from "./tebra-admin";
import type { LoadCareCapability } from "./tebra-capability";
import { UnconfiguredTebraPracticeClient, type TebraPracticeClient } from "./tebra-client";
import { parseTebraConfiguration, type TebraConfiguration } from "./tebra-config";
import { createTebraGateway, type TebraGateway } from "./tebra-gateway";
import type { TebraLinkStore } from "./tebra-link-store";
import type { TebraAuditDetail } from "./tebra-redaction";
import { createTebraAdminHandlers, type TebraAdminHandlers } from "./tebra-routes";
import { createTebraSyncScheduler, type TebraSyncScheduler } from "./tebra-scheduler";
import {
  createTebraSchedulingTransport,
  type CareSchedulingTransport,
} from "./tebra-scheduling-bridge";

/**
 * One entry point that assembles the connector correctly.
 *
 * Wiring this by hand means getting nine pieces right, and the pieces that
 * matter most are the ones easiest to omit. So the dangerous inputs are
 * REQUIRED rather than defaulted:
 *
 *   - `loadCareCapability`, because an omitted capability check is a fail-open
 *     gate, and this is the gate an operator reaches for in an incident.
 *   - `links`, because the in-memory store is correct but process-local, and a
 *     lease that does not coordinate across processes silently permits two
 *     pollers. Choosing it should be deliberate, not a default someone inherits.
 *   - `audit`, because Care does not accept an unlogged action.
 *
 * The practice client is the one input that DOES default, to the client that
 * refuses every call, so an incomplete deployment degrades to the concierge
 * fallback instead of making an unreviewed provider call.
 *
 * Nothing here registers a route or starts the scheduler. Both are returned for
 * the composition root to use deliberately.
 */

export interface TebraConnectorInput {
  /** Read once, at assembly. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  loadCareCapability: LoadCareCapability;
  links: TebraLinkStore;
  audit: (event: string, detail: TebraAuditDetail) => Promise<void>;
  /** A stable instance identifier. The lease is scoped by it. */
  owner: string;
  /** Defaults to the client that refuses every call. */
  client?: TebraPracticeClient;
  now?: () => Date;
}

export interface TebraConnector {
  readonly config: TebraConfiguration;
  readonly client: TebraPracticeClient;
  readonly gateway: TebraGateway;
  readonly admin: TebraAdminService;
  readonly scheduler: TebraSyncScheduler;
  /** Admin route handlers. The caller registers them; this does not. */
  handlers(access: CareAccessDependencies): TebraAdminHandlers;
  /**
   * The transport for the EXISTING scheduling adapter in tebra-scheduling.ts.
   * Pass it to createTebraSchedulingAdapter so a booking and a sync share one
   * external id, one link row and one audit trail.
   */
  schedulingTransport(
    resolvePatientId: (appointmentId: string) => Promise<string | null>,
  ): CareSchedulingTransport;
  status(): Promise<TebraIntegrationStatus>;
}

export function createTebraConnector(input: TebraConnectorInput): TebraConnector {
  const config = parseTebraConfiguration(input.env ?? process.env);
  const client = input.client ?? new UnconfiguredTebraPracticeClient();

  const gateway = createTebraGateway({
    config,
    client,
    links: input.links,
    loadCareCapability: input.loadCareCapability,
    audit: input.audit,
    now: input.now,
  });

  // The admin service and the scheduler take the same owner. They separate
  // themselves by trigger inside, so a manual pass cannot double a scheduled
  // one, and neither should be handed a different instance id here.
  const shared = {
    config,
    client,
    links: input.links,
    loadCareCapability: input.loadCareCapability,
    owner: input.owner,
    now: input.now,
  };

  const admin = createTebraAdminService(shared);
  const scheduler = createTebraSyncScheduler(shared);

  return {
    config,
    client,
    gateway,
    admin,
    scheduler,
    handlers: (access) => createTebraAdminHandlers({ access, service: admin }),
    schedulingTransport: (resolvePatientId) =>
      createTebraSchedulingTransport({ gateway, resolvePatientId, now: input.now }),
    status: () => admin.status(),
  };
}
