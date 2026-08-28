import { describe, expect, it } from "vitest";
import {
  isTebraPublicConfiguration,
  TEBRA_REQUEST_SEMANTICS,
} from "@shared/care/tebra-experience";
import { careCapabilityStatusForState } from "./capability";
import {
  parseTebraAllowedOrigins,
  resolveTebraExperienceConfiguration,
  resolveTebraPublicConfiguration,
} from "./tebra-scheduling";
import {
  fingerprintTebraAuthorityConfiguration,
  type ReadyTebraPortalConfiguration,
  type ReadyTebraSchedulingConfiguration,
  type TebraPatientPortalPublicAuthority,
  type TebraPublicActivationContext,
  type TebraSchedulingPublicAuthority,
} from "./tebra-public-authority";

const enabledCare = careCapabilityStatusForState(
  "enabled",
  new Date("2026-08-28T00:00:00.000Z"),
);
const disabledCare = careCapabilityStatusForState(
  "disabled",
  new Date("2026-08-28T00:00:00.000Z"),
);

const currentReleaseSha = "1111111111111111111111111111111111111111";
const mismatchedReleaseSha = "2222222222222222222222222222222222222222";
const now = new Date("2026-08-28T12:00:00.000Z");

const readyDirectEnv: NodeJS.ProcessEnv = {
  TEBRA_SCHEDULING_ENABLED: "true",
  TEBRA_SCHEDULING_MODE: "direct_link",
  TEBRA_SCHEDULING_URL:
    "https://schedule.example.test/request?practice=west&version=2",
  TEBRA_ALLOWED_ORIGINS: "https://schedule.example.test",
  TEBRA_TELEHEALTH_ENABLED: "false",
  TEBRA_ENVIRONMENT: "production",
};

const readyDirectConfiguration: ReadyTebraSchedulingConfiguration = {
  status: "ready",
  mode: "direct_link",
  url: readyDirectEnv.TEBRA_SCHEDULING_URL!,
  telehealthEnabled: false,
  requestSemantics: TEBRA_REQUEST_SEMANTICS,
};

function schedulingAuthority(
  configuration: ReadyTebraSchedulingConfiguration,
  overrides: Partial<TebraSchedulingPublicAuthority> = {},
): TebraSchedulingPublicAuthority {
  return {
    schemaVersion: 1,
    source: "durable_release_attestation",
    scope: "scheduling_public_handoff",
    authorityId: "synthetic-scheduling-authority",
    releaseSha: currentReleaseSha,
    environment: "production",
    configurationFingerprint: fingerprintTebraAuthorityConfiguration(
      "scheduling_public_handoff",
      configuration,
    ),
    stagingResult: "passed",
    stagingVerifiedAt: "2026-08-28T09:00:00.000Z",
    decision: "approved",
    approvedByRef: "synthetic-release-reviewer",
    approvedAt: "2026-08-28T10:00:00.000Z",
    validUntil: "2026-08-29T12:00:00.000Z",
    revokedAt: null,
    providerSchedulingState: "verified_enabled",
    ...overrides,
  };
}

function portalAuthority(
  configuration: ReadyTebraPortalConfiguration,
  overrides: Partial<TebraPatientPortalPublicAuthority> = {},
): TebraPatientPortalPublicAuthority {
  return {
    schemaVersion: 1,
    source: "durable_release_attestation",
    scope: "patient_portal_public_handoff",
    authorityId: "synthetic-portal-authority",
    releaseSha: currentReleaseSha,
    environment: "production",
    configurationFingerprint: fingerprintTebraAuthorityConfiguration(
      "patient_portal_public_handoff",
      configuration,
    ),
    stagingResult: "passed",
    stagingVerifiedAt: "2026-08-28T09:00:00.000Z",
    decision: "approved",
    approvedByRef: "synthetic-portal-reviewer",
    approvedAt: "2026-08-28T10:00:00.000Z",
    validUntil: "2026-08-29T12:00:00.000Z",
    revokedAt: null,
    providerPortalState: "verified_active",
    providerStateVerifiedAt: "2026-08-28T08:00:00.000Z",
    ...overrides,
  };
}

function activation(
  authorities: TebraPublicActivationContext["authorities"],
  releaseSha = currentReleaseSha,
): TebraPublicActivationContext {
  return { currentReleaseSha: releaseSha, authorities, now };
}

function resolve(
  env: NodeJS.ProcessEnv,
  careCapability = enabledCare,
  publicActivation?: TebraPublicActivationContext,
) {
  return resolveTebraPublicConfiguration({
    env,
    careCapability,
    activation: publicActivation,
  });
}

