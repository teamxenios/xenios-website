import { enqueueNotification, runOutboxTick } from "./outbox";
import {
  MEMBER_PLATFORM_TEMPLATES,
  type MemberPlatformTemplateKey,
} from "./member-platform-emails";

// ---------------------------------------------------------------------------
// xenios research member platform: shared dependency seams (Website 2 lane).
//
// Every member-platform module receives `MemberPlatformDeps` instead of
// reaching for the clock or notification transport directly, so tests inject
// deterministic values and providers stay swappable. Defaults are the real
// implementations; nothing here reads provider credentials.
// ---------------------------------------------------------------------------

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

// Durable-first notification seam. The merged outbox (PR #25) is the durable
// queue, but its dispatch() maps template keys to senders inside the frozen
// outbox.ts. Until the coordinator wires MEMBER_PLATFORM_TEMPLATES into
// dispatch() (integration handoff, one line), enqueue would dead-letter our
// keys, so the seam: (1) attempts the direct send via this lane's template
// senders, and (2) when the direct send fails, enqueues for the durable retry
// path so the intent is never lost. Payloads carry references, never tokens.
export interface MemberPlatformNotifier {
  notify(input: {
    eventKey: string;
    eventType: string;
    templateKey: MemberPlatformTemplateKey;
    recipient: string;
    memberId?: string | null;
    payload?: Record<string, unknown>;
  }): Promise<boolean>;
}

export const defaultNotifier: MemberPlatformNotifier = {
  async notify(input) {
    const sender = MEMBER_PLATFORM_TEMPLATES[input.templateKey];
    let sent = false;
    try {
      sent = await sender({ recipient: input.recipient, payload: input.payload ?? {} });
    } catch {
      sent = false;
    }
    if (!sent) {
      const queued = await enqueueNotification({
        eventKey: input.eventKey,
        eventType: input.eventType,
        templateKey: input.templateKey,
        recipient: input.recipient,
        payload: input.payload,
      });
      if (queued) void runOutboxTick().catch(() => undefined);
      return queued;
    }
    return true;
  },
};

export interface MemberPlatformDeps {
  clock: Clock;
  notifier: MemberPlatformNotifier;
}

export function defaultDeps(): MemberPlatformDeps {
  return { clock: systemClock, notifier: defaultNotifier };
}
