import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import {
  RESOURCE_AUDIENCES,
  RESOURCE_CHANGE_SUMMARY_MAX,
  RESOURCE_PDF_MAX_BYTES,
  RESOURCE_PURPOSE_MAX,
  RESOURCE_TITLE_MAX,
  RESOURCE_USAGE_POLICIES,
  RESOURCE_USAGE_POLICY_LABELS,
  resourceUploadSchema,
  resourceVersionReviewSchema,
  type ResourceAdminDto,
  type ResourceAdminListResponse,
  type ResourceAudience,
  type ResourceUploadInput,
  type ResourceUsagePolicy,
  type ResourceVersionAdminDto,
  type ResourceVersionReviewInput,
  type ResourceVersionState,
} from "@shared/research/resource-hub/contract";
import { resourceAudienceLabel } from "../../adapters/partner";
import {
  downloadResourceHubVersion,
  listResourceHubResources,
  reviewResourceHubVersion,
  uploadResourceHubVersion,
  type ResourceHubWriteResult,
} from "../../adapters/resourceHubAdmin";
import { ResearchEmptyState, ResearchMetricCard, ResearchStatusBadge, type BadgeTone } from "../../ui/kit";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";
import { fmtDateTime, useAdminResource } from "./auth";

// ---------------------------------------------------------------------------
// Resource Hub operations (/admin/research/resource-hub). An admin uploads a
// real PDF, assigns audience and usage policy, reviews the exact version,
// publishes it, and can withdraw it. Every transition is a server decision
// recorded against the version; this page renders only the transitions the
// version's current state allows and never invents a state. Bytes are
// immutable per version: a new upload is a new version, never an edit.
// ---------------------------------------------------------------------------

const loadResourceHub = (token: string) => listResourceHubResources(token);

const STATE_LABELS: Readonly<Record<ResourceVersionState, string>> = {
  quarantined: "Quarantined",
  draft: "Draft",
  in_review: "In review",
  published: "Published",
  superseded: "Superseded",
  withdrawn: "Withdrawn",
};

function stateTone(state: ResourceVersionState): BadgeTone {
  switch (state) {
    case "published":
      return "success";
    case "in_review":
      return "info";
    case "quarantined":
      return "warning";
    case "withdrawn":
      return "danger";
    case "superseded":
      return "pending";
    default:
      return "neutral";
  }
}

