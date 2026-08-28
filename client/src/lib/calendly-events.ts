const SCHEDULED_EVENT = "calendly.event_scheduled";

type CalendlyMessage = {
  event?: unknown;
};

export function isTrustedCalendlyScheduledMessage(
  message: MessageEvent,
  calendlyUrl: string,
  iframeWindow: Window | null,
): boolean {
  if (!iframeWindow || message.source !== iframeWindow) return false;

  let expectedOrigin: string;
  try {
    const configuredUrl = new URL(calendlyUrl);
    if (configuredUrl.protocol !== "https:") return false;
    expectedOrigin = configuredUrl.origin;
  } catch {
    return false;
  }

  if (message.origin !== expectedOrigin || !message.data || typeof message.data !== "object") {
    return false;
  }

  return (message.data as CalendlyMessage).event === SCHEDULED_EVENT;
}
