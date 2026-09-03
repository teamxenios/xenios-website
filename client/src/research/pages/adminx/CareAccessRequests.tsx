import { useMemo, useState } from "react";
import {
  CARE_MANUAL_ACCESS_ADMIN_STATUSES,
  type CareManualAccessAdminListResponse,
  type CareManualAccessAdminRecord,
  type CareManualAccessAdminStatus,
} from "@shared/care/manual-access-admin";
import {
  listCareAccessRequests,
  updateCareAccessRequestStatus,
} from "../../adapters/careAdmin";
import {
  ResearchEmptyState,
  ResearchMetricCard,
  ResearchSecureNotice,
  ResearchStatusBadge,
  type BadgeTone,
} from "../../ui/kit";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";
import { fmtDateTime, useAdminResource } from "./auth";

const loadCareAccessRequests = (token: string) =>
  listCareAccessRequests(token);

function statusTone(status: string): BadgeTone {
  switch (status) {
    case "Closed":
      return "success";
    case "Not moving forward":
      return "neutral";
    case "Contacted":
    case "Secure intake sent":
    case "Provider handoff":
      return "info";
    case "New":
      return "warning";
    default:
      return "pending";
  }
}

function emailTone(emailStatus: string | null): BadgeTone {
  if (emailStatus === "sent") return "success";
  if (emailStatus === "failed") return "danger";
  return "warning";
}

function statusIsKnown(status: string): status is CareManualAccessAdminStatus {
  return (CARE_MANUAL_ACCESS_ADMIN_STATUSES as readonly string[]).includes(
    status,
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mono-label text-ink-mute">{label}</p>
      <p className="body-s text-ink-2 mt-1" style={{ overflowWrap: "anywhere" }}>
        {value}
      </p>
    </div>
  );
}

