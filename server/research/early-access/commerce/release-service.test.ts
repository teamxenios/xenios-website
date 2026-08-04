import { describe, expect, it } from "vitest";
import { createEarlyAccessOrder, type EarlyAccessOrder } from "./early-access-order";
import { SUPPLIER_RELEASE_PACKET_KEYS } from "./supplier-release";
import { describeProofAttachment, type EarlyAccessProofRecord } from "./proof-service";
import {
  decideManualPayment,
  type EarlyAccessVerificationEntry,
} from "./verification-service";
import type { EarlyAccessVerifiedOrder } from "./payment-verification";
import {
  EARLY_ACCESS_MAX_TRACKING_UPDATES,
  EARLY_ACCESS_RELEASE_RECORD_KEYS,
  InMemoryReleaseRepository,
  authorizingApproval,
  describeFulfillment,
  describeSupplierRelease,
  describeTrackingUpdate,
  fulfillOrder,
  isCarrier,
  isTrackingNumber,
  readEarlyAccessReleaseRecord,
  recordTracking,
  releaseToSupplier,
  type EarlyAccessReleaseRecord,
  type EarlyAccessTrackingRecord,
} from "./release-service";

const CREATED = "2026-08-04T12:00:00.000Z";
const UPLOADED = "2026-08-04T12:30:00.000Z";
const DECIDED = "2026-08-04T13:00:00.000Z";
const RELEASED = "2026-08-04T14:00:00.000Z";
const TRACKED = "2026-08-05T09:00:00.000Z";
const FULFILLED = "2026-08-07T17:00:00.000Z";

const KEY_ONE = "idem-ea-verify-00000001";
const ADMIN = Object.freeze({ id: "usr_alex_houston", role: "founder_admin" });

const SUPPLIER = Object.freeze({
  supplierId: "sup_apex_labs",
  supplierSku: "APX-BPC-5",
  recipient: Object.freeze({
    recipientName: "Samuel Boadu",
    line1: "1 Research Way",
    line2: null,
    city: "Houston",
    region: "TX",
    postalCode: "77002",
    country: "US",
  }),
});

function order(overrides: Record<string, unknown> = {}): EarlyAccessOrder {
  const result = createEarlyAccessOrder({
    orderId: "ord_ea_0001",
    customerRef: "cus_samuel",
    productId: "prd_bpc157",
    variantId: "var_5mg",
    sku: "XEA-BPC-5MG",
    quantity: 2,
    unitPriceCents: 12_450,
    unitPriceVersion: "prdver-9f2c1a",
    currency: "USD",
    now: CREATED,
    referralCode: "REF-ATHENA",
  });
  if (!result.ok) throw new Error(`fixture order refused: ${result.code}`);
  return Object.freeze({
    ...result.value,
    status: "payment_under_review",
    ...overrides,
  }) as EarlyAccessOrder;
}

function proof(): EarlyAccessProofRecord {
  const result = describeProofAttachment({
    order: order({ status: "awaiting_payment" }),
    proofs: [],
    proofId: "prf_0001",
    storageRef: "obj_zelle_receipt_a1",
    filename: "zelle-receipt.png",
    contentType: "image/png",
    byteSize: 240_512,
    method: "zelle",
    uploadedBy: "cus_samuel",
    uploadedAt: UPLOADED,
    supersedesProofId: null,
  });
  if (!result.ok) throw new Error(`fixture proof refused: ${result.code}`);
  return result.value.record;
}

function decision(decisionValue: "approve" | "reject") {
  const result = decideManualPayment({
    order: order(),
    proofs: [proof()],
    decisions: [],
    actor: { ...ADMIN },
    decision: decisionValue,
    reason: "Zelle receipt matches the order total.",
    reviewedProofRef: "obj_zelle_receipt_a1",
    amountVerifiedCents: 24_900,
    currency: "USD",
    idempotencyKey: KEY_ONE,
    now: DECIDED,
    method: "zelle",
  });
  if (!result.ok) throw new Error(`fixture decision refused: ${result.code}`);
  if (result.value.append === null) throw new Error("fixture decision appended nothing");
  return { entry: result.value.append, verification: result.value.verification };
}

function approved(): {
  entry: EarlyAccessVerificationEntry;
  verifiedOrder: EarlyAccessVerifiedOrder;
} {
  const { entry, verification } = decision("approve");
  if (verification.verifiedOrder === null) throw new Error("fixture had no verified order");
  return { entry, verifiedOrder: verification.verifiedOrder };
}

