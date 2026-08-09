import { describe, expect, it, vi } from "vitest";

import { EARLY_ACCESS_INTERNAL_RECIPIENT } from "../hardening-contract";
import { createLazyResendInternalOrderEmailSender } from "./production-deps";

/**
 * The production sender resolves its provider on first use, because
 * `getResendClient()` is async and throws when nothing is configured, and a
 * throw at boot would take a whole process down for a surface that may never be
 * reached. These tests pin the three answers that matter to the durable row the
 * service has already written by the time send is called.
 */

function fakeResend(behaviour: {
  send: (
    payload: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => Promise<{ data?: { id?: string } | null; error?: unknown }>;
}) {
  return { emails: { send: behaviour.send } };
}

describe("the lazily resolved internal order email sender", () => {
  const message = Object.freeze({
    subject: "[EA SUBMITTED ORDER] XEC-1",
    text: "body",
    filename: "receipt.png",
    contentType: "image/png",
    bytes: Uint8Array.of(1, 2, 3),
    idempotencyKey: "eapk_1",
  });

  it("refuses cleanly when no email provider is configured", async () => {
    const sender = createLazyResendInternalOrderEmailSender(async () => {
      throw new Error("Email provider unavailable");
    });
    // `refused`, not `ambiguous`: nothing was sent and nothing can have been,
    // so the durable row records `failed` and a retry is safe.
    await expect(sender.send(message)).resolves.toEqual({ outcome: "refused" });
  });

  it("sends to the one fixed internal recipient and passes the idempotency key", async () => {
    const calls: Array<{ payload: Record<string, unknown>; options?: Record<string, unknown> }> = [];
    const sender = createLazyResendInternalOrderEmailSender(async () => ({
      client: fakeResend({
        async send(payload, options) {
          calls.push({ payload, options });
          return { data: { id: "msg_1" } };
        },
      }),
      fromEmail: "xenios <team@xeniostechnology.com>",
    }));

    await expect(sender.send(message)).resolves.toEqual({
      outcome: "accepted",
      providerMessageId: "msg_1",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].payload.to).toBe(EARLY_ACCESS_INTERNAL_RECIPIENT);
    expect(calls[0].payload.from).toBe("xenios <team@xeniostechnology.com>");
    expect(calls[0].options).toEqual({ idempotencyKey: "eapk_1" });
  });

  it("falls back to the site's own from address when none is configured", async () => {
    const calls: Record<string, unknown>[] = [];
    const sender = createLazyResendInternalOrderEmailSender(async () => ({
      client: fakeResend({
        async send(payload) {
          calls.push(payload);
          return { data: { id: "msg_2" } };
        },
      }),
    }));
    await sender.send(message);
    expect(String(calls[0].from)).toContain("team@xeniostechnology.com");
  });

  it("resolves the provider once and reuses it", async () => {
    const resolve = vi.fn(async () => ({
      client: fakeResend({ async send() { return { data: { id: "msg_3" } }; } }),
      fromEmail: "xenios <team@xeniostechnology.com>",
    }));
    const sender = createLazyResendInternalOrderEmailSender(resolve);
    await sender.send(message);
    await sender.send(message);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed resolution, so a later configuration works", async () => {
    let attempts = 0;
    const sender = createLazyResendInternalOrderEmailSender(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("not configured yet");
      return {
        client: fakeResend({ async send() { return { data: { id: "msg_4" } }; } }),
        fromEmail: "xenios <team@xeniostechnology.com>",
      };
    });
    await expect(sender.send(message)).resolves.toEqual({ outcome: "refused" });
    await expect(sender.send(message)).resolves.toEqual({
      outcome: "accepted",
      providerMessageId: "msg_4",
    });
  });

  it("reports a provider error as refused and a missing id as ambiguous", async () => {
    const refusing = createLazyResendInternalOrderEmailSender(async () => ({
      client: fakeResend({ async send() { return { error: { name: "invalid" } }; } }),
    }));
    await expect(refusing.send(message)).resolves.toEqual({ outcome: "refused" });

    const idless = createLazyResendInternalOrderEmailSender(async () => ({
      client: fakeResend({ async send() { return { data: null }; } }),
    }));
    // Accepted with no identifier is not something to record as accepted: the
    // id is the only handle reconciliation would ever have.
    await expect(idless.send(message)).resolves.toEqual({ outcome: "ambiguous" });
  });
});
