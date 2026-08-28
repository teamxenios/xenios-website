import { describe, expect, it } from "vitest";

import { readAttribution } from "./routes";

describe("public submission attribution boundary", () => {
  it("revalidates the browser projection and drops free text at the server", () => {
    expect(
      readAttribution({
        source_page: "/waitlist",
        landing_page: "/for/:slug",
        referrer_url: "https://jane-doe.example/private?phone=312-555-0199",
        utm_source: "partner",
        utm_medium: "organic",
        utm_campaign: "Jane Doe",
        utm_content: "jane-doe",
        utm_term: "312-555-0199",
      }),
    ).toEqual({
      source_page: "/waitlist",
      landing_page: "/for/:slug",
      referrer_url: null,
      utm_source: "partner",
      utm_medium: "organic",
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
    });
  });

  it("rejects sensitive, unknown, or malformed direct-request values", () => {
    expect(
      readAttribution({
        source_page: "/research/member/private-id",
        landing_page: "/unknown/Jane-Doe",
        referrer_url: "https://partner.example",
        utm_source: "5551234567",
        utm_medium: { value: "organic" },
      }),
    ).toEqual({
      source_page: null,
      landing_page: null,
      referrer_url: null,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
    });
    expect(readAttribution(null)).toEqual({
      source_page: null,
      landing_page: null,
      referrer_url: null,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
    });
  });
});
