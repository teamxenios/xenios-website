import {
  AssistedOrderValidationError,
  isAssistedOrderActionGroup,
  isAssistedOrderStatus,
  isAssistedOrderWorkflowMode,
  type AssistedOrderCatalogQuery,
  type AssistedOrderStatusUpdateInput,
  type AssistedOrderSubmitInput,
  type AssistedOrderUploadRequest,
} from "../../../shared/research/assisted-order/contract";
import {
  AssistedOrderAgreementRequiredError,
  AssistedOrderAuthorizationError,
  AssistedOrderConflictError,
  AssistedOrderNotFoundError,
  AssistedOrderService,
} from "./service";
import type {
  AssistedOrderAttributionResolver,
  AssistedOrderRouteViewerResolver,
  AssistedOrderViewer,
} from "./ports";

export type AssistedOrderHttpRequest = Readonly<{
  method: string;
  path: string;
  headers: Readonly<Record<string, string | undefined>>;
  query: Readonly<Record<string, string | undefined>>;
  params: Readonly<Record<string, string | undefined>>;
  body: unknown;
}>;

export type AssistedOrderHttpResponse = Readonly<{
  status: number;
  headers?: Readonly<Record<string, string>>;
  body: unknown;
}>;

export type AssistedOrderRouteHandler = (
  request: AssistedOrderHttpRequest,
) => Promise<AssistedOrderHttpResponse>;

export type AssistedOrderRouteDescriptor = Readonly<{
  method: "GET" | "POST" | "PATCH" | "OPTIONS";
  path: string;
  auth: "early_access_or_member" | "admin";
  handler: AssistedOrderRouteHandler;
}>;

const jsonHeaders = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
});

function ok(status: number, body: unknown): AssistedOrderHttpResponse {
  return Object.freeze({ status, headers: jsonHeaders, body });
}

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  max: number,
): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= max
    ? parsed
    : fallback;
}

function catalogQuery(
  request: AssistedOrderHttpRequest,
): AssistedOrderCatalogQuery {
  const action = request.query.action?.trim();
  if (action && !isAssistedOrderActionGroup(action)) {
    throw new AssistedOrderValidationError(
      "action",
      "Choose a valid catalog action.",
    );
  }
  const workflowMode = request.query.workflowMode?.trim();
  if (workflowMode && !isAssistedOrderWorkflowMode(workflowMode)) {
    throw new AssistedOrderValidationError(
      "workflowMode",
      "Choose a valid catalog workflow.",
    );
  }
  return Object.freeze({
    search: request.query.q?.trim() || undefined,
    family: request.query.family?.trim() || undefined,
    channel: request.query.channel?.trim() || undefined,
    actionGroup: isAssistedOrderActionGroup(action)
      ? action
      : undefined,
    workflowMode: isAssistedOrderWorkflowMode(workflowMode)
      ? workflowMode
      : undefined,
    page: parsePositiveInt(request.query.page, 1, 100_000),
    pageSize: parsePositiveInt(request.query.pageSize, 24, 100),
  });
}

function errorResponse(error: unknown): AssistedOrderHttpResponse {
  if (error instanceof AssistedOrderValidationError) {
    return ok(400, {
      error: "validation_error",
      field: error.field,
      message: error.message,
    });
  }
  if (error instanceof AssistedOrderAuthorizationError) {
    return ok(403, {
      error: "forbidden",
      message: "This request is not authorized.",
    });
  }
  if (error instanceof AssistedOrderAgreementRequiredError) {
    return ok(403, {
      error: "agreement_required",
      message: "Accept the current Research Use Policy before submitting.",
    });
  }
  if (error instanceof AssistedOrderNotFoundError) {
    // Ownership failures intentionally collapse into not-found.
    return ok(404, {
      error: "not_found",
      message: "The request was not found.",
    });
  }
  if (error instanceof AssistedOrderConflictError) {
    return ok(409, {
      error: error.code,
      message: error.message,
    });
  }
  return ok(500, {
    error: "assisted_order_unavailable",
    message: "The assisted order service is temporarily unavailable.",
  });
}

async function handle(
  operation: () => Promise<AssistedOrderHttpResponse>,
): Promise<AssistedOrderHttpResponse> {
  try {
    return await operation();
  } catch (error) {
    return errorResponse(error);
  }
}

