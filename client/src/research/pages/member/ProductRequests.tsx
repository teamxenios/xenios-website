import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import type { MemberProductRequest, ProductRequestStatus } from "@shared/research/product-requests";
import { useResearch } from "../../core";
import {
  addProductRequestMessage,
  getProductRequestFileAccess,
  listMemberProductRequests,
  removeProductRequestFile,
  withdrawProductRequest,
} from "../../adapters/productRequests";
import { MEMBER_ROUTES } from "../../lib/routes";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchEmptyState,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
  ResearchTimeline,
  type BadgeTone,
} from "../../ui/kit";

const STATUS_META: Record<ProductRequestStatus, { label: string; tone: BadgeTone }> = {
  submitted: { label: "Submitted", tone: "pending" },
  under_review: { label: "Under review", tone: "info" },
  more_information_requested: { label: "More information requested", tone: "warning" },
  accepted_for_diligence: { label: "Accepted for diligence", tone: "info" },
  planned: { label: "Planned", tone: "info" },
  added_to_catalog: { label: "Added to catalog", tone: "success" },
  currently_unavailable: { label: "Currently unavailable", tone: "warning" },
  not_moving_forward: { label: "Not moving forward", tone: "neutral" },
  closed: { label: "Closed", tone: "neutral" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

type PageState =
  | { phase: "loading" }
  | { phase: "ok"; requests: MemberProductRequest[] }
  | { phase: "unauthorized" }
  | { phase: "unavailable" }
  | { phase: "error"; message?: string };

export default function ProductRequests() {
  const { member, memberChecking, memberToken } = useResearch();
  const [state, setState] = useState<PageState>({ phase: "loading" });
  const [openReference, setOpenReference] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    const result = await listMemberProductRequests(memberToken);
    if (result.kind === "ok") setState({ phase: "ok", requests: result.data.requests });
    else if (result.kind === "unauthorized") setState({ phase: "unauthorized" });
    else if (result.kind === "unavailable") setState({ phase: "unavailable" });
    else setState({ phase: "error", message: result.message });
  }, [memberToken]);

  useEffect(() => {
    if (!memberChecking) void load();
  }, [load, memberChecking]);

  const boundaryState = memberChecking
    ? "loading"
    : !member || state.phase === "unauthorized"
      ? "unauthorized"
      : state.phase === "loading"
        ? "loading"
        : state.phase === "unavailable"
          ? "unavailable"
          : state.phase === "error"
            ? "error"
            : "ok";
  const requests = state.phase === "ok" ? state.requests : [];
  const open = requests.find((request) => request.reference === openReference) ?? null;

  return (
    <ResearchMemberShell
      eyebrow="Product requests"
      title="Your product requests"
      lead="Track the research products you have asked the team to consider. Requests are demand signals, not orders or availability promises."
      actions={
        <Link href={MEMBER_ROUTES.newProductRequest} className="btn btn-primary">
          Request a product
        </Link>
      }
    >
      <ResearchRouteBoundary
        state={boundaryState}
        errorMessage={state.phase === "error" ? state.message : undefined}
        onRetry={() => void load()}
        unavailableTitle="Product requests are not available yet."
        unavailableBody="This area will open when the private request system is connected."
      >
        {requests.length === 0 ? (
          <ResearchEmptyState
            title="No product requests yet."
            body="If the catalog does not include what you are looking for, submit a request for the research team to review."
            action={
              <Link href={MEMBER_ROUTES.newProductRequest} className="btn btn-primary">
                Request a product
              </Link>
            }
          />
        ) : (
          <ul className="grid gap-4" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {requests.map((request) => {
              const meta = STATUS_META[request.status];
              return (
                <li key={request.reference} className="card" data-testid={`product-request-${request.reference}`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="mono-label text-ink-mute">{request.reference}</p>
                      <h2 className="body-l font-700 mt-1">{request.productName}</h2>
                      <p className="body-s text-ink-2 mt-2">
                        Submitted {new Date(request.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <ResearchStatusBadge label={meta.label} tone={meta.tone} />
                  </div>
                  {request.memberVisibleUpdate && (
                    <p className="body-s text-ink-2 mt-4" data-testid="product-request-visible-update">
                      {request.memberVisibleUpdate}
                    </p>
                  )}
                  <div className="mt-4">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setOpenReference(openReference === request.reference ? null : request.reference)}
                    >
                      {openReference === request.reference ? "Hide details" : "View details"}
                    </button>
                  </div>
                  {openReference === request.reference && (
                    <RequestDetails
                      request={request}
                      token={memberToken}
                      onChanged={() => void load()}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </ResearchRouteBoundary>

      <ResearchSecureNotice>
        A request never creates a product, order, inventory record, commerce state, price, approval, or availability
        promise. The research team evaluates requests separately.
      </ResearchSecureNotice>
      {open && null}
    </ResearchMemberShell>
  );
}

function RequestDetails({
  request,
  token,
  onChanged,
}: {
  request: MemberProductRequest;
  token: string | null;
  onChanged: () => void;
}) {
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const closed = ["closed", "withdrawn", "added_to_catalog"].includes(request.status);

  const addMessage = async () => {
    if (busy || message.trim().length < 2) return;
    setBusy(true);
    setNotice(null);
    const result = await addProductRequestMessage(request.reference, request.version, message.trim(), token);
    setBusy(false);
    if (result.kind === "ok") {
      setMessage("");
      onChanged();
    } else {
      setNotice(result.kind === "denied" ? result.message ?? "The message was not accepted." : "The message could not be saved. Reload and try again.");
    }
  };

  const withdraw = async () => {
    if (busy || !window.confirm("Withdraw this request? Its history will remain available.")) return;
    setBusy(true);
    const result = await withdrawProductRequest(request.reference, request.version, token);
    setBusy(false);
    if (result.kind === "ok") onChanged();
    else setNotice("The request could not be withdrawn. Reload and try again.");
  };

  const openFile = async (fileId: string) => {
    const result = await getProductRequestFileAccess(request.reference, fileId, token);
    if (result.kind === "ok") window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
    else setNotice("The private file could not be opened.");
  };

  const removeFile = async (fileId: string) => {
    if (!window.confirm("Remove this file from the request?")) return;
    const result = await removeProductRequestFile(request.reference, fileId, token);
    if (result.kind === "ok") onChanged();
    else setNotice("The private file could not be removed.");
  };

  return (
    <div className="mt-6 grid gap-5 border-t pt-5">
      <dl className="grid gap-3 sm:grid-cols-2">
        <Detail label="Category" value={request.category.replace(/_/g, " ")} />
        <Detail label="Brand" value={request.brand ?? "Not provided"} />
        <Detail label="Presentation" value={request.desiredPresentation ?? "Not provided"} />
        <Detail label="Quantity" value={request.desiredQuantity ?? "Not provided"} />
      </dl>
      <div>
        <h3 className="form-label">Request</h3>
        <p className="body-s text-ink-2 mt-2" style={{ whiteSpace: "pre-wrap" }}>
          {request.description}
        </p>
      </div>
      {request.files.length > 0 && (
        <section aria-label="Private files">
          <h3 className="form-label">Private files</h3>
          <ul className="grid gap-2 mt-2" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {request.files.map((file) => (
              <li key={file.fileId} className="flex flex-wrap items-center justify-between gap-3">
                <span className="body-s">{file.originalFilename}</span>
                <span className="flex gap-2">
                  {file.state === "confirmed" && (
                    <button type="button" className="btn btn-ghost" onClick={() => void openFile(file.fileId)}>
                      Open
                    </button>
                  )}
                  {!closed && (
                    <button type="button" className="btn btn-ghost" onClick={() => void removeFile(file.fileId)}>
                      Remove
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-label="Request history">
        <h3 className="form-label">History</h3>
        <div className="mt-3">
          <ResearchTimeline
            items={request.events.map((event) => ({
              at: new Date(event.createdAt).toLocaleString(),
              title:
                event.eventType === "status_changed" && event.nextStatus
                  ? `Status changed to ${event.nextStatus.replace(/_/g, " ")}`
                  : event.eventType.replace(/_/g, " "),
              detail: event.memberVisibleMessage ?? undefined,
            }))}
          />
        </div>
      </section>
      {!closed && (
        <section className="grid gap-3" aria-label="Add information">
          <label className="form-label" htmlFor={`message-${request.reference}`}>
            Add information for the research team
          </label>
          <textarea
            id={`message-${request.reference}`}
            className="input-field"
            rows={3}
            maxLength={3000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn btn-secondary" disabled={busy || message.trim().length < 2} onClick={() => void addMessage()}>
              Add message
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void withdraw()}>
              Withdraw request
            </button>
          </div>
        </section>
      )}
      {notice && (
        <p className="body-s text-ink-2" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="mono-label text-ink-mute">{label}</dt>
      <dd className="body-s mt-1">{value}</dd>
    </div>
  );
}