function release(overrides: Record<string, unknown> = {}) {
  const { entry, verifiedOrder } = approved();
  return describeSupplierRelease({
    verifiedOrder,
    decisions: [entry],
    supplier: SUPPLIER,
    actorId: "usr_ops_release",
    releasedAt: RELEASED,
    ...overrides,
  });
}

function releaseRecord(): EarlyAccessReleaseRecord {
  const result = release();
  if (!result.ok) throw new Error(`fixture release refused: ${result.code}`);
  return result.value.record;
}

function trackingRecord(overrides: Record<string, unknown> = {}): EarlyAccessTrackingRecord {
  const result = describeTrackingUpdate({
    release: releaseRecord(),
    tracking: [],
    carrier: "UPS",
    trackingNumber: "1Z999AA10123456784",
    actorId: "usr_ops_release",
    recordedAt: TRACKED,
    ...overrides,
  });
  if (!result.ok) throw new Error(`fixture tracking refused: ${result.code}`);
  return result.value;
}

describe("nothing is released to a supplier before the payment is verified", () => {
  it("refuses a release when the verification trail is empty", () => {
    const { verifiedOrder } = approved();
    expect(
      describeSupplierRelease({
        verifiedOrder,
        decisions: [],
        supplier: SUPPLIER,
        actorId: "usr_ops_release",
        releasedAt: RELEASED,
      }),
    ).toEqual({ ok: false, code: "payment_not_verified" });
  });

  it("refuses a release when the only decision on file is a rejection", () => {
    const { verifiedOrder } = approved();
    const { entry } = decision("reject");
    expect(
      describeSupplierRelease({
        verifiedOrder,
        decisions: [entry],
        supplier: SUPPLIER,
        actorId: "usr_ops_release",
        releasedAt: RELEASED,
      }),
    ).toEqual({ ok: false, code: "payment_not_verified" });
  });

  it("refuses a hand built verified order that no decision could have produced", () => {
    const { entry, verifiedOrder } = approved();
    for (const forged of [
      { ...verifiedOrder, verificationIdempotencyKey: "idem-ea-verify-99999999" },
      { ...verifiedOrder, verifiedByActorId: "usr_impostor" },
      { ...verifiedOrder, verifiedAt: "2026-08-04T13:00:00.001Z" },
      { ...verifiedOrder, orderId: "ord_ea_0002" },
    ]) {
      expect(
        describeSupplierRelease({
          verifiedOrder: forged,
          decisions: [entry],
          supplier: SUPPLIER,
          actorId: "usr_ops_release",
          releasedAt: RELEASED,
        }),
      ).toEqual({ ok: false, code: "payment_not_verified" });
    }
  });

  it("refuses a projection whose status is anything but payment_verified", () => {
    const { entry, verifiedOrder } = approved();
    for (const status of ["awaiting_payment", "payment_under_review", "payment_rejected"]) {
      expect(
        describeSupplierRelease({
          verifiedOrder: { ...verifiedOrder, status },
          decisions: [entry],
          supplier: SUPPLIER,
          actorId: "usr_ops_release",
          releasedAt: RELEASED,
        }),
      ).toEqual({ ok: false, code: "verified_order_invalid" });
    }
  });

  it("refuses a release stamped before the approval it cites", () => {
    expect(release({ releasedAt: "2026-08-04T12:59:59.999Z" })).toEqual({
      ok: false,
      code: "released_at_invalid",
    });
  });

  it("releases once the approval is on file and hands the supplier only what it needs", () => {
    const result = release();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value.packet).sort()).toEqual(
      [...SUPPLIER_RELEASE_PACKET_KEYS].sort(),
    );
    const serialized = JSON.stringify(result.value.packet);
    expect(serialized).not.toContain("24900");
    expect(serialized).not.toContain("zelle");
    expect(serialized).not.toContain("REF-ATHENA");
    expect(result.value.record.verificationIdempotencyKey).toBe(KEY_ONE);
    expect(result.value.record.orderId).toBe("ord_ea_0001");
    expect(result.value.record.quantity).toBe(2);
  });

  it("keeps the shipping address out of the ledger row", () => {
    const result = release();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value.record).sort()).toEqual(
      [...EARLY_ACCESS_RELEASE_RECORD_KEYS].sort(),
    );
    expect(JSON.stringify(result.value.record)).not.toContain("Research Way");
    expect(JSON.stringify(result.value.record)).not.toContain("Samuel Boadu");
  });

  it("exposes the approval lookup and refuses a mismatched role", () => {
    const { entry, verifiedOrder } = approved();
    expect(authorizingApproval(verifiedOrder, [entry])).toEqual(entry);
    expect(
      authorizingApproval(verifiedOrder, [{ ...entry, actorRole: "operations_admin" }]),
    ).toBeNull();
    expect(authorizingApproval(verifiedOrder, [])).toBeNull();
  });

  it("refuses hostile shapes and a bad supplier packet", () => {
    expect(describeSupplierRelease(new Proxy({}, {}))).toEqual({
      ok: false,
      code: "input_invalid",
    });
    expect(release({ decisions: "not-an-array" })).toEqual({
      ok: false,
      code: "decision_history_invalid",
    });
    expect(release({ actorId: "no" })).toEqual({ ok: false, code: "actor_invalid" });
    expect(release({ releasedAt: "2026-08-04T14:00:00Z" })).toEqual({
      ok: false,
      code: "released_at_invalid",
    });
    expect(release({ supplier: { ...SUPPLIER, supplierId: "sup/apex" } })).toEqual({
      ok: false,
      code: "supplier_invalid",
    });
    expect(release({ supplier: { ...SUPPLIER, recipient: { ...SUPPLIER.recipient, country: "USA" } } })).toEqual({
      ok: false,
      code: "recipient_invalid",
    });
  });
});

