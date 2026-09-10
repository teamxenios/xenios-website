/** Chromium CDP pipe driver. No guessed evidence-library exports or public debug socket. */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, isAbsolute } from "node:path";
import type { Readable, Writable } from "node:stream";
import { fail, objectOf, originOf } from "./managed-runtime";

type Message = { id?: number; method?: string; params?: Record<string, any>; sessionId?: string; result?: any; error?: unknown };
export class CdpPipe {
  private seq = 0; private buffer = Buffer.alloc(0); private closed = false;
  private pending = new Map<number, { method: string; resolve(v: any): void; reject(e: Error): void; timer: ReturnType<typeof setTimeout> }>();
  onEvent: (m: Message) => void = () => {};
  constructor(private readonly output: Writable, input: Readable) {
    input.on("data", (data: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, data]);
      if (this.buffer.length > 8_000_000) { this.close(); return; }
      for (;;) {
        const index = this.buffer.indexOf(0); if (index < 0) break;
        const raw = this.buffer.subarray(0, index); this.buffer = this.buffer.subarray(index + 1);
        let m: Message; try { m = JSON.parse(raw.toString("utf8")); } catch { this.close(); return; }
        if (typeof m.id === "number") {
          const p = this.pending.get(m.id); if (!p) continue;
          this.pending.delete(m.id); clearTimeout(p.timer);
          // Method and numeric protocol code are safe diagnostics; parameters
          // and raw protocol messages can carry payment secrets and stay private.
          const protocol = objectOf(m.error);
          m.error ? p.reject(new Error(`cdp_command_failed:${p.method}:${typeof protocol?.code === "number" ? protocol.code : "unknown"}`)) : p.resolve(m.result);
        } else this.onEvent(m);
      }
    });
    input.on("error", () => this.close()); input.on("end", () => this.close());
    output.on("error", () => this.close());
  }
  send(method: string, params: object = {}, sessionId?: string, timeout = 10000): Promise<any> {
    if (this.closed) return Promise.reject(new Error("cdp_closed"));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("cdp_timeout")); }, timeout);
      this.pending.set(id, { method, resolve, reject, timer });
      this.output.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0", error => {
        if (!error) return;
        const p = this.pending.get(id); if (p) { clearTimeout(p.timer); this.pending.delete(id); p.reject(new Error("cdp_write_failed")); }
      });
    });
  }
  close(): void {
    if (this.closed) return; this.closed = true;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error("cdp_closed")); }
    this.pending.clear();
  }
}
export function browserUrlAllowed(raw: string, origins: ReadonlySet<string>): boolean {
  if (raw === "about:blank") return true;
  try { const u = new URL(raw); return !u.username && !u.password && ["https:", "http:"].includes(u.protocol) && origins.has(u.origin); }
  catch { return false; }
}
const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export interface ChallengeInput {
  chromePath: string; appOrigin: string; approvedOrigins: readonly string[];
  publishableKey: string; clientSecret: string;
  selector?: string; timeoutMs?: number;
  /** Only for constrained LOCAL browser tests. Never set by the normal managed launcher. */
  localTestNoSandbox?: boolean;
}
export type AuthenticationExpectation = "challenge" | "no_challenge";
export function assertAuthenticationOutcome(expectation: AuthenticationExpectation, challengeObserved: boolean, trustedInputEvents: number, status: unknown): void {
  if (expectation === "challenge" && (!challengeObserved || trustedInputEvents < 3)) fail("authentication_completed_without_observed_challenge");
  if (expectation === "no_challenge" && (challengeObserved || trustedInputEvents !== 0)) fail("unexpected_authentication_challenge");
  if (!["requires_capture", "succeeded"].includes(String(status))) fail("browser_auth_outcome_not_authorized");
}
export async function driveStripeChallenge(input: ChallengeInput) {
  return driveStripeAuthentication(input, "challenge");
}
export async function driveStripeNoChallenge(input: ChallengeInput) {
  return driveStripeAuthentication(input, "no_challenge");
}
async function driveStripeAuthentication(input: ChallengeInput, expectation: AuthenticationExpectation): Promise<{ challengeObserved: boolean; trustedInputEvents: number; blockedOrigins: string[] }> {
  if (!isAbsolute(input.chromePath) || !/^pk_test_[A-Za-z0-9]{8,}$/.test(input.publishableKey) ||
      !/^pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+$/.test(input.clientSecret)) fail("challenge_configuration_invalid");
  const app = originOf(input.appOrigin, true);
  const approved = new Set([app, ...input.approvedOrigins.map(x => originOf(x))]);
  const selector = input.selector ?? "#test-source-authorize-3ds";
  if (!selector || selector.length > 200) fail("challenge_selector_invalid");
  const timeout = input.timeoutMs ?? 90000;
  if (!Number.isSafeInteger(timeout) || timeout < 100 || timeout > 180000) fail("challenge_timeout_invalid");
  const profile = await mkdtemp(join(tmpdir(), "xenios-qa-browser-"));
  let child: ChildProcess | null = null; let cdp: CdpPipe | null = null;
  let fatal: Error | null = null;
  const sessions = new Map<string, { targetId: string; ready: boolean; contexts: Set<number> }>();
  const blockedOrigins = new Set<string>();
  try {
    child = spawn(input.chromePath, ["--headless=new", "--remote-debugging-pipe", `--user-data-dir=${profile}`,
      "--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions",
      "--disable-default-apps", "--no-first-run", "--no-default-browser-check", "--disable-dev-shm-usage",
      ...(input.localTestNoSandbox ? ["--no-sandbox"] : []), "about:blank"],
      { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"], detached: false });
    child.once("error", () => { fatal = new Error("browser_start_failed"); });
    child.once("exit", () => { fatal ??= new Error("browser_exited"); cdp?.close(); });
    cdp = new CdpPipe(child.stdio[3] as Writable, child.stdio[4] as Readable);
    const pipe = cdp;
    const configure = async (sid: string, target: any) => {
      const session = { targetId: String(target.targetId), ready: false, contexts: new Set<number>() }; sessions.set(sid, session);
      await pipe.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] }, sid);
      await pipe.send("Runtime.enable", {}, sid);
      await pipe.send("Page.enable", {}, sid);
      await pipe.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sid);
      await pipe.send("Runtime.runIfWaitingForDebugger", {}, sid);
      session.ready = true;
    };
    pipe.onEvent = message => {
      const p = message.params ?? {};
      if (message.method === "Target.attachedToTarget") {
        if (["page", "iframe"].includes(p.targetInfo?.type)) {
          void configure(p.sessionId, p.targetInfo).catch(() => { fatal = new Error("browser_boundary_setup_failed"); });
        } else {
          // Workers cannot become an unobserved egress path.
          void pipe.send("Target.closeTarget", { targetId: p.targetInfo?.targetId }).catch(() => {});
        }
      } else if (message.method === "Target.detachedFromTarget") sessions.delete(p.sessionId);
      else if (message.method === "Runtime.executionContextCreated" && message.sessionId) sessions.get(message.sessionId)?.contexts.add(p.context.id);
      else if (message.method === "Runtime.executionContextDestroyed" && message.sessionId) sessions.get(message.sessionId)?.contexts.delete(p.executionContextId);
      // Navigation can invalidate all contexts in one event, rather than
      // emitting executionContextDestroyed for each old about:blank context.
      else if (message.method === "Runtime.executionContextsCleared" && message.sessionId) sessions.get(message.sessionId)?.contexts.clear();
      else if (message.method === "Fetch.requestPaused") {
        const allowed = browserUrlAllowed(String(p.request?.url), approved);
        if (!allowed) { try { blockedOrigins.add(new URL(p.request.url).origin); } catch { blockedOrigins.add("invalid"); } }
        void pipe.send(allowed ? "Fetch.continueRequest" : "Fetch.failRequest",
          allowed ? { requestId: p.requestId } : { requestId: p.requestId, errorReason: "BlockedByClient" }, message.sessionId)
          .catch(() => { fatal = new Error("browser_network_boundary_failed"); });
      }
    };
    await pipe.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    const target = await pipe.send("Target.createTarget", { url: "about:blank" });
    const end = Date.now() + timeout;
    let pageSession: string | null = null;
    while (!pageSession && Date.now() < end) {
      if (fatal) throw fatal;
      for (const [sid, s] of sessions) if (s.targetId === target.targetId && s.ready) pageSession = sid;
      if (!pageSession) await delay(20);
    }
    if (!pageSession) fail("browser_page_not_ready");
    await pipe.send("Page.bringToFront", {}, pageSession!);
    const navigation = await pipe.send("Page.navigate", { url: `${app}/api/__qualification/auth` }, pageSession!);
    if (navigation.errorText) fail(navigation.errorText === "net::ERR_BLOCKED_BY_ADMINISTRATOR" ? "browser_navigation_blocked_by_policy" : "browser_navigation_failed");
    let started = false, challengeObserved = false, trustedInputEvents = 0;
    const clicked = new Set<string>();
    while (Date.now() < end) {
      if (fatal) throw fatal;
      if (!started) {
        const loaded = await pipe.send("Runtime.evaluate", { expression: "typeof window.Stripe === 'function'", returnByValue: true }, pageSession!).catch(() => null);
        if (loaded?.result?.value === true) {
          // Secret travels only over our private CDP pipe, never in a URL, log, screenshot or storage.
          const start = await pipe.send("Runtime.callFunctionOn", {
            functionDeclaration: "function(pk, secret) { window.__xeniosAuthResult = {state:'pending'}; Promise.resolve().then(() => window.Stripe(pk).handleNextAction({clientSecret:secret})).then(r => { window.__xeniosAuthResult = r.error ? {state:'failed'} : {state:'complete', status:r.paymentIntent && r.paymentIntent.status}; }, () => { window.__xeniosAuthResult={state:'failed'}; }); return true; }",
            executionContextId: [...sessions.get(pageSession!)!.contexts][0],
            arguments: [{ value: input.publishableKey }, { value: input.clientSecret }], returnByValue: true,
          }, pageSession!);
          if (start.exceptionDetails) fail("browser_auth_start_failed"); started = true;
        }
      }
      if (started) {
        for (const [sid, session] of sessions) {
          if (!session.ready) continue;
          for (const ctx of session.contexts) {
            const key = `${sid}:${ctx}`; if (clicked.has(key)) continue;
            const found = await pipe.send("Runtime.callFunctionOn", {
              executionContextId: ctx, functionDeclaration: "function(selector) { const e=document.querySelector(selector); if (!e || e.disabled || e.getClientRects().length===0) return false; e.focus(); return document.activeElement===e; }",
              arguments: [{ value: selector }], returnByValue: true,
            }, sid).catch(() => null);
            if (found?.result?.value !== true) continue;
            if (expectation === "no_challenge") fail("unexpected_authentication_challenge");
            challengeObserved = true; clicked.add(key);
            await pipe.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sid);
            await pipe.send("Input.dispatchKeyEvent", { type: "char", text: "\r", unmodifiedText: "\r", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sid);
            await pipe.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sid);
            trustedInputEvents += 3;
          }
        }
        const result = await pipe.send("Runtime.evaluate", { expression: "window.__xeniosAuthResult", returnByValue: true }, pageSession!).catch(() => null);
        const value = objectOf(result?.result?.value);
        if (value?.state === "failed") fail("provider_browser_authentication_failed");
        if (value?.state === "complete") {
          assertAuthenticationOutcome(expectation, challengeObserved, trustedInputEvents, value.status);
          return { challengeObserved, trustedInputEvents, blockedOrigins: [...blockedOrigins] };
        }
      }
      await delay(100);
    }
    return fail("browser_challenge_timed_out");
  } finally {
    if (cdp) { await cdp.send("Browser.close", {}, undefined, 1000).catch(() => {}); cdp.close(); }
    if (child && child.exitCode === null && child.signalCode === null) {
      const c = child;
      await new Promise<void>(resolve => { const timer = setTimeout(() => { c.kill("SIGKILL"); resolve(); }, 2000); c.once("exit", () => { clearTimeout(timer); resolve(); }); c.kill("SIGTERM"); });
    }
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
  }
}
