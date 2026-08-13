// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveAuthenticatedLanding,
  setAuthenticatedExperience,
} from "./authenticatedLanding";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        ok: true,
        destination: "/admin",
        defaultExperience: "admin",
        selectedExperience: "admin",
        availableExperiences: ["admin"],
        primaryAdminRole: "super_admin",
        persistedPreference: null,
      }),
    })),
  );
});

describe("authenticated landing adapter", () => {
  it("resolves identity using only the bearer token and server endpoint", async () => {
    await resolveAuthenticatedLanding("signed-token");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/research/auth/landing",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer signed-token" },
      }),
    );
    expect(JSON.stringify(vi.mocked(globalThis.fetch).mock.calls)).not.toContain(
      "samuel@",
    );
  });

  it("persists an intentional member preference through the server", async () => {
    await setAuthenticatedExperience("signed-token", "member");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/research/auth/experience",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer signed-token",
        },
        body: JSON.stringify({ experience: "member" }),
      }),
    );
  });
});

