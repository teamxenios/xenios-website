import { describe, expect, it } from "vitest";
import {
  EmailPayloadRefused,
  FOUNDING_EMAIL_TEMPLATES,
  FOUNDING_EMAIL_TEMPLATE_KEYS,
  assertEmailPayloadSafe,
  enqueueDueRenewalNotices,
  enqueueFoundingEmail,
  foundingEmailEventKey,
  renewalNoticeInstances,
  type FoundingEmailEnqueueInput,
} from "./emails";
import { NO_AUTOMATIC_BILLING_CONTRACT, renewalNoticeSchedule } from "./renewals";
import { createObligation } from "./obligations";

// ---------------------------------------------------------------------------
// The 27-template catalog
// ---------------------------------------------------------------------------

describe("the founding email catalog", () => {
  it("carries exactly the 27 spec templates, unique, all fm_-prefixed", () => {
    expect(FOUNDING_EMAIL_TEMPLATES).toHaveLength(27);
    expect(new Set(FOUNDING_EMAIL_TEMPLATE_KEYS).size).toBe(27);
    for (const template of FOUNDING_EMAIL_TEMPLATES) {
      expect(template.key.startsWith("fm_")).toBe(true);
      expect(["member", "admin"]).toContain(template.audience);
      expect(template.subject.length).toBeGreaterThan(0);
      expect(template.bodyLines.length).toBeGreaterThan(0);
    }
  });

  it("keeps admin-audience templates to exactly the records notifications", () => {
    const admin = FOUNDING_EMAIL_TEMPLATES.filter((t) => t.audience === "admin");
    expect(admin.map((t) => t.key)).toEqual(["fm_admin_esign_completed"]);
  });

  it("includes every renewal notice template the renewals.ts schedule defines", () => {
    for (const notice of renewalNoticeSchedule()) {
      expect(FOUNDING_EMAIL_TEMPLATE_KEYS).toContain(notice.template);
    }
  });

  it("carries the no-automatic-billing contract on every renewal notice body", () => {
    const noticeKeys = new Set(renewalNoticeSchedule().map((notice) => notice.template));
    for (const template of FOUNDING_EMAIL_TEMPLATES) {
      if (!noticeKeys.has(template.key)) continue;
      expect(template.bodyLines).toContain(NO_AUTOMATIC_BILLING_CONTRACT);
    }
  });

  it("never puts a payment destination in a body: the destination line says portal-only", () => {
    const created = FOUNDING_EMAIL_TEMPLATES.find((t) => t.key === "fm_activation_obligation_created");
    expect(created?.bodyLines.join(" ")).toContain("member portal only, never in email");
  });
});

// ---------------------------------------------------------------------------
// Payload discipline
// ---------------------------------------------------------------------------

describe("assertEmailPayloadSafe", () => {
  it("allows the reference-and-label vocabulary", () => {
    expect(() =>
      assertEmailPayloadSafe({ xeniosRef: "XRM-ABCDEFGH", amount: "$50.00", methodLabel: "Zelle" }),
    ).not.toThrow();
  });

  it("refuses instruction-shaped keys loudly", () => {
    for (const key of [
      "receivingInstructions",
      "instructions",
      "destinationHandle",
      "accountNumber",
      "routingNumber",
      "cashTag",
      "deepLink",
    ]) {
      expect(() => assertEmailPayloadSafe({ [key]: "x" }), key).toThrow(EmailPayloadRefused);
    }
  });

  it("is enforced by the enqueue helper before any row can exist", async () => {
    const rows: FoundingEmailEnqueueInput[] = [];
    await expect(
      enqueueFoundingEmail(
        async (input) => {
          rows.push(input);
          return true;
        },
        {
          templateKey: "fm_payment_report_received",
          recipient: "member@members.test",
          subjectId: "ob-1",
          payload: { receivingInstructions: "pay-to-handle" },
        },
      ),
    ).rejects.toThrow(EmailPayloadRefused);
    expect(rows).toHaveLength(0);
  });

  it("refuses an unknown template key", async () => {
    await expect(
      enqueueFoundingEmail(async () => true, {
        templateKey: "fm_not_a_template",
        recipient: "member@members.test",
        subjectId: "ob-1",
      }),
    ).rejects.toThrow("Unknown founding email template");
  });
});

