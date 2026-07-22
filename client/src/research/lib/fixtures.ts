// Typed development fixtures with a hard production guard (Supreme build
// policy: fixtures exist for tests, local development, and explicit fixture
// mode ONLY; production must reject fixture mode entirely). Synthetic member
// health data must never render in production.

export function fixturesAllowed(): boolean {
  // Vite statically replaces import.meta.env.PROD at build time; in the
  // production bundle this function is a constant `false` on the fixture
  // path, so no fixture module can activate regardless of flags or URLs.
  if (import.meta.env.PROD) return false;
  return true;
}

export function assertFixturesAllowed(): void {
  if (!fixturesAllowed()) {
    throw new Error("Research fixtures are disabled in production");
  }
}

// A fixture-backed value for development, an honest `null` in production.
// Callers must render a pending/unavailable state for `null`, never invent.
export function devFixture<T>(make: () => T): T | null {
  if (!fixturesAllowed()) return null;
  return make();
}
