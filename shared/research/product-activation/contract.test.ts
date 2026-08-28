import { describe, expect, it } from "vitest";

import {
  ActivationChecklist,
  ActivationOverlayEntry,
  EMPTY_ACTIVATION_CHECKLIST,
  PRODUCT_ACTIVATION_STATUSES,
  activationBlockers,
  activationComplete,
  baseStatusFromDisplayState,
  isMoreRestrictive,
  isValidActivationApproval,
  resolveActivationStatus,
} from "./contract";

const COMPLETE_CHECKLIST: ActivationChecklist = Object.freeze({
  exactFormulation: "BPC-157 15 mg + TB-500 15 mg, lyophilized",
  exactStrength: "15/15 mg",
  dosageForm: "Lyophilized vial",
  pharmacyLane: "503A — Dallas pharmacy (fixture)",
  stateAvailability: "48 states (fixture doc ref)",
  providerRequirements: "Provider order required (fixture doc ref)",
  pharmacyPricing: "Fixture price sheet 2026-08",
  turnaround: "5 business days (fixture)",
  shippingModel: "Cold chain ground (fixture)",
  documentationTesting: "COA + sterility (fixture doc ref)",
  contractingApproval: "MSA fixture ref",
});

function entry(overrides: Partial<ActivationOverlayEntry>): ActivationOverlayEntry {
  return {
    groupId: "GRP-9999",
    label: "Fixture product",
    confirmationBasis: "none",
    confirmedBy: null,
    confirmedAt: null,
    checklist: EMPTY_ACTIVATION_CHECKLIST,
    founderActivationApproval: null,
    held: false,
    ...overrides,
  };
}

describe("activationBlockers", () => {
  it("reports every field of the empty checklist", () => {
    expect(activationBlockers(EMPTY_ACTIVATION_CHECKLIST)).toHaveLength(11);
  });

  it("reports nothing for a complete checklist", () => {
    expect(activationBlockers(COMPLETE_CHECKLIST)).toHaveLength(0);
  });

  it("treats whitespace-only evidence as missing", () => {
    const blockers = activationBlockers({ ...COMPLETE_CHECKLIST, turnaround: "   " });
    expect(blockers).toEqual(["turnaround"]);
  });
});

describe("resolveActivationStatus — the verbal wall", () => {
  it("a verbal confirmation NEVER yields live, even with a complete checklist and approval", () => {
    const overlay = entry({
      confirmationBasis: "verbal",
      confirmedBy: "Kris (fixture)",
      confirmedAt: "2026-08-26T00:00:00.000Z",
      checklist: COMPLETE_CHECKLIST,
      founderActivationApproval: { approvedBy: "Founder", approvedAt: "2026-08-26T00:00:00.000Z" },
    });
    for (const base of PRODUCT_ACTIVATION_STATUSES) {
      expect(resolveActivationStatus(base, overlay)).not.toBe("live");
    }
  });

  it("verbal on a sellable base projects verbally_confirmed_pending_documentation", () => {
    const overlay = entry({ confirmationBasis: "verbal" });
    expect(resolveActivationStatus("live", overlay)).toBe(
      "verbally_confirmed_pending_documentation",
    );
    expect(resolveActivationStatus("request_only", overlay)).toBe(
      "verbally_confirmed_pending_documentation",
    );
  });

  it("verbal never LOOSENS a more restrictive base", () => {
    const overlay = entry({ confirmationBasis: "verbal" });
    expect(resolveActivationStatus("held", overlay)).toBe("held");
    expect(resolveActivationStatus("unavailable", overlay)).toBe("unavailable");
  });
});

