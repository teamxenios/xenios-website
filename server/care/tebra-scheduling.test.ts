import { describe, expect, it } from "vitest";
import {
  isTebraPublicConfiguration,
  TEBRA_REQUEST_SEMANTICS,
} from "@shared/care/tebra-experience";
import { careCapabilityStatusForState } from "./capability";
import {
  parseTebraAllowedOrigins,
  resolveTebraPublicConfiguration,
} from "./tebra-scheduling";

const enabledCare = careCapabilityStatusForState(
  "enabled",
  new Date("2026-08-28T00:00:00.000Z"),
);
const disabledCare = careCapabilityStatusForState(
  "disabled",
  new Date("2026-08-28T00:00:00.000Z"),
);

const readyDirectEnv: NodeJS.ProcessEnv = {
  TEBRA_SCHEDULING_ENABLED: "true",
  TEBRA_SCHEDULING_MODE: "direct_link",
  TEBRA_SCHEDULING_URL:
    "https://schedule.example.test/request?practice=west&version=2",
  TEBRA_ALLOWED_ORIGINS: "https://schedule.example.test",
  TEBRA_TELEHEALTH_ENABLED: "false",
  TEBRA_ENVIRONMENT: "review",
};

function resolve(
  env: NodeJS.ProcessEnv,
  careCapability = enabledCare,
) {
  return resolveTebraPublicConfiguration({ env, careCapability });
}

