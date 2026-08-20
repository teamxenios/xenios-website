// The binding -> Early Access grant translation. Pinned here: economics are
// never invented (a null program refuses with pending_program before any
// lookup), an unmapped affiliate refuses, a self-referral refuses under the
// launch policy, the emitted grant matches the EA writer's contract field for
// field, and an over-long signed code is carried as a stable digest that the
// writer's referral-code shape accepts.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAUNCH_PROGRAM,
  type AffiliateProgramConfig,
} from "../../../shared/research/affiliate-program/config";
import {
  CUSTOMER_BINDING_METHOD,
  type AffiliateCustomerBinding,
} from "./customer-attribution-binding";
import {
  earlyAccessGrantFromBinding,
  referralCodeForGrant,
  writeEarlyAccessGrantFromBinding,
  type EarlyAccessGrantInput,
} from "./early-access-grant-adapter";

const CUSTOMER = "eac_0123456789abcdef0123456789abcdef";
const AFFILIATE_EA_REF = "eac_fedcba9876543210fedcba9876543210";

// The EA writer's own referral-code shape (commerce-ports.ts), restated to
// prove every emitted code passes it.
const EA_REFERRAL_CODE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,63}$/;

function binding(overrides: Partial<AffiliateCustomerBinding> = {}): AffiliateCustomerBinding {
  return {
    customerKey: CUSTOMER,
    partnerId: "partner-1",
    code: "SPRING24",
    subjectKey: "subject-1",
    capturedAt: "2026-08-19T10:00:00.000Z",
    boundAt: "2026-08-19T12:00:00.000Z",
    programState: "pending_program",
    method: CUSTOMER_BINDING_METHOD,
    ...overrides,
  };
}

describe("earlyAccessGrantFromBinding", () => {
  it("refuses pending_program on a null program, before any lookup runs", async () => {
    let lookups = 0;
    const result = await earlyAccessGrantFromBinding(binding(), {
      program: null,
      affiliateCustomerRefFor: async () => {
        lookups += 1;
        return AFFILIATE_EA_REF;
      },
    });
    expect(result).toEqual({ ok: false, reason: "pending_program" });
    expect(lookups).toBe(0);
  });

  it("refuses affiliate_unmapped when no EA customer ref is known for the partner", async () => {
    const result = await earlyAccessGrantFromBinding(binding(), {
      program: DEFAULT_LAUNCH_PROGRAM,
      affiliateCustomerRefFor: async () => null,
    });
    expect(result).toEqual({ ok: false, reason: "affiliate_unmapped" });
  });

  it("refuses self_referral under the launch policy", async () => {
    const result = await earlyAccessGrantFromBinding(binding(), {
      program: DEFAULT_LAUNCH_PROGRAM,
      affiliateCustomerRefFor: async () => CUSTOMER,
    });
    expect(result).toEqual({ ok: false, reason: "self_referral" });
  });

  it("permits a self-referral only when a program explicitly allows one", async () => {
    const permissive: AffiliateProgramConfig = {
      ...DEFAULT_LAUNCH_PROGRAM,
      selfReferralPolicy: "allowed",
    };
    const result = await earlyAccessGrantFromBinding(binding(), {
      program: permissive,
      affiliateCustomerRefFor: async () => CUSTOMER,
    });
    expect(result.ok).toBe(true);
  });

  it("emits the exact grant shape with the program's first-order rate as the hold", async () => {
    const result = await earlyAccessGrantFromBinding(binding(), {
      program: DEFAULT_LAUNCH_PROGRAM,
      affiliateCustomerRefFor: async (partnerId) => {
        expect(partnerId).toBe("partner-1");
        return AFFILIATE_EA_REF;
      },
    });
    expect(result).toEqual({
      ok: true,
      grant: {
        customerRef: CUSTOMER,
        referralCode: "SPRING24",
        affiliateId: "partner-1",
        affiliateCustomerRef: AFFILIATE_EA_REF,
        holdBasisPoints: DEFAULT_LAUNCH_PROGRAM.firstOrderRateBasisPoints,
      },
    });
  });
});

describe("referralCodeForGrant", () => {
  it("carries a code that fits the EA shape verbatim", () => {
    expect(referralCodeForGrant("SPRING24")).toBe("SPRING24");
    expect(referralCodeForGrant("a.b:c-d_e")).toBe("a.b:c-d_e");
  });

  it("digests an over-long signed code into a stable value the EA shape accepts", () => {
    const signed = `v1.${"A".repeat(48)}.${"B".repeat(16)}.${"C".repeat(43)}`;
    const digested = referralCodeForGrant(signed);
    expect(digested.startsWith("xc")).toBe(true);
    expect(digested).toHaveLength(58);
    expect(EA_REFERRAL_CODE.test(digested)).toBe(true);
    // Deterministic and code-specific: audit can recompute it from the link
    // row, and two different codes never share a digest.
    expect(referralCodeForGrant(signed)).toBe(digested);
    expect(referralCodeForGrant(`${signed}x`)).not.toBe(digested);
  });

  it("digests a code the shape refuses for reasons other than length", () => {
    const withSpace = "not a code";
    const digested = referralCodeForGrant(withSpace);
    expect(EA_REFERRAL_CODE.test(digested)).toBe(true);
  });
});

describe("writeEarlyAccessGrantFromBinding", () => {
  function writerRecording(answer: "granted" | "input_invalid") {
    const calls: EarlyAccessGrantInput[] = [];
    return {
      calls,
      async grant(input: EarlyAccessGrantInput) {
        calls.push(input);
        return answer;
      },
    };
  }

  it("writes the translated grant and relays success", async () => {
    const writer = writerRecording("granted");
    const result = await writeEarlyAccessGrantFromBinding(writer, binding(), {
      program: DEFAULT_LAUNCH_PROGRAM,
      affiliateCustomerRefFor: async () => AFFILIATE_EA_REF,
    });
    expect(result.ok).toBe(true);
    expect(writer.calls).toHaveLength(1);
    expect(writer.calls[0].affiliateId).toBe("partner-1");
  });

  it("never calls the writer on a translation refusal", async () => {
    const writer = writerRecording("granted");
    const result = await writeEarlyAccessGrantFromBinding(writer, binding(), {
      program: null,
      affiliateCustomerRefFor: async () => AFFILIATE_EA_REF,
    });
    expect(result).toEqual({ ok: false, reason: "pending_program" });
    expect(writer.calls).toHaveLength(0);
  });

  it("surfaces the writer's own refusal as writer_refused, never as silence", async () => {
    const writer = writerRecording("input_invalid");
    const result = await writeEarlyAccessGrantFromBinding(writer, binding(), {
      program: DEFAULT_LAUNCH_PROGRAM,
      affiliateCustomerRefFor: async () => AFFILIATE_EA_REF,
    });
    expect(result).toEqual({ ok: false, reason: "writer_refused" });
  });
});