describe("resolveActivationStatus — documentation ladder", () => {
  it("documented + incomplete checklist ⇒ pending_pharmacy_activation", () => {
    const overlay = entry({ confirmationBasis: "documented" });
    expect(resolveActivationStatus("request_only", overlay)).toBe("pending_pharmacy_activation");
  });

  it("documented + complete checklist but NO founder approval ⇒ pending_pharmacy_activation", () => {
    const overlay = entry({ confirmationBasis: "documented", checklist: COMPLETE_CHECKLIST });
    expect(resolveActivationStatus("request_only", overlay)).toBe("pending_pharmacy_activation");
  });

  it("documented + complete + config-approved still cannot resolve a live base live", () => {
    const overlay = entry({
      confirmationBasis: "documented",
      checklist: COMPLETE_CHECKLIST,
      founderActivationApproval: { approvedBy: "Founder", approvedAt: "2026-08-26T00:00:00.000Z" },
    });
    expect(resolveActivationStatus("live", overlay)).toBe("pending_pharmacy_activation");
    expect(resolveActivationStatus("request_only", overlay)).toBe("request_only");
    expect(resolveActivationStatus("provider_required", overlay)).toBe("provider_required");
  });

  it("an explicit hold beats everything", () => {
    const overlay = entry({
      confirmationBasis: "documented",
      checklist: COMPLETE_CHECKLIST,
      founderActivationApproval: { approvedBy: "Founder", approvedAt: "2026-08-26T00:00:00.000Z" },
      held: true,
    });
    expect(resolveActivationStatus("live", overlay)).toBe("held");
  });

  it("no overlay leaves the base untouched", () => {
    for (const base of PRODUCT_ACTIVATION_STATUSES) {
      expect(resolveActivationStatus(base, null)).toBe(base);
    }
  });
});

describe("baseStatusFromDisplayState", () => {
  it("maps the member-safe artifact vocabulary", () => {
    expect(baseStatusFromDisplayState("available_now")).toBe("live");
    expect(baseStatusFromDisplayState("request_access")).toBe("request_only");
    expect(baseStatusFromDisplayState("care_pathway")).toBe("provider_required");
    expect(baseStatusFromDisplayState("approval_required")).toBe("provider_required");
    expect(baseStatusFromDisplayState("temporarily_unavailable")).toBe("held");
    expect(baseStatusFromDisplayState("planned")).toBe("unavailable");
  });

  it("refuses unknown states to unavailable", () => {
    expect(baseStatusFromDisplayState("definitely_new_state")).toBe("unavailable");
  });
});

describe("activationComplete", () => {
  it("is false for verbal, incomplete, unapproved, or held entries", () => {
    expect(activationComplete(entry({ confirmationBasis: "verbal", checklist: COMPLETE_CHECKLIST }))).toBe(false);
    expect(activationComplete(entry({ confirmationBasis: "documented" }))).toBe(false);
    expect(
      activationComplete(entry({ confirmationBasis: "documented", checklist: COMPLETE_CHECKLIST })),
    ).toBe(false);
    expect(
      activationComplete(
        entry({
          confirmationBasis: "documented",
          checklist: COMPLETE_CHECKLIST,
          founderActivationApproval: { approvedBy: "F", approvedAt: "2026-08-26T00:00:00.000Z" },
          held: true,
        }),
      ),
    ).toBe(false);
  });

  it("marks config documentation complete without conferring live authority", () => {
    expect(
      activationComplete(
        entry({
          confirmationBasis: "documented",
          checklist: COMPLETE_CHECKLIST,
          founderActivationApproval: { approvedBy: "F", approvedAt: "2026-08-26T00:00:00.000Z" },
        }),
      ),
    ).toBe(true);
  });
});

describe("isMoreRestrictive", () => {
  it("orders the vocabulary from live to unavailable", () => {
    expect(isMoreRestrictive("held", "live")).toBe(true);
    expect(isMoreRestrictive("live", "held")).toBe(false);
    expect(isMoreRestrictive("verbally_confirmed_pending_documentation", "pending_pharmacy_activation")).toBe(true);
  });
});

