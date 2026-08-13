import {
  TEBRA_SYNC_ENTITIES,
  type TebraIntegrationStatus,
  type TebraSyncEntity,
  type TebraSyncOutcome,
} from "@shared/care/tebra";
import { careCapabilityAllowsTebra, type LoadCareCapability } from "./tebra-capability";
import { UnconfiguredTebraPracticeClient, type TebraPracticeClient } from "./tebra-client";
import { describeTebraConfiguration, type TebraConfiguration } from "./tebra-config";
import type { TebraLinkStore } from "./tebra-link-store";
import { runTebraSyncCycle } from "./tebra-sync";

/**
 * What a Care administrator can see and trigger.
 *
 * Status answers whether the integration is configured and how far the cursors
 * have reached. Manual sync runs the same cycle the scheduler would, under the
 * same lease, so an operator pressing the button cannot collide with a
 * scheduled pass or bypass any of its checks.
 */

export interface TebraAdminService {
  status(): Promise<TebraIntegrationStatus>;
  sync(entity?: TebraSyncEntity): Promise<{ outcomes: TebraSyncOutcome[] }>;
}

export interface TebraAdminDependencies {
  config: TebraConfiguration;
  client: TebraPracticeClient;
  links: TebraLinkStore;
  loadCareCapability: LoadCareCapability;
  owner: string;
  audit?: (event: string, detail: Record<string, unknown>) => Promise<void>;
  now?: () => Date;
}

export function isBoundTebraClient(client: TebraPracticeClient): boolean {
  return !(client instanceof UnconfiguredTebraPracticeClient);
}

export function createTebraAdminService(deps: TebraAdminDependencies): TebraAdminService {
  const now = deps.now ?? (() => new Date());

  return {
    async status() {
      const cursors = await Promise.all(
        TEBRA_SYNC_ENTITIES.map(async (entity) => {
          const cursor = await deps.links.loadCursor(entity);
          return {
            entity,
            fromModifiedAt: cursor?.fromModifiedAt ?? null,
            toModifiedAt: cursor?.toModifiedAt ?? null,
          };
        }),
      );

      return describeTebraConfiguration({
        config: deps.config,
        transportBound: isBoundTebraClient(deps.client),
        careEnabled: await careCapabilityAllowsTebra(deps.loadCareCapability),
        cursors,
        now,
      });
    },

    async sync(entity) {
      // Patients first. An appointment is refused unless its patient is already
      // linked, so running them in the other order would report avoidable
      // failures on the first pass after a new patient appears.
      const entities: readonly TebraSyncEntity[] = entity ? [entity] : TEBRA_SYNC_ENTITIES;
      const outcomes: TebraSyncOutcome[] = [];
      for (const target of entities) {
        outcomes.push(
          await runTebraSyncCycle({
            entity: target,
            config: deps.config,
            client: deps.client,
            links: deps.links,
            loadCareCapability: deps.loadCareCapability,
            owner: deps.owner,
            audit: deps.audit,
            now,
          }),
        );
      }
      return { outcomes };
    },
  };
}
