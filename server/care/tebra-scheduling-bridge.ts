import { tebraExternalId } from "@shared/care/tebra";
import type { TebraGateway } from "./tebra-gateway";

/**
 * Fills the transport seam of the existing Care scheduling adapter.
 *
 * server/care/tebra-scheduling.ts already owns the fail-closed decision about
 * whether an appointment may be sent at all: it checks Care, both runtime
 * approvals, the stored capability, and the request shape, and it falls back to
 * concierge scheduling whenever any of those is missing. That logic is not
 * duplicated here and that file is not modified. This module only supplies the
 * transport it asks for, so a booking placed through the existing adapter lands
 * on the same external id, the same link row, and the same audit trail as one
 * placed by the sync path.
 *
 * The structural type below matches TebraSchedulingTransport in that module.
 * Declaring it structurally keeps this lane from importing across a file it
 * does not own, while a compile-time check in the tests proves the two stay
 * compatible.
 */
export interface CareSchedulingRequest {
  appointmentId: string;
  startsAt: string;
  endsAt: string;
}

export interface CareSchedulingTransport {
  createAppointment(
    endpoint: URL,
    apiKey: string,
    request: CareSchedulingRequest,
  ): Promise<{ externalAppointmentId: string }>;
}

export interface TebraSchedulingBridgeDependencies {
  gateway: TebraGateway;
  /**
   * Resolves the Care patient that an appointment belongs to. The scheduling
   * request is deliberately opaque and carries no patient, so the caller
   * supplies this from the Care appointment repository.
   */
  resolvePatientId: (appointmentId: string) => Promise<string | null>;
  now?: () => Date;
}

/**
 * Failures are raised as an Error carrying only a safe code. The existing
 * adapter catches anything thrown here and returns the concierge fallback, so a
 * refusal degrades to a human scheduling the visit rather than to a silent
 * failure or a partially booked appointment.
 */
export function createTebraSchedulingTransport(
  deps: TebraSchedulingBridgeDependencies,
): CareSchedulingTransport {
  const now = deps.now ?? (() => new Date());

  return {
    // The endpoint and key belong to the existing adapter configuration. The
    // connector authenticates through its own injected practice client, so
    // these are accepted to satisfy the seam and are never read, logged, or
    // forwarded.
    async createAppointment(_endpoint, _apiKey, request) {
      const patientId = await deps.resolvePatientId(request.appointmentId);
      if (!patientId) throw new Error("tebra_not_linked");

      let externalId: string;
      let patientExternalId: string;
      try {
        externalId = tebraExternalId("appointment", request.appointmentId);
        patientExternalId = tebraExternalId("patient", patientId);
      } catch {
        throw new Error("tebra_invalid_payload");
      }

      const result = await deps.gateway.syncAppointment({
        localAppointmentId: request.appointmentId,
        localPatientId: patientId,
        patientExternalId,
        externalId,
        startsAt: request.startsAt,
        endsAt: request.endsAt,
        status: "scheduled",
        modifiedAt: now().toISOString(),
      });

      if (!result.ok) throw new Error(result.code);
      return { externalAppointmentId: result.value.tebraId };
    },
  };
}
