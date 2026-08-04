import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { careApiFetch } from "./api";
import {
  CARE_NO_TRANSMISSION_NOTICE,
  isCareSurfaceStorage,
  labelFor,
  loadCarePatientSurface,
  newIdempotencyKey,
  notServedExplanation,
  readStorage,
  recordCarePatientEntry,
  storageMissingExplanation,
} from "./patient-surface";

vi.mock("./api", () => ({ careApiFetch: vi.fn() }));

const careApiFetchMock = vi.mocked(careApiFetch);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const parseItems = (body: Record<string, unknown>) =>
  Array.isArray(body.items) ? { items: body.items } : null;

// Block bodies on purpose. An expression-bodied hook returns the mock, and a
// hook's return value is treated as a teardown callback, which would call the
// mock again after the test with nothing awaiting the promise it returns.
beforeEach(() => {
  careApiFetchMock.mockReset();
});
afterEach(() => {
  careApiFetchMock.mockReset();
});

describe("Care patient surface reads", () => {
  it("reports a contract with no handler as not served, never as an empty list", async () => {
    careApiFetchMock.mockResolvedValue(json({ message: "Not Found" }, 404));
    const state = await loadCarePatientSurface("/api/care/instructions", parseItems);
    expect(state).toEqual({ kind: "not_served", contract: "/api/care/instructions" });
  });

  it("separates unauthenticated, wrong role, and switched off", async () => {
    careApiFetchMock.mockResolvedValue(json({ ok: false, code: "care_auth_required" }, 401));
    expect((await loadCarePatientSurface("/api/care/supplies", parseItems)).kind).toBe(
      "auth_required",
    );

    careApiFetchMock.mockResolvedValue(json({ ok: false, code: "care_forbidden" }, 403));
    expect((await loadCarePatientSurface("/api/care/supplies", parseItems)).kind).toBe(
      "forbidden",
    );

    careApiFetchMock.mockResolvedValue(
      json({ ok: false, code: "care_disabled", message: "Care is being prepared." }, 503),
    );
    expect(await loadCarePatientSurface("/api/care/supplies", parseItems)).toEqual({
      kind: "disabled",
      message: "Care is being prepared.",
    });
  });

  it("treats a temporarily unavailable read as an error, not as a disabled rail", async () => {
    careApiFetchMock.mockResolvedValue(
      json({ ok: false, code: "care_temporarily_unavailable" }, 503),
    );
    expect((await loadCarePatientSurface("/api/care/support", parseItems)).kind).toBe("error");
  });

  it("refuses a body it cannot completely trust rather than believing part of it", async () => {
    careApiFetchMock.mockResolvedValue(json({ ok: true, items: "not-an-array" }));
    expect((await loadCarePatientSurface("/api/care/messages", parseItems)).kind).toBe("error");

    careApiFetchMock.mockResolvedValue(json({ ok: false, items: [] }));
    expect((await loadCarePatientSurface("/api/care/messages", parseItems)).kind).toBe("error");
  });

  it("fails closed when the request itself throws", async () => {
    careApiFetchMock.mockImplementation(async () => {
      throw new Error("network");
    });
    expect((await loadCarePatientSurface("/api/care/messages", parseItems)).kind).toBe("error");
  });

  it("treats an absent or malformed storage state as unknown, never as available", () => {
    expect(readStorage({}).available).toBe(false);
    expect(readStorage({ storage: { available: true } }).available).toBe(false);
    expect(readStorage({ storage: { available: true, missingTables: [7] } }).available).toBe(
      false,
    );
    expect(isCareSurfaceStorage({ available: true, missingTables: [] })).toBe(true);
    expect(
      readStorage({ storage: { available: false, missingTables: ["care_messages"] } }),
    ).toEqual({ available: false, missingTables: ["care_messages"] });
  });
});

