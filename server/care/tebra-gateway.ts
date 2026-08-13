import {
  TebraAppointmentProjectionSchema,
  TebraPatientProjectionSchema,
  isTebraOpaqueId,
  type TebraFailureCode,
  type TebraOperationResult,
  type TebraRemoteRecord,
  type TebraSyncEntity,
} from "@shared/care/tebra";
import { careCapabilityAllowsTebra, type LoadCareCapability } from "./tebra-capability";
import type { TebraPracticeClient } from "./tebra-client";
import type { TebraConfiguration } from "./tebra-config";
import type { TebraEntityLink, TebraLinkStore } from "./tebra-link-store";
import {
  assertTebraDetailIsSafe,
  tebraAuditDetail,
  type TebraAuditDetail,
} from "./tebra-redaction";
import {
  DEFAULT_TEBRA_RETRY_POLICY,
  runWithTebraRetry,
  type TebraRetryPolicy,
} from "./tebra-retry";

/**
 * Patient and appointment synchronization.
 *
 * Idempotency comes from the deterministic external id rather than from local
 * bookkeeping. A create is attempted only after a lookup by that id has come
 * back empty, so a run that dies between creating a record upstream and saving
 * the link locally adopts the existing record on its next pass instead of
 * creating a duplicate chart.
 */

export interface TebraGatewayDependencies {
  config: TebraConfiguration;
  client: TebraPracticeClient;
  links: TebraLinkStore;
  /**
   * Required, not optional. An optional capability check is a fail-open
   * default: forgetting to pass it would silently remove the Care gate. Callers
   * must supply it and decide, and the composition root should pass the same
   * loader the Care routes use.
   */
  loadCareCapability: LoadCareCapability;
  audit: (event: string, detail: TebraAuditDetail) => Promise<void>;
  retryPolicy?: TebraRetryPolicy;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

export interface TebraGateway {
  syncPatient(raw: unknown): Promise<TebraOperationResult<{ tebraId: string }>>;
  syncAppointment(raw: unknown): Promise<TebraOperationResult<{ tebraId: string }>>;
}

function notReady(config: TebraConfiguration): TebraFailureCode {
  if (config.state === "disabled") return "tebra_disabled";
  if (config.state === "invalid") return "tebra_invalid_configuration";
  return "tebra_unconfigured";
}

function failure<T>(code: TebraFailureCode, retryable = false): TebraOperationResult<T> {
  return { ok: false, code, retryable };
}

/**
 * A remote record is only accepted when it carries a usable id and, if it
 * reports an external id at all, that id is ours. A practice client returning
 * someone else record is treated as a conflict, never as a successful link.
 */
function acceptRemote(remote: TebraRemoteRecord, expectedExternalId: string): boolean {
  if (!isTebraOpaqueId(remote.tebraId)) return false;
  return remote.externalId === null || remote.externalId === expectedExternalId;
}

export function createTebraGateway(deps: TebraGatewayDependencies): TebraGateway {
  const now = deps.now ?? (() => new Date());
  const policy = deps.retryPolicy ?? DEFAULT_TEBRA_RETRY_POLICY;

  /**
   * One record at a time, per key.
   *
   * The external id makes a repeat safe, but only when the repeat happens after
   * the first attempt resolved. Two concurrent syncs of the same record would
   * both look it up, both see nothing, and both create, which is the duplicate
   * chart the whole design exists to prevent. Serializing by key means the
   * second call performs its lookup after the first has finished and therefore
   * adopts instead of creating.
   *
   * This covers one process. Across processes the poller is held apart by the
   * durable lease, and the practice system's own uniqueness on the external id
   * is the backstop once the technical guide confirms it.
   */
  const inFlight = new Map<string, Promise<unknown>>();

  function serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = inFlight.get(key) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    // Kept only while queued behind, so the map cannot grow without bound.
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    inFlight.set(key, settled);
    void settled.then(() => {
      if (inFlight.get(key) === settled) inFlight.delete(key);
    });
    return result;
  }

  async function record(event: string, detail: TebraAuditDetail): Promise<void> {
    assertTebraDetailIsSafe(detail as unknown as Record<string, unknown>);
    await deps.audit(event, detail);
  }

