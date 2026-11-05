// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestIntentEntry } from "./RequestIntentEntry";
const fixture = vi.hoisted(() => ({
  load: vi.fn(),
  props: null as null | { onAgreementStandingRequired?: () => void; continuationEnabled?: boolean },
}));
vi.mock("../core", () => ({ useResearch: () => ({ member: null, memberToken: null,
  memberChecking: false, recovery: "none", memberSessionStatus: "signed_out" }) }));
vi.mock("./request-intent-api", () => ({ createRequestIntentApi: () => ({}) }));
vi.mock("../early-access/orderEntryIntent", () => ({ orderEntryIntentFromSearch: () => null }));
vi.mock("../adapters/earlyAccessAgreement", () => ({ loadEarlyAccessAgreementState: fixture.load }));
vi.mock("./RequestIntentForm", () => ({ RequestIntentForm: (props: NonNullable<typeof fixture.props>) => {
  fixture.props = props;
  return <span>Request form test boundary</span>;
} }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  fixture.load.mockReset().mockResolvedValue({ kind: "accepted" }); fixture.props = null;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
describe("request entry standing refresh forwarding", () => {
  it("forwards embedded invalidation to the parent rather than reading separate standing", async () => {
    const parent = vi.fn();
    await act(async () => root.render(<RequestIntentEntry embedded continuationEnabled onAgreementStandingRequired={parent} />));
    expect(fixture.load).not.toHaveBeenCalled();
    expect(fixture.props?.onAgreementStandingRequired).toBe(parent);
    await act(async () => fixture.props?.onAgreementStandingRequired?.());
    expect(parent).toHaveBeenCalledTimes(1);
  });
  it("re-reads standalone standing and fails closed after a refusal", async () => {
    await act(async () => root.render(<RequestIntentEntry />));
    expect(fixture.props?.continuationEnabled).toBe(true);
    fixture.load.mockResolvedValueOnce({ kind: "required" });
    await act(async () => fixture.props?.onAgreementStandingRequired?.());
    expect(fixture.load).toHaveBeenCalledTimes(2);
    expect(fixture.props?.continuationEnabled).toBe(false);
  });
  it("keeps standalone continuation closed when the standing re-read fails", async () => {
    await act(async () => root.render(<RequestIntentEntry />));
    fixture.load.mockRejectedValueOnce(new Error("Synthetic transport failure"));
    await act(async () => fixture.props?.onAgreementStandingRequired?.());
    expect(fixture.props?.continuationEnabled).toBe(false);
  });
});
