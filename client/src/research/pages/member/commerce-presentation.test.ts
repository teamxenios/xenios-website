// Presentation rules that are load bearing for honesty: a price that is not
// confirmed never renders as money, and a calendar date never drifts a day
// backwards for members west of UTC.

import { describe, expect, it } from "vitest";
import {
  agreementLabel,
  claimNote,
  CLAIM_RESOLUTION_NOTES,
  CLAIM_STATE_NOTES,
  formatCents,
  formatDate,
  priceLabel,
  PRICE_NOT_CONFIRMED,
} from "./commerce-presentation";
import type { ClaimDto } from "@shared/research/commerce-api";

describe("agreementLabel", () => {
  it("turns an opaque key into a readable name", () => {
    expect(agreementLabel("research_use")).toBe("Research use");
    expect(agreementLabel("no_resale")).toBe("No resale");
    expect(agreementLabel("research-terms-v1")).toBe("Research terms v1");
  });

  // The caller phrases it as a NAMED agreement ("I accept the X agreement"),
  // so an unfamiliar key can never produce broken grammar.
  it("never returns an empty label, even for an odd key", () => {
    expect(agreementLabel("x")).toBe("X");
    expect(agreementLabel("")).toBe("");
    expect(agreementLabel("__")).toBe("__");
  });
});

describe("priceLabel", () => {
  it("renders the canonical copy for an unconfirmed price, never money", () => {
    expect(priceLabel(null)).toBe(PRICE_NOT_CONFIRMED);
    expect(priceLabel(null)).not.toContain("$");
  });

  it("renders a confirmed price as money, including a genuine zero", () => {
    expect(priceLabel(4999)).toBe("$49.99");
    expect(priceLabel(0)).toBe("$0.00");
  });

  it("formats cents without floating point drift", () => {
    expect(formatCents(1015)).toBe("$10.15");
    expect(formatCents(100000)).toBe("$1,000.00");
  });
});

describe("formatDate", () => {
  it("returns null for a missing value rather than inventing a date", () => {
    expect(formatDate(null)).toBeNull();
    expect(formatDate(undefined)).toBeNull();
    expect(formatDate("")).toBeNull();
  });

  // The regression the subscriptions migration surfaced: a next-charge date at
  // midnight UTC used to render one day early in every western offset, so a
  // member in Chicago saw the wrong billing day.
  it("holds a midnight-UTC instant on its own calendar day", () => {
    expect(formatDate("2026-08-05T00:00:00Z")).toBe("Aug 5, 2026");
  });

  it("holds a date-only string on its own calendar day", () => {
    expect(formatDate("2026-01-01")).toBe("Jan 1, 2026");
  });

  it("still renders a real time of day in the member's own zone", () => {
    // Only the day is asserted, since the test runner's zone decides the rest.
    expect(formatDate("2026-08-05T15:30:00Z")).toContain("2026");
  });

  it("passes through an unparseable value instead of showing Invalid Date", () => {
    expect(formatDate("not a date")).toBe("not a date");
  });
});

describe("claimNote (the member refund-request lifecycle)", () => {
  const claim = (state: ClaimDto["state"], resolution: ClaimDto["resolution"] = null) => ({ state, resolution });

  it("covers every wire state with a plain what-happens-next sentence", () => {
    const states: Array<ClaimDto["state"]> = [
      "submitted",
      "under_review",
      "information_requested",
      "approved",
      "declined",
      "resolved",
    ];
    for (const state of states) {
      expect(CLAIM_STATE_NOTES[state].length).toBeGreaterThan(5);
      expect(claimNote(claim(state))).toBe(CLAIM_STATE_NOTES[state]);
    }
  });

  it("tells an approved member a refund or replacement is being arranged", () => {
    expect(claimNote(claim("approved"))).toContain("refund or replacement");
  });

  it("prefers the resolution note once a resolved claim carries one", () => {
    expect(claimNote(claim("resolved", "refund"))).toBe(CLAIM_RESOLUTION_NOTES.refund);
    expect(claimNote(claim("resolved", "partial_refund"))).toBe(CLAIM_RESOLUTION_NOTES.partial_refund);
    expect(claimNote(claim("resolved", "replacement"))).toBe(CLAIM_RESOLUTION_NOTES.replacement);
    expect(claimNote(claim("resolved", "none"))).toBe(CLAIM_RESOLUTION_NOTES.none);
  });

  it("does not borrow a resolution note before the claim is resolved", () => {
    expect(claimNote(claim("approved", "refund"))).toBe(CLAIM_STATE_NOTES.approved);
  });
});
