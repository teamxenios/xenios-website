import { afterEach, describe, expect, it } from "vitest";
import {
  approvePaymentMethod,
  CipherNotConfigured,
  createAesGcmInstructionCipher,
  createPaymentMethod,
  disablePaymentMethod,
  foundingActivationEnabled,
  isMethodUsableAt,
  maskReceivingInstructions,
  PaymentMethodInvalid,
  revealReceivingInstructions,
  toAuthenticatedMemberMethod,
  toPublicMethodSummary,
  type CreatePaymentMethodInput,
  type InstructionCipher,
  type PaymentMethodRecord,
} from "./payment-methods";

const NOW = new Date("2026-07-22T12:00:00.000Z");

// A synthetic destination. NOT a real identifier; it exists to prove secrecy.
const PLAINTEXT = "send to synthetic-destination-000TEST memo FM";

const KEY = "test-only-key-material-long-enough-to-be-plausible";

function cipher(): InstructionCipher {
  return createAesGcmInstructionCipher(KEY);
}

function baseInput(overrides: Partial<CreatePaymentMethodInput> = {}): CreatePaymentMethodInput {
  return {
    methodId: "fm_method_1",
    providerCode: "manual_transfer",
    memberFacingName: "Bank transfer",
    adminFacingName: "Manual bank transfer (bridge)",
    duration: "temporary",
    activeStartAt: "2026-07-22T00:00:00.000Z",
    activeEndAt: "2026-08-05T00:00:00.000Z",
    activationEligible: true,
    renewalEligible: true,
    settlementTime: "1 to 3 business days",
    receivingLegalEntity: "Xenios Technology LLC",
    ownershipClassification: "business",
    receivingInstructions: PLAINTEXT,
    mobileInstructions: "Open your banking app and send the exact amount shown.",
    memoInstructions: "Include your member reference in the memo.",
    ...overrides,
  };
}

function approvedMethod(): PaymentMethodRecord {
  const { record } = createPaymentMethod(baseInput(), cipher(), "admin_samuel", NOW);
  return approvePaymentMethod(record, { approvedBy: "admin_samuel", now: NOW }).record;
}

/** Every string value anywhere in a serializable shape, recursively. */
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => allStrings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => allStrings(v, out));
  return out;
}

afterEach(() => {
  delete process.env.RESEARCH_FOUNDING_ACTIVATION_ENABLED;
});

describe("foundingActivationEnabled", () => {
  it("defaults to false when the flag is unset", () => {
    expect(foundingActivationEnabled({})).toBe(false);
  });

  it("is true only for the exact string true", () => {
    expect(foundingActivationEnabled({ RESEARCH_FOUNDING_ACTIVATION_ENABLED: "true" })).toBe(true);
    expect(foundingActivationEnabled({ RESEARCH_FOUNDING_ACTIVATION_ENABLED: "1" })).toBe(false);
    expect(foundingActivationEnabled({ RESEARCH_FOUNDING_ACTIVATION_ENABLED: "TRUE" })).toBe(false);
  });
});

