// Denial presentation coverage: every code in the frozen CommerceDenialCode
// union has non-empty copy of our own, the canonical copy is verbatim, the
// tone mapping holds, and unknown codes land on the calm fallback. The record
// in lib/denials is typed Record<CommerceDenialCode, ...>, so exhaustiveness
// is enforced at compile time; this test proves it at runtime and pins the
// canonical strings.

import { describe, expect, it } from "vitest";
import { denialPresentation, failureText, KNOWN_DENIAL_CODES } from "./denials";

// House style bans the em dash everywhere, so it is referenced by escape here
// rather than typed literally into the file it polices.
const EM_DASH = "\u2014";

// The frozen union, mirrored as data so the test fails loudly if a code loses
// its copy (KNOWN_DENIAL_CODES is derived from the copy record itself).
const EXPECTED_CODES = [
  "activation_required",
  "billing_past_due",
  "membership_inactive",
  "recovery_session",
  "capability_disabled",
  "commerce_disabled",
  "product_not_found",
  "product_not_purchasable",
  "unconfirmed_supplier_facts",
  "lane_not_purchasable",
  "quantity_invalid",
  "insufficient_stock",
  "cart_empty",
  "cart_revalidation_failed",
  "agreement_required",
  "address_invalid",
  "state_not_serviceable",
  "shipping_unavailable",
  "payment_disabled",
  "payment_failed",
  "large_order_review_required",
  "order_not_found",
  "order_state_invalid",
  "subscription_not_found",
  "subscription_action_invalid",
  "guide_not_found",
  "guide_not_published",
  "partner_not_found",
  "partner_not_active",
  "commission_not_visible",
  "forbidden",
] as const;

describe("denialPresentation coverage", () => {
  it("covers every CommerceDenialCode", () => {
    expect([...KNOWN_DENIAL_CODES].sort()).toEqual([...EXPECTED_CODES].sort());
  });

  it.each([...EXPECTED_CODES])("%s returns non-empty title, body, and a valid tone", (code) => {
    const p = denialPresentation(code);
    expect(p.title.length).toBeGreaterThan(0);
    expect(p.body.length).toBeGreaterThan(0);
    expect(["pending", "notice", "error"]).toContain(p.tone);
  });

  it("never uses an em dash anywhere in the copy (house style)", () => {
    for (const code of EXPECTED_CODES) {
      const p = denialPresentation(code);
      expect(p.title).not.toContain(EM_DASH);
      expect(p.body).not.toContain(EM_DASH);
    }
  });

  it("never renders the server message as the copy", () => {
    const p = denialPresentation("commerce_disabled", "RAW SERVER TEXT");
    expect(p.title).not.toContain("RAW SERVER TEXT");
    expect(p.body).not.toContain("RAW SERVER TEXT");
  });
});

describe("canonical copy", () => {
  it("commerce_disabled uses the canonical copy with pending tone", () => {
    expect(denialPresentation("commerce_disabled")).toEqual({
      title: "Ordering is not open yet.",
      body: "Nothing you entered was lost. Ordering opens once commerce is switched on, and this exact flow will work unchanged.",
      tone: "pending",
    });
  });

  it("large_order_review_required is a calm notice, not an error", () => {
    expect(denialPresentation("large_order_review_required")).toEqual({
      title: "Order received, pending review.",
      body: "Large orders get a personal review before processing. Typical turnaround is about two hours.",
      tone: "notice",
    });
  });

  it("guide_not_published carries the canonical title with notice tone", () => {
    const p = denialPresentation("guide_not_published");
    expect(p.title).toBe("This guide is not published yet.");
    expect(p.tone).toBe("notice");
  });
});

describe("tone mapping", () => {
  it.each(["commerce_disabled", "payment_disabled", "capability_disabled"])(
    "%s is pending",
    (code) => {
      expect(denialPresentation(code).tone).toBe("pending");
    },
  );

  it.each([
    "large_order_review_required",
    "guide_not_published",
    "agreement_required",
    "unconfirmed_supplier_facts",
  ])("%s is notice", (code) => {
    expect(denialPresentation(code).tone).toBe("notice");
  });

  it.each(["payment_failed", "cart_empty", "forbidden", "membership_inactive"])(
    "%s is error",
    (code) => {
      expect(denialPresentation(code).tone).toBe("error");
    },
  );
});

describe("failureText", () => {
  const FALLBACK = "That did not go through. Please try again.";

  it("routes a coded denial through our own copy, not the server message", () => {
    const text = failureText(
      { kind: "denied", code: "commerce_disabled", message: "raw server wording" },
      FALLBACK,
    );
    expect(text).toContain("Ordering is not open yet.");
    expect(text).not.toContain("raw server wording");
  });

  it("uses the calm fallback copy for a code it has never seen", () => {
    const text = failureText({ kind: "denied", code: "some_future_code_v9" }, FALLBACK);
    expect(text).toContain("This is not available right now.");
    expect(text).not.toContain("some_future_code_v9");
  });

  it("gives its own sentence for an ended session", () => {
    expect(failureText({ kind: "unauthorized" }, FALLBACK)).toContain("session has ended");
  });

  it("keeps the caller's fallback for an unpublished endpoint, which is not an error", () => {
    expect(failureText({ kind: "unavailable" }, FALLBACK)).toBe(FALLBACK);
  });

  it("never returns undefined when an error carries no message", () => {
    expect(failureText({ kind: "error" }, FALLBACK)).toBe(FALLBACK);
    expect(failureText({ kind: "forbidden" }, FALLBACK)).toBe(
      "This action is not allowed for your account.",
    );
  });

  it("never renders an em dash", () => {
    for (const code of KNOWN_DENIAL_CODES) {
      expect(failureText({ kind: "denied", code }, FALLBACK)).not.toContain(EM_DASH);
    }
  });
});

describe("unknown codes", () => {
  it("falls back to the calm generic denial and never leaks the raw code", () => {
    const p = denialPresentation("some_future_code_v9");
    expect(p).toEqual({
      title: "This is not available right now.",
      body: "The request was declined. Please try again, or contact support if it keeps happening.",
      tone: "error",
    });
    expect(p.title).not.toContain("some_future_code_v9");
    expect(p.body).not.toContain("some_future_code_v9");
  });
});
