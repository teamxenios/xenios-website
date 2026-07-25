import { useCallback, useState } from "react";
import { Link, useParams } from "wouter";
import {
  PRODUCT_REQUEST_PRIORITIES,
  PRODUCT_REQUEST_STATUSES,
  type ProductRequestPriority,
  type ProductRequestStatus,
} from "@shared/research/product-requests";
import {
  getAdminProductRequest,
  getAdminProductRequestFileAccess,
  updateAdminProductRequest,
} from "../../adapters/productRequests";
import { ADMIN_ROUTES } from "../../lib/routes";
import { ResearchSecureNotice, ResearchStatusBadge, ResearchTimeline } from "../../ui/kit";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";
import { fmtDateTime, useAdminResource } from "./auth";

type AdminRequestDetail = {
  id: string;
  reference: string;
  member_email: string;
  member_first_name: string;
  product_name: string;
  category: string;
  description: string;
  brand: string | null;
  product_url: string | null;
  desired_presentation: string | null;
  desired_quantity: string | null;
  expected_purchase_frequency: string | null;
  interest_timing: string | null;
  additional_notes: string | null;
  contact_consent: boolean;
  status: ProductRequestStatus;
  member_visible_update: string | null;
  assigned_owner: string | null;
  priority: ProductRequestPriority;
  internal_notes: string | null;
  candidate_id: string | null;
  linked_product_ref: string | null;
  attribution_source: string | null;
  attribution_code: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  files: Array<{
    fileId: string;
    originalFilename: string;
    contentType: string;
    sizeBytes: number;
    state: string;
    uploadedAt: string | null;
  }>;
  events: Array<{
    eventType: string;
    actorType: string;
    previousStatus: string | null;
    nextStatus: string | null;
    memberVisibleMessage: string | null;
    internalDetail: Record<string, unknown> | null;
    createdAt: string;
  }>;
};

export default function ProductRequestAdminDetail() {
  const { id = "" } = useParams<{ id: string }>();
  return (
    <AdminScreen
      title="Product request"
      lead="Review one member demand signal. Internal diligence and notes never appear in the member account."
      actions={
        <Link href={ADMIN_ROUTES.productRequests} className="btn btn-secondary">
          Back to queue
        </Link>
      }
    >
      {(token) => <ProductRequestDetail token={token} id={id} />}
    </AdminScreen>
  );
}

function ProductRequestDetail({ token, id }: { token: string; id: string }) {
  const load = useCallback(
    (currentToken: string) => getAdminProductRequest<AdminRequestDetail>(currentToken, id),
    [id],
  );
  const resource = useAdminResource(token, load);

  return (
    <AdminBoundary
      state={resource.state}
      message={resource.message}
      deniedCode={resource.deniedCode}
      onRetry={resource.reload}
      unavailableTitle="This product request is not available."
      unavailableBody="No private request details are shown without the authorized server response."
    >
      {resource.data?.request && (
        <div className="grid gap-6">
          <RequestFacts request={resource.data.request} token={token} />
          <AdminUpdateForm
            request={resource.data.request}
            token={token}
            onUpdated={resource.reload}
          />
          <section className="card" aria-label="Request history">
            <h2 className="body-l font-700">Append-only history</h2>
            <div className="mt-4">
              <ResearchTimeline
                items={resource.data.request.events.map((event) => ({
                  at: fmtDateTime(event.createdAt),
                  title: `${event.actorType}: ${event.eventType.replace(/_/g, " ")}`,
                  detail:
                    event.memberVisibleMessage ??
                    (event.nextStatus ? `${event.previousStatus ?? "new"} → ${event.nextStatus}` : undefined),
                }))}
              />
            </div>
          </section>
          <ResearchSecureNotice>
            Product URLs are stored as references only and are never automatically fetched or previewed. Private
            attachments use short-lived signed access. Affiliate and practitioner attribution remains internal and is
            not exposed to the member or partner.
          </ResearchSecureNotice>
        </div>
      )}
    </AdminBoundary>
  );
}