export function createAssistedOrderRouteTable<Request extends AssistedOrderHttpRequest>(
  service: AssistedOrderService,
  viewerResolver: AssistedOrderRouteViewerResolver<Request>,
  // Optional so existing composition compiles unchanged; absent means every
  // submission records no affiliate attribution, never that a body value is
  // trusted instead.
  attribution?: AssistedOrderAttributionResolver | null,
): readonly AssistedOrderRouteDescriptor[] {
  const viewer = (request: AssistedOrderHttpRequest): Promise<AssistedOrderViewer> =>
    viewerResolver.resolve(request as Request);

  const routes: AssistedOrderRouteDescriptor[] = [
    {
      // The wizard's first fetch. The wall admits it openly because it
      // reports only the feature state, the published legal (kind, version)
      // pairs, and the operational form copy; the D-005 disabled state is an
      // up-front answer, not an error.
      method: "GET",
      path: "/api/research/early-access/assisted-orders/config",
      auth: "early_access_or_member",
      handler: (request) =>
        handle(async () => {
          const view = await service.config(await viewer(request));
          return ok(200, view);
        }),
    },
    {
      method: "GET",
      path: "/api/research/early-access/assisted-orders/catalog",
      auth: "early_access_or_member",
      handler: (request) =>
        handle(async () => {
          const page = await service.catalog(await viewer(request), catalogQuery(request));
          return ok(200, page);
        }),
    },
    {
      method: "POST",
      path: "/api/research/early-access/assisted-orders",
      auth: "early_access_or_member",
      handler: (request) =>
        handle(async () => {
          // The affiliate ref is derived HERE, from the verified attribution
          // cookie on the request headers, and nowhere else. The body cannot
          // supply one: the service ignores any body-carried value outright.
          const affiliateAttributionRef =
            attribution?.resolve(request.headers.cookie) ?? null;
          const receipt = await service.submit(
            await viewer(request),
            request.body as AssistedOrderSubmitInput,
            affiliateAttributionRef,
          );
          return ok(201, receipt);
        }),
    },
    {
      method: "GET",
      path: "/api/research/early-access/assisted-orders/:publicReference",
      auth: "early_access_or_member",
      handler: (request) =>
        handle(async () => {
          const status = await service.status(
            await viewer(request),
            request.params.publicReference ?? "",
            request.query.token,
          );
          return ok(200, status);
        }),
    },
    {
      method: "POST",
      path: "/api/research/early-access/assisted-orders/:requestId/documents/upload-url",
      auth: "early_access_or_member",
      handler: (request) =>
        handle(async () => {
          const ticket = await service.createDocumentUpload(
            await viewer(request),
            request.params.requestId ?? "",
            request.body as AssistedOrderUploadRequest,
          );
          return ok(201, ticket);
        }),
    },
    {
      method: "POST",
      path: "/api/research/early-access/assisted-orders/:requestId/documents/:documentId/complete",
      auth: "early_access_or_member",
      handler: (request) =>
        handle(async () => {
          await service.completeDocumentUpload(
            await viewer(request),
            request.params.requestId ?? "",
            request.params.documentId ?? "",
            (request.body as { publicReference?: string }).publicReference ?? "",
            (request.body as { statusToken?: string }).statusToken,
          );
          return ok(204, null);
        }),
    },
    {
      method: "GET",
      path: "/api/admin/research/assisted-orders",
      auth: "admin",
      handler: (request) =>
        handle(async () => {
          const status = isAssistedOrderStatus(request.query.status)
            ? request.query.status
            : undefined;
          const page = await service.listAdmin(await viewer(request), {
            status,
            search: request.query.q,
            page: parsePositiveInt(request.query.page, 1, 100_000),
            pageSize: parsePositiveInt(request.query.pageSize, 25, 100),
          });
          return ok(200, page);
        }),
    },
    {
      method: "GET",
      path: "/api/admin/research/assisted-orders/:requestId",
      auth: "admin",
      handler: (request) =>
        handle(async () => {
          const detail = await service.adminDetail(
            await viewer(request),
            request.params.requestId ?? "",
          );
          return ok(200, detail);
        }),
    },
    {
      method: "PATCH",
      path: "/api/admin/research/assisted-orders/:requestId/status",
      auth: "admin",
      handler: (request) =>
        handle(async () => {
          const updated = await service.updateStatus(
            await viewer(request),
            request.params.requestId ?? "",
            request.body as AssistedOrderStatusUpdateInput,
          );
          return ok(200, updated);
        }),
    },
    {
      method: "POST",
      path: "/api/admin/research/assisted-orders/:requestId/documents/:documentId/download-url",
      auth: "admin",
      handler: (request) =>
        handle(async () => {
          const result = await service.createDocumentDownload(
            await viewer(request),
            request.params.requestId ?? "",
            request.params.documentId ?? "",
          );
          return ok(200, result);
        }),
    },
  ];

  for (const route of [...routes]) {
    routes.push(
      Object.freeze({
        method: "OPTIONS" as const,
        path: route.path,
        auth: route.auth,
        handler: async () =>
          Object.freeze({
            status: 204,
            headers: Object.freeze({
              "cache-control": "no-store",
              allow: route.method,
            }),
            body: null,
          }),
      }),
    );
  }
  return Object.freeze(routes);
}