function expectNoSchedulingAction(
  configuration: ReturnType<typeof resolve>,
): void {
  expect(configuration.scheduling.status).not.toBe("ready");
  expect(configuration.scheduling).not.toHaveProperty("url");
  expect(configuration.scheduling).not.toHaveProperty("popupScriptUrl");
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

  it("projects a direct link only with exact production release authority", () => {
    const configuration = resolve(
      readyDirectEnv,
      enabledCare,
      activation({
        scheduling: schedulingAuthority(readyDirectConfiguration),
      }),
    );
    expect(configuration).toEqual({
      schemaVersion: 1,
      authority: "tebra",
      careAvailable: true,
      scheduling: readyDirectConfiguration,
      portal: { status: "unconfigured" },
    });
    expect(isTebraPublicConfiguration(configuration)).toBe(true);
  });

  it("keeps iframe mode unavailable while protected CSP composition is absent", () => {
    const iframeConfiguration: ReadyTebraSchedulingConfiguration = {
      ...readyDirectConfiguration,
      mode: "iframe",
    };
    const configuration = resolve(
      { ...readyDirectEnv, TEBRA_SCHEDULING_MODE: "iframe" },
      enabledCare,
      activation({ scheduling: schedulingAuthority(iframeConfiguration) }),
    );

    expect(configuration.scheduling).toEqual({
      status: "unconfigured",
      mode: "iframe",
      telehealthEnabled: false,
      requestSemantics: TEBRA_REQUEST_SEMANTICS,
    });
  });

  it("keeps an otherwise exact popup unavailable without protected CSP composition", () => {
    const popupEnv: NodeJS.ProcessEnv = {
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
    };
    const popupConfiguration: ReadyTebraSchedulingConfiguration = {
      status: "ready",
      mode: "popup_widget",
      url: readyDirectEnv.TEBRA_SCHEDULING_URL!,
      popupScriptUrl: "https://widgets.example.test/widget.js?version=2",
      telehealthEnabled: true,
      practiceName: "Xenios Care Review Practice",
      locationLabel: "Review location",
      providerLabel: "Provider availability shown in Tebra",
      requestSemantics: TEBRA_REQUEST_SEMANTICS,
    };
    const configuration = resolve(
      popupEnv,
      enabledCare,
      activation({ scheduling: schedulingAuthority(popupConfiguration) }),
    );
    expect(configuration.scheduling).toEqual({
      status: "unconfigured",
      mode: "popup_widget",
      telehealthEnabled: false,
      requestSemantics: TEBRA_REQUEST_SEMANTICS,
    });
    expect(isTebraPublicConfiguration(configuration)).toBe(true);
  });

  it.each(["direct_link", "iframe", "popup_widget"] as const)(
    "never exposes a review-mode %s action even with matching synthetic authority",
    (mode) => {
      const candidate: ReadyTebraSchedulingConfiguration =
        mode === "popup_widget"
          ? {
              ...readyDirectConfiguration,
              mode,
              popupScriptUrl: "https://widgets.example.test/widget.js",
            }
          : { ...readyDirectConfiguration, mode };
      const env: NodeJS.ProcessEnv = {
        ...readyDirectEnv,
        TEBRA_ENVIRONMENT: "review",
        TEBRA_SCHEDULING_MODE: mode,
        ...(mode === "popup_widget"
          ? {
              TEBRA_SCHEDULING_EMBED_SCRIPT_URL:
                "https://widgets.example.test/widget.js",
              TEBRA_ALLOWED_ORIGINS:
                "https://schedule.example.test,https://widgets.example.test",
            }
          : {}),
      };

      const resolved = resolve(
        env,
        enabledCare,
        activation({ scheduling: schedulingAuthority(candidate) }),
      );
      expectNoSchedulingAction(resolved);
      expect(
        resolveTebraExperienceConfiguration({
          env,
          careCapability: enabledCare,
          activation: activation({
            scheduling: schedulingAuthority(candidate),
          }),
        }).allowedOrigins,
      ).toEqual([]);
    },
  );

  it("remains unconfigured when exact durable release authority is absent", () => {
    const configuration = resolve(readyDirectEnv);
    expect(configuration.scheduling).toMatchObject({
      status: "unconfigured",
      mode: "direct_link",
    });
    expectNoSchedulingAction(configuration);
  });

  it("remains unconfigured when the running release identity is absent", () => {
    const configuration = resolve(readyDirectEnv, enabledCare, {
      authorities: {
        scheduling: schedulingAuthority(readyDirectConfiguration),
      },
      now,
    });
    expect(configuration.scheduling).toMatchObject({ status: "unconfigured" });
    expectNoSchedulingAction(configuration);
  });

  it.each([
    [
      "expired",
      schedulingAuthority(readyDirectConfiguration, {
        validUntil: "2026-08-28T11:59:59.000Z",
      }),
      currentReleaseSha,
    ],
    [
      "bound to another release",
      schedulingAuthority(readyDirectConfiguration),
      mismatchedReleaseSha,
    ],
    [
      "bound to another configuration",
      schedulingAuthority(readyDirectConfiguration, {
        configurationFingerprint: `sha256:${"0".repeat(64)}`,
      }),
      currentReleaseSha,
    ],
  ])("rejects %s scheduling authority", (_reason, authority, releaseSha) => {
    const configuration = resolve(
      readyDirectEnv,
      enabledCare,
      activation({ scheduling: authority }, releaseSha),
    );
    expect(configuration.scheduling).toMatchObject({
      status: "configuration_invalid",
    });
    expectNoSchedulingAction(configuration);
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
  const portalConfiguration: ReadyTebraPortalConfiguration = {
    status: "ready",
    url: "https://portal.example.test/portal?practice=west",
  };
  const portalEnv: NodeJS.ProcessEnv = {
    ...readyDirectEnv,
    TEBRA_SCHEDULING_ENABLED: "false",
    TEBRA_PATIENT_PORTAL_URL: portalConfiguration.url,
    TEBRA_ALLOWED_ORIGINS:
      "https://schedule.example.test,https://portal.example.test",
  };

  it("requires its own durable approval independently of scheduling", () => {
    const withoutPortalAuthority = resolve(
      portalEnv,
      enabledCare,
      activation({
        scheduling: schedulingAuthority(readyDirectConfiguration),
      }),
    );
    expect(withoutPortalAuthority.scheduling).toMatchObject({
      status: "disabled",
      mode: "disabled",
    });
    expect(withoutPortalAuthority.portal).toEqual({ status: "unconfigured" });

    const configuration = resolve(
      portalEnv,
      enabledCare,
      activation({ portal: portalAuthority(portalConfiguration) }),
    );
    expect(configuration.scheduling).toMatchObject({
      status: "disabled",
      mode: "disabled",
    });
    expect(configuration.portal).toEqual(portalConfiguration);
  });

  it("does not activate a retained portal URL in review mode", () => {
    const configuration = resolve(
      { ...portalEnv, TEBRA_ENVIRONMENT: "review" },
      enabledCare,
      activation({ portal: portalAuthority(portalConfiguration) }),
    );
    expect(configuration.portal).toEqual({ status: "unconfigured" });
    expect(JSON.stringify(configuration)).not.toContain(portalConfiguration.url);
  });

  it("rejects stale, mismatched, or scheduling-scoped portal authority", () => {
    const invalidAuthorities: unknown[] = [
      portalAuthority(portalConfiguration, {
        validUntil: "2026-08-28T11:59:59.000Z",
      }),
      portalAuthority(portalConfiguration, {
        releaseSha: mismatchedReleaseSha,
      }),
      portalAuthority(portalConfiguration, {
        configurationFingerprint: `sha256:${"0".repeat(64)}`,
      }),
      schedulingAuthority(readyDirectConfiguration),
    ];

    for (const authority of invalidAuthorities) {
      const configuration = resolve(
        portalEnv,
        enabledCare,
        activation({ portal: authority }),
      );
      expect(configuration.portal).toEqual({
        status: "configuration_invalid",
      });
      expect(JSON.stringify(configuration)).not.toContain(portalConfiguration.url);
    }
  });

  it("rejects portal authority without distinct provider activation evidence", () => {
    const authority = {
      ...portalAuthority(portalConfiguration),
      providerPortalState: "unknown",
    };
    const configuration = resolve(
      portalEnv,
      enabledCare,
      activation({ portal: authority }),
    );
    expect(configuration.portal).toEqual({ status: "configuration_invalid" });
    expect(JSON.stringify(configuration)).not.toContain(portalConfiguration.url);
  });

  it("withholds the retained URL when no portal authority is supplied", () => {
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
    expect(configuration.portal).toEqual({ status: "unconfigured" });
    expect(JSON.stringify(configuration)).not.toContain("portal.example.test");
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
    const ready = resolve(
      readyDirectEnv,
      enabledCare,
      activation({
        scheduling: schedulingAuthority(readyDirectConfiguration),
      }),
    );
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