function RequestFacts({ request, token }: { request: AdminRequestDetail; token: string }) {
  const [notice, setNotice] = useState<string | null>(null);
  const openFile = async (fileId: string) => {
    const result = await getAdminProductRequestFileAccess(token, request.id, fileId);
    if (result.kind === "ok") window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
    else setNotice("The private attachment could not be opened.");
  };

  return (
    <section className="card" aria-label="Request detail">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mono-label text-ink-mute">{request.reference}</p>
          <h2 className="display-s mt-1">{request.product_name}</h2>
          <p className="body-s text-ink-mute mt-2">
            {request.member_email} · submitted {fmtDateTime(request.created_at)}
          </p>
        </div>
        <ResearchStatusBadge label={request.status.replace(/_/g, " ")} tone="info" />
      </div>
      <dl className="grid gap-4 sm:grid-cols-2 mt-6">
        <Fact label="Category" value={request.category.replace(/_/g, " ")} />
        <Fact label="Brand" value={request.brand ?? "Not provided"} />
        <Fact label="Presentation" value={request.desired_presentation ?? "Not provided"} />
        <Fact label="Quantity" value={request.desired_quantity ?? "Not provided"} />
        <Fact label="Frequency" value={request.expected_purchase_frequency?.replace(/_/g, " ") ?? "Not provided"} />
        <Fact label="Timing" value={request.interest_timing?.replace(/_/g, " ") ?? "Not provided"} />
        <Fact label="Contact consent" value={request.contact_consent ? "Yes" : "No"} />
        <Fact label="Demand candidate" value={request.candidate_id ?? "Not linked"} />
        <Fact label="Attribution source" value={request.attribution_source ?? "Direct or not recorded"} />
        <Fact label="Attribution code" value={request.attribution_code ?? "Not recorded"} />
      </dl>
      <div className="mt-6">
        <p className="form-label">What the member is looking for</p>
        <p className="body-s text-ink-2 mt-2" style={{ whiteSpace: "pre-wrap" }}>
          {request.description}
        </p>
      </div>
      {request.additional_notes && (
        <div className="mt-5">
          <p className="form-label">Additional notes</p>
          <p className="body-s text-ink-2 mt-2" style={{ whiteSpace: "pre-wrap" }}>
            {request.additional_notes}
          </p>
        </div>
      )}
      {request.product_url && (
        <div className="mt-5">
          <p className="form-label">Submitted product URL</p>
          <a
            className="body-s text-ink-2 mt-2 inline-block"
            href={request.product_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ overflowWrap: "anywhere" }}
          >
            Open submitted HTTPS reference
          </a>
          <p className="body-s text-ink-mute mt-1">Stored only. The server does not fetch or preview this URL.</p>
        </div>
      )}
      {request.files.length > 0 && (
        <div className="mt-5">
          <p className="form-label">Private attachments</p>
          <ul className="grid gap-2 mt-2" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {request.files.map((file) => (
              <li key={file.fileId} className="flex flex-wrap items-center justify-between gap-3">
                <span className="body-s">
                  {file.originalFilename} · {Math.ceil(file.sizeBytes / 1024)} KB · {file.state}
                </span>
                {file.state === "confirmed" && (
                  <button type="button" className="btn btn-secondary" onClick={() => void openFile(file.fileId)}>
                    Open private file
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {notice && (
        <p className="body-s text-ink-2 mt-3" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}

function AdminUpdateForm({
  request,
  token,
  onUpdated,
}: {
  request: AdminRequestDetail;
  token: string;
  onUpdated: () => void;
}) {
  const [status, setStatus] = useState<ProductRequestStatus>(request.status);
  const [priority, setPriority] = useState<ProductRequestPriority>(request.priority);
  const [owner, setOwner] = useState(request.assigned_owner ?? "");
  const [memberUpdate, setMemberUpdate] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [linkedProduct, setLinkedProduct] = useState(request.linked_product_ref ?? "");
  const [candidateId, setCandidateId] = useState(request.candidate_id ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const result = await updateAdminProductRequest(token, request.id, {
      expectedVersion: request.version,
      status,
      priority,
      assignedOwner: owner || null,
      memberVisibleUpdate: memberUpdate || null,
      internalNote: internalNote || null,
      linkedProductRef: linkedProduct || null,
      candidateId: candidateId || null,
    });
    setBusy(false);
    if (result.kind === "ok") {
      setMemberUpdate("");
      setInternalNote("");
      onUpdated();
    }
    else if (result.kind === "denied") setNotice(result.message ?? "Product-request permission is required.");
    else setNotice(result.kind === "error" ? result.message : "The request changed or could not be updated. Reload and retry.");
  };

  return (
    <section className="card grid gap-4" aria-label="Review controls">
      <h2 className="body-l font-700">Review controls</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status">
          <select className="input-field" value={status} onChange={(event) => setStatus(event.target.value as ProductRequestStatus)}>
            {PRODUCT_REQUEST_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select className="input-field" value={priority} onChange={(event) => setPriority(event.target.value as ProductRequestPriority)}>
            {PRODUCT_REQUEST_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Assigned owner">
          <input className="input-field" value={owner} onChange={(event) => setOwner(event.target.value)} maxLength={180} />
        </Field>
        <Field label="Linked product reference" hint="Links an existing reviewed catalog record. It does not create one.">
          <input
            className="input-field"
            value={linkedProduct}
            onChange={(event) => setLinkedProduct(event.target.value)}
            maxLength={180}
          />
        </Field>
        <Field
          label="Demand candidate ID"
          hint="Connect duplicate requests by assigning an existing demand candidate. This does not create a product."
        >
          <input
            className="input-field"
            value={candidateId}
            onChange={(event) => setCandidateId(event.target.value)}
            maxLength={36}
          />
        </Field>
      </div>
      <Field label="Member-visible update" hint="Only meaningful member-facing updates trigger one idempotent email.">
        <textarea
          className="input-field"
          rows={3}
          value={memberUpdate}
          onChange={(event) => setMemberUpdate(event.target.value)}
          maxLength={3000}
        />
      </Field>
      <Field label="Internal note" hint="Never shown to the member and never triggers an email.">
        <textarea
          className="input-field"
          rows={4}
          value={internalNote}
          onChange={(event) => setInternalNote(event.target.value)}
          maxLength={5000}
        />
      </Field>
      {request.internal_notes && (
        <div>
          <p className="form-label">Existing internal notes</p>
          <p className="body-s text-ink-2 mt-2" style={{ whiteSpace: "pre-wrap" }}>
            {request.internal_notes}
          </p>
        </div>
      )}
      {notice && (
        <p className="body-s text-ink-2" role="status">
          {notice}
        </p>
      )}
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
        {busy ? "Saving..." : "Save review update"}
      </button>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="mono-label text-ink-mute">{label}</dt>
      <dd className="body-s mt-1" style={{ overflowWrap: "anywhere" }}>
        {value}
      </dd>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="form-label">{label}</span>
      {hint && <span className="body-s text-ink-mute">{hint}</span>}
      {children}
    </label>
  );
}
