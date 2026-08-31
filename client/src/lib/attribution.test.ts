// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAttribution, initAttribution } from "./attribution";

type UtmFieldForTest =
  | "utm_source"
  | "utm_medium"
  | "utm_campaign"
  | "utm_content"
  | "utm_term";

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
    "/health?interest=private",
    "/HEALTH/?token=secret",
    "/%68ealth?visit=private",
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

    navigate(
      "/early-interest?utm_source=partner&utm_medium=referral&utm_campaign=summer_2026",
    );
    initAttribution();

    expect(getAttribution()).toMatchObject({
      source_page: "/early-interest",
      landing_page: "/early-interest",
      referrer_url: "",
      utm_source: "partner",
      utm_medium: "referral",
      utm_campaign: null,
    });
    expect(JSON.stringify(getAttribution())).not.toMatch(/patient|private|schedule|\?/iu);
  });

  it("retains only an allowlisted public path and controlled UTM values", () => {
    vi.spyOn(document, "referrer", "get").mockReturnValue(
      "https://partner.example/path/to/person?email=private@example.test",
    );
    navigate(
      "/about?utm_source=Partner&utm_medium=organic&utm_campaign=fall-launch&utm_content=hello%40example.test&other=secret",
    );

    initAttribution();

    expect(getAttribution()).toEqual({
      source_page: "/about",
      landing_page: "/about",
      referrer_url: "",
      utm_source: "partner",
      utm_medium: "organic",
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
    });
  });

  it("sanitizes legacy stored URLs before returning them", () => {
    navigate("/waitlist");
    sessionStorage.setItem("xen_attribution_schema", "2");
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
      JSON.stringify({ utm_source: "partner", utm_content: "private@example.test" }),
    );

    expect(getAttribution()).toEqual({
      source_page: "/waitlist",
      landing_page: "",
      referrer_url: "",
      utm_source: "partner",
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
    });
  });

  it("fails closed on malformed or non-object stored UTM payloads", () => {
    navigate("/waitlist");
    sessionStorage.setItem("xen_attribution_schema", "2");
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

  it("purges unversioned legacy free text instead of reclassifying it", () => {
    navigate("/waitlist");
    sessionStorage.setItem("xen_landing_page", "/about");
    sessionStorage.setItem("xen_referrer", "https://partner.example");
    sessionStorage.setItem(
      "xen_utm",
      JSON.stringify({ utm_source: "partner", utm_campaign: "old-campaign" }),
    );

    expect(getAttribution()).toEqual({
      source_page: "/waitlist",
      landing_page: "/waitlist",
      referrer_url: "",
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
    });
    expect(sessionStorage.getItem("xen_utm")).toBeNull();
    expect(sessionStorage.getItem("xen_attribution_schema")).toBe("2");
  });

  it.each([
    ["utm_source", "5551234567"],
    ["utm_campaign", "Jane Doe"],
    ["utm_content", "jane-doe"],
    ["utm_term", "312-555-0199"],
  ])("rejects identifier-like query value %s=%s", (field, value) => {
    navigate(`/waitlist?${field}=${encodeURIComponent(value)}`);
    initAttribution();

    expect(JSON.stringify(getAttribution())).not.toContain(value);
    expect(getAttribution()[field as UtmFieldForTest]).toBeNull();
  });

  it("rejects identifier-like values even in current-schema storage", () => {
    navigate("/waitlist");
    sessionStorage.setItem("xen_attribution_schema", "2");
    sessionStorage.setItem(
      "xen_utm",
      JSON.stringify({
        utm_source: "5551234567",
        utm_campaign: "Jane Doe",
        utm_content: "jane-doe",
        utm_term: "312-555-0199",
      }),
    );

    const attribution = getAttribution();
    expect(attribution.utm_source).toBeNull();
    expect(attribution.utm_campaign).toBeNull();
    expect(attribution.utm_content).toBeNull();
    expect(attribution.utm_term).toBeNull();
  });

  it.each([
    "/admin?email=private%40example.test",
    "/admin/research/applications/private-id",
    "/ADMIN/users/Jane-Doe",
  ])("treats admin path %s as a sensitive attribution boundary", (path) => {
    sessionStorage.setItem("xen_attribution_schema", "2");
    sessionStorage.setItem("xen_utm", JSON.stringify({ utm_source: "partner" }));
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

  it("buckets dynamic public routes and refuses unknown free-text paths", () => {
    navigate("/for/Jane-Doe");
    initAttribution();
    expect(getAttribution().source_page).toBe("/for/:slug");
    expect(JSON.stringify(getAttribution())).not.toContain("Jane");

    sessionStorage.clear();
    navigate("/unknown/312-555-0199");
    initAttribution();
    expect(getAttribution().source_page).toBe("");
    expect(JSON.stringify(getAttribution())).not.toContain("312-555-0199");
  });
});