describe("Tebra scheduling configuration", () => {
  it.each([
    [undefined, "unconfigured"],
    ["TRUE", "configuration_invalid"],
    ["1", "configuration_invalid"],
    ["false", "disabled"],
  ])("parses the feature gate exactly: %s", (flag, status) => {
    const configuration = resolve({
      ...readyDirectEnv,
      TEBRA_SCHEDULING_ENABLED: flag,
    });
    expect(configuration.scheduling).toMatchObject({ status });
    expect(configuration.scheduling).not.toHaveProperty("url");
    expect(configuration.scheduling).not.toHaveProperty("popupScriptUrl");
  });

  it.each(["direct_link", "iframe"] as const)(
    "projects a ready %s destination and preserves safe static query values",
    (mode) => {
      const configuration = resolve({
        ...readyDirectEnv,
        TEBRA_SCHEDULING_MODE: mode,
      });
      expect(configuration).toEqual({
        schemaVersion: 1,
        authority: "tebra",
        careAvailable: true,
        scheduling: {
          status: "ready",
          mode,
          url: readyDirectEnv.TEBRA_SCHEDULING_URL,
          telehealthEnabled: false,
          requestSemantics: TEBRA_REQUEST_SEMANTICS,
        },
        portal: { status: "unconfigured" },
      });
      expect(isTebraPublicConfiguration(configuration)).toBe(true);
    },
  );

  it("requires an explicitly enabled popup script and both exact origins", () => {
    const configuration = resolve({
      ...readyDirectEnv,
      TEBRA_SCHEDULING_MODE: "popup_widget",
      TEBRA_SCHEDULING_EMBED_SCRIPT_URL:
        "https://widgets.example.test/widget.js?version=2",
      TEBRA_ALLOWED_ORIGINS:
        "https://schedule.example.test, https://widgets.example.test/",
      TEBRA_TELEHEALTH_ENABLED: "true",
      TEBRA_PRACTICE_NAME: "  Xenios Care Review Practice  ",
      TEBRA_LOCATION_LABEL: "Review location",
      TEBRA_PROVIDER_LABEL: "Provider availability shown in Tebra",
    });
    expect(configuration.scheduling).toEqual({
      status: "ready",
      mode: "popup_widget",
      url: readyDirectEnv.TEBRA_SCHEDULING_URL,
      popupScriptUrl: "https://widgets.example.test/widget.js?version=2",
      telehealthEnabled: true,
      practiceName: "Xenios Care Review Practice",
      locationLabel: "Review location",
      providerLabel: "Provider availability shown in Tebra",
      requestSemantics: TEBRA_REQUEST_SEMANTICS,
    });
    expect(isTebraPublicConfiguration(configuration)).toBe(true);
  });

  it("keeps popup mode unconfigured until its script URL exists", () => {
    expect(
      resolve({
        ...readyDirectEnv,
        TEBRA_SCHEDULING_MODE: "popup_widget",
      }).scheduling,
    ).toMatchObject({ status: "unconfigured", mode: "popup_widget" });
  });

  it.each([
    "https://widgets.example.test/",
    "https://widgets.example.test/widget/",
    "https://widgets.example.test/widget;variant.js",
    "https://widgets.example.test/widget,variant.js",
  ])("rejects a popup script path that cannot be pinned to one CSP resource: %s", (url) => {
    const configuration = resolve({
      ...readyDirectEnv,
      TEBRA_SCHEDULING_MODE: "popup_widget",
      TEBRA_SCHEDULING_EMBED_SCRIPT_URL: url,
      TEBRA_ALLOWED_ORIGINS:
        "https://schedule.example.test,https://widgets.example.test",
    });
    expect(configuration.scheduling).toMatchObject({
      status: "configuration_invalid",
      mode: "popup_widget",
    });
    expect(configuration.scheduling).not.toHaveProperty("popupScriptUrl");
  });

  it.each([
    ["TEBRA_SCHEDULING_URL", undefined, "unconfigured"],
    ["TEBRA_ALLOWED_ORIGINS", undefined, "unconfigured"],
    ["TEBRA_ENVIRONMENT", undefined, "unconfigured"],
    ["TEBRA_ENVIRONMENT", "staging", "configuration_invalid"],
    ["TEBRA_SCHEDULING_MODE", "script", "configuration_invalid"],
    ["TEBRA_TELEHEALTH_ENABLED", "TRUE", "configuration_invalid"],
    ["TEBRA_PRACTICE_NAME", "bad\nlabel", "configuration_invalid"],
  ])("fails closed when %s is %s", (key, value, status) => {
    const env: NodeJS.ProcessEnv = { ...readyDirectEnv, [key]: value };
    expect(resolve(env).scheduling).toMatchObject({ status });
  });

  it.each([
    "http://schedule.example.test/request",
    "https://user:pass@schedule.example.test/request",
    "https://schedule.example.test/request#patient",
    "https://schedule.example.test/request?patientId=123",
    "https://schedule.example.test/request?accessToken=opaque",
    "https://schedule.example.test/request?authtoken=opaque",
    "https://schedule.example.test/request?api_key=opaque",
    "https://schedule.example.test/request?customeremail=private%40example.test",
    "https://schedule.example.test/request?e-mail=private%40example.test",
    "https://schedule.example.test/request?emailaddress=private%40example.test",
    "https://schedule.example.test/request?phonenumber=5550000000",
    "https://schedule.example.test/request?pass-word=private",
    "https://schedule.example.test/request?productid=private",
    "https://schedule.example.test/request?sessionid=private",
    "https://schedule.example.test/request?visitreason=private",
    "https://schedule.example.test/request?portalId=private",
    "https://schedule.example.test/request?recordId=private",
    "https://schedule.example.test/request?mrn=private",
    "https://schedule.example.test/request?name=private",
    "https://schedule.example.test/request?signature=opaque",
    "javascript:alert(1)",
  ])("rejects an unsafe public destination: %s", (url) => {
    const configuration = resolve({
      ...readyDirectEnv,
      TEBRA_SCHEDULING_URL: url,
    });
    expect(configuration.scheduling).toMatchObject({
      status: "configuration_invalid",
    });
    expect(JSON.stringify(configuration)).not.toContain(url);
  });

  it("requires exact origin membership instead of hostname-prefix matching", () => {
    const configuration = resolve({
      ...readyDirectEnv,
      TEBRA_ALLOWED_ORIGINS: "https://schedule.example.test.evil.invalid",
    });
    expect(configuration.scheduling).toMatchObject({
      status: "configuration_invalid",
    });
  });

  it("withholds destinations, labels, telehealth, and unrelated values when Care is unavailable", () => {
    const privateValue = "must-never-reach-the-browser";
    const configuration = resolve(
      {
        ...readyDirectEnv,
        TEBRA_TELEHEALTH_ENABLED: "true",
        TEBRA_PRACTICE_NAME: "Hidden review practice",
        TEBRA_PATIENT_PORTAL_URL: "https://schedule.example.test/portal",
        UNRELATED_PRIVATE_VALUE: privateValue,
      },
      disabledCare,
    );
    expect(configuration).toEqual({
      schemaVersion: 1,
      authority: "tebra",
      careAvailable: false,
      scheduling: {
        status: "care_unavailable",
        mode: "direct_link",
        telehealthEnabled: false,
        requestSemantics: TEBRA_REQUEST_SEMANTICS,
      },
      portal: { status: "care_unavailable" },
    });
    expect(JSON.stringify(configuration)).not.toContain(privateValue);
    expect(isTebraPublicConfiguration(configuration)).toBe(true);
  });
});

