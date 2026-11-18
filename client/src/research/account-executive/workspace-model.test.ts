import { describe, expect, it } from "vitest";
import { aeContactLabel, aeRequestStatusLabel, aeOriginalReferralLabel, aeReferrerLabel,
  aeAssignmentHistoryLabel, freezeAeCommand, readAeWorkspace } from "./workspace-model";
import type { AeCustomer, AeWorkspace } from "@shared/research/account-executive/workspace";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1), scope = id(5), at = "2026-11-18T14:00:00.000Z";
const ref = (n: number) => `XRI-${id(n).replaceAll("-", "").toUpperCase()}`;
function workspace(): AeWorkspace {
  return { schemaVersion: 1, actorAuthUserId: actor, scopeId: scope, generatedAt: at,
    capabilities: ["workspace:read"], customers: [{
      assignment: { id: id(6), customerAuthUserId: id(3), assigneeAuthUserId: actor, scopeId: scope, revision: 3 },
      assignmentHistory: { state: "unavailable" },
      contact: { state: "not_permitted" }, referral: { state: "unavailable" }, followups: [],
      requests: [{ requestId: id(8), publicReference: ref(8), receiptStatus: "pending_review", submittedAt: at,
        originalReferralInput: { state: "unavailable" }, workflow: null }],
    }] };
}
const context = { actorAuthUserId: actor, scopeId: scope };

