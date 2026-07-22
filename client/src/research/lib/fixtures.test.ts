// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { assertFixturesAllowed, devFixture, fixturesAllowed } from "./fixtures";

// The Supreme policy guard: fixtures must be impossible in production.
// Vite exposes import.meta.env as a mutable object under vitest, which lets
// us simulate the production build flag directly.

const env = import.meta.env as unknown as Record<string, unknown>;
const original = env.PROD;

afterEach(() => {
  env.PROD = original;
});

describe("fixture production guard", () => {
  it("allows fixtures outside production", () => {
    env.PROD = false;
    expect(fixturesAllowed()).toBe(true);
    expect(devFixture(() => 42)).toBe(42);
    expect(() => assertFixturesAllowed()).not.toThrow();
  });

  it("rejects fixtures in production: assert throws and devFixture yields null", () => {
    env.PROD = true;
    expect(fixturesAllowed()).toBe(false);
    expect(devFixture(() => 42)).toBeNull();
    expect(() => assertFixturesAllowed()).toThrow(/disabled in production/);
  });
});
