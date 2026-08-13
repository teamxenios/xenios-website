import { describe, expect, it } from "vitest";
import { describeTebraConfiguration, parseTebraConfiguration } from "./tebra-config";

const CREDENTIALS = {
  CARE_ENABLED: "true",
  CARE_ENABLE_APPROVED: "true",
  CARE_TEBRA_SYNC_ENABLED: "true",
  CARE_TEBRA_SOAP_ENDPOINT: "https://practice.example/soap",
  CARE_TEBRA_USERNAME: "integration-user",
  CARE_TEBRA_PASSWORD: "not-a-real-password",
  CARE_TEBRA_CUSTOMER_KEY: "not-a-real-customer-key",
} satisfies NodeJS.ProcessEnv;

describe("Tebra configuration", () => {
  it("stays disabled until Care itself is enabled and approved", () => {
    expect(parseTebraConfiguration({}).state).toBe("disabled");
    expect(parseTebraConfiguration({ CARE_ENABLED: "true" }).state).toBe("disabled");
    expect(
      parseTebraConfiguration({ ...CREDENTIALS, CARE_ENABLE_APPROVED: "false" }).state,
    ).toBe("disabled");
  });

  it("stays unconfigured when the integration switch or any credential is missing", () => {
    expect(
      parseTebraConfiguration({ CARE_ENABLED: "true", CARE_ENABLE_APPROVED: "true" }).state,
    ).toBe("unconfigured");
    for (const key of [
      "CARE_TEBRA_SOAP_ENDPOINT",
      "CARE_TEBRA_USERNAME",
      "CARE_TEBRA_PASSWORD",
      "CARE_TEBRA_CUSTOMER_KEY",
    ] as const) {
      const partial: NodeJS.ProcessEnv = { ...CREDENTIALS };
      delete partial[key];
      expect(parseTebraConfiguration(partial).state).toBe("unconfigured");
    }
  });

  it("refuses an endpoint that could carry a secret into a log line", () => {
    const unsafe = [
      "http://practice.example/soap",
      "https://user:pass@practice.example/soap",
      "https://practice.example/soap?key=abc",
      "https://practice.example/soap#key",
      "not-a-url",
    ];
    for (const endpoint of unsafe) {
      const config = parseTebraConfiguration({
        ...CREDENTIALS,
        CARE_TEBRA_SOAP_ENDPOINT: endpoint,
      });
      expect(config).toEqual({ state: "invalid", reason: "unsafe_endpoint" });
    }
  });

  it("holds polling inside the documented five to fifteen minute range", () => {
    for (const minutes of ["4", "16", "0", "7.5", "ten"]) {
      expect(
        parseTebraConfiguration({
          ...CREDENTIALS,
          CARE_TEBRA_POLL_INTERVAL_MINUTES: minutes,
        }),
      ).toEqual({ state: "invalid", reason: "poll_interval_out_of_range" });
    }
    for (const minutes of ["5", "10", "15"]) {
      const config = parseTebraConfiguration({
        ...CREDENTIALS,
        CARE_TEBRA_POLL_INTERVAL_MINUTES: minutes,
      });
      expect(config.state).toBe("ready");
      if (config.state === "ready") expect(config.pollIntervalMinutes).toBe(Number(minutes));
    }
  });

  it("defaults to a ten minute cadence and bounded pages", () => {
    const config = parseTebraConfiguration(CREDENTIALS);
    expect(config.state).toBe("ready");
    if (config.state !== "ready") return;
    expect(config.pollIntervalMinutes).toBe(10);
    expect(config.maxPagesPerRun).toBe(20);
    expect(config.overlapSeconds).toBe(120);
    expect(config.practiceId).toBeNull();
  });

  it("refuses page and overlap settings outside their bounds", () => {
    expect(
      parseTebraConfiguration({ ...CREDENTIALS, CARE_TEBRA_MAX_PAGES: "0" }).state,
    ).toBe("invalid");
    expect(
      parseTebraConfiguration({ ...CREDENTIALS, CARE_TEBRA_CURSOR_OVERLAP_SECONDS: "901" }).state,
    ).toBe("invalid");
  });
});

describe("Tebra status description", () => {
  it("never carries a credential, a host, or a practice id", () => {
    const config = parseTebraConfiguration({
      ...CREDENTIALS,
      CARE_TEBRA_PRACTICE_ID: "practice-9182",
    });
    const status = describeTebraConfiguration({
      config,
      transportBound: true,
      careEnabled: true,
      cursors: [],
      now: () => new Date("2026-08-12T12:00:00Z"),
    });

    const serialized = JSON.stringify(status);
    for (const secret of [
      CREDENTIALS.CARE_TEBRA_PASSWORD,
      CREDENTIALS.CARE_TEBRA_CUSTOMER_KEY,
      CREDENTIALS.CARE_TEBRA_USERNAME,
      "practice.example",
      "practice-9182",
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(status.ready).toBe(true);
    expect(status.pollIntervalMinutes).toBe(10);
  });

  it("is not ready while no transport is bound, even with valid credentials", () => {
    const status = describeTebraConfiguration({
      config: parseTebraConfiguration(CREDENTIALS),
      transportBound: false,
      careEnabled: true,
      cursors: [],
    });
    expect(status.state).toBe("ready");
    expect(status.ready).toBe(false);
    expect(status.transportBound).toBe(false);
  });
});
