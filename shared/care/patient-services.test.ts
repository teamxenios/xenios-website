import { describe, expect, it } from "vitest";
import { CARE_ROUTE_CONTRACTS, type CareRecordId } from "./contracts";
import {
  CARE_DISCOVERY_STORAGE_TABLES,
  CARE_INSTRUCTION_STORAGE_TABLES,
  CARE_MESSAGE_STORAGE_TABLES,
  CARE_SERVICE_STORAGE_AVAILABLE,
  CARE_SUPPLY_STORAGE_TABLES,
  CARE_SUPPORT_STORAGE_TABLES,
  CARE_TRANSMISSION_STATE,
  careDiscoveryAvailability,
  careServiceStorageMissing,
  countCareInstructionsAwaitingPublication,
  isCareInstructionPublished,
  selectCareInstructionsForPatient,
  toCareMessageReceipt,
  toCareMessageThreadItem,
  toCareSupplyShipmentItem,
  toCareSupportRequestItem,
  toCareSupportRequestReceipt,
  type CareInstructionRecord,
  type CareMessageRecord,
  type CareMessageThreadRecord,
  type CareSupplyShipmentRecord,
  type CareSupportRequestRecord,
} from "./patient-services";

const patientId = "patient-1" as CareRecordId;

function instruction(
  overrides: Partial<CareInstructionRecord> = {},
): CareInstructionRecord {
  return {
    id: "instruction-1" as CareRecordId,
    patientId,
    prescriptionId: null,
    title: "How to store your medication",
    category: "medication_use",
    version: "v1",
    publishedAt: "2026-07-28T10:00:00.000Z",
    publishedByUserId: "clinician-1",
    acknowledgedAt: null,
    bodyRecorded: true,
    updatedAt: "2026-07-28T10:00:00.000Z",
    ...overrides,
  };
}

function shipment(
  overrides: Partial<CareSupplyShipmentRecord> = {},
): CareSupplyShipmentRecord {
  return {
    id: "shipment-1" as CareRecordId,
    patientId,
    pharmacyOrderId: null,
    status: "requested",
    itemCount: 3,
    carrierName: null,
    trackingRecorded: false,
    shippedAt: null,
    deliveredAt: null,
    updatedAt: "2026-07-28T10:00:00.000Z",
    ...overrides,
  };
}

describe("Care patient service storage state", () => {
  it("names the missing record rather than reporting an empty result", () => {
    const state = careServiceStorageMissing(CARE_MESSAGE_STORAGE_TABLES);
    expect(state.available).toBe(false);
    expect(state.missingTables).toEqual([
      "care_message_threads",
      "care_messages",
    ]);
    expect(CARE_SERVICE_STORAGE_AVAILABLE.available).toBe(true);
    expect(CARE_SERVICE_STORAGE_AVAILABLE.missingTables).toEqual([]);
  });

  it("names a table for every surface that has no handler today", () => {
    expect(CARE_INSTRUCTION_STORAGE_TABLES).toEqual([
      "care_patient_instructions",
    ]);
    expect(CARE_SUPPLY_STORAGE_TABLES).toEqual(["care_supply_shipments"]);
    expect(CARE_SUPPORT_STORAGE_TABLES).toEqual(["care_support_requests"]);
    expect(CARE_DISCOVERY_STORAGE_TABLES).toEqual(["care_discovery_events"]);
  });

  it("does not let a caller mutate the shared missing-table list", () => {
    const state = careServiceStorageMissing(CARE_SUPPLY_STORAGE_TABLES);
    expect(state.missingTables).not.toBe(CARE_SUPPLY_STORAGE_TABLES);
  });
});

describe("Care instructions", () => {
  it("withholds an instruction no named clinician published", () => {
    expect(isCareInstructionPublished(instruction())).toBe(true);
    expect(
      isCareInstructionPublished(instruction({ publishedAt: null })),
    ).toBe(false);
    // A publication timestamp with nobody behind it is not a publication.
    expect(
      isCareInstructionPublished(instruction({ publishedByUserId: null })),
    ).toBe(false);
  });

  it("drops an unpublished draft from what a patient can read", () => {
    const records = [
      instruction({ id: "published" as CareRecordId }),
      instruction({ id: "draft" as CareRecordId, publishedAt: null }),
      instruction({
        id: "unowned" as CareRecordId,
        publishedByUserId: null,
      }),
    ];
    const visible = selectCareInstructionsForPatient(records);
    expect(visible.map((item) => item.id)).toEqual(["published"]);
    expect(countCareInstructionsAwaitingPublication(records)).toBe(2);
  });

  it("projects no instruction body and no patient identifier", () => {
    const [item] = selectCareInstructionsForPatient([instruction()]);
    expect(item.bodyAvailable).toBe(true);
    expect(item).not.toHaveProperty("body");
    expect(item).not.toHaveProperty("patientId");
    expect(item).not.toHaveProperty("publishedByUserId");
  });
});

