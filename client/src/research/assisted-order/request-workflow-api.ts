import {
  parseRequestWorkflow, parseStaffRequestWorkflow, REQUEST_WORKFLOW_BASE_PATH, requestWorkflowId,
  type RequestWorkflowV1, type StaffRequestWorkflowV1,
} from "../../../../shared/research/assisted-order/request-intent-workflow";

/**
 * One read of a request's workflow. Only "ready" carries server facts; every
 * other outcome says nothing about the request's state or its existence.
 */
export type RequestWorkflowRead<T> =
  | Readonly<{ status: "ready"; value: T }>
  /** The server reported the workflow read as switched off or not configured. */
  | Readonly<{ status: "unavailable" }>
  /** 401, 403 or 404: this session may not read it. Existence is not disclosed. */
  | Readonly<{ status: "denied" }>
  | Readonly<{ status: "rate_limited" }>
  /** Anything else, including a lost reply or a 200 that fails the strict parser. */
  | Readonly<{ status: "unconfirmed" }>;

export interface RequestWorkflowApi {
  owner(requestId: string): Promise<RequestWorkflowRead<RequestWorkflowV1>>;
  staff(requestId: string): Promise<RequestWorkflowRead<StaffRequestWorkflowV1>>;
}

const UNAVAILABLE_CODE = "request_workflow_unavailable";

async function errorCode(response: Response): Promise<string | null> {
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const code = (body as { error?: unknown }).error;
  return typeof code === "string" && /^[a-z][a-z0-9_]{0,79}$/.test(code) ? code : null;
}

/**
 * Read-only. GET only, no query string, the same cookie and member-token
 * transport as the request API. The server decides ownership; a public
 * reference or an email address is never sent as proof of it.
 */
export function createRequestWorkflowApi(
  memberToken: () => string | null = () => null,
  transport: (path: string, init: RequestInit) => Promise<Response> = (path, init) => fetch(path, init),
): RequestWorkflowApi {
  async function read<T>(path: string, requestId: string, parse: (raw: unknown) => T,
    idOf: (value: T) => string): Promise<RequestWorkflowRead<T>> {
    if (!requestWorkflowId.safeParse(requestId).success) return { status: "unconfirmed" };
    const token = memberToken();
    let response: Response;
    try {
      response = await transport(REQUEST_WORKFLOW_BASE_PATH + path, {
        method: "GET", credentials: "include", cache: "no-store",
        headers: { accept: "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
      });
    } catch { return { status: "unconfirmed" }; }
    if (!response.ok) {
      if ([401, 403, 404].includes(response.status)) return { status: "denied" };
      if (response.status === 429) return { status: "rate_limited" };
      // A bare or HTML 503 (a proxy, a restart) is not the server's "switched off".
      if (response.status === 503 && await errorCode(response) === UNAVAILABLE_CODE) return { status: "unavailable" };
      return { status: "unconfirmed" };
    }
    const raw: unknown = await response.json().catch(() => undefined);
    try {
      const value = parse(raw);
      return idOf(value).toLowerCase() === requestId.toLowerCase() ? { status: "ready", value } : { status: "unconfirmed" };
    } catch { return { status: "unconfirmed" }; }
  }
  return {
    owner: (requestId) => read("/" + requestId + "/workflow", requestId, parseRequestWorkflow, (value) => value.requestId),
    staff: (requestId) => read("/staff/" + requestId + "/workflow", requestId, parseStaffRequestWorkflow,
      (value) => value.workflow.requestId),
  };
}
