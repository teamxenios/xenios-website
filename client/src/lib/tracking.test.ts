// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// Tracking isolation (PR #25 correction pass, blocker 1): third-party
// tracking must never initialize under /research or while a Supabase
// recovery hash is present, and no event may carry a URL, hash, or token.

const cfg = vi.hoisted(() => ({
  value: { metaPixelId: "PIXEL123", turnstileSiteKey: "", calendlyUrl: "", supabaseUrl: "", supabaseAnonKey: "" } as any,
}));

vi.mock("./config", () => ({ getConfig: async () => cfg.value }));

async function freshTracking() {
  vi.resetModules();
  return await import("./tracking");
}

function setLocation(path: string, hash = "") {
  window.history.replaceState(null, "", path + hash);
}

function pixelScripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll("script")).filter((s) => s.src.includes("fbevents")) as HTMLScriptElement[];
}

beforeEach(() => {
  document.querySelectorAll("script").forEach((s) => s.remove());
  delete (window as any).fbq;
  delete (window as any)._fbq;
  setLocation("/");
  // The pixel snippet inserts before the first existing script tag.
  document.head.appendChild(document.createElement("script"));
});

describe("initTracking is a no-op on the private Research surface", () => {
  it("no-op on /research/reset-password: no Meta script node, no fbq, no PageView", async () => {
    setLocation("/research/reset-password");
    const t = await freshTracking();
    await t.initTracking();
    expect(pixelScripts()).toHaveLength(0);
    expect(window.fbq).toBeUndefined();
  });

  it("no-op on any /research/* path and on /research itself", async () => {
    for (const path of ["/research", "/research/apply", "/research/member", "/research/apply/status"]) {
      setLocation(path);
      const t = await freshTracking();
      await t.initTracking();
      expect(pixelScripts()).toHaveLength(0);
      expect(window.fbq).toBeUndefined();
    }
  });

  it("no-op when a recovery hash is present, even on a marketing path", async () => {
    setLocation("/", "#access_token=abc&refresh_token=def&type=recovery");
    const t = await freshTracking();
    await t.initTracking();
    expect(pixelScripts()).toHaveLength(0);
    expect(window.fbq).toBeUndefined();
    // The hash was only read, never stripped: Supabase must still consume it.
    expect(window.location.hash).toContain("type=recovery");
  });

  it("no-op on case-variant AND percent-encoded research URLs (wouter matches the decoded, case-folded path)", async () => {
    for (const path of [
      "/Research",
      "/RESEARCH/member",
      "/Research/reset-password",
      "/reSearch/apply",
      "/%72esearch/member", // %72 = r
      "/%52esearch", // %52 = R
      "/resea%72ch/apply",
    ]) {
      setLocation(path);
      const t = await freshTracking();
      await t.initTracking();
      expect(pixelScripts()).toHaveLength(0);
      expect(window.fbq).toBeUndefined();
    }
  });

  it("re-checks after the config fetch: an SPA navigation into /research during the await still blocks injection", async () => {
    setLocation("/");
    // Config resolves only after we have navigated into research.
    let resolveCfg: (v: any) => void = () => {};
    cfg.value = new Promise((r) => { resolveCfg = r; }) as any;
    // getConfig returns cfg.value; make it await the pending promise.
    const t = await freshTracking();
    const pending = t.initTracking();
    setLocation("/research/member"); // user clicks the Research SPA link mid-await
    resolveCfg({ metaPixelId: "PIXEL123" });
    await pending;
    expect(pixelScripts()).toHaveLength(0);
    expect(window.fbq).toBeUndefined();
    cfg.value = { metaPixelId: "PIXEL123" };
  });
});

describe("positive control and event hygiene", () => {
  it("initializes on a marketing path and emits ONLY init + PageView, never a URL or hash", async () => {
    setLocation("/");
    const t = await freshTracking();
    await t.initTracking();
    expect(pixelScripts()).toHaveLength(1);
    expect(window.fbq).toBeTypeOf("function");
    const queued = (window.fbq as any).queue.map((args: IArguments) => Array.from(args));
    expect(queued).toEqual([
      ["init", "PIXEL123"],
      ["track", "PageView"],
    ]);
    expect(JSON.stringify(queued)).not.toMatch(/http|#|access_token|recovery|@/);
  });

  it("track() is suppressed under /research even when the pixel is already loaded (SPA navigation)", async () => {
    setLocation("/");
    const t = await freshTracking();
    const fbq = vi.fn();
    (window as any).fbq = fbq;
    setLocation("/research/member");
    t.track("Lead");
    t.trackPageView();
    expect(fbq).not.toHaveBeenCalled();
    setLocation("/concepts");
    t.track("Lead");
    expect(fbq).toHaveBeenCalledTimes(1);
  });
});
