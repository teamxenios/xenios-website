// @vitest-environment jsdom
// Actual route; child test doubles isolate refresh/remount/callback semantics.
// The actual mixed-form refusal/marker tests are appended to RequestIntentForm.test.tsx.
import { act, useEffect, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EarlyAccessRoute from "./EarlyAccessRoute";

type AgreementCallbacks = {
  onAccepted?: (accepted: boolean) => void;
  onBlocked?: (reason: "unverified" | "locked" | null) => void;
};
const observations = vi.hoisted(() => ({
  agreement: [] as AgreementCallbacks[], formMounts: 0, formUnmounts: 0,
}));
vi.mock("@/components/SeoHead", () => ({ default: () => null }));
vi.mock("@/lib/motion", () => ({ scrollToTopRespectingMotion: vi.fn() }));
vi.mock("../assisted-order/AssistedOrderCta", () => ({ useAssistedOrderBridgeState: () => ({ kind: "enabled" }) }));
vi.mock("../assisted-order/order-request-mode", () => ({
  readOrderRequestContinuity: () => "none", useOrderRequestMode: () => ({ kind: "mixed" }),
}));
vi.mock("./orderEntryIntent", () => ({ orderEntryIntentFromSearch: () => null }));
vi.mock("./EarlyAccessUnlockForm", () => ({ EarlyAccessUnlockForm: () => null }));
vi.mock("./EarlyAccessStepper", () => ({ EarlyAccessStepper: () => null }));
vi.mock("./EarlyAccessCatalogSection", () => ({ EarlyAccessCatalogSection: () => null }));
vi.mock("./EarlyAccessCheckoutJourney", () => ({
  EarlyAccessCheckoutJourney: () => null, EarlyAccessOrderRecoveryCard: () => null,
}));
vi.mock("./pendingOrderStore", () => ({
  clearLastOrderNumber: vi.fn(), clearPendingAttempt: vi.fn(), readLastOrderNumber: () => null,
}));
vi.mock("../assisted-order/storage", () => ({ clearAssistedOrderStorage: vi.fn() }));
vi.mock("./cart/cartStore", () => ({ clearBrowserCart: vi.fn() }));
vi.mock("./cart/cartAttemptStore", () => ({ clearCartRecovery: vi.fn() }));
vi.mock("./cart/EarlyAccessCartMount", () => ({ EarlyAccessCartMount: ({ fallback }: { fallback: ReactNode }) => fallback }));
vi.mock("./fulfillment-copy", () => ({ EARLY_ACCESS_FULFILLMENT_TARGET_COPY: "Synthetic" }));
vi.mock("./customerSteps", () => ({
  EARLY_ACCESS_CUSTOMER_STEP_LABELS: ["Products", "Contact", "Review"], earlyAccessCustomerStepIndex: () => 0,
}));
vi.mock("./EarlyAccessAgreementSection", () => ({
  EarlyAccessAgreementSection: (props: AgreementCallbacks) => {
    useEffect(() => { observations.agreement.push(props); }, []);
    return <div data-testid="synthetic-policy-panel">Policy panel</div>;
  },
}));
vi.mock("../assisted-order/OrderRequestEntry", () => ({
  OrderRequestCta: () => null,
  ClosedIntakeRequestReceipt: ({ fallback }: { fallback: ReactNode }) => fallback,
  OrderRequestEntry: (props: { continuationEnabled?: boolean; onAgreementStandingRequired?: () => void }) => {
    const [draft, setDraft] = useState("");
    useEffect(() => { observations.formMounts += 1; return () => { observations.formUnmounts += 1; }; }, []);
    return <div>
      <input aria-label="Synthetic retained draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
      <button onClick={() => props.onAgreementStandingRequired?.()}>Simulate proven agreement refusal</button>
      <button disabled={!props.continuationEnabled}>Synthetic continue</button>
    </div>;
  },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  observations.agreement.length = 0;
  observations.formMounts = 0; observations.formUnmounts = 0;
  sessionStorage.clear();
  window.history.replaceState({}, "", "/research/early-access/order-request");
  vi.stubGlobal("fetch", vi.fn(async (path: RequestInfo | URL) => {
    if (String(path) !== "/api/research/early-access/session") throw new Error("Unexpected network path: " + String(path));
    return { ok: true, status: 200, json: async () => ({ authenticated: true, expiresAt: null }) } as Response;
  }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); sessionStorage.clear(); });
function button(label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find((element) => element.textContent === label);
  if (!found) throw new Error("Missing button: " + label);
  return found;
}
async function mount() {
  await act(async () => { root.render(<EarlyAccessRoute requestOnly />); });
}

describe("Early Access policy refresh boundary", () => {
  it("remounts only policy, preserving the request draft and requiring fresh standing", async () => {
    await mount();
    expect(observations.agreement).toHaveLength(1);
    const old = observations.agreement[0];
    await act(async () => old.onAccepted?.(true));
    expect(button("Synthetic continue").disabled).toBe(false);
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Synthetic retained draft"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Synthetic draft only");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("Simulate proven agreement refusal").click());
    expect(observations.agreement).toHaveLength(2);
    expect(button("Synthetic continue").disabled).toBe(true);
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Synthetic retained draft"]')?.value).toBe("Synthetic draft only");
    expect(observations.formMounts).toBe(1);
    expect(observations.formUnmounts).toBe(0);
    // A delayed response from the destroyed policy view cannot reopen continuation.
    await act(async () => { old.onAccepted?.(true); old.onBlocked?.("locked"); });
    expect(button("Synthetic continue").disabled).toBe(true);
    const current = observations.agreement[1];
    await act(async () => { current.onBlocked?.(null); current.onAccepted?.(true); });
    expect(button("Synthetic continue").disabled).toBe(false);
    await act(async () => { old.onAccepted?.(false); old.onBlocked?.("locked"); });
    expect(button("Synthetic continue").disabled).toBe(false);
    expect(observations.formMounts).toBe(1);
  });

  it("does not change the policy key on an ordinary parent re-render", async () => {
    await mount();
    const first = observations.agreement[0];
    await act(async () => first.onAccepted?.(true));
    await act(async () => root.render(<EarlyAccessRoute requestOnly />));
    expect(observations.agreement).toHaveLength(1);
    expect(observations.formMounts).toBe(1);
  });

  it("fences every older generation, not just the immediately previous one", async () => {
    await mount();
    const first = observations.agreement[0];
    await act(async () => button("Simulate proven agreement refusal").click());
    const second = observations.agreement[1];
    await act(async () => button("Simulate proven agreement refusal").click());
    await act(async () => { first.onAccepted?.(true); second.onAccepted?.(true); });
    expect(button("Synthetic continue").disabled).toBe(true);
    await act(async () => observations.agreement[2].onAccepted?.(true));
    expect(button("Synthetic continue").disabled).toBe(false);
    expect(observations.formMounts).toBe(1);
  });
});
