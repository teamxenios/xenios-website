import { beforeEach, describe, expect, it } from "vitest";
import { CrmService } from "./crm-service";
import type { OperationsActor } from "./state-machines";

const NOW = new Date("2026-07-25T16:00:00.000Z");
const ops: OperationsActor = { id: "ops", role: "operations_manager" };
const mitch: OperationsActor = { id: "mitch", role: "mitch" };

function unwrap<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

describe("operations CRM privacy and audit", () => {
  let crm: CrmService;

  beforeEach(() => {
    crm = new CrmService();
    unwrap(
      crm.create({
        id: "contact-1",
        kind: "applicant",
        displayName: "Ada Research",
        email: "Ada@Example.com",
        actor: ops,
        idempotencyKey: "contact-create",
        occurredAt: NOW,
      }),
    );
  });

  it("keeps CRM inaccessible to Mitch's logistics-only role", () => {
    expect(crm.get("contact-1", mitch)).toMatchObject({ ok: false, code: "forbidden" });
    expect(crm.list(mitch)).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("tracks application, activation, payment, and active stages with stale-write protection", () => {
    let contact = unwrap(crm.get("contact-1", ops)).contact;
    contact = unwrap(
      crm.transitionStage({
        contactId: contact.id,
        to: "pending_application",
        expectedVersion: contact.version,
        actor: ops,
        idempotencyKey: "stage-1",
        occurredAt: NOW,
      }),
    );
    const stale = crm.transitionStage({
      contactId: contact.id,
      to: "active",
      expectedVersion: 1,
      actor: ops,
      idempotencyKey: "stage-stale",
      occurredAt: NOW,
    });
    expect(stale).toMatchObject({ ok: false, code: "stale_write" });
    expect(crm.list(ops, "pending_application")).toMatchObject({ ok: true, value: [{ id: "contact-1" }] });
  });

  it("rejects clinical and patient data from operational notes", () => {
    const contact = unwrap(crm.get("contact-1", ops)).contact;
    for (const summary of [
      "Patient diagnosis reviewed",
      "Prescription value is $500",
      "Medication referral",
      "Medical record received",
    ]) {
      expect(
        crm.addNote({
          contactId: contact.id,
          summary,
          expectedVersion: contact.version,
          actor: ops,
          idempotencyKey: `bad-${summary}`,
          occurredAt: NOW,
        }),
      ).toMatchObject({ ok: false, code: "privacy_refused" });
    }
  });

  it("links orders and exceptions by reference and leaves an append-only timeline", () => {
    let contact = unwrap(crm.get("contact-1", ops)).contact;
    contact = unwrap(
      crm.linkReference({
        contactId: contact.id,
        referenceType: "order",
        referenceId: "ord-42",
        expectedVersion: contact.version,
        actor: ops,
        idempotencyKey: "link-order",
        occurredAt: NOW,
      }),
    );
    unwrap(
      crm.linkReference({
        contactId: contact.id,
        referenceType: "exception",
        referenceId: "exc-9",
        expectedVersion: contact.version,
        actor: ops,
        idempotencyKey: "link-exception",
        occurredAt: NOW,
      }),
    );
    const timeline = unwrap(crm.get("contact-1", ops)).timeline;
    expect(timeline.map((event) => event.kind)).toEqual(["created", "order_linked", "exception_linked"]);
    expect(timeline[1]).toMatchObject({ referenceType: "order", referenceId: "ord-42", actorId: "ops" });
  });

  it("absorbs a repeated write and refuses a conflicting key", () => {
    const contact = unwrap(crm.get("contact-1", ops)).contact;
    const command = {
      contactId: contact.id,
      summary: "Follow up Monday.",
      expectedVersion: contact.version,
      actor: ops,
      idempotencyKey: "note-once",
      occurredAt: NOW,
    };
    expect(crm.addNote(command)).toMatchObject({ ok: true, idempotent: false });
    expect(crm.addNote(command)).toMatchObject({ ok: true, idempotent: true });
    expect(crm.addNote({ ...command, summary: "Different note." })).toMatchObject({
      ok: false,
      code: "idempotency_conflict",
    });
    expect(unwrap(crm.get("contact-1", ops)).timeline.filter((event) => event.kind === "note")).toHaveLength(1);
  });
});