  /**
   * Shared shape for both entities. The remote interaction is what gets
   * retried, and because it starts with a lookup by external id, repeating it
   * is safe.
   */
  async function link(input: {
    entity: TebraSyncEntity;
    localId: string;
    externalId: string;
    find: () => Promise<TebraRemoteRecord | null>;
    create: () => Promise<TebraRemoteRecord>;
    update: (tebraId: string) => Promise<TebraRemoteRecord>;
  }): Promise<TebraOperationResult<{ tebraId: string }>> {
    const { entity, localId, externalId } = input;

    let existing: TebraEntityLink | null = null;
    try {
      existing = await deps.links.findByLocalId(entity, localId);
    } catch {
      await record(
        `care.tebra.${entity}_failed`,
        tebraAuditDetail({
          operation: "sync",
          entity,
          localId,
          externalId,
          success: false,
          code: "tebra_unavailable",
        }),
      );
      return failure("tebra_unavailable", true);
    }

    const attempt = await runWithTebraRetry(
      async () => {
        if (existing) return input.update(existing.tebraId);
        const found = await input.find();
        return found ? input.update(found.tebraId) : input.create();
      },
      { policy, sleep: deps.sleep },
    );

    if (!attempt.ok) {
      await record(
        `care.tebra.${entity}_failed`,
        tebraAuditDetail({
          operation: "sync",
          entity,
          localId,
          externalId,
          success: false,
          code: attempt.code,
          attempts: attempt.attempts,
        }),
      );
      return failure(attempt.code, attempt.retryable);
    }

    if (!acceptRemote(attempt.value, externalId)) {
      await record(
        `care.tebra.${entity}_failed`,
        tebraAuditDetail({
          operation: "sync",
          entity,
          localId,
          externalId,
          success: false,
          code: "tebra_conflict",
          attempts: attempt.attempts,
        }),
      );
      return failure("tebra_conflict");
    }

    const stamp = now().toISOString();
    try {
      await deps.links.saveLink({
        entity,
        localId,
        externalId,
        tebraId: attempt.value.tebraId,
        linkedAt: existing?.linkedAt ?? stamp,
        lastSeenAt: stamp,
      });
    } catch {
      // The upstream record exists and is addressed by the external id, so the
      // next run reaches the same record. Report a retryable failure rather
      // than claiming a link that was not stored.
      await record(
        `care.tebra.${entity}_failed`,
        tebraAuditDetail({
          operation: "sync",
          entity,
          localId,
          externalId,
          success: false,
          code: "tebra_unavailable",
          attempts: attempt.attempts,
        }),
      );
      return failure("tebra_unavailable", true);
    }

    try {
      await record(
        `care.tebra.${entity}_linked`,
        tebraAuditDetail({
          operation: "sync",
          entity,
          localId,
          externalId,
          tebraId: attempt.value.tebraId,
          success: true,
          attempts: attempt.attempts,
        }),
      );
    } catch {
      // Care does not accept an unlogged action. The link is already stored, so
      // a retry re-audits without touching the practice system again.
      return failure("tebra_unavailable", true);
    }

    return { ok: true, value: { tebraId: attempt.value.tebraId } };
  }

  return {
    async syncPatient(raw) {
      if (deps.config.state !== "ready") return failure(notReady(deps.config));
      const parsed = TebraPatientProjectionSchema.safeParse(raw);
      if (!parsed.success) return failure("tebra_invalid_payload");
      if (!(await careCapabilityAllowsTebra(deps.loadCareCapability))) {
        return failure("care_disabled");
      }
      const patient = parsed.data;

      return serialize(patient.externalId, () =>
        link({
          entity: "patient",
          localId: patient.localPatientId,
          externalId: patient.externalId,
          find: () => deps.client.findPatientByExternalId(patient.externalId),
          create: () => deps.client.createPatient(patient),
          update: (tebraId) => deps.client.updatePatient(tebraId, patient),
        }),
      );
    },

    async syncAppointment(raw) {
      if (deps.config.state !== "ready") return failure(notReady(deps.config));
      const parsed = TebraAppointmentProjectionSchema.safeParse(raw);
      if (!parsed.success) return failure("tebra_invalid_payload");
      if (!(await careCapabilityAllowsTebra(deps.loadCareCapability))) {
        return failure("care_disabled");
      }
      const appointment = parsed.data;

      // An appointment cannot be placed before its patient exists upstream.
      // Creating one against an unlinked patient is how a booking ends up on
      // the wrong chart, so this refuses instead of guessing.
      let patientLink: TebraEntityLink | null = null;
      try {
        patientLink = await deps.links.findByExternalId(
          "patient",
          appointment.patientExternalId,
        );
      } catch {
        return failure("tebra_unavailable", true);
      }
      if (!patientLink) return failure("tebra_not_linked");

      return serialize(appointment.externalId, () =>
        link({
          entity: "appointment",
          localId: appointment.localAppointmentId,
          externalId: appointment.externalId,
          find: () => deps.client.findAppointmentByExternalId(appointment.externalId),
          create: () => deps.client.createAppointment(appointment),
          update: (tebraId) => deps.client.updateAppointment(tebraId, appointment),
        }),
      );
    },
  };
}
