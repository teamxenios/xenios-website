import { describe, expect, it } from "vitest";
import {
  CARE_APPOINTMENT_STATUSES,
  type CareAppointmentStatus,
} from "@shared/care/appointments";
import {
  CARE_CAPABILITY_STATES,
  CARE_ROLES,
  CARE_ROLE_PERMISSIONS,
  type CareCapabilityState,
  type CareRecordId,
} from "@shared/care/contracts";
import { TebraAppointmentProjectionSchema, tebraExternalId } from "@shared/care/tebra";
import { careCapabilityAllowsTebra } from "./tebra-capability";
import { TEBRA_SCHEDULING_FAILURE_CODES } from "./tebra-scheduling";
import { buildTebraAppointmentProjection } from "./tebra-projection";

/**
 * What this lane assumes about the base it sits on.
 *
 * Every lane owes a rebase onto FINAL_EA_FAST_FOLLOW_BASE, and this connector
 * imports from exactly four upstream modules: @shared/care/contracts,
 * @shared/care/appointments, ./access and ./tebra-scheduling. A type error on
 * rebase is easy to see. These are the assumptions that would NOT produce a type
 * error, and would instead change what the connector means while it still
 * compiles. They are pinned here so a rebase reports them in one test run rather
 * than in production behaviour.
 */

describe("Base assumption: who may administer Care", () => {
  it("care:administer is held by exactly one role", () => {
    // The two admin surfaces are gated on care:administer. If a later base
    // grants it to another role, this connector's admin surface widens with no
    // change to any file in this lane and no type error anywhere.
    const holders = CARE_ROLES.filter((role) =>
      CARE_ROLE_PERMISSIONS[role].includes("care:administer"),
    );
    expect(holders).toEqual(["clinical_admin"]);
  });

  it("no role reaches the admin surfaces through a different permission", () => {
    // A patient-facing or clinician-facing role must not acquire care:administer
    // indirectly by a permission rename upstream.
    for (const role of ["care_patient", "clinician", "care_security_admin"] as const) {
      expect(CARE_ROLE_PERMISSIONS[role]).not.toContain("care:administer");
    }
  });
});

describe("Base assumption: the Care capability gate", () => {
  it("refuses every capability state the base defines except enabled", async () => {
    // Enumerated from the base's own list rather than hard coded, so a state
    // ADDED upstream is covered the moment it appears. A new state that this
    // connector treated as permission to run would be a silent fail-open on the
    // exact gate an operator reaches for in an incident.
    for (const state of CARE_CAPABILITY_STATES as readonly CareCapabilityState[]) {
      const allowed = await careCapabilityAllowsTebra(async () => ({
        rail: "care",
        state,
        enabled: state === "enabled",
        publicMessage: "",
        checkedAt: "2026-08-13T00:00:00.000Z",
      }));
      expect(`${state}:${allowed}`).toBe(`${state}:${state === "enabled"}`);
    }
  });

  it("requires state and enabled to agree, not either one alone", async () => {
    // Guards a base that lets the two fields drift apart. Both must say yes.
    await expect(
      careCapabilityAllowsTebra(async () => ({
        rail: "care",
        state: "pending_qa",
        enabled: true,
        publicMessage: "",
        checkedAt: "2026-08-13T00:00:00.000Z",
      })),
    ).resolves.toBe(false);

    await expect(
      careCapabilityAllowsTebra(async () => ({
        rail: "care",
        state: "enabled",
        enabled: false,
        publicMessage: "",
        checkedAt: "2026-08-13T00:00:00.000Z",
      })),
    ).resolves.toBe(false);
  });
});

describe("Base assumption: appointment status vocabulary", () => {
  it("the projection accepts exactly the statuses the base defines, both directions", () => {
    const accepted = new Set<string>();
    for (const status of CARE_APPOINTMENT_STATUSES as readonly CareAppointmentStatus[]) {
      const built = buildTebraAppointmentProjection({
        id: "22222222-2222-4222-8222-222222222222" as CareRecordId,
        patientId: "11111111-1111-4111-8111-111111111111" as CareRecordId,
        startsAt: "2026-08-20T15:00:00.000Z",
        endsAt: "2026-08-20T15:30:00.000Z",
        status,
        updatedAt: "2026-08-13T00:00:00.000Z",
      });
      if (built.ok) accepted.add(built.value.status);
    }
    // A status added upstream must not silently become an invalid payload on
    // its way to the practice system.
    expect([...accepted].sort()).toEqual([...CARE_APPOINTMENT_STATUSES].sort());

    // And nothing outside the base vocabulary is accepted.
    const foreign = TebraAppointmentProjectionSchema.safeParse({
      localAppointmentId: "22222222-2222-4222-8222-222222222222",
      localPatientId: "11111111-1111-4111-8111-111111111111",
      patientExternalId: tebraExternalId("patient", "11111111-1111-4111-8111-111111111111"),
      externalId: tebraExternalId("appointment", "22222222-2222-4222-8222-222222222222"),
      startsAt: "2026-08-20T15:00:00.000Z",
      endsAt: "2026-08-20T15:30:00.000Z",
      status: "rescheduled",
      modifiedAt: "2026-08-13T00:00:00.000Z",
    });
    expect(foreign.success).toBe(false);
  });
});

describe("Base assumption: Care record identifiers stay opaque", () => {
  it("a real Care record id can carry an external id", () => {
    // External ids are derived from Care record ids. If Care ever adopts an id
    // format outside the opaque band, derivation throws and every sync stops,
    // which is safe but total. Better to learn it here.
    const uuid = "11111111-1111-4111-8111-111111111111";
    expect(() => tebraExternalId("patient", uuid)).not.toThrow();
    expect(tebraExternalId("patient", uuid)).toContain(uuid);
  });
});

describe("Base assumption: the existing scheduling seam", () => {
  it("still publishes the failure vocabulary the bridge degrades into", () => {
    // The bridge throws a code and lets the existing adapter map it to the
    // concierge fallback. If that adapter stops publishing these, the fallback
    // path changes meaning.
    for (const code of ["care_disabled", "tebra_unavailable"] as const) {
      expect(TEBRA_SCHEDULING_FAILURE_CODES).toContain(code);
    }
  });
});
