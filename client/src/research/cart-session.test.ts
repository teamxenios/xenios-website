// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  LEGACY_RESEARCH_CART_STORAGE_KEY,
  RESEARCH_CART_SESSION_KEY,
  clearResearchCartStorage,
  readResearchCartForScope,
  writeResearchCartForScope,
} from "./cart-session";

const MEMBER_A = "a".repeat(64);
const MEMBER_B = "b".repeat(64);

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("member-scoped Research cart persistence", () => {
  it("restores only the same verified member scope", () => {
    expect(writeResearchCartForScope(sessionStorage, MEMBER_A, [
      { slug: "research-item", quantity: 2 },
    ], localStorage)).toBe(true);
    expect(readResearchCartForScope(sessionStorage, MEMBER_A, localStorage)).toEqual([
      { slug: "research-item", quantity: 2 },
    ]);

    expect(readResearchCartForScope(sessionStorage, MEMBER_B, localStorage)).toEqual([]);
    expect(sessionStorage.getItem(RESEARCH_CART_SESSION_KEY)).toBeNull();
  });

  it("purges the legacy global localStorage cart instead of migrating it", () => {
    localStorage.setItem(
      LEGACY_RESEARCH_CART_STORAGE_KEY,
      JSON.stringify([{ slug: "other-members-selection", quantity: 1 }]),
    );
    expect(readResearchCartForScope(sessionStorage, MEMBER_A, localStorage)).toEqual([]);
    expect(localStorage.getItem(LEGACY_RESEARCH_CART_STORAGE_KEY)).toBeNull();
  });

  it("rejects malformed scopes, duplicate lines, quantities, and extra fields", () => {
    expect(writeResearchCartForScope(sessionStorage, "member-a", [], localStorage)).toBe(false);
    for (const items of [
      [{ slug: "x", quantity: 0 }],
      [{ slug: "x", quantity: 1 }, { slug: "x", quantity: 2 }],
      [{ slug: "../private", quantity: 1 }],
      [{ slug: "x", quantity: 1, customer: "someone" }],
    ]) {
      sessionStorage.setItem(
        RESEARCH_CART_SESSION_KEY,
        JSON.stringify({ version: 2, scope: MEMBER_A, items }),
      );
      expect(readResearchCartForScope(sessionStorage, MEMBER_A, localStorage)).toEqual([]);
      expect(sessionStorage.getItem(RESEARCH_CART_SESSION_KEY)).toBeNull();
    }
  });

  it("clears both member-scoped and legacy stores on an identity boundary", () => {
    sessionStorage.setItem(RESEARCH_CART_SESSION_KEY, "private-cart");
    sessionStorage.setItem(LEGACY_RESEARCH_CART_STORAGE_KEY, "legacy-session-cart");
    localStorage.setItem(LEGACY_RESEARCH_CART_STORAGE_KEY, "legacy-local-cart");
    clearResearchCartStorage(sessionStorage, localStorage);
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });
});