// P1-7 (2026-08-27): the FULL Cartesian sweep. Every base status × every
// basis × complete/incomplete checklist × approval present/absent × held
// flag — and for every single combination, the resolved status is never more
// permissive than the base. The exact-value assertions per branch live in the
// suites above; this suite pins the INVARIANT so no future branch can escape.
describe("resolveActivationStatus — monotonic restriction, exhaustively", () => {
  const bases = PRODUCT_ACTIVATION_STATUSES;
  const bases_and_overlays: Array<[string, ActivationOverlayEntry | null]> = [
    ["no overlay", null],
    ["basis none", entry({ confirmationBasis: "none" })],
    ["verbal incomplete", entry({ confirmationBasis: "verbal" })],
    ["verbal complete", entry({ confirmationBasis: "verbal", checklist: COMPLETE_CHECKLIST })],
    ["verbal complete approved", entry({
      confirmationBasis: "verbal",
      checklist: COMPLETE_CHECKLIST,
      founderActivationApproval: { approvedBy: "F", approvedAt: "2026-08-27T00:00:00.000Z" },
    })],
    ["documented incomplete", entry({ confirmationBasis: "documented" })],
    ["documented incomplete approved", entry({
      confirmationBasis: "documented",
      founderActivationApproval: { approvedBy: "F", approvedAt: "2026-08-27T00:00:00.000Z" },
    })],
    ["documented complete unapproved", entry({ confirmationBasis: "documented", checklist: COMPLETE_CHECKLIST })],
    ["documented complete approved", entry({
      confirmationBasis: "documented",
      checklist: COMPLETE_CHECKLIST,
      founderActivationApproval: { approvedBy: "F", approvedAt: "2026-08-27T00:00:00.000Z" },
    })],
    ["held, none", entry({ held: true })],
    ["held, documented complete approved", entry({
      held: true,
      confirmationBasis: "documented",
      checklist: COMPLETE_CHECKLIST,
      founderActivationApproval: { approvedBy: "F", approvedAt: "2026-08-27T00:00:00.000Z" },
    })],
  ];

  it("no combination ever resolves MORE permissive than its base", () => {
    for (const base of bases) {
      for (const [label, overlay] of bases_and_overlays) {
        const result = resolveActivationStatus(base, overlay);
        expect(
          isMoreRestrictive(base, result),
          `base=${base} overlay=(${label}) resolved to ${result}, which is more permissive than the base`,
        ).toBe(false);
      }
    }
  });

  it("held bases stay held and unavailable bases stay unavailable, whatever the overlay says", () => {
    for (const [label, overlay] of bases_and_overlays) {
      expect(resolveActivationStatus("held", overlay), `held × ${label}`).toBe("held");
      expect(resolveActivationStatus("unavailable", overlay), `unavailable × ${label}`).toBe("unavailable");
    }
  });

  it("the documented branch no longer loosens: incomplete/unapproved over held-or-worse keeps the base", () => {
    const documentedIncomplete = entry({ confirmationBasis: "documented" });
    const documentedUnapproved = entry({ confirmationBasis: "documented", checklist: COMPLETE_CHECKLIST });
    expect(resolveActivationStatus("held", documentedIncomplete)).toBe("held");
    expect(resolveActivationStatus("unavailable", documentedIncomplete)).toBe("unavailable");
    expect(resolveActivationStatus("held", documentedUnapproved)).toBe("held");
    expect(resolveActivationStatus("unavailable", documentedUnapproved)).toBe("unavailable");
    // A verbal base is already stricter than pending: it stays verbal.
    expect(resolveActivationStatus("verbally_confirmed_pending_documentation", documentedIncomplete))
      .toBe("verbally_confirmed_pending_documentation");
    // On a merely-sellable base the documented ladder still restricts as before.
    expect(resolveActivationStatus("request_only", documentedIncomplete)).toBe("pending_pharmacy_activation");
    expect(resolveActivationStatus("live", documentedUnapproved)).toBe("pending_pharmacy_activation");
  });

  it("an overlay hold restricts a live base but cannot LOOSEN an unavailable base", () => {
    expect(resolveActivationStatus("live", entry({ held: true }))).toBe("held");
    expect(resolveActivationStatus("unavailable", entry({ held: true }))).toBe("unavailable");
  });
});

