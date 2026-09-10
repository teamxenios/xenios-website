/** Owned-process restart evidence. Never runs a shell command or kills another session's process. */
import { fork, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { isAbsolute } from "node:path";
import { fail, originOf, objectOf } from "./managed-runtime";
import type { QualificationIdentity } from "./qualification-control";

export interface ChildReady extends QualificationIdentity { type: "qualification-ready"; appOrigin: string; controlOrigin: string }
export interface OwnedChildOptions {
  modulePath: string; cwd: string; runId: string; projectRef: string; sourceSha: string;
  env: Record<string, string | undefined>; execArgv?: string[]; startupMs?: number; shutdownMs?: number;
}
export class QualificationSupervisor {
  private child: ChildProcess | null = null;
  private readyValue: ChildReady | null = null;
  private transitioning = false;
  readonly controlToken = randomBytes(32).toString("hex");
  constructor(private readonly options: OwnedChildOptions) {
    if (!isAbsolute(options.modulePath) || !isAbsolute(options.cwd)) fail("child_path_not_absolute");
    if (options.env.NODE_ENV === "production" || options.env.RENDER_SERVICE_ID || options.env.RENDER === "true") fail("deployed_child_refused");
    if (!/^[a-z]{20}$/.test(options.projectRef) || options.projectRef === "yvzeduaxbwgcwllhywff" || !/^[a-f0-9]{40}$/.test(options.sourceSha)) fail("child_identity_invalid");
  }
  current(): ChildReady { if (!this.readyValue || !this.child || this.child.exitCode !== null || this.child.signalCode !== null) return fail("child_not_ready"); return { ...this.readyValue }; }
  async start(): Promise<ChildReady> {
    if (this.transitioning || this.child) fail("child_already_started");
    this.transitioning = true;
    try { return await this.launch(null); } finally { this.transitioning = false; }
  }
  private async launch(previous: ChildReady | null): Promise<ChildReady> {
    const o = this.options;
    // Use an explicit environment. Do not inherit a production database, live provider key or NODE_OPTIONS.
    const env = { ...o.env, NODE_ENV: "development", NODE_OPTIONS: "", XENIOS_QUALIFY_CHILD: "owned" };
    const child = fork(o.modulePath, [], {
      cwd: o.cwd, env, execArgv: o.execArgv ?? [], silent: true, detached: false,
    });
    this.child = child;
    // Child logs can contain framework/provider details. Consume without forwarding or storing.
    child.stdout?.resume(); child.stderr?.resume();
    try {
      const ready = await new Promise<ChildReady>((resolve, reject) => {
        let done = false;
        const finish = (error?: Error, value?: ChildReady) => {
          if (done) return; done = true; clearTimeout(timer);
          child.off("message", onMessage); child.off("error", onError); child.off("exit", onExit);
          error ? reject(error) : resolve(value!);
        };
        const onError = () => finish(new Error("qualification_child_start_failed"));
        const onExit = () => finish(new Error("qualification_child_exited_before_ready"));
        const onMessage = (value: unknown) => {
          const m = objectOf(value);
          if (m?.type === "qualification-not-run") { finish(new Error("qualification_child_not_run")); return; }
          if (m?.type !== "qualification-ready") return;
          try {
            if (m.runId !== o.runId || m.projectRef !== o.projectRef || m.sourceSha !== o.sourceSha ||
                m.mode !== "test" || m.pid !== child.pid || typeof m.bootId !== "string" || !m.bootId ||
                (previous && (m.pid === previous.pid || m.bootId === previous.bootId))) fail("child_ready_identity_mismatch");
            const appOrigin = originOf(String(m.appOrigin), true), controlOrigin = originOf(String(m.controlOrigin), true);
            if (previous && (appOrigin !== previous.appOrigin || controlOrigin !== previous.controlOrigin)) fail("child_restart_origin_changed");
            finish(undefined, { ...m, appOrigin, controlOrigin } as unknown as ChildReady);
          } catch { finish(new Error("qualification_child_ready_invalid")); }
        };
        const timer = setTimeout(() => finish(new Error("qualification_child_start_timeout")), o.startupMs ?? 30000);
        child.on("message", onMessage); child.once("error", onError); child.once("exit", onExit);
        child.send({ type: "qualification-init", runId: o.runId, projectRef: o.projectRef, sourceSha: o.sourceSha,
          token: this.controlToken,
          appPort: previous ? Number(new URL(previous.appOrigin).port) : 0,
          controlPort: previous ? Number(new URL(previous.controlOrigin).port) : 0,
        }, error => { if (error) onError(); });
      });
      this.readyValue = ready; return { ...ready };
    } catch (e) { await this.stopChild(); throw e; }
  }
  private async stopChild(): Promise<void> {
    const c = this.child; this.child = null; this.readyValue = null;
    if (!c || c.exitCode !== null || c.signalCode !== null) return;
    await new Promise<void>((resolve, reject) => {
      let finished = false;
      const finish = (error?: Error) => {
        if (finished) return; finished = true; clearTimeout(term); clearTimeout(kill);
        error ? reject(error) : resolve();
      };
      c.once("exit", () => finish());
      const term = setTimeout(() => c.kill("SIGKILL"), this.options.shutdownMs ?? 3000);
      const kill = setTimeout(() => finish(new Error("qualification_child_stop_timeout")), (this.options.shutdownMs ?? 3000) + 5000);
      c.kill("SIGTERM");
    });
  }
  async restart(): Promise<ChildReady> {
    if (this.transitioning) fail("child_transition_in_progress");
    const previous = this.current(); this.transitioning = true;
    try { await this.stopChild(); return await this.launch(previous); }
    finally { this.transitioning = false; }
  }
  async close(): Promise<void> { await this.stopChild(); }
}
