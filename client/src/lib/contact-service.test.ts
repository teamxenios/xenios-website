import { afterEach, describe, expect, it, vi } from "vitest";
import { contactService } from "./waitlist-service";
const message = { name: "Audit", email: "audit@example.invalid", persona: "enterprise" as const, subject: "Synthetic test", message: "Synthetic test message for isolated capture." };
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("contact transport uncertainty", () => {
  it("bounds a never-returning response and reports uncertainty, not rejection", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const result = contactService.submit(message).catch(error => error);
    await vi.advanceTimersByTimeAsync(20_001);
    expect((await result).message).toContain("may already have been accepted");
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it("retains identical request content after a lost response and accepts the retry receipt", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("response lost"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, autoReplySent: false }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(contactService.submit(message)).rejects.toThrow("Receipt is not confirmed");
    await expect(contactService.submit(message)).resolves.toEqual({ success: true, autoReplySent: false });
    expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
  });
});