// P1-E (2026-08-27, round 3): approval must be REAL EVIDENCE. Empty strings,
// whitespace, unparseable or impossible or out-of-era timestamps are not
// approvals — and even a fully valid approval can only stop the overlay from
// restricting; it can never promote past the canonical base.
describe("isValidActivationApproval — evidence, not text", () => {
  const good = { approvedBy: "Founder", approvedAt: "2026-08-27T12:00:00.000Z" };

  it("accepts substantive approver + strict real in-era ISO instant", () => {
    expect(isValidActivationApproval(good)).toBe(true);
    expect(isValidActivationApproval({ ...good, approvedAt: "2026-08-27T12:00:00Z" })).toBe(true);
  });

  it("rejects empty, whitespace, tab and newline approvers", () => {
    for (const approvedBy of ["", " ", "\t", "\n", " \t\n "]) {
      expect(isValidActivationApproval({ approvedBy, approvedAt: good.approvedAt }), JSON.stringify(approvedBy)).toBe(false);
    }
  });

  it("rejects empty, invalid, impossible, loose, and out-of-era timestamps", () => {
    for (const approvedAt of [
      "",
      " ",
      "not-a-date",
      "2026-13-45T99:99:99Z",          // impossible fields fail the strict shape
      "2026-02-30T00:00:00.000Z",      // rolls over in Date.parse; round-trip refuses
      "2026-08-27",                    // date only
      "2026-08-27T12:00:00",           // no Z
      "2026-08-27T12:00:00+02:00",     // offsets are not the canonical instant form
      "1999-01-01T00:00:00.000Z",      // before this system existed
      "3026-01-01T00:00:00.000Z",      // absurd future
    ]) {
      expect(isValidActivationApproval({ approvedBy: "Founder", approvedAt }), approvedAt).toBe(false);
    }
  });

  it("null is not approval", () => {
    expect(isValidActivationApproval(null)).toBe(false);
  });
});

describe("resolveActivationStatus — approval text cannot manufacture authority", () => {
  it("empty-string approval fields never satisfy the documented ladder", () => {
    for (const approval of [
      { approvedBy: "", approvedAt: "2026-08-27T12:00:00.000Z" },
      { approvedBy: "Founder", approvedAt: "" },
      { approvedBy: " ", approvedAt: " " },
      { approvedBy: "Founder", approvedAt: "not-a-date" },
    ]) {
      const overlay = entry({
        confirmationBasis: "documented",
        checklist: COMPLETE_CHECKLIST,
        founderActivationApproval: approval,
      });
      expect(resolveActivationStatus("request_only", overlay), JSON.stringify(approval))
        .toBe("pending_pharmacy_activation");
      expect(activationComplete(overlay)).toBe(false);
    }
  });

  it("even a VALID approval never promotes past the canonical base", () => {
    const overlay = entry({
      confirmationBasis: "documented",
      checklist: COMPLETE_CHECKLIST,
      founderActivationApproval: { approvedBy: "Founder", approvedAt: "2026-08-27T12:00:00.000Z" },
    });
    // The overlay may stop restricting; it may not grant. A non-orderable
    // base stays exactly what the canonical catalog says it is.
    expect(resolveActivationStatus("request_only", overlay)).toBe("request_only");
    expect(resolveActivationStatus("provider_required", overlay)).toBe("provider_required");
    expect(resolveActivationStatus("held", overlay)).toBe("held");
    expect(resolveActivationStatus("unavailable", overlay)).toBe("unavailable");
  });
});
