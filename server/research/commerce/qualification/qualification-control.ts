/** Isolated qualification child only. This module is never imported by server/index.ts. */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { fail, objectOf, QualificationBoundaryError } from "./managed-runtime";

export interface QualificationIdentity {
  runId: string; projectRef: string; sourceSha: string; mode: "test"; pid: number; bootId: string;
}
export function assertChildIdentity(i: QualificationIdentity, env: Record<string, string | undefined>): void {
  if (env.NODE_ENV === "production" || env.RENDER === "true" || env.RENDER_SERVICE_ID || env.VERCEL === "1") fail("qualification_deployed_process_refused");
  if (!/^[a-z]{20}$/.test(i.projectRef) || i.projectRef === "yvzeduaxbwgcwllhywff" || i.mode !== "test" ||
      !/^[a-f0-9]{40}$/.test(i.sourceSha) || !/^[A-Za-z0-9_-]{8,100}$/.test(i.runId)) fail("qualification_identity_invalid");
}
export function assertControlToken(token: string): void {
  if (!/^[a-f0-9]{64}$/.test(token)) fail("qualification_control_token_invalid");
}
const localPeer = (ip: string | undefined) => ip === "127.0.0.1" || ip === "::ffff:127.0.0.1" || ip === "::1";
function authorized(req: IncomingMessage, token: string, port: number): boolean {
  const supplied = req.headers.authorization;
  if (!localPeer(req.socket.remoteAddress) || req.headers.origin || req.headers["x-forwarded-for"] ||
      req.headers.host !== `127.0.0.1:${port}` || typeof supplied !== "string") return false;
  const expected = Buffer.from(`Bearer ${token}`); const actual = Buffer.from(supplied);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function reply(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(value));
}
async function jsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) fail("control_content_type_invalid");
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    const b = Buffer.from(chunk); size += b.length; if (size > 2048) fail("control_body_too_large"); chunks.push(b);
  }
  let value: unknown; try { value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return fail("control_body_invalid"); }
  return objectOf(value) ?? fail("control_body_invalid");
}

export interface StripeTransportInput { method: string; path: string; form?: Record<string, string> }
export interface StripeTransportOutput { status: number; body: unknown }
export type FaultKind = "lost_response" | "server_error" | "local_commit";
/** Arms at most one fault at a time, scoped to the approved synthetic member set. */
export class QualificationFaults {
  private pending: { kind: FaultKind; expires: number; armId: string } | null = null;
  private readonly executed: Array<{ kind: FaultKind; armId: string }> = [];
  constructor(private readonly members: ReadonlySet<string>, private readonly now = Date.now) {
    if (!members.size) fail("fault_members_missing");
  }
  arm(kind: FaultKind): string {
    if (this.pending && this.pending.expires > this.now()) fail("fault_already_armed");
    const armId = randomUUID(); this.pending = { kind, armId, expires: this.now() + 30_000 }; return armId;
  }
  private take(kind: FaultKind): { armId: string } | null {
    const p = this.pending; if (!p) return null;
    if (p.expires <= this.now()) { this.pending = null; return null; }
    if (p.kind !== kind) return null;
    this.pending = null; this.executed.push({ kind, armId: p.armId }); return p;
  }
  snapshot() { return { armed: this.pending?.kind ?? null, consumed: this.executed.map(x => ({ ...x })) }; }
  wrapTransport<R extends StripeTransportInput, S extends StripeTransportOutput>(send: (r: R) => Promise<S>): (r: R) => Promise<S> {
    return async r => {
      // Reads and other account activity can never consume the armed creation fault.
      const eligible = r.method === "POST" && r.path === "/v1/payment_intents" &&
        typeof r.form?.["metadata[memberId]"] === "string" && this.members.has(r.form["metadata[memberId]"]);
      if (!eligible) return send(r);
      if (this.take("server_error")) throw new QualificationBoundaryError("injected_provider_transport_error");
      const lost = this.take("lost_response");
      const response = await send(r);
      if (lost) throw new QualificationBoundaryError("injected_lost_provider_response");
      return response;
    };
  }
  wrapExecutionStore<T extends {
    commitCaptured(executionId: string, version: number): Promise<unknown>;
  }>(store: T, belongsToRun: (id: string) => Promise<boolean>): T {
    // Preserve all native methods and their this binding. No alternate money implementation.
    return new Proxy(store, {
      get: (target, key) => {
        if (key === "commitCaptured") return async (id: string, version: number) => {
          if (await belongsToRun(id)) {
            if (this.take("local_commit")) throw new QualificationBoundaryError("injected_local_commit_failure");
          }
          return target.commitCaptured(id, version);
        };
        const v = Reflect.get(target, key); return typeof v === "function" ? v.bind(target) : v;
      },
    });
  }
}

export async function startQualificationControl(input: {
  identity: QualificationIdentity; token: string; faults: QualificationFaults;
  env?: Record<string, string | undefined>; port?: number;
}) {
  assertChildIdentity(input.identity, input.env ?? process.env); assertControlToken(input.token);
  let port = input.port ?? 0;
  const server = createServer(async (req, res) => {
    if (!authorized(req, input.token, port)) { reply(res, 403, { ok: false, code: "control_forbidden" }); return; }
    try {
      if (req.method === "GET" && req.url === "/__qualification/identity") { reply(res, 200, { ok: true, identity: input.identity }); return; }
      if (req.method === "GET" && req.url === "/__qualification/fault-state") { reply(res, 200, { ok: true, ...input.faults.snapshot() }); return; }
      if (req.method !== "POST" || !["/__qualification/fault", "/__qualification/fail-next-commit"].includes(req.url ?? "")) {
        reply(res, 404, { ok: false, code: "control_not_found" }); return;
      }
      const body = await jsonBody(req);
      let kind: FaultKind;
      if (req.url === "/__qualification/fail-next-commit") {
        if (Object.keys(body).length) fail("control_body_invalid"); kind = "local_commit";
      } else {
        if (Object.keys(body).length !== 1 || (body.fault !== "lost_response" && body.fault !== "server_error")) fail("control_fault_invalid");
        kind = body.fault;
      }
      reply(res, 200, { ok: true, armId: input.faults.arm(kind) });
    } catch (e) {
      reply(res, 400, { ok: false, code: e instanceof QualificationBoundaryError ? e.code : "control_failed" });
    }
  });
  server.requestTimeout = 5000; server.headersTimeout = 5000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject); server.listen(port, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const address = server.address(); if (!address || typeof address === "string") fail("control_listener_invalid");
  port = address.port;
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise<void>((resolve, reject) => {
    server.close(e => e ? reject(e) : resolve()); server.closeAllConnections();
  }) };
}
