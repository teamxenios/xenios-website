import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import type { MemberRow } from "../member-auth";
import { InMemoryKrisCatalogSource } from "./dataset-reader";
import { buildKrisCatalogProductionDependencies } from "./production";
import { krisProduct, pricedAt } from "./test-fixtures";

const ACTIVE_MEMBER: MemberRow = {
  id: "11111111-2222-3333-4444-555555555555",
  application_id: "application-1",
  auth_user_id: "auth-1",
  email: "info@romanhealthcollective.com",
  first_name: "Kris",
  status: "active",
  created_at: "2026-08-13T00:00:00.000Z",
};

describe("Kris Launch A production composition", () => {
  it("derives the viewer only from the canonical active-member resolver", async () => {
    const resolve = vi.fn(() => ACTIVE_MEMBER);
    const dependencies = buildKrisCatalogProductionDependencies(resolve, {
      env: { RESEARCH_KRIS_LAUNCH_A_ENABLED: "true" },
      source: new InMemoryKrisCatalogSource([]),
    });
    const request = { headers: {}, query: { memberId: "attacker" } } as unknown as Request;

    await expect(dependencies.authorizeViewer(request)).resolves.toEqual({
      audience: "member",
      email: ACTIVE_MEMBER.email,
      memberId: ACTIVE_MEMBER.id,
    });
    expect(resolve).toHaveBeenCalledWith(request);
  });

  it("fails closed when canonical member auth resolves no active member", async () => {
    const dependencies = buildKrisCatalogProductionDependencies(() => null, {
      source: new InMemoryKrisCatalogSource([]),
    });
    await expect(dependencies.authorizeViewer({} as Request)).resolves.toBeNull();
  });

  it("turns a missing artifact into service unavailability, never an empty catalog", () => {
    const dependencies = buildKrisCatalogProductionDependencies(() => ACTIVE_MEMBER, {
      source: null,
    });
    expect(() =>
      dependencies.serviceForProfile("KRIS_VOLUME_PARTNER", {
        audience: "member",
        email: ACTIVE_MEMBER.email,
        memberId: ACTIVE_MEMBER.id,
      }),
    ).toThrow(/artifact is unavailable/);
  });

  it("creates a request service over the shared indexed source", () => {
    const product = krisProduct();
    const source = new InMemoryKrisCatalogSource(
      [product],
      new Map([[product.id, pricedAt(8800)]]),
    );
    const dependencies = buildKrisCatalogProductionDependencies(() => ACTIVE_MEMBER, { source });
    const service = dependencies.serviceForProfile("KRIS_VOLUME_PARTNER", {
      audience: "member",
      email: ACTIVE_MEMBER.email,
      memberId: ACTIVE_MEMBER.id,
    });
    expect(service).toBeDefined();
  });
});
