// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestIntentApi } from "./request-intent-api";
import { linkedRequestReference, RequestIntentStaffReadback } from "./RequestIntentStaffReadback";
vi.mock("./assisted-order.css", () => ({ default: {} }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REFERENCE = "XRI-30000000000040008000000000000001";

function api() {
  return {
    config: vi.fn(async () => ({ legal: [], form: [] })),
    catalog: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 24, families: [], channels: [], workflowModes: [] })),
    submit: vi.fn(async () => null), recover: vi.fn(async () => null),
    staff: vi.fn(async () => { throw new Error("not read in this test"); }),
    staffQueue: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 25 })),
  } satisfies RequestIntentApi;
}

let host: HTMLDivElement, root: Root;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  window.history.replaceState(null, "", "/");
});

describe("staff notice link", () => {
  it("accepts only one well-formed request reference", () => {
    expect(linkedRequestReference("?reference=" + REFERENCE.toLowerCase())).toBe(REFERENCE);
    expect(linkedRequestReference("?reference=%20" + REFERENCE + "%20")).toBe(REFERENCE);
    for (const search of ["", "?reference=", "?reference=XRI-123", "?reference=" + REFERENCE + "0",
      "?ref=" + REFERENCE, "?reference=<script>", "?reference=" + REFERENCE + "&reference=" + REFERENCE]) {
      expect(linkedRequestReference(search)).toBe("");
    }
  });

  it("opens the linked request through the authorized staff API", async () => {
    window.history.replaceState(null, "", "/care/request-intents?reference=" + REFERENCE);
    const fake = api();
    await act(async () => root.render(<RequestIntentStaffReadback api={fake} />));
    const input = host.querySelector("form input") as HTMLInputElement;
    expect(input.value).toBe(REFERENCE);
    expect(fake.staff).toHaveBeenCalledTimes(1);
    expect(fake.staff).toHaveBeenCalledWith("30000000-0000-4000-8000-000000000001");
    expect(host.textContent).toContain("Private request access could not be confirmed.");
  });
});