describe("Care supplies", () => {
  it("never reports a shipment as shipped or delivered ahead of its status", () => {
    const packed = toCareSupplyShipmentItem(
      shipment({
        status: "packed",
        shippedAt: "2026-07-28T12:00:00.000Z",
        deliveredAt: "2026-07-29T12:00:00.000Z",
      }),
    );
    expect(packed.status).toBe("packed");
    expect(packed.shippedAt).toBeNull();
    expect(packed.deliveredAt).toBeNull();

    const shipped = toCareSupplyShipmentItem(
      shipment({
        status: "shipped",
        shippedAt: "2026-07-28T12:00:00.000Z",
        deliveredAt: "2026-07-29T12:00:00.000Z",
      }),
    );
    expect(shipped.shippedAt).toBe("2026-07-28T12:00:00.000Z");
    expect(shipped.deliveredAt).toBeNull();
  });

  it("reports whether tracking exists without projecting the identifier", () => {
    const item = toCareSupplyShipmentItem(
      shipment({ status: "shipped", trackingRecorded: true, carrierName: "usps" }),
    );
    expect(item.trackingAvailable).toBe(true);
    expect(item).not.toHaveProperty("trackingReference");
    expect(item).not.toHaveProperty("patientId");

    const untracked = toCareSupplyShipmentItem(shipment({ status: "shipped" }));
    expect(untracked.trackingAvailable).toBe(false);
    expect(untracked.carrierName).toBeNull();
  });
});

describe("Care messages", () => {
  const thread: CareMessageThreadRecord = {
    id: "thread-1" as CareRecordId,
    patientId,
    assignedClinicianUserId: null,
    subject: "A question about my appointment",
    status: "open",
    messageCount: 1,
    lastMessageAt: "2026-07-28T10:00:00.000Z",
    lastMessageFrom: "patient",
    createdAt: "2026-07-28T10:00:00.000Z",
    updatedAt: "2026-07-28T10:00:00.000Z",
  };

  it("reports whether a clinician is assigned without naming one", () => {
    const unassigned = toCareMessageThreadItem(thread);
    expect(unassigned.clinicianAssigned).toBe(false);
    expect(unassigned).not.toHaveProperty("assignedClinicianUserId");
    expect(unassigned).not.toHaveProperty("patientId");

    const assigned = toCareMessageThreadItem({
      ...thread,
      assignedClinicianUserId: "clinician-1",
    });
    expect(assigned.clinicianAssigned).toBe(true);
  });

  it("confirms a message as recorded and never as sent", () => {
    const record: CareMessageRecord = {
      id: "message-1" as CareRecordId,
      threadId: thread.id,
      patientId,
      authorRole: "patient",
      bodyRecorded: true,
      transmission: CARE_TRANSMISSION_STATE,
      recordedAt: "2026-07-28T10:00:00.000Z",
    };
    const receipt = toCareMessageReceipt(record);
    expect(receipt.transmission).toBe("not_enabled");
    expect(receipt.notice).toContain("does not send");
    expect(receipt).not.toHaveProperty("sentAt");
    expect(receipt).not.toHaveProperty("deliveredAt");
    expect(receipt).not.toHaveProperty("body");
  });
});

describe("Care support", () => {
  const request: CareSupportRequestRecord = {
    id: "support-1" as CareRecordId,
    patientId,
    topic: "billing",
    status: "received",
    bodyRecorded: true,
    assignedToUserId: null,
    recordedAt: "2026-07-28T10:00:00.000Z",
    resolvedAt: null,
    updatedAt: "2026-07-28T10:00:00.000Z",
  };

  it("reports that nobody has taken the request rather than softening it", () => {
    const item = toCareSupportRequestItem(request);
    expect(item.assigned).toBe(false);
    expect(item).not.toHaveProperty("assignedToUserId");
    expect(item).not.toHaveProperty("body");
  });

  it("never reports a resolution time on an unresolved request", () => {
    const item = toCareSupportRequestItem({
      ...request,
      status: "in_progress",
      resolvedAt: "2026-07-29T10:00:00.000Z",
    });
    expect(item.resolvedAt).toBeNull();
  });

  it("confirms a support request as recorded and never as sent", () => {
    const receipt = toCareSupportRequestReceipt(request);
    expect(receipt.status).toBe("received");
    expect(receipt.assigned).toBe(false);
    expect(receipt.transmission).toBe("not_enabled");
    expect(receipt).not.toHaveProperty("sentAt");
  });
});

describe("Care discovery", () => {
  it("reports that nothing is recorded and names what is missing", () => {
    const availability = careDiscoveryAvailability();
    expect(availability.intent).toBe("learn_about_care");
    expect(availability.recordingAvailable).toBe(false);
    expect(availability.subjectResolutionAvailable).toBe(false);
    expect(availability.storage.missingTables).toEqual([
      "care_discovery_events",
    ]);
    expect(availability.reason).toContain("not built");
  });

  it("carries no subject identifier and no product or order linkage", () => {
    const availability = careDiscoveryAvailability();
    expect(availability).not.toHaveProperty("subjectId");
    expect(availability).not.toHaveProperty("consentedAt");
    expect(availability).not.toHaveProperty("sku");
    expect(availability).not.toHaveProperty("orderId");
  });
});

describe("Care route contracts", () => {
  it("keeps the five surfaces on the paths the contract declares", () => {
    expect(CARE_ROUTE_CONTRACTS.instructions).toBe("/api/care/instructions");
    expect(CARE_ROUTE_CONTRACTS.supplies).toBe("/api/care/supplies");
    expect(CARE_ROUTE_CONTRACTS.messages).toBe("/api/care/messages");
    expect(CARE_ROUTE_CONTRACTS.support).toBe("/api/care/support");
    expect(CARE_ROUTE_CONTRACTS.discovery).toBe("/api/care/discovery");
  });
});
