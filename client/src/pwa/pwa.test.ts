// Static policy checks for the PWA slice (same source-reading idiom as
// App.routes.test.ts): the service worker's privacy rules, the manifest's
// installability, and the wiring are asserted from the artifacts themselves.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const swSource = readFileSync(
  resolve(__dirname, "../../public/sw.js"),
  "utf8",
);
const manifest = JSON.parse(
  readFileSync(resolve(__dirname, "../../public/site.webmanifest"), "utf8"),
);
const indexHtml = readFileSync(
  resolve(__dirname, "../../index.html"),
  "utf8",
);
const mainSource = readFileSync(resolve(__dirname, "../main.tsx"), "utf8");
const registerSource = readFileSync(resolve(__dirname, "register.ts"), "utf8");

describe("service worker privacy policy", () => {
  it("declares /api/ as never-cache and returns before any caching for it", () => {
    expect(swSource).toMatch(/NEVER_CACHE_PREFIXES\s*=\s*\["\/api\/"\]/);
    expect(swSource).toContain("if (isNeverCache(url)) return;");
  });

  it("ignores every non-GET request", () => {
    expect(swSource).toContain('if (request.method !== "GET") return;');
  });

  it("ignores cross-origin requests", () => {
    expect(swSource).toContain(
      "if (url.origin !== self.location.origin) return;",
    );
  });

  it("only caches static destinations, so JSON can never enter the cache", () => {
    expect(swSource).toMatch(
      /STATIC_DESTINATIONS\s*=\s*new Set\(\["style", "script", "font", "image"\]\)/,
    );
    expect(swSource).toContain("STATIC_DESTINATIONS.has(request.destination)");
  });

  it("versions its cache and deletes stale versions on activate", () => {
    expect(swSource).toMatch(/XENIOS_PWA_VERSION\s*=\s*"v\d+"/);
    expect(swSource).toContain("caches.delete(key)");
  });

  it("serves the offline shell only for navigations", () => {
    expect(swSource).toContain('request.mode === "navigate"');
    expect(swSource).toContain("caches.match(OFFLINE_URL)");
  });
});

describe("web app manifest installability", () => {
  it("carries the fields an install prompt requires", () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.id).toBe("/");
    expect(manifest.scope).toBe("/");
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("offers a maskable icon so Android does not letterbox the install", () => {
    const purposes = manifest.icons
      .map((icon: { purpose?: string }) => icon.purpose ?? "")
      .join(" ");
    expect(purposes).toContain("maskable");
  });
});

describe("wiring", () => {
  it("index.html links the manifest and the iOS A2HS metas", () => {
    expect(indexHtml).toContain('rel="manifest"');
    expect(indexHtml).toContain('name="apple-mobile-web-app-capable"');
    expect(indexHtml).toContain('name="apple-mobile-web-app-title"');
  });

  it("main.tsx registers the worker through the PROD-gated module", () => {
    expect(mainSource).toContain('from "./pwa/register"');
    expect(mainSource).toContain("registerXeniosPwa()");
    expect(registerSource).toContain("if (!import.meta.env.PROD) return;");
  });

  it("the offline shell exists and promises that nothing private is stored", () => {
    const offline = readFileSync(
      resolve(__dirname, "../../public/offline.html"),
      "utf8",
    );
    expect(offline).toContain("nothing private is stored");
  });
});

describe("lifecycle UX (update banner + install education)", () => {
  const lifecycle = readFileSync(
    resolve(__dirname, "PwaLifecycle.tsx"),
    "utf8",
  );

  it("is mounted beside App so no app surface is modified", () => {
    expect(mainSource).toContain('from "./pwa/PwaLifecycle"');
    expect(mainSource).toContain("<PwaLifecycle />");
  });

  it("listens for the update event and applies via the register module", () => {
    expect(lifecycle).toContain('"xenios:pwa-update-available"');
    expect(lifecycle).toContain("applyPwaUpdate(updateRegistration)");
  });

  it("captures beforeinstallprompt and only prompts on an explicit tap", () => {
    expect(lifecycle).toContain('"beforeinstallprompt"');
    expect(lifecycle).toContain("event.preventDefault()");
    expect(lifecycle).toContain("installPrompt.prompt()");
  });

  it("educates iOS Safari outside standalone mode with A2HS wording", () => {
    expect(lifecycle).toContain("Add to Home Screen");
    expect(lifecycle).toContain("isStandalone()");
    expect(lifecycle).toContain("isIosSafari()");
  });

  it("stores only a dismissal flag, in sessionStorage, never an identifier", () => {
    expect(lifecycle).toContain("sessionStorage");
    expect(lifecycle).not.toContain("localStorage");
    expect(lifecycle).toMatch(/DISMISS_KEY = "xenios-pwa-hint-dismissed"/);
  });
});
