// The fault seam for a managed qualification run, and its loopback control channel.
//
// Two of the thirteen required scenarios need the application to fail on
// purpose: a provider response lost AFTER the provider processed the request,
// and a local transaction that fails after a real capture. Those are the two
// cases where money and records can genuinely diverge, so they cannot be
// skipped and still call a run qualified.
//
// The application must never carry a switch that can be flipped from outside.
// So this module is not part of the application: it wraps the pieces an
// application is COMPOSED FROM, and it is only ever composed in by a separate
// qualification entry point that a harness starts itself. Three things keep
// that true:
//
//   1. It refuses to start when NODE_ENV is "production".
//   2. Its control server binds to loopback and nothing else.
//   3. The harness refuses a non-loopback control URL, so a channel that
//      somehow reached a deployed host still could not be driven.
//
// Nothing here belongs in server/index.ts or production-deps.ts, and nothing in
// the application imports it.
import { createServer, type Server } from "node:http";
import type { StripeRequest, StripeResponse, StripeTransport } from "../../providers/payment";
import type { OrderRecord } from "../orders";

export class QualificationSeamRefused extends Error {}

export type TransportFault = "lost_response" | "server_error";

export interface FaultSeamState {
  /** Arm exactly one dropped response, or one provider error. */
  arm(fault: TransportFault): void;
  /** Arm exactly one local commit failure after a capture. */
  armLocalCommitFailure(): void;
  /** What is armed right now. For the operator, not for the application. */
  pending(): { transport: TransportFault | null; localCommit: boolean };
}

export interface FaultSeam extends FaultSeamState {
  /** Wraps the real provider transport. Compose the adapter over THIS. */
  wrapTransport(inner: StripeTransport): StripeTransport;
  /** Wraps a canonical order save. Compose the order store over THIS. */
  wrapOrderSave(inner: (order: OrderRecord) => Promise<void>): (order: OrderRecord) => Promise<void>;
}

/**
 * A fault seam.
 *
 * Every fault is ONE-SHOT and consumed when it fires, so an armed fault cannot
 * leak into the scenario after it. The lost-response fault drops the response
 * of the next WRITE only after the provider has already processed it, which is
 * the dangerous case: the effect exists and the caller does not know.
 */
export function createQualificationFaultSeam(
  env: Record<string, string | undefined> = process.env,
): FaultSeam {
  if ((env.NODE_ENV ?? "") === "production") {
    throw new QualificationSeamRefused("the qualification fault seam must never be composed into a production build");
  }
  let transportFault: TransportFault | null = null;
  let localCommitFault = false;

  return {
    arm(fault) {
      transportFault = fault;
    },
    armLocalCommitFailure() {
      localCommitFault = true;
    },
    pending: () => ({ transport: transportFault, localCommit: localCommitFault }),

    wrapTransport(inner) {
      return async (request: StripeRequest): Promise<StripeResponse> => {
        const armed = transportFault;
        if (armed === "server_error") {
          transportFault = null;
          // The provider never sees this one: it is refused before the effect.
          return { status: 500, body: { error: { type: "api_error", message: "qualification fault" } } };
        }
        const response = await inner(request);
        if (armed === "lost_response" && request.method === "POST") {
          transportFault = null;
          // The effect HAPPENED. The caller never learns the outcome, which is
          // exactly the state reconciliation has to be able to recover from.
          throw new Error("connection closed after the provider processed the request");
        }
        return response;
      };
    },

    wrapOrderSave(inner) {
      return async (order: OrderRecord) => {
        if (localCommitFault && order.state === "payment_captured") {
          localCommitFault = false;
          // After a real capture, before the local record exists.
          throw new Error("qualification fault: the local transaction failed after the capture");
        }
        return inner(order);
      };
    },
  };
}

export interface FaultControlServer {
  /** The loopback origin to give the harness. */
  url: string;
  close(): Promise<void>;
}

const CONTROL_PATHS = Object.freeze({
  fault: "/__qualification/fault",
  failNextCommit: "/__qualification/fail-next-commit",
  pending: "/__qualification/pending",
});

/**
 * The control channel the harness drives.
 *
 * It binds to 127.0.0.1 and refuses to serve a request whose Host is anything
 * else, so it cannot be reached from another machine even if a port were
 * forwarded. It carries no authentication because it must not be reachable at
 * all; if it ever needs authentication, it has already been mounted somewhere
 * it does not belong.
 */
export function startFaultControlServer(
  seam: FaultSeamState,
  options: { port?: number; env?: Record<string, string | undefined> } = {},
): Promise<FaultControlServer> {
  const env = options.env ?? process.env;
  if ((env.NODE_ENV ?? "") === "production") {
    throw new QualificationSeamRefused("the qualification control channel must never run in a production build");
  }

  const server: Server = createServer((req, res) => {
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(body));
    };
    // Loopback only, checked on the socket rather than on a header a caller
    // controls.
    const remote = req.socket.remoteAddress ?? "";
    if (!/^(::1|::ffff:127\.0\.0\.1|127\.0\.0\.1)$/.test(remote)) {
      reply(403, { ok: false, code: "not_loopback" });
      return;
    }
    if (req.method !== "POST") {
      reply(405, { ok: false, code: "method_not_allowed" });
      return;
    }
    const path = (req.url ?? "").split("?")[0];
    let raw = "";
    req.on("data", (chunk) => {
      raw += String(chunk);
      // A control channel has no reason to accept a large body.
      if (raw.length > 4096) req.destroy();
    });
    req.on("end", () => {
      if (path === CONTROL_PATHS.failNextCommit) {
        seam.armLocalCommitFailure();
        reply(200, { ok: true, armed: "local_commit" });
        return;
      }
      if (path === CONTROL_PATHS.fault) {
        let fault: unknown;
        try {
          fault = (JSON.parse(raw || "{}") as { fault?: unknown }).fault;
        } catch {
          reply(400, { ok: false, code: "unreadable_body" });
          return;
        }
        if (fault !== "lost_response" && fault !== "server_error") {
          reply(400, { ok: false, code: "unknown_fault" });
          return;
        }
        seam.arm(fault);
        reply(200, { ok: true, armed: fault });
        return;
      }
      if (path === CONTROL_PATHS.pending) {
        reply(200, { ok: true, pending: seam.pending() });
        return;
      }
      reply(404, { ok: false, code: "unknown_control_path" });
    });
  });

  return new Promise<FaultControlServer>((resolve, reject) => {
    server.on("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("the control channel did not bind to a port"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise<void>((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
  });
}

export const QUALIFICATION_CONTROL_PATHS = CONTROL_PATHS;
