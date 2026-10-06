import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");

// Source-contract coverage only. Rendered App, cold navigation and refresh
// need the separately scoped composition/browser qualification.
describe("the disabled Quick Order route contract", () => {
  it("mounts one exact Research module route with no session before the preserved Health redirect", () => {
    const imports = [...appSource.matchAll(/lazy\(\(\) => import\("@\/research\/quick-order\/QuickOrderPage"\)\)/g)];
    expect(imports).toHaveLength(1);
    const routes = [...appSource.matchAll(/<Route path="\/health\/quick-order">([^]*?)<\/Route>/g)];
    expect(routes).toHaveLength(1);
    expect(routes[0][1]).toContain('<QuickOrderPage sessionKey={null} />');
    expect(routes[0][1]).toContain('<Suspense');
    expect(routes[0][1]).not.toMatch(/intakeEnabled|transport=/);
    expect(appSource).not.toContain('path="/health/*"');
    const gateway = '<Route path="/health"><Redirect to="/" /></Route>';
    expect(appSource).toContain(gateway);
    expect(routes[0].index).toBeLessThan(appSource.indexOf(gateway));
  });
});

describe("the owner-approved clarity route map", () => {
  it.each([
    ["/", "Home"],
    ["/individuals", "IndividualsPage"],
    ["/products", "ProductsPage"],
    ["/practices", "PracticesPage"],
    ["/partners", "PartnersPage"],
    ["/suppliers", "SuppliersPage"],
    ["/quality", "QualityPage"],
    ["/faq", "FaqPage"],
    ["/support", "SupportPage"],
    ["/status", "StatusPage"],
    ["/sign-in", "SignInPage"],
    ["/activate", "ActivatePage"],
  ])("mounts %s through %s", (path, component) => {
    expect(appSource).toContain(`<Route path="${path}" component={${component}} />`);
  });

  it("moves the coach home to /workspace and redirects the old health gateway to root", () => {
    expect(appSource).toContain('<Route path="/workspace" component={WorkspaceHome} />');
    expect(appSource).toContain('<Route path="/health"><Redirect to="/" /></Route>');
  });

  it("preserves exact Research and Care authority subroutes", () => {
    expect(appSource).toContain('<Route path="/research/*" component={ResearchRoutes} />');
    expect(appSource).toContain('<Route path="/care" component={CareRoutes} />');
    expect(appSource).toContain('<Route path="/care/*" component={CareRoutes} />');
  });

  it("leaves the existing Research access hub to its section router instead of shadowing it with a home redirect", () => {
    expect(appSource).not.toContain('<Route path="/research/access-hub"><Redirect to="/" /></Route>');
    expect(appSource).toContain('<Route path="/research/*" component={ResearchRoutes} />');
    const sectionSource = readFileSync(resolve(__dirname, "research/section.tsx"), "utf8");
    expect(sectionSource).toContain('<Route path="/research/access-hub">{() => <L component={AccessHub} />}</Route>');
  });

  it("removes the legacy public partners and FAQ redirects", () => {
    expect(appSource).not.toContain('<Route path="/partners"><Redirect to="/ecosystem" /></Route>');
    expect(appSource).not.toContain('<Route path="/faq"><Redirect to="/product" /></Route>');
  });

  it("keeps the closed partner-application alias on the public inquiry journey", () => {
    expect(appSource).toContain('<Route path="/partners/apply"><Redirect to="/partners#inquiry" /></Route>');
    expect(appSource).not.toContain('<Route path="/partners/apply"><Redirect to="/research/partners/apply" /></Route>');
  });

  it("handles same-path fragment navigation through Wouter's pushState event", () => {
    expect(appSource).toContain('window.addEventListener("pushState", scrollForLocation);');
    expect(appSource).toContain('window.addEventListener("hashchange", scrollForLocation);');
    expect(appSource).toContain("target.scrollIntoView({ block: \"start\" });");
    expect(appSource).toContain("target.focus({ preventScroll: true });");
    expect(appSource).toContain('window.removeEventListener("pushState", scrollForLocation);');
  });
});

describe("the Admin dashboard bundle", () => {
  it("is lazy-loaded, not shipped eagerly in the main bundle", () => {
    expect(appSource).toContain('const Admin = lazy(() => import("@/pages/Admin"));');
    expect(appSource).not.toMatch(/^import Admin from "@\/pages\/Admin";/m);
  });

  it("mounts through a Suspense-wrapped route", () => {
    expect(appSource).toContain('<Route path="/admin" component={AdminRoutes} />');
    expect(appSource).toMatch(/function AdminRoutes\(\) \{\s*return \(\s*<Suspense[^]*?<Admin \/>/);
  });
});
