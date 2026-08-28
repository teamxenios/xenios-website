import { describe, expect, it } from "vitest";
import {
  TEBRA_REQUEST_SEMANTICS,
  type TebraPublicConfiguration,
} from "@shared/care/tebra-experience";
import { buildTebraCspContribution } from "./tebra-csp";

const base = {
  schemaVersion: 1,
  authority: "tebra",
  careAvailable: true,
  portal: { status: "unconfigured" },
} as const;

describe("Tebra CSP contribution", () => {
  it("adds only an exact frame origin for a ready iframe", () => {
    const configuration: TebraPublicConfiguration = {
      ...base,
      scheduling: {
        status: "ready",
        mode: "iframe",
        url: "https://schedule.example.test/request?practice=west",
        telehealthEnabled: false,
        requestSemantics: TEBRA_REQUEST_SEMANTICS,
      },
    };
    expect(buildTebraCspContribution(configuration)).toEqual({
      frameSrc: ["https://schedule.example.test"],
      scriptSrc: [],
    });
  });

  it("adds the exact frame origin and exact script path for a ready popup widget", () => {
    const configuration: TebraPublicConfiguration = {
      ...base,
      scheduling: {
        status: "ready",
        mode: "popup_widget",
        url: "https://schedule.example.test/request",
        popupScriptUrl: "https://widgets.example.test/v2/widget.js?version=2",
        telehealthEnabled: false,
        requestSemantics: TEBRA_REQUEST_SEMANTICS,
      },
    };
    expect(buildTebraCspContribution(configuration)).toEqual({
      frameSrc: ["https://schedule.example.test"],
      scriptSrc: ["https://widgets.example.test/v2/widget.js"],
    });
  });

  it.each([
    "https://widgets.example.test/",
    "https://widgets.example.test/v2/",
    "https://widgets.example.test/v2/widget;variant.js",
    "https://widgets.example.test/v2/widget,variant.js",
  ])("fails closed when the script path cannot identify one CSP resource: %s", (popupScriptUrl) => {
    const configuration = {
      ...base,
      scheduling: {
        status: "ready",
        mode: "popup_widget",
        url: "https://schedule.example.test/request",
        popupScriptUrl,
        telehealthEnabled: false,
        requestSemantics: TEBRA_REQUEST_SEMANTICS,
      },
    };
    expect(buildTebraCspContribution(configuration)).toEqual({
      frameSrc: [],
      scriptSrc: [],
    });
  });

  it.each([
    {
      ...base,
      scheduling: {
        status: "ready",
        mode: "direct_link",
        url: "https://schedule.example.test/request",
        telehealthEnabled: false,
        requestSemantics: TEBRA_REQUEST_SEMANTICS,
      },
    },
    {
      ...base,
      scheduling: {
        status: "unconfigured",
        mode: "disabled",
        telehealthEnabled: false,
        requestSemantics: TEBRA_REQUEST_SEMANTICS,
      },
    },
    { schemaVersion: 1, authority: "tebra" },
  ])("contributes nothing for direct, unavailable, or malformed input", (input) => {
    expect(buildTebraCspContribution(input)).toEqual({ frameSrc: [], scriptSrc: [] });
  });
});
