import { describe, expect, it } from "vitest";
import {
  earlyAccessAgreementGate,
  standingFromAgreementState,
  type EarlyAccessAgreementStanding,
} from "./agreementGate";

/**
 * THE GATE FAILS CLOSED, AND "WE HAVE NOT ASKED YET" IS NOT CONSENT.
 *
 * Exactly one standing may open this gate. Everything else, including the
 * states that mean the server never answered, must keep it shut. The last test
 * is the important one: it enumerates the whole type, so a standing added later
 * is closed by default and has to be opened deliberately.
 */

describe("only a server 'accepted' satisfies the gate", () => {
  it("accepted opens it", () => {
    expect(earlyAccessAgreementGate("accepted").satisfied).toBe(true);
  });

  it("unknown does not, because nobody has asked", () => {
    const gate = earlyAccessAgreementGate("unknown");
    expect(gate.satisfied).toBe(false);
    // And it does not accuse the customer of skipping something.
    expect(gate.actionable).toBe(false);
    expect(gate.detail.toLowerCase()).toContain("checking");
  });

  it("required does not, and tells the customer it is theirs to do", () => {
    const gate = earlyAccessAgreementGate("required");
    expect(gate.satisfied).toBe(false);
    expect(gate.actionable).toBe(true);
  });

  it("locked and error do not, and neither is the customer's to fix here", () => {
    for (const standing of ["locked", "error"] as const) {
      const gate = earlyAccessAgreementGate(standing);
      expect(gate.satisfied).toBe(false);
      expect(gate.actionable).toBe(false);
    }
  });

  it("unverified does not, but the customer can act on it", () => {
    const gate = earlyAccessAgreementGate("unverified");
    expect(gate.satisfied).toBe(false);
    expect(gate.actionable).toBe(true);
  });

  it("EVERY standing except accepted keeps the gate shut", () => {
    const all: readonly EarlyAccessAgreementStanding[] = [
      "unknown",
      "accepted",
      "required",
      "locked",
      "unverified",
      "error",
    ];
    const opened = all.filter((standing) => earlyAccessAgreementGate(standing).satisfied);
    expect(opened).toEqual(["accepted"]);
  });

  it("a value outside the type is treated as a fault, never as consent", () => {
    const gate = earlyAccessAgreementGate("something-new" as EarlyAccessAgreementStanding);
    expect(gate.satisfied).toBe(false);
  });
});

describe("narrowing a server answer to a standing", () => {
  it("maps the kinds the agreement adapter returns", () => {
    expect(standingFromAgreementState({ kind: "accepted" })).toBe("accepted");
    expect(standingFromAgreementState({ kind: "required" })).toBe("required");
    expect(standingFromAgreementState({ kind: "locked" })).toBe("locked");
    expect(standingFromAgreementState({ kind: "unverified" })).toBe("unverified");
    expect(standingFromAgreementState({ kind: "error" })).toBe("error");
  });

  it("anything unrecognised, absent or malformed becomes error, not accepted", () => {
    expect(standingFromAgreementState(null)).toBe("error");
    expect(standingFromAgreementState(undefined)).toBe("error");
    expect(standingFromAgreementState({ kind: "" })).toBe("error");
    expect(standingFromAgreementState({ kind: "ACCEPTED" })).toBe("error");
    expect(standingFromAgreementState({ kind: "accepted_v2" })).toBe("error");
    // The shape a hostile or simply newer server might send.
    expect(standingFromAgreementState({ kind: "ok" })).toBe("error");
  });
});