describe("createAesGcmInstructionCipher", () => {
  it("round-trips and never emits the plaintext inside the ciphertext", () => {
    const c = cipher();
    const sealed = c.encrypt(PLAINTEXT);
    expect(sealed).not.toContain(PLAINTEXT);
    expect(sealed.startsWith("enc.v1:")).toBe(true);
    expect(c.decrypt(sealed)).toBe(PLAINTEXT);
  });

  it("uses a fresh IV so equal plaintexts produce distinct ciphertexts", () => {
    const c = cipher();
    expect(c.encrypt(PLAINTEXT)).not.toBe(c.encrypt(PLAINTEXT));
  });

  it("fails closed when the key is not configured", () => {
    expect(() => createAesGcmInstructionCipher(undefined)).toThrow(CipherNotConfigured);
    expect(() => createAesGcmInstructionCipher("  ")).toThrow(CipherNotConfigured);
  });

  it("reads PAYMENT_INSTRUCTIONS_ENC_KEY when no key material is passed", () => {
    process.env.RESEARCH_FOUNDING_ACTIVATION_ENABLED = "true"; // unrelated flag; must not matter
    const prior = process.env.PAYMENT_INSTRUCTIONS_ENC_KEY;
    try {
      process.env.PAYMENT_INSTRUCTIONS_ENC_KEY = KEY;
      const c = createAesGcmInstructionCipher();
      expect(c.decrypt(c.encrypt("x"))).toBe("x");
    } finally {
      if (prior === undefined) delete process.env.PAYMENT_INSTRUCTIONS_ENC_KEY;
      else process.env.PAYMENT_INSTRUCTIONS_ENC_KEY = prior;
    }
  });

  it("rejects a tampered ciphertext (GCM authenticates)", () => {
    const c = cipher();
    const sealed = c.encrypt(PLAINTEXT);
    const parts = sealed.split(":");
    const body = Buffer.from(parts[3], "base64");
    body[0] = body[0] ^ 0xff;
    parts[3] = body.toString("base64");
    expect(() => c.decrypt(parts.join(":"))).toThrow();
  });
});

describe("maskReceivingInstructions", () => {
  it("keeps only the last two characters", () => {
    const masked = maskReceivingInstructions(PLAINTEXT);
    expect(masked).toBe("••••FM");
    expect(masked).not.toContain("synthetic-destination");
  });

  it("is empty for empty input", () => {
    expect(maskReceivingInstructions("   ")).toBe("");
  });
});

describe("createPaymentMethod", () => {
  it("creates disabled and pending review; approval is never assumed", () => {
    const { record, version } = createPaymentMethod(baseInput(), cipher(), "admin_samuel", NOW);
    expect(record.enabled).toBe(false);
    expect(record.approvalStatus).toBe("pending_review");
    expect(record.approvedBy).toBeNull();
    expect(record.category).toBe("manual_external_payment");
    expect(record.version).toBe(1);
    expect(version.changeKind).toBe("created");
    expect(version.version).toBe(1);
    expect(version.changedBy).toBe("admin_samuel");
  });

  it("stores ciphertext plus a derived mask and never the plaintext", () => {
    const { record } = createPaymentMethod(baseInput(), cipher(), "admin_samuel", NOW);
    expect(record.receivingInstructionsEncrypted.startsWith("enc.v1:")).toBe(true);
    expect(record.receivingInstructionsMasked).toBe("••••FM");
    const everyString = allStrings(record);
    expect(everyString.some((s) => s.includes(PLAINTEXT))).toBe(false);
  });

  it("defaults product eligibility to false and refuses true outright", () => {
    const { record } = createPaymentMethod(baseInput(), cipher(), "admin_samuel", NOW);
    expect(record.productEligible).toBe(false);
    expect(() =>
      createPaymentMethod(baseInput({ productEligible: true }), cipher(), "admin_samuel", NOW),
    ).toThrow(PaymentMethodInvalid);
  });

  it("refuses merchant-integration labels the bridge does not have", () => {
    expect(() =>
      createPaymentMethod(baseInput({ memberFacingName: "Apple Pay" }), cipher(), "admin_samuel", NOW),
    ).toThrow(/merchant integration/);
    expect(() =>
      createPaymentMethod(baseInput({ providerCode: "apple_pay" }), cipher(), "admin_samuel", NOW),
    ).toThrow(/merchant integration/);
  });

  it("requires an activeEndAt for a temporary method and orders the amount bounds", () => {
    expect(() =>
      createPaymentMethod(baseInput({ activeEndAt: null }), cipher(), "admin_samuel", NOW),
    ).toThrow(/temporary/);
    expect(() =>
      createPaymentMethod(
        baseInput({ minAmountCents: 5000, maxAmountCents: 2500 }),
        cipher(),
        "admin_samuel",
        NOW,
      ),
    ).toThrow(/exceed/);
  });

  it("requires receiving instructions; a method with nothing to encrypt is refused", () => {
    expect(() =>
      createPaymentMethod(baseInput({ receivingInstructions: "  " }), cipher(), "admin_samuel", NOW),
    ).toThrow(/receiving instructions/);
  });
});