describe("Tebra portal configuration", () => {
  it("can remain ready independently while scheduling is explicitly disabled", () => {
    const configuration = resolve({
      ...readyDirectEnv,
      TEBRA_SCHEDULING_ENABLED: "false",
      TEBRA_PATIENT_PORTAL_URL:
        "https://portal.example.test/portal?practice=west",
      TEBRA_ALLOWED_ORIGINS:
        "https://schedule.example.test,https://portal.example.test",
    });
    expect(configuration.scheduling).toMatchObject({
      status: "disabled",
      mode: "disabled",
    });
    expect(configuration.portal).toEqual({
      status: "ready",
      url: "https://portal.example.test/portal?practice=west",
    });
  });

  it.each([
    ["https://portal.example.test/portal?session=opaque", "configuration_invalid"],
    ["https://other.example.test/portal", "configuration_invalid"],
    [undefined, "unconfigured"],
  ])("fails closed for portal destination %s", (portalUrl, status) => {
    const configuration = resolve({
      ...readyDirectEnv,
      TEBRA_PATIENT_PORTAL_URL: portalUrl,
    });
    expect(configuration.portal).toEqual({ status });
  });
});

describe("Tebra exact origin parsing", () => {
  it("normalizes optional trailing slashes and the default HTTPS port", () => {
    expect(
      parseTebraAllowedOrigins(
        "https://schedule.example.test/, https://widgets.example.test:443",
      ),
    ).toEqual({
      state: "ready",
      origins: [
        "https://schedule.example.test",
        "https://widgets.example.test",
      ],
    });
  });

  it.each([
    "https://*.example.test",
    "http://schedule.example.test",
    "https://schedule.example.test/path",
    "https://schedule.example.test?tenant=west",
    "https://user:pass@schedule.example.test",
    "https://schedule.example.test,https://schedule.example.test/",
    "https://schedule.example.test,",
    "not-an-origin",
  ])("rejects a non-origin or ambiguous list: %s", (value) => {
    expect(parseTebraAllowedOrigins(value)).toEqual({
      state: "invalid",
      origins: [],
    });
  });
});

describe("Tebra public configuration guard", () => {
  it("rejects extra keys, unsafe URLs, and inconsistent availability", () => {
    const ready = resolve(readyDirectEnv);
    expect(isTebraPublicConfiguration({ ...ready, secret: "no" })).toBe(false);
    expect(
      isTebraPublicConfiguration({
        ...ready,
        scheduling: {
          ...ready.scheduling,
          url: "https://schedule.example.test/request?member=private",
        },
      }),
    ).toBe(false);
    expect(isTebraPublicConfiguration({ ...ready, careAvailable: false })).toBe(
      false,
    );
  });
});
