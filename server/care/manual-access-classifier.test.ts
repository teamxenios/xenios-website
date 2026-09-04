import { describe, expect, it } from "vitest";
import type { LoiRow } from "../supabase-store";
import {
  CARE_ACCESS_BUSINESS_NAME,
  CARE_ACCESS_ROLE_PREFIX,
  CARE_ACCESS_SCHEMA,
  excludeCareManualAccessRows,
  isCareManualAccessOperationsRow,
  parseCareRawPayload,
  partitionCareManualAccessRows,
  rawPayloadHasCareSchema,
} from "./manual-access-classifier";

function genericLoi(overrides: Partial<LoiRow> = {}): LoiRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    full_name: "Generic Founder",
    email: "founder@example.test",
    business_name: "Generic Co",
    role: "CEO",
    why_interested: "We want to explore a pilot.",
    status: "New",
    email_status: "sent",
    created_at: "2026-09-01T10:00:00.000Z",
    ...overrides,
  } as LoiRow;
}

function careRow(overrides: Partial<LoiRow> = {}): LoiRow {
  return genericLoi({
    id: "2a99c6f7-1111-4222-8333-abcdefabcdef",
    full_name: "Care Requester",
    email: "care@example.test",
    business_name: CARE_ACCESS_BUSINESS_NAME,
    role: `${CARE_ACCESS_ROLE_PREFIX}new_care_request`,
    why_interested: JSON.stringify({
      schema: CARE_ACCESS_SCHEMA,
      locationState: "CO",
      careGoal: "new_care_request",
      contactMethod: "phone",
      contactWindow: "morning",
      adultConfirmation: true,
      boundaryAcknowledgement: true,
      medicalFreeTextCollected: false,
    }),
    source_page: "/care/schedule",
    landing_page: "/care/schedule",
    ...overrides,
  });
}

describe("canonical Care manual-access classifier", () => {
  it("does not recognise a generic LOI row", () => {
    expect(isCareManualAccessOperationsRow(genericLoi())).toBe(false);
  });

  it("recognises a fully marked Care row", () => {
    expect(isCareManualAccessOperationsRow(careRow())).toBe(true);
  });

  it("recognises each strong marker on its own so schema drift cannot demote a Care row", () => {
    const bare = {
      business_name: "Something else",
      role: "Founder",
      why_interested: "plain text",
      source_page: "/research",
      landing_page: "/research",
    } as Partial<LoiRow>;
    expect(isCareManualAccessOperationsRow(genericLoi({ ...bare, business_name: CARE_ACCESS_BUSINESS_NAME }))).toBe(true);
    expect(isCareManualAccessOperationsRow(genericLoi({ ...bare, role: `${CARE_ACCESS_ROLE_PREFIX}anything` }))).toBe(true);
    expect(
      isCareManualAccessOperationsRow(
        genericLoi({ ...bare, why_interested: JSON.stringify({ schema: CARE_ACCESS_SCHEMA }) }),
      ),
    ).toBe(true);
    expect(
      isCareManualAccessOperationsRow(
        genericLoi({ ...bare, source_page: "/care/schedule", landing_page: "/care/schedule" }),
      ),
    ).toBe(true);
    // Only one of the two page markers is not a strong marker.
    expect(isCareManualAccessOperationsRow(genericLoi({ ...bare, source_page: "/care/schedule" }))).toBe(false);
  });

  it("keeps recognising a Care row whose operational payload is malformed", () => {
    expect(isCareManualAccessOperationsRow(careRow({ why_interested: "{not json" }))).toBe(true);
    expect(isCareManualAccessOperationsRow(careRow({ why_interested: null }))).toBe(true);
    expect(
      isCareManualAccessOperationsRow(
        careRow({ business_name: "drifted", role: null as unknown as string, why_interested: "{not json" }),
      ),
    ).toBe(true);
  });

  it("parses payloads without throwing and matches only the Care schema", () => {
    expect(parseCareRawPayload(null)).toBeNull();
    expect(parseCareRawPayload("{oops")).toBeNull();
    expect(rawPayloadHasCareSchema(parseCareRawPayload(JSON.stringify({ schema: CARE_ACCESS_SCHEMA })))).toBe(true);
    expect(rawPayloadHasCareSchema(parseCareRawPayload(JSON.stringify({ schema: "other" })))).toBe(false);
    expect(rawPayloadHasCareSchema(parseCareRawPayload(JSON.stringify([CARE_ACCESS_SCHEMA])))).toBe(false);
  });

  it("partitions and excludes without reordering the generic rows", () => {
    const rows = [genericLoi({ id: "a" }), careRow({ id: "b" }), genericLoi({ id: "c" }), careRow({ id: "d", why_interested: "{" })];
    expect(excludeCareManualAccessRows(rows).map((r) => r.id)).toEqual(["a", "c"]);
    const { care, generic } = partitionCareManualAccessRows(rows);
    expect(care.map((r) => r.id)).toEqual(["b", "d"]);
    expect(generic.map((r) => r.id)).toEqual(["a", "c"]);
  });
});
