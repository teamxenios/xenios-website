// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Route, Router } from "wouter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { careApiFetch } from "./api";
import EligibilityPendingPage from "./EligibilityPendingPage";

vi.mock("./api", () => ({
  careApiFetch: vi.fn(),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const careApiFetchMock = vi.mocked(careApiFetch);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  careApiFetchMock.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// The decision that makes the page render its state-code form.
const locationRequired = {
  ok: true,
  decision: {
    outcome: "unavailable",
    reason: "location_required",
    stateCode: null,
  },
};

const path = "/care/eligibility";
const staticLocation = (): [string, (next: string) => void] => [
  path,
  () => undefined,
];
const staticSearch = () => "";

async function settle() {
  await act(async () => {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
  });
}

async function renderLocationForm() {
  careApiFetchMock.mockImplementation(async () => json(locationRequired));
  await act(async () => {
    root.render(
      <Router hook={staticLocation} searchHook={staticSearch} ssrPath={path}>
        <Route path={path}>
          <EligibilityPendingPage />
        </Route>
      </Router>,
    );
  });
  await settle();
  const input = container.querySelector<HTMLInputElement>("#care-state-code");
  const form = container.querySelector("form");
  if (!input || !form) throw new Error("location form did not render");
  return { input, form };
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("Care eligibility state-code validation is tied to its field", () => {
  it("marks the input invalid and describes it with the message", async () => {
    const { input, form } = await renderLocationForm();

    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(input.getAttribute("aria-describedby")).toBe("care-state-help");

    await act(async () => {
      type(input, "X");
    });
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    const error = container.querySelector("#care-state-error");
    expect(error?.textContent).toContain(
      "Enter the two-letter code for your current state.",
    );
    expect(error?.getAttribute("role")).toBe("alert");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    // The field points at its own error first, then the standing help text, so
    // a screen reader reads the problem before the instruction.
    expect(input.getAttribute("aria-describedby")).toBe(
      "care-state-error care-state-help",
    );
    // The message sits inside the form, next to the input it is about.
    expect(form.contains(error)).toBe(true);
  });

  it("never submits an invalid state code", async () => {
    const { input, form } = await renderLocationForm();
    const callsAfterLoad = careApiFetchMock.mock.calls.length;

    await act(async () => {
      type(input, "X");
    });
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(careApiFetchMock.mock.calls.length).toBe(callsAfterLoad);
    expect(
      careApiFetchMock.mock.calls.some(
        ([path]) => typeof path === "string" && path.includes("/location"),
      ),
    ).toBe(false);
  });

  it("clears the error and the invalid state once the field is edited", async () => {
    const { input, form } = await renderLocationForm();

    await act(async () => {
      type(input, "X");
    });
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(container.querySelector("#care-state-error")).not.toBeNull();

    await act(async () => {
      type(input, "TX");
    });

    expect(container.querySelector("#care-state-error")).toBeNull();
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(input.getAttribute("aria-describedby")).toBe("care-state-help");
  });

  it("keeps a request failure as a separate action-level announcement", async () => {
    const { input, form } = await renderLocationForm();

    careApiFetchMock.mockImplementation(async (path) => {
      if (typeof path === "string" && path.includes("/location")) {
        return json({ ok: false }, 500);
      }
      return json(locationRequired);
    });

    await act(async () => {
      type(input, "TX");
    });
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    // A valid code is not a field error, so the field stays valid.
    expect(container.querySelector("#care-state-error")).toBeNull();
    expect(input.getAttribute("aria-invalid")).toBeNull();

    const alerts = Array.from(
      container.querySelectorAll('[role="alert"]'),
      (node) => node.textContent ?? "",
    );
    expect(alerts.join(" ")).toContain("Nothing was submitted. Try again.");
  });
});