describe("AE client read model", () => {
  it("accepts only the exact current actor/scope response", () => {
    expect(readAeWorkspace({ ok: true, value: workspace() }, context)).toEqual(workspace());
    expect(readAeWorkspace({ ok: true, value: workspace() }, { ...context, actorAuthUserId: id(2) })).toBeNull();
    expect(readAeWorkspace({ ok: true, value: workspace() }, { ...context, scopeId: id(99) })).toBeNull();
  });
  it("distinguishes a successful empty assigned list from unreadable data", () => {
    expect(readAeWorkspace({ ok: true, value: { ...workspace(), customers: [] } }, context)?.customers).toEqual([]);
    expect(readAeWorkspace({ ok: false, code: "unavailable" }, context)).toBeNull();
    expect(readAeWorkspace({ ok: true, value: { ...workspace(), customers: null } }, context)).toBeNull();
  });
  it("refuses extra private fields or a cross-customer assignment", () => {
    const value = workspace(); Object.assign(value.customers[0], { clinicalNotes: "PRIVATE_SENTINEL" });
    expect(readAeWorkspace({ ok: true, value }, context)).toBeNull();
    const other = workspace(); other.customers[0].assignment.assigneeAuthUserId = id(2);
    expect(readAeWorkspace({ ok: true, value: other }, context)).toBeNull();
  });
  it("never calls receipt-only pending_review a queued or completed workflow", () => {
    const row = workspace().customers[0].requests[0];
    expect(aeRequestStatusLabel(row)).toBe("Request received; processing status unavailable");
    expect(aeRequestStatusLabel({ ...row, workflow: { state: "approved" } })).toBe("Request status unavailable");
    expect(aeRequestStatusLabel({ ...row, publicReference: ref(9) })).toBe("Request status unavailable");
  });
  it("uses only a validated actual queued/reviewing history", () => {
    const row = workspace().customers[0].requests[0];
    const workflow = { schemaVersion: 1, requestId: id(8), publicReference: ref(8), state: "queued", revision: 1,
      changedAt: at, customerNotice: "unavailable", events: [
        { id: id(20), revision: 0, kind: "received", occurredAt: at },
        { id: id(21), revision: 1, kind: "queued", occurredAt: at },
      ] };
    expect(aeRequestStatusLabel({ ...row, workflow })).toBe("Queued for review");
    expect(aeRequestStatusLabel({ ...row, workflow: { ...workflow, state: "reviewing", revision: 2,
      events: [...workflow.events, { id: id(22), revision: 2, kind: "review_started", occurredAt: at }] } })).toBe("Under review");
  });
  it("does not display blank contact fields as available", () => {
    const customer = workspace().customers[0];
    expect(aeContactLabel(customer)).toBe("Contact access not granted");
    expect(aeContactLabel({ ...customer, contact: { state: "unavailable" } })).toBe("Contact details unavailable");
  });
  it("keeps original input, unresolved referrer and unavailable assignment history distinct", () => {
    const value = workspace(); value.customers[0].referral = { state: "unresolved" };
    expect(readAeWorkspace({ ok: true, value }, context)?.customers[0]).toMatchObject({
      assignment: { assigneeAuthUserId: actor }, referral: { state: "unresolved" },
      requests: [{ originalReferralInput: { state: "unavailable" } }], assignmentHistory: { state: "unavailable" },
    });
    expect(aeOriginalReferralLabel({ state: "redacted" })).toBe("Original referral input recorded (redacted)");
    expect(aeOriginalReferralLabel({ state: "none" })).toBe("No original referral input provided");
    expect(aeOriginalReferralLabel({ state: "unavailable" })).toBe("Original referral input unavailable");
    expect(aeOriginalReferralLabel({ state: "redacted", rawText: "PRIVATE_REFERRAL" })).toBe("Original referral input unavailable");
    expect(aeReferrerLabel({ state: "unresolved" })).toBe("Referrer unresolved");
    expect(aeReferrerLabel({ state: "none" })).toBe("No referrer recorded");
    expect(aeReferrerLabel({ state: "unavailable" })).toBe("Referrer attribution unavailable");
  });
  it("does not present missing history as zero events or accept private referral text", () => {
    expect(aeAssignmentHistoryLabel({ state: "unavailable" })).toBe("Assignment history unavailable");
    expect(aeAssignmentHistoryLabel({ state: "available", events: [] })).toBe("No assignment events recorded");
    expect(aeAssignmentHistoryLabel({ state: "available", events: null })).toBe("Assignment history unavailable");
    const value = workspace();
    Object.assign(value.customers[0].requests[0].originalReferralInput, { rawText: "PRIVATE_REFERRAL" });
    expect(readAeWorkspace({ ok: true, value }, context)).toBeNull();
  });
  it("rejects a cross-organization assignment event even when its customer and current AE match", () => {
    const value = workspace(); value.customers[0].assignmentHistory = { state: "available", events: [{
      id: id(50), assignmentId: id(6), scopeId: id(99), customerAuthUserId: id(3), revision: 1,
      actorAuthUserId: id(40), previousAssigneeAuthUserId: null, assigneeAuthUserId: actor,
      kind: "assigned", occurredAt: at,
    }] };
    expect(readAeWorkspace({ ok: true, value }, context)).toBeNull();
  });
  it("freezes the exact command for an uncertain retry and rejects authority/clinical additions", () => {
    const value = { kind: "record_followup", commandId: id(9), assignmentId: id(6), customerAuthUserId: id(3),
      expectedRevision: 3, purpose: "contact_customer", dueAt: at };
    const frozen = freezeAeCommand(value);
    expect(frozen).toEqual(value); expect(Object.isFrozen(frozen)).toBe(true);
    value.expectedRevision = 4;
    expect(frozen?.expectedRevision).toBe(3);
    expect(freezeAeCommand({ ...value, actorAuthUserId: actor })).toBeNull();
    expect(freezeAeCommand({ ...value, note: "PRIVATE_HEALTH_SENTINEL" })).toBeNull();
    expect(freezeAeCommand({ ...value, expectedRevision: 0 })).toBeNull();
    expect(freezeAeCommand({ ...value, expectedRevision: Number.MAX_SAFE_INTEGER })).toBeNull();
  });
  it("cannot bind a followup from another customer to an allowed customer", () => {
    const value = workspace();
    value.customers[0].followups = [{ id: id(13), customerAuthUserId: id(99), assignmentId: id(6),
      ownerAuthUserId: actor, purpose: "contact_customer", dueAt: at, state: "open", createdAt: at }];
    expect(readAeWorkspace({ ok: true, value }, context)).toBeNull();
  });
  it("keeps completed historical ownership visible while open tasks belong to the current AE", () => {
    const value = workspace(), row = value.customers[0];
    row.assignmentHistory = { state: "available", events: [
      { id: id(50), assignmentId: id(6), scopeId: scope, customerAuthUserId: id(3), revision: 1,
        actorAuthUserId: id(40), previousAssigneeAuthUserId: null, assigneeAuthUserId: id(2), kind: "assigned", occurredAt: at },
      { id: id(51), assignmentId: id(6), scopeId: scope, customerAuthUserId: id(3), revision: 2,
        actorAuthUserId: id(40), previousAssigneeAuthUserId: id(2), assigneeAuthUserId: actor, kind: "reassigned", occurredAt: at },
    ] };
    row.followups = [{ id: id(13), assignmentId: id(6), customerAuthUserId: id(3), ownerAuthUserId: id(2),
      purpose: "contact_customer", dueAt: at, createdAt: at, state: "completed" }];
    expect(readAeWorkspace({ ok: true, value }, context)?.customers[0].followups).toEqual(row.followups);
    row.followups[0].state = "open";
    expect(readAeWorkspace({ ok: true, value }, context)).toBeNull();
  });
});
