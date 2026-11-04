// @vitest-environment jsdom
import { act, useLayoutEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ member: { status: "active" }, memberToken: "synthetic-privacy-member", memberChecking: false }));
const api = vi.hoisted(() => ({ correction: vi.fn(), export: vi.fn(), deletion: vi.fn(), withdraw: vi.fn() }));
vi.mock("../../core", () => ({ useResearch: () => session }));
vi.mock("../../ui/shells", () => ({ ResearchMemberShell: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("../../lib/capabilities", async (original) => ({ ...await original<object>(), fetchCapabilities: vi.fn(async () => new Map()) }));
vi.mock("../../adapters/member", () => ({
  getPrivacySummary: vi.fn(async () => ({ kind: "ok", data: { consents: [], media: [] } })),
  getResearchAgreements: vi.fn(async () => ({ kind: "ok", data: { agreements: [] } })),
  requestPrivacyCorrection: api.correction, requestPrivacyExport: api.export,
  requestPrivacyDeletion: api.deletion, withdrawResearchAgreement: api.withdraw,
}));
import PrivacyControls from "./PrivacyControls";

let root: Root, host: HTMLDivElement;
const tokenA = "synthetic-privacy-member";
const tokenB = "synthetic-privacy-member-b";
const originalDetail = "Correct the synthetic account address.";
const newerDetail = "Also correct the synthetic postal code.";
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
const field = () => host.querySelector<HTMLTextAreaElement>("#ra-correction-detail")!;
const card = () => field().closest(".card")!;
async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field(), value);
    field().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => card().querySelector<HTMLButtonElement>("button")!.click());
}
function CommitProbe({ observe }: { observe: () => void }) {
  useLayoutEffect(observe, [observe]);
  return null;
}

async function renderFor(token: string, observe?: () => void) {
  session.memberToken = token;
  await act(async () => root.render(<><PrivacyControls />{observe && <CommitProbe observe={observe} />}</>));
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  api.correction.mockReset();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await renderFor(tokenA);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("privacy correction receipt belongs to submitted text", () => {
  it("clears A's draft and receipt at the first committed render for B", async () => {
    api.correction.mockResolvedValueOnce({ kind: "ok", data: { ok: true } });
    await type(originalDetail); await submit(); await type(newerDetail);
    expect(card().textContent).toContain("Your earlier correction request was received.");

    const committed: Array<{ detail: string; text: string }> = [];
    await renderFor(tokenB, () => {
      committed.push({
        detail: host.querySelector<HTMLTextAreaElement>("#ra-correction-detail")?.value ?? "",
        text: host.textContent ?? "",
      });
    });
    expect(committed).toHaveLength(1);
    expect(committed[0].detail).toBe("");
    expect(committed[0].text).not.toContain("request was received");
    expect(field().value).toBe("");
    expect(api.correction).toHaveBeenCalledExactlyOnceWith(originalDetail, tokenA);
  });

  it("keeps B's draft separate when A's pending correction resolves late", async () => {
    const reply = deferred();
    api.correction.mockReturnValueOnce(reply.promise);
    await type(originalDetail); await submit();

    await renderFor(tokenB);
    await type(newerDetail);
    await act(async () => reply.resolve({ kind: "ok", data: { ok: true } }));
    expect(field().value).toBe(newerDetail);
    expect(card().textContent).not.toContain("request was received");
    expect(api.correction).toHaveBeenCalledExactlyOnceWith(originalDetail, tokenA);
  });

  it("sends one correction for two same-turn clicks and acknowledges only the submitted text", async () => {
    const reply = deferred();
    api.correction.mockReturnValueOnce(reply.promise).mockReturnValueOnce(reply.promise);
    await type("  " + originalDetail + "  ");
    const button = card().querySelector<HTMLButtonElement>("button")!;
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(button.disabled).toBe(false);
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(button.disabled).toBe(true);
    expect(api.correction).toHaveBeenCalledExactlyOnceWith(originalDetail, tokenA);

    await type(newerDetail);
    await act(async () => reply.resolve({ kind: "ok", data: { ok: true } }));
    expect(card().textContent).toContain("Your earlier correction request was received. Your newer edits have not been submitted.");
    expect(field().value).toBe(newerDetail);
    expect(api.correction).toHaveBeenCalledTimes(1);
  });

  it.each(["pending", "confirmed"])("does not claim newer edits were received when edited after %s submission", async (timing) => {
    const reply = deferred(); api.correction.mockReturnValueOnce(reply.promise);
    await type(originalDetail); await submit();
    if (timing === "confirmed") await act(async () => reply.resolve({ kind: "ok", data: { ok: true } }));
    await type(newerDetail);
    if (timing === "pending") await act(async () => reply.resolve({ kind: "ok", data: { ok: true } }));
    expect(field().value).toBe(newerDetail);
    expect(card().textContent).toContain("Your earlier correction request was received. Your newer edits have not been submitted.");
    expect(card().textContent).not.toContain("Your correction request was received. A person");
    expect(api.correction).toHaveBeenCalledExactlyOnceWith(originalDetail, session.memberToken);
    expect(api.export).not.toHaveBeenCalled(); expect(api.deletion).not.toHaveBeenCalled(); expect(api.withdraw).not.toHaveBeenCalled();
  });
  it("retains the normal receipt when current text equals the normalized submitted text", async () => {
    api.correction.mockResolvedValueOnce({ kind: "ok", data: { ok: true } });
    await type("  " + originalDetail + "  "); await submit();
    expect(card().textContent).toContain("Your correction request was received. A person");
    expect(card().textContent).not.toContain("newer edits");
    expect(api.correction).toHaveBeenCalledExactlyOnceWith(originalDetail, session.memberToken);
  });
  it("does not show a receipt for a failed request or send newer edits automatically", async () => {
    const reply = deferred(); api.correction.mockReturnValueOnce(reply.promise);
    await type(originalDetail); await submit(); await type(newerDetail);
    await act(async () => reply.resolve({ kind: "error", message: "Synthetic request failure." }));
    expect(field().value).toBe(newerDetail);
    expect(card().textContent).not.toContain("was received");
    expect(api.correction).toHaveBeenCalledTimes(1);
  });
  it("records the newer draft only after a fresh explicit submission", async () => {
    const reply = deferred(); api.correction.mockReturnValueOnce(reply.promise).mockResolvedValueOnce({ kind: "ok", data: { ok: true } });
    await type(originalDetail); await submit(); await type(newerDetail);
    await act(async () => reply.resolve({ kind: "ok", data: { ok: true } }));
    expect(api.correction).toHaveBeenCalledTimes(1);
    await submit();
    expect(api.correction).toHaveBeenCalledTimes(2);
    expect(api.correction.mock.calls[1]).toEqual([newerDetail, session.memberToken]);
    expect(card().textContent).toContain("Your correction request was received. A person");
    expect(card().textContent).not.toContain("newer edits");
  });
});
