import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { careReferralRecord, type CareReferral } from "@shared/care/referral";
import { CARE_CONCIERGE_HANDOFF } from "@shared/care/referral-handoff";
import CareReferralStatusCard from "./CareReferralStatusCard";
import CareReferralOperationsQueue from "./CareReferralOperationsQueue";
import CareConciergeRequestForm from "./CareConciergeRequestForm";
import {
  careReferralRowView,
  careReferralViewFromResponse,
  type CareReferralViewState,
} from "./referral-view";

const REFERRAL: CareReferral = careReferralRecord({
  referralId: "ref-0001",
  internalUserId: "user-0001",
  emrVendor: "tebra",
  externalEmrId: null,
  serviceCategory: "general_consultation",
  stateCode: "IL",
  status: "handoff_pending",
  appointmentAt: null,
  operationsOwner: "care-ops",
  createdAt: "2026-08-01T15:00:00Z",
  updatedAt: "2026-08-01T15:00:00Z",
  synchronizedAt: null,
  errorCode: null,
});

const CONFIGURED = {
  mode: "direct_url" as const,
  schedulingUrl: "https://scheduling.example.invalid/book",
  widgetScriptUrl: null,
  configured: true,
};

function card(state: CareReferralViewState) {
  return renderToStaticMarkup(<CareReferralStatusCard state={state} />);
}
function queue(state: CareReferralViewState) {
  return renderToStaticMarkup(<CareReferralOperationsQueue state={state} />);
}

describe("care referral view state", () => {
  it("maps an unauthorized response", () => {
    expect(careReferralViewFromResponse(401, {}).kind).toBe("unauthorized");
  });

  it("maps a disabled response without inventing availability", () => {
    const state = careReferralViewFromResponse(503, {
      code: "care_referrals_disabled",
    });
    expect(state.kind).toBe("disabled");
  });

  it("maps a malformed success body to an error, never to empty", () => {
    expect(careReferralViewFromResponse(200, { ok: true }).kind).toBe("error");
    expect(careReferralViewFromResponse(200, null).kind).toBe("error");
    expect(careReferralViewFromResponse(500, {}).kind).toBe("error");
  });

  it("separates empty from not configured", () => {
    expect(
      careReferralViewFromResponse(200, {
        ok: true,
        referrals: [],
        handoff: CONFIGURED,
      }).kind,
    ).toBe("empty");
    expect(
      careReferralViewFromResponse(200, {
        ok: true,
        referrals: [],
        handoff: CARE_CONCIERGE_HANDOFF,
      }).kind,
    ).toBe("not_configured");
  });

  it("refuses a handoff that claims a url it did not carry", () => {
    const state = careReferralViewFromResponse(200, {
      ok: true,
      referrals: [],
      handoff: { mode: "direct_url", schedulingUrl: null, configured: true },
    });
    expect(state.kind).toBe("not_configured");
  });

  it("drops a clinical value out of a referral before it reaches a component", () => {
    const state = careReferralViewFromResponse(200, {
      ok: true,
      referrals: [{ ...REFERRAL, diagnosis: "REDACTED" }],
      handoff: CONFIGURED,
    });
    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") return;
    expect(Object.keys(state.referrals[0])).not.toContain("diagnosis");
  });

  it("never presents an appointment time unless the referral is scheduled", () => {
    const row = careReferralRowView({
      ...REFERRAL,
      status: "handoff_pending",
      appointmentAt: "2026-09-01T15:00:00Z",
    });
    expect(row.appointment).toBe("Not scheduled");
  });
});

describe("care referral status card", () => {
  it("renders the loading state", () => {
    expect(card({ kind: "loading" })).toContain('aria-busy="true"');
  });

  it("renders the unauthorized state without a referral", () => {
    const markup = card({ kind: "unauthorized" });
    expect(markup).toContain("Sign in");
    expect(markup).not.toContain("ref-0001");
  });

  it("renders the disabled state with the server's message", () => {
    expect(card({ kind: "disabled", message: "Care is being prepared." })).toContain(
      "Care is being prepared.",
    );
  });

  it("renders the error state as an alert and changes nothing", () => {
    const markup = card({ kind: "error" });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Nothing was changed");
  });

  it("renders the not configured state without a scheduling link", () => {
    const markup = card({
      kind: "not_configured",
      handoff: CARE_CONCIERGE_HANDOFF,
    });
    expect(markup).toContain("care-handoff-not-configured");
    expect(markup).not.toContain("href=");
  });

  it("renders a scheduling link only when one was configured", () => {
    const markup = card({ kind: "empty", handoff: CONFIGURED });
    expect(markup).toContain("https://scheduling.example.invalid/book");
  });

  it("renders only the thin referral fields", () => {
    const markup = card({
      kind: "ready",
      referrals: [REFERRAL],
      handoff: CONFIGURED,
    });
    expect(markup).toContain("General consultation");
    expect(markup).toContain("Handoff pending");
    expect(markup).toContain("Not scheduled");
    expect(markup).toContain("care-ops");
    // The internal user id is not a thing to display back to a person.
    expect(markup).not.toContain("user-0001");
  });

  it("cannot render a clinical value that somehow reached the component", () => {
    const drifted = { ...REFERRAL, diagnosis: "REDACTED-DX" } as CareReferral;
    const markup = card({
      kind: "ready",
      referrals: [drifted],
      handoff: CONFIGURED,
    });
    expect(markup).not.toContain("REDACTED-DX");
  });
});

describe("care referral operations queue", () => {
  it("renders every non ready state", () => {
    expect(queue({ kind: "loading" })).toContain('aria-busy="true"');
    expect(queue({ kind: "unauthorized" })).toContain("operations account");
    expect(queue({ kind: "disabled", message: "not yet" })).toContain("not yet");
    expect(queue({ kind: "error" })).toContain('role="alert"');
    expect(queue({ kind: "empty", handoff: CONFIGURED })).toContain(
      "No referrals in the queue",
    );
  });

  it("renders one row per referral with thin fields only", () => {
    const markup = queue({
      kind: "ready",
      referrals: [REFERRAL, { ...REFERRAL, referralId: "ref-0002", status: "error", errorCode: "handoff_unreachable" }],
      handoff: CONFIGURED,
    });
    expect(markup.match(/care-referral-queue-row/g)).toHaveLength(2);
    expect(markup).toContain("needing attention");
    expect(markup).toContain("Needs attention");
  });

  it("cannot render a clinical value in the queue either", () => {
    const drifted = { ...REFERRAL, clinicalNotes: "REDACTED-NOTE" } as CareReferral;
    expect(
      queue({ kind: "ready", referrals: [drifted], handoff: CONFIGURED }),
    ).not.toContain("REDACTED-NOTE");
  });
});

describe("concierge request form", () => {
  it("shows the do not enter medical details notice", () => {
    const markup = renderToStaticMarkup(
      <CareConciergeRequestForm
        stateCode="IL"
        serviceCategories={["general_consultation"]}
        onSubmit={() => undefined}
      />,
    );
    expect(markup).toContain("care-concierge-notice");
    expect(markup).toContain("Do not enter medical details");
    expect(markup).toContain("not a confirmation");
    // Empty message means the screen refuses, so submission starts disabled.
    expect(markup).toContain("disabled");
  });

  it("offers nothing when the state covers no service", () => {
    const markup = renderToStaticMarkup(
      <CareConciergeRequestForm
        stateCode="TX"
        serviceCategories={[]}
        onSubmit={() => undefined}
      />,
    );
    expect(markup).toContain("not open in your state");
    expect(markup).not.toContain("<form");
  });
});