// ---------------------------------------------------------------------------
// The renewal notice schedule mapped onto real dates
// ---------------------------------------------------------------------------

describe("renewalNoticeInstances", () => {
  it("projects the renewals.ts offsets onto the obligation's due date", () => {
    const instances = renewalNoticeInstances("2026-08-21T00:00:00.000Z");
    const byKey = new Map(instances.map((instance) => [instance.key, instance]));
    expect(byKey.get("renewal_upcoming_7d")?.sendAt).toBe("2026-08-14T00:00:00.000Z");
    expect(byKey.get("renewal_upcoming_3d")?.sendAt).toBe("2026-08-18T00:00:00.000Z");
    expect(byKey.get("renewal_due_today")?.sendAt).toBe("2026-08-21T00:00:00.000Z");
    expect(byKey.get("renewal_overdue_1d")?.sendAt).toBe("2026-08-22T00:00:00.000Z");
    expect(instances).toHaveLength(renewalNoticeSchedule().length);
  });

  it("refuses a nonsense due date", () => {
    expect(() => renewalNoticeInstances("not-a-date")).toThrow("Not a valid due date");
  });
});

describe("enqueueDueRenewalNotices", () => {
  const method = {
    methodId: "zelle-1",
    category: "manual_external_payment" as const,
    label: "Zelle",
    instructionsRef: "zelle-1",
    productPurchaseEligible: false,
    capturedAt: "2026-07-22T00:00:00.000Z",
  };

  function renewalDue(dueAt: string) {
    return createObligation({
      memberId: "member-n-1",
      type: "renewal_25",
      method,
      now: new Date("2026-07-22T00:00:00Z"),
      dueAt: new Date(dueAt),
    });
  }

  it("enqueues only the notices whose sendAt has arrived, with deterministic event keys", async () => {
    const obligation = renewalDue("2026-08-21T00:00:00.000Z");
    const rows: FoundingEmailEnqueueInput[] = [];
    const run = () =>
      enqueueDueRenewalNotices({
        obligations: [obligation],
        recipientFor: async () => "member@members.test",
        enqueue: async (input) => {
          rows.push(input);
          return true;
        },
        now: new Date("2026-08-21T12:00:00Z"),
      });

    const first = await run();
    // Due date has passed by noon: the 7d, 3d, and due-today notices are due.
    expect(first).toBe(3);
    expect(rows.map((row) => row.templateKey).sort()).toEqual([
      "fm_renewal_due_today",
      "fm_renewal_upcoming_3d",
      "fm_renewal_upcoming_7d",
    ]);

    // A second tick produces byte-identical event keys, so the outbox unique
    // event_key absorbs the re-enqueue and nothing double-sends.
    const before = rows.map((row) => row.eventKey);
    await run();
    expect(rows.slice(3).map((row) => row.eventKey)).toEqual(before);
  });

  it("skips verified and terminal obligations and members without an address", async () => {
    const verified = { ...renewalDue("2026-08-21T00:00:00.000Z"), status: "verified" as const };
    const noAddress = renewalDue("2026-08-21T00:00:00.000Z");
    const rows: FoundingEmailEnqueueInput[] = [];
    const count = await enqueueDueRenewalNotices({
      obligations: [verified, noAddress],
      recipientFor: async () => null,
      enqueue: async (input) => {
        rows.push(input);
        return true;
      },
      now: new Date("2026-08-21T12:00:00Z"),
    });
    expect(count).toBe(0);
    expect(rows).toHaveLength(0);
  });

  it("derives one stable event key per (template, subject)", () => {
    expect(foundingEmailEventKey("fm_renewal_due_today", "ob-1:renewal_due_today")).toBe(
      "fm:fm_renewal_due_today:ob-1:renewal_due_today",
    );
  });
});