function CareRequestCard({
  request,
  token,
  saving,
  onSaving,
  onSaved,
  onError,
}: {
  request: CareManualAccessAdminRecord;
  token: string;
  saving: boolean;
  onSaving: (id: string) => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  async function changeStatus(status: CareManualAccessAdminStatus) {
    onSaving(request.id);
    onError("");
    const result = await updateCareAccessRequestStatus(
      token,
      request.id,
      status,
    );
    if (result.kind !== "ok") {
      onError(
        "The status was not changed. Refresh the queue and try again. If the problem continues, escalate it as an operations incident.",
      );
      onSaved();
      return;
    }
    onSaved();
  }

  const phoneHref = request.phone
    ? `tel:${request.phone.replace(/[^+0-9]/gu, "")}`
    : null;

  return (
    <article
      className="card"
      aria-labelledby={`care-request-${request.id}`}
      data-testid={`care-request-${request.reference}`}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div style={{ minWidth: 0 }}>
          <p className="mono-label text-ink-mute">{request.reference}</p>
          <h2
            id={`care-request-${request.id}`}
            className="body-l font-700 mt-1"
          >
            {request.fullName}
          </h2>
          <p className="body-s text-ink-mute mt-1">
            Submitted {fmtDateTime(request.createdAt) || "at an unknown time"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ResearchStatusBadge
            label={request.status}
            tone={statusTone(request.status)}
          />
          <ResearchStatusBadge
            label={
              request.emailStatus === "sent"
                ? "Notifications sent"
                : request.emailStatus === "failed"
                  ? "Notification failure"
                  : "Notification state unknown"
            }
            tone={emailTone(request.emailStatus)}
          />
          {request.dataQuality === "malformed" && (
            <ResearchStatusBadge label="Data needs review" tone="danger" />
          )}
        </div>
      </div>

      {request.attentionRequired && (
        <div className="mt-4 ra-state" role="status">
          <p className="body-s font-700">Action required</p>
          <p className="body-s text-ink-2 mt-1">
            {request.attentionReasons
              .map((reason) => reason.replaceAll("_", " "))
              .join(" · ")}
          </p>
        </div>
      )}

      <div
        className="grid gap-4 mt-5"
        style={{
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(210px, 100%), 1fr))",
        }}
      >
        <Field label="State" value={request.locationStateLabel} />
        <Field label="Routing category" value={request.careGoalLabel} />
        <Field label="Preferred contact" value={request.contactMethodLabel} />
        <Field label="Best time" value={request.contactWindowLabel} />
      </div>

      <div className="flex items-end justify-between gap-4 flex-wrap mt-5">
        <div className="flex items-center gap-3 flex-wrap">
          {request.email ? (
            <a className="btn btn-secondary" href={`mailto:${request.email}`}>
              Email
            </a>
          ) : null}
          {phoneHref ? (
            <a className="btn btn-secondary" href={phoneHref}>
              Call
            </a>
          ) : null}
          <span className="body-s text-ink-mute">
            {request.email || "Email unavailable"}
            {request.phone ? ` · ${request.phone}` : ""}
          </span>
        </div>

        <div style={{ minWidth: 240 }}>
          <label
            className="form-label"
            htmlFor={`care-status-${request.id}`}
          >
            Operational status
          </label>
          <select
            id={`care-status-${request.id}`}
            className="input-field"
            value={request.status}
            disabled={saving}
            onChange={(event) => {
              const next = event.target.value;
              if (statusIsKnown(next)) void changeStatus(next);
            }}
            data-testid={`care-status-${request.reference}`}
          >
            {!statusIsKnown(request.status) && (
              <option value={request.status}>{request.status}</option>
            )}
            {CARE_MANUAL_ACCESS_ADMIN_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          {saving && (
            <p className="body-s text-ink-mute mt-1" role="status">
              Saving...
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function Queue({
  data,
  token,
  reload,
}: {
  data: CareManualAccessAdminListResponse;
  token: string;
  reload: () => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const stateOptions = useMemo(
    () =>
      Array.from(
        new Set(
          data.requests
            .map((request) => request.locationState)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort(),
    [data.requests],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return data.requests.filter((request) => {
      const matchesQuery =
        !normalizedQuery ||
        [
          request.reference,
          request.fullName,
          request.email,
          request.phone ?? "",
          request.locationState ?? "",
          request.locationStateLabel,
        ].some((value) => value.toLowerCase().includes(normalizedQuery));
      const matchesStatus =
        statusFilter === "all" || request.status === statusFilter;
      const matchesState =
        stateFilter === "all" || request.locationState === stateFilter;
      return matchesQuery && matchesStatus && matchesState;
    });
  }, [data.requests, query, stateFilter, statusFilter]);

  return (
    <div className="grid gap-7">
      <section aria-label="Care request queue summary">
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(190px, 100%), 1fr))",
          }}
        >
          <ResearchMetricCard
            label="Total requests"
            value={String(data.summary.total)}
            summary="Durable Care access requests currently visible to operations."
          />
          <ResearchMetricCard
            label="New"
            value={String(data.summary.newCount)}
            summary="Requests that have not yet been marked contacted."
          />
          <ResearchMetricCard
            label="Needs attention"
            value={String(data.summary.attentionRequiredCount)}
            summary="New, notification-failed, notification-unknown, or malformed records."
          />
          <ResearchMetricCard
            label="Notification failures"
            value={String(data.summary.notificationFailureCount)}
            summary="Saved requests whose combined email delivery state is failed."
          />
          <ResearchMetricCard
            label="Data quality"
            value={String(data.summary.dataQualityIssueCount)}
            summary="Care rows kept visible even though their operational payload needs review."
          />
        </div>
      </section>

      {(data.summary.notificationFailureCount > 0 ||
        data.summary.notificationUnknownCount > 0 ||
        data.summary.dataQualityIssueCount > 0) && (
        <div className="ra-state" role="alert">
          <p className="body-m font-700">Queue integrity warning</p>
          <p className="body-s text-ink-2 mt-2">
            Every saved Care request remains visible, including records with
            notification or data-quality problems. Resolve the flagged items
            before treating the queue as operationally clear.
          </p>
        </div>
      )}

      <section className="card" aria-label="Care request filters">
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
          }}
        >
          <div>
            <label htmlFor="care-request-search" className="form-label">
              Search
            </label>
            <input
              id="care-request-search"
              className="input-field"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, email, phone, state or CARE reference"
            />
          </div>
          <div>
            <label htmlFor="care-request-status-filter" className="form-label">
              Status
            </label>
            <select
              id="care-request-status-filter"
              className="input-field"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              {CARE_MANUAL_ACCESS_ADMIN_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="care-request-state-filter" className="form-label">
              State
            </label>
            <select
              id="care-request-state-filter"
              className="input-field"
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value)}
            >
              <option value="all">All states</option>
              {stateOptions.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {actionError && (
        <div className="ra-state" role="alert">
          <p className="body-s font-700">Status update failed</p>
          <p className="body-s text-ink-2 mt-1">{actionError}</p>
        </div>
      )}

      {filtered.length === 0 ? (
        <ResearchEmptyState
          title={data.requests.length === 0 ? "No Care requests yet." : "No requests match these filters."}
          body={
            data.requests.length === 0
              ? "A successful public Care access request will appear here immediately after durable persistence, even if email delivery fails."
              : "Clear or change the filters to return to the full queue."
          }
        />
      ) : (
        <section className="grid gap-4" aria-label="Care access requests">
          {filtered.map((request) => (
            <CareRequestCard
              key={request.id}
              request={request}
              token={token}
              saving={savingId === request.id}
              onSaving={setSavingId}
              onSaved={() => {
                setSavingId(null);
                reload();
              }}
              onError={setActionError}
            />
          ))}
        </section>
      )}

      <ResearchSecureNotice>
        This queue contains operational routing data only. Do not place
        symptoms, diagnoses, medications, allergies, laboratory results,
        medical records, treatment notes, prescriptions, or clinical reasoning
        into this surface. Move clinical intake into the authorized secure Care
        system.
      </ResearchSecureNotice>
    </div>
  );
}

export default function CareAccessRequests() {
  return (
    <AdminScreen
      title="Care access requests"
      lead="Every successfully saved public Care request, projected from the same durable operations store and kept visible even when notifications or payload validation need attention."
    >
      {(token) => <CareAccessRequestsBody token={token} />}
    </AdminScreen>
  );
}

export function CareAccessRequestsBody({ token }: { token: string }) {
  const resource = useAdminResource(token, loadCareAccessRequests);

  return (
    <AdminBoundary
      state={resource.state}
      message={resource.message}
      deniedCode={resource.deniedCode}
      onRetry={resource.reload}
      unavailableTitle="The Care request queue is not reachable."
      unavailableBody="The request may still be durably saved. Check system status and escalate the missing admin projection instead of asking the customer to resubmit."
    >
      {resource.data ? (
        <Queue data={resource.data} token={token} reload={resource.reload} />
      ) : null}
    </AdminBoundary>
  );
}