describe("tracking is recorded against a real release and is append only", () => {
  it("refuses a tracking update with no release behind it", () => {
    expect(
      describeTrackingUpdate({
        release: null,
        tracking: [],
        carrier: "UPS",
        trackingNumber: "1Z999AA10123456784",
        actorId: "usr_ops_release",
        recordedAt: TRACKED,
      }),
    ).toEqual({ ok: false, code: "release_missing" });
  });

  it("refuses a carrier or tracking number carrying a separator or control text", () => {
    for (const carrier of [
      "UPS/Express",
      "UPS\\Express",
      "UPS\u0000Express",
      "UPS\u0007Express",
      " UPS",
      "",
      42,
      null,
    ]) {
      const result = describeTrackingUpdate({
        release: releaseRecord(),
        tracking: [],
        carrier,
        trackingNumber: "1Z999AA10123456784",
        actorId: "usr_ops_release",
        recordedAt: TRACKED,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("carrier_invalid");
    }

    for (const trackingNumber of [
      "1Z999/AA10",
      "1Z999\\AA10",
      "1Z999\u0000AA10",
      "1Z 999 AA10",
      "../../etc",
      "ab",
      "",
      42,
      null,
    ]) {
      const result = describeTrackingUpdate({
        release: releaseRecord(),
        tracking: [],
        carrier: "UPS",
        trackingNumber,
        actorId: "usr_ops_release",
        recordedAt: TRACKED,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("tracking_number_invalid");
    }

    expect(isCarrier("UPS")).toBe(true);
    expect(isCarrier("FedEx Ground")).toBe(true);
    expect(isCarrier("UPS/Express")).toBe(false);
    expect(isTrackingNumber("1Z999AA10123456784")).toBe(true);
    expect(isTrackingNumber("1Z999/AA10")).toBe(false);
  });

  it("records a correction as a new row rather than an edit", () => {
    const first = trackingRecord();
    expect(first.sequence).toBe(1);
    const corrected = describeTrackingUpdate({
      release: releaseRecord(),
      tracking: [first],
      carrier: "UPS",
      trackingNumber: "1Z999AA10123456785",
      actorId: "usr_ops_release",
      recordedAt: "2026-08-05T10:00:00.000Z",
    });
    expect(corrected.ok).toBe(true);
    if (!corrected.ok) return;
    expect(corrected.value.sequence).toBe(2);
    // The number the customer was originally given is still readable.
    expect(first.trackingNumber).toBe("1Z999AA10123456784");
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("refuses a tracking update stamped before the release", () => {
    expect(trackingRecordResult({ recordedAt: "2026-08-04T13:59:59.999Z" })).toEqual({
      ok: false,
      code: "recorded_at_invalid",
    });
  });

  function trackingRecordResult(overrides: Record<string, unknown> = {}) {
    return describeTrackingUpdate({
      release: releaseRecord(),
      tracking: [],
      carrier: "UPS",
      trackingNumber: "1Z999AA10123456784",
      actorId: "usr_ops_release",
      recordedAt: TRACKED,
      ...overrides,
    });
  }
});

describe("fulfillment records the shipment and the commission it earns", () => {
  function fulfill(overrides: Record<string, unknown> = {}) {
    const { verifiedOrder } = approved();
    return describeFulfillment({
      verifiedOrder,
      release: releaseRecord(),
      tracking: [trackingRecord()],
      fulfillments: [],
      attribution: {
        affiliateId: "aff_athena",
        affiliateCustomerRef: "cus_athena",
        referralCode: "REF-ATHENA",
        holdBasisPoints: 1_000,
      },
      actorId: "usr_ops_release",
      fulfilledAt: FULFILLED,
      ...overrides,
    });
  }

  it("refuses a fulfillment with no release or no tracking on file", () => {
    expect(fulfill({ release: null })).toEqual({ ok: false, code: "release_missing" });
    expect(fulfill({ tracking: [] })).toEqual({ ok: false, code: "tracking_missing" });
  });

  it("holds a commission against a verified payment and never a payout", () => {
    const result = fulfill();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.record.commissionHold?.state).toBe("held");
    expect(result.value.record.commissionHold?.payout).toBe(false);
    // Ten percent of the order total, computed by commission-event.ts.
    expect(result.value.record.commissionHold?.holdAmountCents).toBe(2_490);
    expect(result.value.record.trackingNumber).toBe("1Z999AA10123456784");
    expect(result.value.append).not.toBeNull();
  });

  it("records no hold when there is no attribution, and refuses a self referral", () => {
    const noHold = fulfill({ attribution: null });
    expect(noHold.ok).toBe(true);
    if (noHold.ok) expect(noHold.value.record.commissionHold).toBeNull();

    expect(
      fulfill({
        attribution: {
          affiliateId: "aff_athena",
          affiliateCustomerRef: "cus_samuel",
          referralCode: "REF-ATHENA",
          holdBasisPoints: 1_000,
        },
      }),
    ).toEqual({ ok: false, code: "self_referral" });
  });

  it("reports an existing fulfillment instead of holding a second commission", () => {
    const first = fulfill();
    expect(first.ok).toBe(true);
    if (!first.ok || first.value.append === null) return;
    const second = fulfill({ fulfillments: [first.value.append] });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.append).toBeNull();
    expect(second.value.record).toEqual(first.value.append);
  });

  it("refuses a fulfillment stamped before the tracking it cites", () => {
    expect(fulfill({ fulfilledAt: "2026-08-05T08:59:59.999Z" })).toEqual({
      ok: false,
      code: "fulfilled_at_invalid",
    });
  });
});

describe("the release repository", () => {
  async function stand() {
    const { entry, verifiedOrder } = approved();
    const releases = new InMemoryReleaseRepository();
    const verifications = {
      async history() {
        return Object.freeze([entry]);
      },
    };
    return { releases, deps: { verifications, releases }, verifiedOrder, entry };
  }

  it("runs the whole path in order and refuses each step out of order", async () => {
    const { deps, verifiedOrder } = await stand();

    // Tracking before a release exists.
    expect(
      await recordTracking(deps, {
        orderId: "ord_ea_0001",
        carrier: "UPS",
        trackingNumber: "1Z999AA10123456784",
        actorId: "usr_ops_release",
        recordedAt: TRACKED,
      }),
    ).toEqual({ ok: false, code: "release_missing" });

    // Fulfillment before a release exists.
    expect(
      await fulfillOrder(deps, {
        verifiedOrder,
        attribution: null,
        actorId: "usr_ops_release",
        fulfilledAt: FULFILLED,
      }),
    ).toEqual({ ok: false, code: "release_missing" });

    const released = await releaseToSupplier(deps, {
      verifiedOrder,
      supplier: SUPPLIER,
      actorId: "usr_ops_release",
      releasedAt: RELEASED,
    });
    expect(released.ok).toBe(true);

    // Fulfillment before any tracking exists.
    expect(
      await fulfillOrder(deps, {
        verifiedOrder,
        attribution: null,
        actorId: "usr_ops_release",
        fulfilledAt: FULFILLED,
      }),
    ).toEqual({ ok: false, code: "tracking_missing" });

    const tracked = await recordTracking(deps, {
      orderId: "ord_ea_0001",
      carrier: "UPS",
      trackingNumber: "1Z999AA10123456784",
      actorId: "usr_ops_release",
      recordedAt: TRACKED,
    });
    expect(tracked.ok).toBe(true);

    const fulfilled = await fulfillOrder(deps, {
      verifiedOrder,
      attribution: null,
      actorId: "usr_ops_release",
      fulfilledAt: FULFILLED,
    });
    expect(fulfilled.ok).toBe(true);
    if (fulfilled.ok) expect(fulfilled.value.append).not.toBeNull();
  });

  it("refuses a second release for one order", async () => {
    const { deps, verifiedOrder } = await stand();
    const first = await releaseToSupplier(deps, {
      verifiedOrder,
      supplier: SUPPLIER,
      actorId: "usr_ops_release",
      releasedAt: RELEASED,
    });
    expect(first.ok).toBe(true);
    expect(
      await releaseToSupplier(deps, {
        verifiedOrder,
        supplier: SUPPLIER,
        actorId: "usr_ops_release",
        releasedAt: RELEASED,
      }),
    ).toEqual({ ok: false, code: "release_already_recorded" });
  });

  it("writes one fulfillment however many times it is called", async () => {
    const { deps, releases, verifiedOrder } = await stand();
    expect(
      (
        await releaseToSupplier(deps, {
          verifiedOrder,
          supplier: SUPPLIER,
          actorId: "usr_ops_release",
          releasedAt: RELEASED,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await recordTracking(deps, {
          orderId: "ord_ea_0001",
          carrier: "UPS",
          trackingNumber: "1Z999AA10123456784",
          actorId: "usr_ops_release",
          recordedAt: TRACKED,
        })
      ).ok,
    ).toBe(true);

    for (let index = 0; index < 3; index += 1) {
      const result = await fulfillOrder(deps, {
        verifiedOrder,
        attribution: null,
        actorId: "usr_ops_release",
        fulfilledAt: FULFILLED,
      });
      expect(result.ok).toBe(true);
      if (result.ok && index > 0) expect(result.value.append).toBeNull();
    }
    expect(await releases.fulfillments("ord_ea_0001")).toHaveLength(1);
  });

  it("keeps every tracking row and offers no update or delete", async () => {
    const { deps, releases, verifiedOrder } = await stand();
    expect(
      (
        await releaseToSupplier(deps, {
          verifiedOrder,
          supplier: SUPPLIER,
          actorId: "usr_ops_release",
          releasedAt: RELEASED,
        })
      ).ok,
    ).toBe(true);
    for (const trackingNumber of ["1Z999AA10123456784", "1Z999AA10123456785"]) {
      const result = await recordTracking(deps, {
        orderId: "ord_ea_0001",
        carrier: "UPS",
        trackingNumber,
        actorId: "usr_ops_release",
        recordedAt: TRACKED,
      });
      expect(result.ok).toBe(true);
    }
    const trail = await releases.tracking("ord_ea_0001");
    expect(trail.map((row) => row.trackingNumber)).toEqual([
      "1Z999AA10123456784",
      "1Z999AA10123456785",
    ]);

    const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(releases)).filter(
      (name) => name !== "constructor",
    );
    expect(surface.sort()).toEqual([
      "appendFulfillment",
      "appendRelease",
      "appendTracking",
      "fulfillments",
      "release",
      "tracking",
    ]);
  });

  it("re-validates a hand written row on the way in", async () => {
    const releases = new InMemoryReleaseRepository();
    const record = releaseRecord();
    expect(await releases.appendRelease({ ...record, orderId: "ord/ea" })).toEqual({
      ok: false,
      code: "input_invalid",
    });
    expect((await releases.appendRelease(record)).ok).toBe(true);
    expect(
      await releases.appendTracking({ ...trackingRecord(), carrier: "UPS/Express" }),
    ).toEqual({ ok: false, code: "input_invalid" });
    expect((await releases.appendTracking(trackingRecord())).ok).toBe(true);
    expect(await releases.appendTracking(trackingRecord())).toEqual({
      ok: false,
      code: "tracking_history_invalid",
    });
  });

  it("bounds the tracking trail", async () => {
    const releases = new InMemoryReleaseRepository();
    expect((await releases.appendRelease(releaseRecord())).ok).toBe(true);
    for (let index = 1; index <= EARLY_ACCESS_MAX_TRACKING_UPDATES; index += 1) {
      const appended = await releases.appendTracking({
        ...trackingRecord(),
        trackingNumber: `1Z999AA1012345678${index}`,
        sequence: index,
      });
      expect(appended.ok).toBe(true);
    }
    expect(
      await releases.appendTracking({
        ...trackingRecord(),
        trackingNumber: "1Z999AA10123456799",
        sequence: EARLY_ACCESS_MAX_TRACKING_UPDATES + 1,
      }),
    ).toEqual({ ok: false, code: "input_invalid" });
  });

  it("validates a stored release row", () => {
    const record = releaseRecord();
    expect(readEarlyAccessReleaseRecord(record)).toEqual(record);
    for (const broken of [
      { ...record, orderId: "ord/ea" },
      { ...record, supplierSku: "APX/BPC" },
      { ...record, quantity: 0 },
      { ...record, releasedAt: "2026-08-04T14:00:00Z" },
      { ...record, releasedByActorId: "no" },
    ]) {
      expect(readEarlyAccessReleaseRecord(broken)).toBeNull();
    }
  });
});