describe("Care patient surface writes", () => {
  it("confirms a record only when a record came back", async () => {
    careApiFetchMock.mockResolvedValue(json({ ok: true, message: { id: "m1" } }, 201));
    expect(
      (
        await recordCarePatientEntry(
          "/api/care/messages",
          { body: "hello" },
          (body) => typeof (body.message as { id?: string })?.id === "string",
        )
      ).kind,
    ).toBe("recorded");

    careApiFetchMock.mockResolvedValue(json({ ok: true }, 201));
    expect(
      (
        await recordCarePatientEntry(
          "/api/care/messages",
          { body: "hello" },
          (body) => typeof (body.message as { id?: string })?.id === "string",
        )
      ).kind,
    ).toBe("error");
  });

  it("carries the named refusal for a record that cannot be held", async () => {
    careApiFetchMock.mockResolvedValue(
      json(
        {
          ok: false,
          code: "care_message_not_recorded",
          missingTables: ["care_messages"],
          message: "This message was not recorded and nobody will see it.",
        },
        503,
      ),
    );
    const state = await recordCarePatientEntry("/api/care/messages", {}, () => true);
    expect(state).toEqual({
      kind: "not_recorded",
      message: "This message was not recorded and nobody will see it.",
      missingTables: ["care_messages"],
    });
  });

  it("keeps a thread ownership refusal distinct from a permission refusal", async () => {
    careApiFetchMock.mockResolvedValue(
      json(
        {
          ok: false,
          code: "care_message_thread_not_owned",
          message: "This message was not recorded and nobody will see it.",
        },
        403,
      ),
    );
    expect((await recordCarePatientEntry("/api/care/messages", {}, () => true)).kind).toBe(
      "refused",
    );

    careApiFetchMock.mockResolvedValue(json({ ok: false, code: "care_forbidden" }, 403));
    expect((await recordCarePatientEntry("/api/care/messages", {}, () => true)).kind).toBe(
      "forbidden",
    );
  });

  it("reports a write to an unserved contract as not recorded", async () => {
    careApiFetchMock.mockResolvedValue(json({ message: "Not Found" }, 404));
    expect(await recordCarePatientEntry("/api/care/support", {}, () => true)).toEqual({
      kind: "not_served",
      contract: "/api/care/support",
    });
  });

  it("never treats a failed write as recorded", async () => {
    careApiFetchMock.mockImplementation(async () => {
      throw new Error("network");
    });
    expect((await recordCarePatientEntry("/api/care/support", {}, () => true)).kind).toBe(
      "error",
    );
  });

  it("sends a distinct idempotency key long enough for the served schema", () => {
    const first = newIdempotencyKey();
    const second = newIdempotencyKey();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(8);
    expect(first.length).toBeLessThanOrEqual(128);
  });
});

describe("Care patient surface wording", () => {
  it("says nothing is sent, in the browser rather than from a response", () => {
    expect(CARE_NO_TRANSMISSION_NOTICE).toContain("Nothing written here is sent anywhere");
    expect(CARE_NO_TRANSMISSION_NOTICE).toContain("nobody has been told it exists");
  });

  it("names the missing contract and refuses to read as an empty list", () => {
    const text = notServedExplanation("/api/care/supplies", "Your supplies");
    expect(text).toContain("/api/care/supplies");
    expect(text).toContain("this is not an empty list");
  });

  it("names the missing record and refuses to read as none", () => {
    const text = storageMissingExplanation(
      { available: false, missingTables: ["care_support_requests"] },
      "Your support requests",
    );
    expect(text).toContain("care_support_requests");
    expect(text).toContain("This does not mean you have none");
  });

  it("falls back rather than projecting a value it does not recognize", () => {
    expect(labelFor({ open: "Open" }, "open", "Unknown")).toBe("Open");
    expect(labelFor({ open: "Open" }, "SOMETHING_ELSE", "Unknown")).toBe("Unknown");
    expect(labelFor({ open: "Open" }, 7, "Unknown")).toBe("Unknown");
  });
});
