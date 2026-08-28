// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAttribution, initAttribution } from "./attribution";

function navigate(path: string): void {
  window.history.replaceState(null, "", path);
}

beforeEach(() => {
  sessionStorage.clear();
  navigate("/");
  vi.restoreAllMocks();
});

describe("marketing attribution privacy boundary", () => {
  it.each([
    "/research/member?email=private%40example.test",
    "/Research/apply?interest=private",
    "/%72esearch/reset-password#access_token=secret&type=recovery",
    "/care/schedule?patient=private",
    "/CARE/portal?token=secret",
    "/%63are/provider-review?visit=private",
    "/#access_token=secret&type=recovery",
  ])("stores and returns no attribution on %s", (path) => {
    sessionStorage.setItem("xen_landing_page", "/about?legacy=secret");
    sessionStorage.setItem("xen_referrer", "https://example.test/private?secret=yes");
    sessionStorage.setItem("xen_utm", JSON.stringify({ utm_source: "legacy" }));

    navigate(path);
    initAttribution();

    expect(sessionStorage.length).toBe(0);
    expect(getAttribution()).toEqual({
      source_page: "",
      landing_page: "",
      referrer_url: "",
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
    });
  });

  it("does not carry a sensitive landing into a later public form submission", () => {
    navigate("/care/schedule?patient=private");
    initAttribution();
    expect(sessionStorage.length).toBe(0);

    navigate("/early-interest?utm_source=care-followup&utm_campaign=summer_2026");
    initAttribution();

    expect(getAttribution()).toMatchObject({
      source_page: "/early-interest",
      landing_page: "/early-interest",
      referrer_url: "",
      utm_source: "care-followup",
      utm_campaign: "summer_2026",
    });
    expect(JSON.stringify(getAttribution())).not.toMatch(/patient|private|schedule|\?/iu);
  });

  it("retains only a public path, safe UTM values, and the referrer origin", () => {
    vi.spyOn(document, "referrer", "get").mockReturnValue(
      "https://partner.example/path/to/person?email=private@example.test",
    );
    navigate(
      "/about?utm_source=partner&utm_campaign=fall-launch&utm_content=hello%40example.test&other=secret",
    );

    initAttribution();

    expect(getAttribution()).toEqual({
      source_page: "/about",
      landing_page: "/about",
      referrer_url: "https://partner.example",
      utm_source: "partner",
      utm_medium: null,
      utm_campaign: "fall-launch",
      utm_content: null,
      utm_term: null,
    });
  });

  it("sanitizes legacy stored URLs before returning them", () => {
    navigate("/waitlist");
    sessionStorage.setItem(
      "xen_landing_page",
      "/about?email=private@example.test#access_token=secret&refresh_token=private&type=recovery",
    );
    sessionStorage.setItem(
      "xen_referrer",
      "https://xeniostechnology.com/research/member?email=private@example.test",
    );
    sessionStorage.setItem(
      "xen_utm",
      JSON.stringify({ utm_source: "safe-source", utm_content: "private@example.test" }),
    );

    expect(getAttribution()).toEqual({
      source_page: "/waitlist",
      landing_page: "",
      referrer_url: "",
      utm_source: "safe-source",
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
    });
  });

  it("fails closed on malformed or non-object stored UTM payloads", () => {
    navigate("/waitlist");
    sessionStorage.setItem("xen_landing_page", "/waitlist");
    sessionStorage.setItem("xen_utm", "null");
    expect(getAttribution().utm_source).toBeNull();

    sessionStorage.setItem("xen_utm", "not-json");
    expect(getAttribution()).toMatchObject({
      source_page: "/waitlist",
      landing_page: "/waitlist",
      utm_source: null,
      utm_campaign: null,
    });
  });
});
