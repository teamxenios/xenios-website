import { describe, expect, it } from "vitest";
import { isTrustedCalendlyScheduledMessage } from "./calendly-events";

const configuredUrl = "https://calendly.com/xenios/product-walkthrough";

function scheduledMessage(origin: string, source: Window | null): MessageEvent {
  return {
    origin,
    source,
    data: { event: "calendly.event_scheduled" },
  } as MessageEvent;
}

describe("isTrustedCalendlyScheduledMessage", () => {
  it("accepts the configured Calendly origin from the embedded iframe", () => {
    const iframeWindow = {} as Window;
    expect(
      isTrustedCalendlyScheduledMessage(
        scheduledMessage("https://calendly.com", iframeWindow),
        configuredUrl,
        iframeWindow,
      ),
    ).toBe(true);
  });

  it("rejects lookalike origins, unrelated windows, and malformed payloads", () => {
    const iframeWindow = {} as Window;
    const otherWindow = {} as Window;

    expect(
      isTrustedCalendlyScheduledMessage(
        scheduledMessage("https://calendly.com.evil.test", iframeWindow),
        configuredUrl,
        iframeWindow,
      ),
    ).toBe(false);
    expect(
      isTrustedCalendlyScheduledMessage(
        scheduledMessage("https://calendly.com", otherWindow),
        configuredUrl,
        iframeWindow,
      ),
    ).toBe(false);
    expect(
      isTrustedCalendlyScheduledMessage(
        { origin: "https://calendly.com", source: iframeWindow, data: null } as MessageEvent,
        configuredUrl,
        iframeWindow,
      ),
    ).toBe(false);
  });

  it("fails closed for non-HTTPS or invalid configured URLs", () => {
    const iframeWindow = {} as Window;
    const message = scheduledMessage("http://calendly.com", iframeWindow);

    expect(isTrustedCalendlyScheduledMessage(message, "http://calendly.com/xenios", iframeWindow)).toBe(false);
    expect(isTrustedCalendlyScheduledMessage(message, "not a URL", iframeWindow)).toBe(false);
  });
});
