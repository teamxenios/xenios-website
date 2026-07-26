import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Care PR1 shared integration wiring", () => {
  const serverSource = readFileSync(resolve(__dirname, "../index.ts"), "utf8");
  const appSource = readFileSync(
    resolve(__dirname, "../../client/src/App.tsx"),
    "utf8",
  );
  const navbarSource = readFileSync(
    resolve(__dirname, "../../client/src/components/Navbar.tsx"),
    "utf8",
  );

  it("registers the production Care API before the API and SPA fallbacks", () => {
    const registration = serverSource.indexOf(
      "registerCareApi(app, buildCareProductionDependencies())",
    );
    const apiFallback = serverSource.indexOf('app.use("/api/{*rest}"');
    const productionSpa = serverSource.indexOf("serveStatic(app)");
    const developmentSpa = serverSource.indexOf("setupVite(");

    expect(serverSource).toContain("app.use(carePageGate)");
    expect(registration).toBeGreaterThan(-1);
    expect(registration).toBeLessThan(apiFallback);
    expect(registration).toBeLessThan(productionSpa);
    expect(registration).toBeLessThan(developmentSpa);
  });

  it("mounts both the exact and nested Care client routes", () => {
    expect(appSource).toContain(
      'const CareSection = lazy(() => import("@/care/section"))',
    );
    expect(appSource).toContain(
      '<Route path="/care" component={CareRoutes} />',
    );
    expect(appSource).toContain(
      '<Route path="/care/*" component={CareRoutes} />',
    );
  });

  it("keeps the desktop call to action hidden at mobile breakpoints", () => {
    expect(navbarSource).toContain(
      'className="btn btn-primary !hidden sm:!inline-flex"',
    );
    expect(navbarSource).not.toContain(
      'className="btn btn-primary hidden sm:inline-flex"',
    );
  });
});