function usageTone(policy: ResourceUsagePolicy): BadgeTone {
  switch (policy) {
    case "external_share":
      return "success";
    case "private":
      return "info";
    case "draft":
      return "warning";
    default:
      return "neutral";
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shortSha(sha256: string): string {
  return sha256.length > 12 ? `${sha256.slice(0, 12)}…` : sha256;
}

function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `rh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

// Save server-streamed bytes through a short-lived object URL.
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type FieldErrors = Record<string, string[]>;

// Server field names map onto the form's fields. The metadata's filename and
// the server's verdict on the bytes ("file") both describe the one file input.
function formFieldFor(serverField: string): string {
  if (serverField === "originalFilename" || serverField === "file") return "file";
  return serverField;
}

function mergeFieldErrors(into: FieldErrors, field: string, messages: string[]): FieldErrors {
  const key = formFieldFor(field);
  return { ...into, [key]: [...(into[key] ?? []), ...messages] };
}

function issuesToFieldErrors(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): FieldErrors {
  let out: FieldErrors = {};
  for (const issue of issues) {
    const head = issue.path[0];
    const field = typeof head === "string" ? head : "form";
    out = mergeFieldErrors(out, field, [issue.message]);
  }
  return out;
}

function writeFailureMessage(result: Exclude<ResourceHubWriteResult<unknown>, { kind: "ok" }>, what: string): string {
  switch (result.kind) {
    case "unauthorized":
      return `Your admin session has ended. Sign in again; ${what} was not recorded.`;
    case "forbidden":
      return `This account is not authorized for the Resource Hub. ${what} was not recorded.`;
    case "unavailable":
      return `The Resource Hub API is not mounted in this environment. ${what} was not recorded.`;
    case "error":
      return `${result.message} If the connection dropped, retrying reuses the same idempotency key, so nothing is duplicated.`;
    case "denied":
      switch (result.code) {
        case "invalid_resource_upload":
          return result.message ?? "The server rejected the file. Check the highlighted field.";
        case "invalid_resource_metadata":
          return result.message ?? "The server rejected the details. Check the highlighted fields.";
        case "resource_state_conflict":
          return result.message ?? "The version is no longer in a state that allows this. Refresh and look again.";
        case "not_found":
          return result.message ?? "That resource or version no longer exists. Refresh the list.";
        case "resource_hub_unavailable":
          return result.message ?? "The Resource Hub store is not configured in this environment. Nothing was recorded.";
        default:
          return result.message ?? `The server declined (${result.code}). Nothing was recorded.`;
      }
  }
}

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="body-s mt-1" role="alert" style={{ color: "var(--error)", overflowWrap: "anywhere" }}>
      {messages.join(" ")}
    </p>
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

// ---------------------------------------------------------------------------
// Upload form: one PDF becomes one new version (of a new or existing
// resource). Client pre-checks name the obvious problems before any bytes
// are sent; the shared zod schema validates the exact metadata the server
// will see; the file itself travels untouched as the request body and is
// judged only by the server; server field errors land on the field they
// name. The idempotency key is minted once per attempt and reused only when
// the outcome was uncertain.
// ---------------------------------------------------------------------------

type UploadStatus =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "failure"; message: string };

function UploadForm({
  token,
  resources,
  onUploaded,
}: {
  token: string;
  resources: ResourceAdminDto[];
  /** Called with the outcome line after a successful upload; the list reloads. */
  onUploaded: (message: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [usagePolicy, setUsagePolicy] = useState<ResourceUsagePolicy>("private");
  const [audience, setAudience] = useState<ResourceAudience[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [resourceId, setResourceId] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<UploadStatus>({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attemptKeyRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const busy = status.kind === "submitting";

  function toggleAudience(value: ResourceAudience, checked: boolean) {
    setAudience((current) => {
      const without = current.filter((item) => item !== value);
      return checked ? [...without, value] : without;
    });
  }

  function preCheck(): FieldErrors {
    let found: FieldErrors = {};
    if (!file) {
      found = mergeFieldErrors(found, "file", ["Choose a PDF file to upload."]);
    } else {
      if (!/\.pdf$/iu.test(file.name)) {
        found = mergeFieldErrors(found, "file", [
          `"${file.name}" is not a PDF. This release accepts .pdf files only.`,
        ]);
      }
      if (file.size > RESOURCE_PDF_MAX_BYTES) {
        found = mergeFieldErrors(found, "file", [
          `"${file.name}" is ${formatBytes(file.size)}, larger than the ${formatBytes(RESOURCE_PDF_MAX_BYTES)} limit.`,
        ]);
      }
      if (file.size === 0) {
        found = mergeFieldErrors(found, "file", [`"${file.name}" is empty.`]);
      }
    }
    if (title.trim().length < 3) found = mergeFieldErrors(found, "title", ["Give the resource a title of at least 3 characters."]);
    if (purpose.trim().length < 10) {
      found = mergeFieldErrors(found, "purpose", ["Say who this is for and how to use it (at least 10 characters)."]);
    }
    if (audience.length === 0) found = mergeFieldErrors(found, "audience", ["Choose at least one audience."]);
    return found;
  }

  function resetForm() {
    setTitle("");
    setPurpose("");
    setUsagePolicy("private");
    setAudience([]);
    setFile(null);
    setResourceId("");
    setChangeSummary("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ kind: "idle" });
    const pre = preCheck();
    setErrors(pre);
    if (Object.keys(pre).length > 0 || !file) return;

    // One key per attempt, bound to the exact form contents. A definitive
    // answer (ok, denied, unauthorized, forbidden) ends the attempt; an
    // uncertain one (network failure, or a 503 that may have landed) keeps the
    // key so a retry cannot create a second version. Editing any field or
    // choosing another file starts a new attempt, so a changed upload can
    // never be swallowed as a replay of the earlier one.
    const fingerprint = JSON.stringify([
      title.trim(),
      purpose.trim(),
      usagePolicy,
      [...audience].sort(),
      file.name,
      file.size,
      file.lastModified,
      resourceId,
      changeSummary.trim(),
    ]);
    if (!attemptKeyRef.current || attemptKeyRef.current.fingerprint !== fingerprint) {
      attemptKeyRef.current = { fingerprint, key: newIdempotencyKey() };
    }
    const idempotencyKey = attemptKeyRef.current.key;

    // Metadata only: the bytes are never read into memory here. They go to
    // the server as the raw request body alongside this metadata.
    const payload: ResourceUploadInput = {
      title: title.trim(),
      purpose: purpose.trim(),
      usagePolicy,
      audience,
      originalFilename: file.name,
      ...(resourceId ? { resourceId } : {}),
      ...(changeSummary.trim() ? { changeSummary: changeSummary.trim() } : {}),
      idempotencyKey,
    };
    const parsed = resourceUploadSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error.issues));
      setStatus({ kind: "failure", message: "Fix the highlighted fields. Nothing was uploaded." });
      return;
    }

    setStatus({ kind: "submitting" });
    const result = await uploadResourceHubVersion(token, parsed.data, file);
    if (result.kind === "ok") {
      attemptKeyRef.current = null;
      const newest = [...result.data.resource.versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];
      resetForm();
      setErrors({});
      setStatus({ kind: "idle" });
      // The outcome line lives above the boundary: the list reloads on
      // success, which remounts this form, so a local message would vanish.
      onUploaded(
        newest
          ? `Uploaded "${result.data.resource.title}" as version ${newest.versionNumber}. It is ${STATE_LABELS[newest.state].toLowerCase()}; send it for review, approve it, and publish it from the list below when it is ready.`
          : `Uploaded "${result.data.resource.title}". Review it in the list below.`,
      );
      return;
    }
    if (result.kind !== "error" && result.kind !== "unavailable") attemptKeyRef.current = null;
    if (result.kind === "denied" && result.fieldErrors) {
      let mapped: FieldErrors = {};
      for (const [field, messages] of Object.entries(result.fieldErrors)) mapped = mergeFieldErrors(mapped, field, messages);
      setErrors(mapped);
    }
    setStatus({ kind: "failure", message: writeFailureMessage(result, "The upload") });
  }

  const versionOf = resources.find((resource) => resource.resourceId === resourceId) ?? null;

  return (
    <form
      className="card"
      aria-labelledby="resource-hub-upload-title"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
      data-testid="resource-hub-upload"
    >
      <h2 id="resource-hub-upload-title" className="body-l font-700">
        Upload a PDF version
      </h2>
      <p className="body-s text-ink-2 mt-1">
        The file is checked here for type and size and judged again by the server (PDF signature, size, no scripts,
        launch actions, embedded files, or encryption). A file that fails is rejected and nothing is stored. A file
        that passes becomes a draft version; review and publishing are separate steps below.
      </p>

      <div
        className="grid gap-4 mt-5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))" }}
      >
        <div>
          <label htmlFor="resource-hub-title" className="form-label">
            Title
          </label>
          <input
            id="resource-hub-title"
            className="input-field"
            type="text"
            value={title}
            maxLength={RESOURCE_TITLE_MAX}
            disabled={busy}
            aria-describedby={errors.title ? "resource-hub-title-error" : undefined}
            aria-invalid={errors.title ? true : undefined}
            onChange={(event) => setTitle(event.target.value)}
          />
          <FieldError id="resource-hub-title-error" messages={errors.title} />
        </div>

        <div>
          <label htmlFor="resource-hub-usage" className="form-label">
            Usage policy
          </label>
          <select
            id="resource-hub-usage"
            className="input-field"
            value={usagePolicy}
            disabled={busy}
            onChange={(event) => setUsagePolicy(event.target.value as ResourceUsagePolicy)}
          >
            {RESOURCE_USAGE_POLICIES.map((policy) => (
              <option key={policy} value={policy}>
                {RESOURCE_USAGE_POLICY_LABELS[policy]}
              </option>
            ))}
          </select>
          <FieldError id="resource-hub-usage-error" messages={errors.usagePolicy} />
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="resource-hub-purpose" className="form-label">
          Purpose (who this is for and how to use it)
        </label>
        <textarea
          id="resource-hub-purpose"
          className="input-field"
          rows={3}
          value={purpose}
          maxLength={RESOURCE_PURPOSE_MAX}
          disabled={busy}
          aria-describedby={errors.purpose ? "resource-hub-purpose-error" : undefined}
          aria-invalid={errors.purpose ? true : undefined}
          onChange={(event) => setPurpose(event.target.value)}
        />
        <FieldError id="resource-hub-purpose-error" messages={errors.purpose} />
      </div>

      <fieldset className="mt-4" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <legend className="form-label">Audience</legend>
        <div
          className="grid gap-2 mt-1"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}
        >
          {RESOURCE_AUDIENCES.map((value) => {
            const id = `resource-hub-audience-${value}`;
            return (
              <label key={value} htmlFor={id} className="body-s text-ink-2 flex items-center gap-2" style={{ minHeight: 44 }}>
                <input
                  id={id}
                  type="checkbox"
                  value={value}
                  checked={audience.includes(value)}
                  disabled={busy}
                  onChange={(event) => toggleAudience(value, event.target.checked)}
                />
                <span>{resourceAudienceLabel(value)}</span>
              </label>
            );
          })}
        </div>
        <FieldError id="resource-hub-audience-error" messages={errors.audience} />
      </fieldset>

      <div
        className="grid gap-4 mt-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))" }}
      >
        <div>
          <label htmlFor="resource-hub-file" className="form-label">
            PDF file
          </label>
          <input
            ref={fileInputRef}
            id="resource-hub-file"
            className="input-field"
            type="file"
            accept=".pdf,application/pdf"
            disabled={busy}
            aria-describedby={errors.file ? "resource-hub-file-error" : "resource-hub-file-hint"}
            aria-invalid={errors.file ? true : undefined}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <p id="resource-hub-file-hint" className="body-s text-ink-mute mt-1" style={{ overflowWrap: "anywhere" }}>
            {file
              ? `${file.name} · ${formatBytes(file.size)}`
              : `PDF only, up to ${formatBytes(RESOURCE_PDF_MAX_BYTES)}.`}
          </p>
          <FieldError id="resource-hub-file-error" messages={errors.file} />
        </div>

        <div>
          <label htmlFor="resource-hub-version-of" className="form-label">
            New version of (optional)
          </label>
          <select
            id="resource-hub-version-of"
            className="input-field"
            value={resourceId}
            disabled={busy}
            onChange={(event) => setResourceId(event.target.value)}
          >
            <option value="">A new resource</option>
            {resources.map((resource) => (
              <option key={resource.resourceId} value={resource.resourceId}>
                {resource.title}
              </option>
            ))}
          </select>
          <FieldError id="resource-hub-version-of-error" messages={errors.resourceId} />
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="resource-hub-change-summary" className="form-label">
          Change summary {versionOf ? `for the next version of "${versionOf.title}"` : "(optional)"}
        </label>
        <textarea
          id="resource-hub-change-summary"
          className="input-field"
          rows={2}
          value={changeSummary}
          maxLength={RESOURCE_CHANGE_SUMMARY_MAX}
          disabled={busy}
          onChange={(event) => setChangeSummary(event.target.value)}
        />
        <FieldError id="resource-hub-change-summary-error" messages={errors.changeSummary} />
      </div>

      <FieldError id="resource-hub-form-error" messages={errors.form ?? errors.idempotencyKey} />

      <div className="flex items-center gap-4 flex-wrap mt-5">
        <button type="submit" className="btn btn-primary" style={{ minHeight: 44 }} disabled={busy} data-testid="resource-hub-submit">
          {status.kind === "submitting" ? "Uploading..." : "Upload version"}
        </button>
        {status.kind === "failure" && (
          <p className="body-s" role="alert" style={{ color: "var(--error)", overflowWrap: "anywhere" }}>
            {status.message}
          </p>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// One version row: facts, validation, and only the transitions its state
// allows. Approve and withdraw ask for a reason (recorded, never shown to
// partners). The preview download streams the exact bytes behind the admin
// bearer.
// ---------------------------------------------------------------------------

type ReviewAction = ResourceVersionReviewInput["action"];

function transitionsFor(version: ResourceVersionAdminDto) {
  return {
    request_review: version.state === "draft",
    // Approval is recorded once; an already-approved version offers Publish, not a second approval.
    approve_content: (version.state === "draft" || version.state === "in_review") && version.reviewedAt === null,
    // A "Draft / review required" version is never publishable: the server
    // refuses it too, so the action is not offered here.
    publish: version.state === "in_review" && version.reviewedAt !== null && version.validation.ok && version.usagePolicy !== "draft",
    withdraw: version.state === "published",
    preview: version.state !== "quarantined",
  };
}

function VersionRow({
  resource,
  version,
  token,
  onChanged,
}: {
  resource: ResourceAdminDto;
  version: ResourceVersionAdminDto;
  token: string;
  /** Called with the outcome line after a recorded transition; the list reloads. */
  onChanged: (message: string) => void;
}) {
  const [pending, setPending] = useState<Extract<ReviewAction, "approve_content" | "withdraw"> | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<ReviewAction | "preview" | null>(null);
  const [error, setError] = useState("");
  const attemptKeyRef = useRef<string | null>(null);
  const can = transitionsFor(version);
  const vid = version.versionId;

  async function runReview(action: ReviewAction, withReason?: string) {
    if (!attemptKeyRef.current) attemptKeyRef.current = newIdempotencyKey();
    const input: ResourceVersionReviewInput = {
      action,
      ...(withReason ? { reason: withReason } : {}),
      idempotencyKey: attemptKeyRef.current,
    };
    const parsed = resourceVersionReviewSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    setBusy(action);
    setError("");
    const result = await reviewResourceHubVersion(token, resource.resourceId, vid, parsed.data);
    setBusy(null);
    if (result.kind === "ok") {
      attemptKeyRef.current = null;
      setPending(null);
      setReason("");
      const next = result.data.resource.versions.find((item) => item.versionId === vid);
      onChanged(
        next
          ? `Recorded. "${resource.title}" version ${version.versionNumber} is now ${STATE_LABELS[next.state].toLowerCase()}.`
          : `Recorded. "${resource.title}" version ${version.versionNumber} was updated.`,
      );
      return;
    }
    if (result.kind !== "error" && result.kind !== "unavailable") attemptKeyRef.current = null;
    const fieldText =
      result.kind === "denied" && result.fieldErrors
        ? " " + Object.values(result.fieldErrors).flat().join(" ")
        : "";
    setError(writeFailureMessage(result, "The change") + fieldText);
  }

  async function preview() {
    setBusy("preview");
    setError("");
    const result = await downloadResourceHubVersion(token, resource.resourceId, vid);
    setBusy(null);
    if (result.kind === "ok") {
      saveBlob(result.blob, result.filename ?? version.originalFilename);
      return;
    }
    setError(
      result.kind === "error"
        ? result.message
        : result.kind === "unauthorized"
          ? "Your admin session has ended. Sign in again to preview this version."
          : result.kind === "forbidden"
            ? "This account is not authorized to read this version."
            : "This version's bytes are not available right now. Nothing was downloaded.",
    );
  }

  function confirmReason() {
    if (!pending) return;
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setError("Give a reason of at least 3 characters. It is recorded for the audit trail and never shown to partners.");
      return;
    }
    void runReview(pending, trimmed);
  }

  return (
    <div className="ra-state" data-testid={`version-${vid}`} aria-label={`Version ${version.versionNumber}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div style={{ minWidth: 0 }}>
          <p className="body-m font-700">Version {version.versionNumber}</p>
          <p className="body-s text-ink-mute mt-1" style={{ overflowWrap: "anywhere" }}>
            {version.originalFilename} · {formatBytes(version.sizeBytes)} · sha256 {shortSha(version.sha256)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ResearchStatusBadge label={STATE_LABELS[version.state]} tone={stateTone(version.state)} />
          <ResearchStatusBadge
            label={version.validation.ok ? "Validation passed" : "Validation failed"}
            tone={version.validation.ok ? "success" : "danger"}
          />
          <ResearchStatusBadge label={RESOURCE_USAGE_POLICY_LABELS[version.usagePolicy]} tone={usageTone(version.usagePolicy)} />
        </div>
      </div>

      {!version.validation.ok && version.validation.reasons.length > 0 && (
        <div className="mt-3" role="status">
          <p className="body-s font-700">Why validation failed</p>
          <ul className="body-s text-ink-2 mt-1" style={{ paddingLeft: "1.2em" }}>
            {version.validation.reasons.map((item) => (
              <li key={item} style={{ overflowWrap: "anywhere" }}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div
        className="grid gap-4 mt-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}
      >
        <Field label="Audience" value={version.audience.map(resourceAudienceLabel).join(", ") || "None"} />
        <Field label="Uploaded" value={fmtDateTime(version.uploadedAt) || "Unknown"} />
        <Field label="Content approved" value={fmtDateTime(version.reviewedAt) || "Not yet"} />
        <Field label="Published" value={fmtDateTime(version.publishedAt) || "Not published"} />
        {version.withdrawnAt && <Field label="Withdrawn" value={fmtDateTime(version.withdrawnAt) || "Yes"} />}
        {version.supersedesVersionId && (
          <Field
            label="Supersedes"
            value={
              resource.versions.find((item) => item.versionId === version.supersedesVersionId)
                ? `Version ${resource.versions.find((item) => item.versionId === version.supersedesVersionId)?.versionNumber}`
                : "An earlier version"
            }
          />
        )}
        {version.changeSummary && <Field label="Change summary" value={version.changeSummary} />}
      </div>

      <div className="flex items-center gap-3 flex-wrap mt-4">
        {can.request_review && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ minHeight: 44 }}
            disabled={busy !== null}
            onClick={() => void runReview("request_review")}
            data-testid={`action-request_review-${vid}`}
          >
            {busy === "request_review" ? "Requesting..." : "Request review"}
          </button>
        )}
        {can.approve_content && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ minHeight: 44 }}
            disabled={busy !== null}
            aria-expanded={pending === "approve_content"}
            onClick={() => {
              setError("");
              setPending((current) => (current === "approve_content" ? null : "approve_content"));
            }}
            data-testid={`action-approve_content-${vid}`}
          >
            Approve content
          </button>
        )}
        {can.publish && (
          <button
            type="button"
            className="btn btn-primary"
            style={{ minHeight: 44 }}
            disabled={busy !== null}
            onClick={() => void runReview("publish")}
            data-testid={`action-publish-${vid}`}
          >
            {busy === "publish" ? "Publishing..." : "Publish"}
          </button>
        )}
        {can.withdraw && (
          <button
            type="button"
            className="btn btn-secondary ra-btn-danger"
            style={{ minHeight: 44 }}
            disabled={busy !== null}
            aria-expanded={pending === "withdraw"}
            onClick={() => {
              setError("");
              setPending((current) => (current === "withdraw" ? null : "withdraw"));
            }}
            data-testid={`action-withdraw-${vid}`}
          >
            Withdraw
          </button>
        )}
        {can.preview && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 44 }}
            disabled={busy !== null}
            onClick={() => void preview()}
            data-testid={`preview-${vid}`}
          >
            {busy === "preview" ? "Preparing..." : "Admin preview download"}
          </button>
        )}
        {!can.request_review && !can.approve_content && !can.publish && !can.withdraw && (
          <span className="body-s text-ink-mute">
            {version.state === "quarantined"
              ? "No actions until validation passes."
              : "No further transitions for this version."}
          </span>
        )}
      </div>

      {pending && (
        <div className="mt-4" data-testid={`reason-form-${vid}`}>
          <label htmlFor={`reason-${vid}`} className="form-label">
            {pending === "approve_content" ? "Reason for approving this content" : "Reason for withdrawing this version"}
          </label>
          <input
            id={`reason-${vid}`}
            className="input-field"
            type="text"
            value={reason}
            maxLength={400}
            disabled={busy !== null}
            onChange={(event) => setReason(event.target.value)}
            data-testid={`reason-${vid}`}
          />
          <p className="body-s text-ink-mute mt-1">Recorded for the audit trail. Partners never see it.</p>
          <div className="flex items-center gap-3 flex-wrap mt-3">
            <button
              type="button"
              className={`btn ${pending === "withdraw" ? "btn-secondary ra-btn-danger" : "btn-primary"}`}
              style={{ minHeight: 44 }}
              disabled={busy !== null}
              onClick={confirmReason}
              data-testid={`confirm-${vid}`}
            >
              {busy === pending
                ? "Recording..."
                : pending === "approve_content"
                  ? "Confirm approval"
                  : "Confirm withdrawal"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: 44 }}
              disabled={busy !== null}
              onClick={() => {
                setPending(null);
                setReason("");
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="body-s mt-3" role="alert" style={{ color: "var(--error)", overflowWrap: "anywhere" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function ResourceCard({
  resource,
  token,
  onChanged,
}: {
  resource: ResourceAdminDto;
  token: string;
  onChanged: (message: string) => void;
}) {
  const headingId = `resource-hub-${resource.resourceId}-title`;
  const versions = [...resource.versions].sort((a, b) => b.versionNumber - a.versionNumber);
  const published = resource.currentPublishedVersionId
    ? resource.versions.find((item) => item.versionId === resource.currentPublishedVersionId) ?? null
    : null;

  return (
    <article className="card" aria-labelledby={headingId} data-testid={`resource-${resource.resourceId}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div style={{ minWidth: 0 }}>
          <p className="mono-label text-ink-mute">
            {resource.kind.toUpperCase()} · created {fmtDateTime(resource.createdAt) || "at an unknown time"}
          </p>
          <h2 id={headingId} className="body-l font-700 mt-1" style={{ overflowWrap: "anywhere" }}>
            {resource.title}
          </h2>
          <p className="body-s text-ink-2 mt-2" style={{ overflowWrap: "anywhere" }}>
            {resource.purpose}
          </p>
        </div>
        <ResearchStatusBadge
          label={published ? `Published: version ${published.versionNumber}` : "No published version"}
          tone={published ? "success" : "pending"}
        />
      </div>

      <div className="grid gap-3 mt-5" aria-label={`Versions of ${resource.title}`}>
        {versions.length === 0 ? (
          <p className="body-s text-ink-mute">No versions recorded.</p>
        ) : (
          versions.map((version) => (
            <VersionRow key={version.versionId} resource={resource} version={version} token={token} onChanged={onChanged} />
          ))
        )}
      </div>
    </article>
  );
}

function Hub({
  data,
  token,
  onChanged,
}: {
  data: ResourceAdminListResponse;
  token: string;
  /** Announces the outcome line and reloads the list from the server. */
  onChanged: (message: string) => void;
}) {
  const summary = useMemo(() => {
    const all = data.resources.flatMap((resource) => resource.versions);
    return {
      resources: data.resources.length,
      published: all.filter((version) => version.state === "published").length,
      awaitingReview: all.filter((version) => version.state === "in_review").length,
      withdrawn: all.filter((version) => version.state === "withdrawn").length,
    };
  }, [data.resources]);

  return (
    <div className="grid gap-7">
      <div className="ra-state" role="note" data-testid="resource-hub-standing-note">
        <p className="body-s font-700">What publishing does in this release</p>
        <p className="body-s text-ink-2 mt-1">
          Publishing makes the exact version visible to its audience on the partner Resources page and nothing else:
          it sends no notifications. External sharing is not enabled in this release; the &ldquo;
          {RESOURCE_USAGE_POLICY_LABELS.external_share}&rdquo; label records policy only, and partners see no share
          action.
        </p>
      </div>

      <section aria-label="Resource Hub summary">
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(190px, 100%), 1fr))" }}
        >
          <ResearchMetricCard label="Resources" value={String(summary.resources)} summary="Resources with at least one uploaded version." />
          <ResearchMetricCard label="Published versions" value={String(summary.published)} summary="Versions partners in the audience can list and download now." />
          <ResearchMetricCard label="Awaiting review" value={String(summary.awaitingReview)} summary="Versions with a review requested and no publish yet." />
          <ResearchMetricCard label="Withdrawn versions" value={String(summary.withdrawn)} summary="Versions pulled from partners; their bytes stay auditable." />
        </div>
      </section>

      <UploadForm token={token} resources={data.resources} onUploaded={onChanged} />

      {data.resources.length === 0 ? (
        <ResearchEmptyState
          title="No resources uploaded yet."
          body="Upload the first PDF above. A file that passes validation becomes a draft version and then moves through review and publish; partners see nothing until a version is published to their audience."
        />
      ) : (
        <section className="grid gap-4" aria-label="Resource library">
          {data.resources.map((resource) => (
            <ResourceCard key={resource.resourceId} resource={resource} token={token} onChanged={onChanged} />
          ))}
        </section>
      )}
    </div>
  );
}

export default function ResourceHubAdmin() {
  return (
    <AdminScreen
      title="Resource Hub"
      lead="Upload Xenios-published PDFs, assign audience and usage policy, review the exact version, and publish it to the partner Resources page. Bytes are immutable per version; every transition is recorded by the server."
    >
      {(token) => <ResourceHubAdminBody token={token} />}
    </AdminScreen>
  );
}

export function ResourceHubAdminBody({ token }: { token: string }) {
  const resource = useAdminResource(token, loadResourceHub);
  // The one outcome line for the page. A recorded transition or upload
  // reloads the list from the server (the boundary shows loading and remounts
  // the hub), so the message is held here, above the boundary, where it
  // survives the reload.
  const [outcome, setOutcome] = useState<string | null>(null);
  const reload = resource.reload;
  const onChanged = useCallback(
    (message: string) => {
      setOutcome(message);
      reload();
    },
    [reload],
  );

  return (
    <div className="grid gap-5">
      {outcome && (
        <div className="ra-state" role="status" data-testid="resource-hub-outcome">
          <p className="body-s text-ink-2" style={{ overflowWrap: "anywhere" }}>
            {outcome}
          </p>
        </div>
      )}
      <AdminBoundary
        state={resource.state}
        message={resource.message}
        deniedCode={resource.deniedCode}
        onRetry={resource.reload}
        unavailableTitle="The Resource Hub is not reachable."
        unavailableBody="Its API is not mounted in this environment, or the resource library migration has not been applied. Nothing has been uploaded or published from this screen."
      >
        {resource.data ? <Hub data={resource.data} token={token} onChanged={onChanged} /> : null}
      </AdminBoundary>
    </div>
  );
}
