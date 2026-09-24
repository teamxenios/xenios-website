import { describe, expect, it, vi } from "vitest";
import { deliverContact } from "./contact-delivery";

const message = { name: "Audit", email: "audit@example.invalid", persona: "enterprise" as const, subject: "Synthetic inquiry", message: "Synthetic inquiry for a local test only." };

describe("contact acceptance boundary", () => {
  it("does not acknowledge or send a confirmation before the team accepts", async () => {
    let accept!: () => void;
    const sendMessage = vi.fn(() => new Promise<void>(resolve => { accept = resolve; }));
    const sendAutoReply = vi.fn(async () => {});
    let completed = false;
    const pending = deliverContact(message, { sendMessage, sendAutoReply }).then(value => { completed = true; return value; });
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(sendAutoReply).not.toHaveBeenCalled();
    accept();
    expect(await pending).toEqual({ accepted: true, autoReplySent: true });
  });

  it("does not send a false customer receipt when internal delivery fails", async () => {
    const sendAutoReply = vi.fn(async () => {});
    expect(await deliverContact(message, { sendMessage: async () => { throw new Error("unavailable"); }, sendAutoReply })).toEqual({ accepted: false });
    expect(sendAutoReply).not.toHaveBeenCalled();
  });

  it("keeps the accepted inquiry successful if only the courtesy reply fails", async () => {
    const sendMessage = vi.fn(async () => {});
    expect(await deliverContact(message, { sendMessage, sendAutoReply: async () => { throw new Error("rejected"); } })).toEqual({ accepted: true, autoReplySent: false });
    expect(sendMessage).toHaveBeenCalledOnce();
  });
});
