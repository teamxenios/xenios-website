// Static policy checks for the PWA slice (same source-reading idiom as
// App.routes.test.ts): the service worker's privacy rules, the manifest's
// installability, and the wiring are asserted from the artifacts themselves.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

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

type ServiceWorkerFetchEvent = {
  request: {
    method: string;
    url: string;
    mode: string;
    destination: string;
  };
  respondWith: ReturnType<typeof vi.fn>;
};

function evaluateServiceWorker() {
  const listeners = new Map<string, (event: ServiceWorkerFetchEvent) => void>();
  const fetchMock = vi.fn(() => Promise.resolve({ ok: true, type: "basic" }));
  const cacheMatch = vi.fn(() => Promise.resolve({ offline: true }));
  const context: Record<string, unknown> = {
    URL,
    decodeURI,
    fetch: fetchMock,
    caches: {
      open: vi.fn(() => Promise.resolve({ addAll: vi.fn(), put: vi.fn() })),
      keys: vi.fn(() => Promise.resolve([])),
      delete: vi.fn(() => Promise.resolve(true)),
      match: cacheMatch,
    },
    self: {
      location: { origin: "https://xenios.test" },
      clients: { claim: vi.fn() },
      skipWaiting: vi.fn(),
      addEventListener: (
        type: string,
        listener: (event: ServiceWorkerFetchEvent) => void,
      ) => listeners.set(type, listener),
    },
  };

  runInNewContext(swSource, context);

  return {
    fetchListener: listeners.get("fetch"),
    isCareNavigationPath: context.isCareNavigationPath as
      | ((pathname: string) => boolean)
      | undefined,
    fetchMock,
    cacheMatch,
  };
}

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

  it("classifies only canonical Care paths for network-only navigation", () => {
    const { isCareNavigationPath } = evaluateServiceWorker();
    expect(isCareNavigationPath).toBeTypeOf("function");

    for (const path of [
      "/care",
      "/CARE/",
      "/c%61re/schedule",
      "/care/portal",
    ]) {
      expect(isCareNavigationPath?.(path), path).toBe(true);
    }

    for (const path of [
      "/careers",
      "/api/care/status",
      "/care%2Fschedule",
      "/care/%ZZ",
      "/care//schedule",
      "/research",
    ]) {
      expect(isCareNavigationPath?.(path), path).toBe(false);
    }
  });

  it("never intercepts a Care navigation or supplies the generic offline shell", () => {
    const { fetchListener, fetchMock, cacheMatch } = evaluateServiceWorker();
    expect(fetchListener).toBeTypeOf("function");
    const respondWith = vi.fn();

    fetchListener?.({
      request: {
        method: "GET",
        url: "https://xenios.test/care/schedule",
        mode: "navigate",
        destination: "document",
      },
      respondWith,
    });

    expect(respondWith).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cacheMatch).not.toHaveBeenCalled();
  });

  it("keeps the generic offline fallback for an ordinary navigation", async () => {
    const { fetchListener, fetchMock, cacheMatch } = evaluateServiceWorker();
    const respondWith = vi.fn();
    fetchMock.mockRejectedValueOnce(new Error("offline"));

    fetchListener?.({
      request: {
        method: "GET",
        url: "https://xenios.test/research",
        mode: "navigate",
        destination: "document",
      },
      respondWith,
    });

    expect(respondWith).toHaveBeenCalledOnce();
    await expect(respondWith.mock.calls[0]?.[0]).resolves.toEqual({
      offline: true,
    });
    expect(cacheMatch).toHaveBeenCalledWith("/offline.html");
  });

  it("checks Care before the generic navigation fallback", () => {
    const careGuardIndex = swSource.indexOf(
      'request.mode === "navigate" && isCareNavigationPath(url.pathname)',
    );
    const genericNavigationIndex = swSource.indexOf(
      'if (request.mode === "navigate") {',
    );

    expect(careGuardIndex).toBeGreaterThan(-1);
    expect(careGuardIndex).toBeLessThan(genericNavigationIndex);
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