describe("approve, disable, and usability", () => {
  it("approval stamps the approver and date and is the only path to enabled", () => {
    const { record } = createPaymentMethod(baseInput(), cipher(), "admin_samuel", NOW);
    const approved = approvePaymentMethod(record, { approvedBy: "admin_samuel", now: NOW });
    expect(approved.record.enabled).toBe(true);
    expect(approved.record.approvalStatus).toBe("approved");
    expect(approved.record.approvedBy).toBe("admin_samuel");
    expect(approved.record.approvalDate).toBe(NOW.toISOString());
    expect(approved.record.version).toBe(2);
    expect(approved.version.changeKind).toBe("approved");
  });

  it("disable records the reason and a new version row", () => {
    const method = approvedMethod();
    const disabled = disablePaymentMethod(method, {
      actorId: "admin_samuel",
      reason: "Provider paused",
      now: NOW,
    });
    expect(disabled.record.enabled).toBe(false);
    expect(disabled.record.disabledReason).toBe("Provider paused");
    expect(disabled.version.changeKind).toBe("disabled");
    expect(isMethodUsableAt(disabled.record, NOW)).toBe(false);
  });

  it("usability honors the active window", () => {
    const method = approvedMethod();
    expect(isMethodUsableAt(method, NOW)).toBe(true);
    expect(isMethodUsableAt(method, new Date("2026-07-21T00:00:00.000Z"))).toBe(false); // before start
    expect(isMethodUsableAt(method, new Date("2026-08-05T00:00:00.000Z"))).toBe(false); // at end -> expired
  });

  it("a pending-review method is never usable", () => {
    const { record } = createPaymentMethod(baseInput(), cipher(), "admin_samuel", NOW);
    expect(isMethodUsableAt(record, NOW)).toBe(false);
  });
});

describe("serialized shapes never leak instructions (structural)", () => {
  it("the public summary carries no instruction material at all, masked or not", () => {
    const method = approvedMethod();
    const summary = toPublicMethodSummary(method);
    const json = JSON.stringify(summary);
    expect(json).not.toContain(PLAINTEXT);
    expect(json).not.toContain(method.receivingInstructionsEncrypted);
    expect(json).not.toContain(method.receivingInstructionsMasked);
    expect("receivingInstructionsMasked" in summary).toBe(false);
    expect("receivingInstructionsEncrypted" in summary).toBe(false);
  });

  it("the post-auth member shape carries the mask only, never ciphertext or plaintext", () => {
    const method = approvedMethod();
    const shape = toAuthenticatedMemberMethod(method);
    expect(shape.receivingInstructionsMasked).toBe("••••FM");
    const strings = allStrings(shape);
    expect(strings.some((s) => s.includes(PLAINTEXT))).toBe(false);
    expect(strings.some((s) => s.includes(method.receivingInstructionsEncrypted))).toBe(false);
    expect(strings.some((s) => s.includes("synthetic-destination"))).toBe(false);
  });
});

describe("revealReceivingInstructions", () => {
  it("decrypts only for a currently usable method", () => {
    const method = approvedMethod();
    expect(revealReceivingInstructions(method, cipher(), NOW)).toBe(PLAINTEXT);
  });

  it("keeps an unapproved or expired method's destination sealed", () => {
    const { record } = createPaymentMethod(baseInput(), cipher(), "admin_samuel", NOW);
    expect(() => revealReceivingInstructions(record, cipher(), NOW)).toThrow(/sealed/);
    const method = approvedMethod();
    expect(() =>
      revealReceivingInstructions(method, cipher(), new Date("2026-09-01T00:00:00.000Z")),
    ).toThrow(/sealed/);
  });
});
