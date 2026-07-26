import { useMemo, useState, type FormEvent } from "react";
import { Link } from "wouter";
import {
  defineRequiredInput,
  listRequiredInputs,
  setReadinessManifest,
  transitionDomainLaunch,
  transitionRequiredInput,
} from "../../adapters/adminOps";
import {
  PRELAUNCH_ROLES,
  PRELAUNCH_LAUNCH_STATUSES,
  type PrelaunchLaunchStatus,
  type PrelaunchRole,
} from "@shared/research/prelaunch";
import {
  REQUIRED_INPUT_BLOCKING_LEVELS,
  REQUIRED_INPUT_ENTRY_MODES,
  type RequiredInput,
  type RequiredInputBlockingLevel,
  type RequiredInputEntryMode,
  type RequiredInputState,
  type RequiredInputSummary,
  type DomainReadiness,
} from "@shared/research/required-inputs";
import {
  ResearchEmptyState,
  ResearchMetricCard,
  ResearchSecureNotice,
  ResearchStatusBadge,
} from "../../ui/kit";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";
import { useAdminResource } from "./auth";

type RequiredInputsResponse = {
  ok: true;
  items: RequiredInput[];
  summary: RequiredInputSummary;
  readiness: DomainReadiness[];
};

const loadRequiredInputs = (token: string) => listRequiredInputs(token);

const STATE_LABELS: Record<RequiredInputState, string> = {
  missing: "Missing",
  entered: "Entered",
  under_review: "Under review",
  verified: "Verified",
  rejected: "Rejected",
  expired: "Expired",
  superseded: "Superseded",
  not_applicable: "Not applicable",
};

const NEXT_STATES: Record<RequiredInputState, RequiredInputState[]> = {
  missing: ["entered", "superseded"],
  entered: ["under_review", "missing", "superseded"],
  under_review: ["verified", "rejected", "not_applicable"],
  rejected: ["entered", "superseded"],
  verified: ["expired", "superseded"],
  expired: ["entered", "superseded"],
  superseded: [],
  not_applicable: ["superseded"],
};

const NEXT_LAUNCH_STATES: Record<
  PrelaunchLaunchStatus,
  PrelaunchLaunchStatus[]
> = {
  internal_build: ["internal_review", "disabled"],
  internal_review: ["ready_for_real_data", "paused", "disabled"],
  ready_for_real_data: ["real_data_entered", "paused", "disabled"],
  real_data_entered: ["release_review", "paused", "disabled"],
  release_review: ["public_enabled", "paused", "disabled"],
  public_enabled: ["paused", "disabled"],
  paused: [
    "internal_review",
    "ready_for_real_data",
    "real_data_entered",
    "release_review",
    "public_enabled",
    "disabled",
  ],
  disabled: ["internal_build"],
};

function toneFor(state: RequiredInputState) {
  if (state === "verified" || state === "not_applicable") return "success";
  if (state === "rejected" || state === "expired") return "danger";
  if (state === "entered" || state === "under_review") return "info";
  return "pending";
}

function readable(value: string) {
  return value.replace(/_/g, " ");
}

export default function RequiredInputs() {
  return (
    <AdminScreen
      title="Required inputs"
      lead="The exact real-world facts that block display, transactions, fulfillment, provider activation, clinical activation, or public launch. Technical keys and secret values never appear on public routes."
    >
      {(token) => <RequiredInputsBody token={token} />}
    </AdminScreen>
  );
}

function RequiredInputsBody({ token }: { token: string }) {
  const resource = useAdminResource<RequiredInputsResponse>(
    token,
    loadRequiredInputs,
  );
  return (
    <AdminBoundary
      state={resource.state}
      message={resource.message}
      deniedCode={resource.deniedCode}
      onRetry={resource.reload}
      unavailableTitle="Required inputs are not published yet."
      unavailableBody="The reviewed governance migration must be applied before this dashboard can read or change launch-blocking facts."
    >
      {resource.data && (
        <Dashboard
          token={token}
          data={resource.data}
          reload={resource.reload}
        />
      )}
    </AdminBoundary>
  );
}

export function Dashboard({
  token,
  data,
  reload,
}: {
  token: string;
  data: RequiredInputsResponse;
  reload: () => void;
}) {
  const grouped = useMemo(() => {
    const groups = new Map<string, RequiredInput[]>();
    for (const item of data.items) {
      const current = groups.get(item.domain) ?? [];
      current.push(item);
      groups.set(item.domain, current);
    }
    return Array.from(groups.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
  }, [data.items]);

  return (
    <div className="grid gap-8">
      <section aria-labelledby="required-input-summary">
        <h2 id="required-input-summary" className="heading-m">
          Release blockers
        </h2>
        <div
          className="grid gap-4 mt-4"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          }}
        >
          <ResearchMetricCard
            label="Total"
            value={String(data.summary.total)}
            summary="Governed inputs across all domains."
          />
          <ResearchMetricCard
            label="Missing"
            value={String(data.summary.missing)}
            summary="Facts that have not been entered."
          />
          <ResearchMetricCard
            label="Launch blocking"
            value={String(data.summary.launchBlocking)}
            summary="Unresolved inputs that block public release."
          />
          <ResearchMetricCard
            label="Clinical blocking"
            value={String(data.summary.clinicalBlocking)}
            summary="Unresolved inputs that block clinical activation."
          />
          <ResearchMetricCard
            label="Verified"
            value={String(data.summary.verified)}
            summary="Inputs approved through the review workflow."
          />
        </div>
      </section>

      <ReadinessScorecard token={token} rows={data.readiness} onSaved={reload} />

      <DefineInputForm token={token} onSaved={reload} />

      <section aria-labelledby="required-input-register">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="mono-label text-ink-mute">Canonical register</p>
            <h2 id="required-input-register" className="heading-m mt-1">
              Inputs by domain
            </h2>
          </div>
          <button type="button" className="btn btn-secondary" onClick={reload}>
            Refresh
          </button>
        </div>
        {grouped.length === 0 ? (
          <div className="mt-4">
            <ResearchEmptyState
              title="No required inputs have been defined."
              body="Create the exact fact needed by a workflow. The system does not seed operational facts or infer readiness."
            />
          </div>
        ) : (
          <div className="grid gap-8 mt-5">
            {grouped.map(([domain, items]) => (
              <div key={domain}>
                <p className="mono-label text-ink-mute">{readable(domain)}</p>
                <div className="grid gap-4 mt-3">
                  {items.map((item) => (
                    <RequiredInputCard
                      key={item.id}
                      token={token}
                      item={item}
                      onSaved={reload}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <ResearchSecureNotice>
        External secrets are referenced by configuration name only. This
        dashboard cannot store or return credential values, and public routes
        never expose this internal register.
      </ResearchSecureNotice>
    </div>
  );
}

function ReadinessScorecard({
  token,
  rows,
  onSaved,
}: {
  token: string;
  rows: DomainReadiness[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby="readiness-scorecard">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="mono-label text-ink-mute">Launch control</p>
          <h2 id="readiness-scorecard" className="heading-m mt-1">
            Domain readiness
          </h2>
          <p className="body-s text-ink-2 mt-2 max-w-[68ch]">
            Software completion and real-input readiness are separate. Public
            enablement is a server transition and fails closed until the
            approved manifest and every blocking input agree.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Close manifest form" : "Approve manifest"}
        </button>
      </div>
      {open && <ManifestForm token={token} onSaved={onSaved} />}
      {rows.length === 0 ? (
        <div className="mt-4">
          <ResearchEmptyState
            title="No readiness manifests are approved."
            body="A domain remains in internal build until an administrator approves a versioned manifest with its exact required-input count."
          />
        </div>
      ) : (
        <div className="grid gap-4 mt-5">
          {rows.map((row) => (
            <ReadinessCard
              key={row.domain}
              token={token}
              readiness={row}
              onSaved={onSaved}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ManifestForm({
  token,
  onSaved,
}: {
  token: string;
  onSaved: () => void;
}) {
  const [domain, setDomain] = useState("");
  const [expectedVersion, setExpectedVersion] = useState("0");
  const [manifestVersion, setManifestVersion] = useState("1");
  const [manifestHash, setManifestHash] = useState("");
  const [expectedInputCount, setExpectedInputCount] = useState("");
  const [softwareComplete, setSoftwareComplete] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    const result = await setReadinessManifest<{ ok: true }>(token, domain, {
      expectedVersion: Number(expectedVersion),
      manifestVersion: Number(manifestVersion),
      manifestHash,
      expectedInputCount: Number(expectedInputCount),
      softwareComplete,
      reason,
    });
    setSaving(false);
    if (result.kind === "ok") {
      onSaved();
      return;
    }
    setNotice(
      "The manifest was rejected. Confirm the reviewed SHA-256 hash, expected count, and current domain version.",
    );
  }

  return (
    <form className="card grid gap-5 mt-5" onSubmit={submit}>
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
      >
        <TextField
          id="manifest-domain"
          label="Domain"
          value={domain}
          onChange={setDomain}
        />
        <TextField
          id="manifest-current-version"
          label="Current domain version"
          value={expectedVersion}
          onChange={setExpectedVersion}
          hint="Use 0 for a domain's first manifest."
        />
        <TextField
          id="manifest-version"
          label="Manifest version"
          value={manifestVersion}
          onChange={setManifestVersion}
        />
        <TextField
          id="manifest-input-count"
          label="Expected input count"
          value={expectedInputCount}
          onChange={setExpectedInputCount}
        />
      </div>
      <TextField
        id="manifest-hash"
        label="Reviewed manifest SHA-256"
        value={manifestHash}
        onChange={setManifestHash}
        hint="64 lowercase hexadecimal characters. This binds the release review to an exact manifest."
      />
      <TextArea
        id="manifest-reason"
        label="Approval reason"
        value={reason}
        onChange={setReason}
      />
      <label className="flex items-start gap-3 body-s">
        <input
          type="checkbox"
          checked={softwareComplete}
          onChange={(event) => setSoftwareComplete(event.target.checked)}
        />
        <span>
          Software is complete for this manifest. This does not assert that
          real inputs are present or enable public access.
        </span>
      </label>
      {notice && (
        <p role="alert" className="body-s" style={{ color: "var(--error)" }}>
          {notice}
        </p>
      )}
      <div>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving..." : "Approve readiness manifest"}
        </button>
      </div>
    </form>
  );
}

function ReadinessCard({
  token,
  readiness,
  onSaved,
}: {
  token: string;
  readiness: DomainReadiness;
  onSaved: () => void;
}) {
  const nextStates = NEXT_LAUNCH_STATES[readiness.launchStatus];
  const [target, setTarget] = useState<PrelaunchLaunchStatus>(
    nextStates[0] ?? readiness.launchStatus,
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    const result = await transitionDomainLaunch<{ ok: true }>(
      token,
      readiness.domain,
      {
        expectedVersion: readiness.version,
        targetStatus: target,
        reason,
      },
    );
    setSaving(false);
    if (result.kind === "ok") {
      onSaved();
      return;
    }
    setNotice(
      target === "public_enabled"
        ? "Public enablement is blocked until software, manifest count, and every blocking input pass server validation."
        : "The launch transition was rejected. Reload the current version and follow the allowed sequence.",
    );
  }

  return (
    <article className="card">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="mono-label text-ink-mute">{readiness.domain}</p>
          <h3 className="heading-s mt-1">
            {readiness.softwareComplete
              ? "Software complete"
              : "Software completion required"}
          </h3>
          <p className="body-s text-ink-2 mt-2">
            {readiness.blockingInputCount} blocking input
            {readiness.blockingInputCount === 1 ? "" : "s"} ·{" "}
            {readiness.actualInputCount} of {readiness.expectedInputCount}{" "}
            expected inputs defined
          </p>
        </div>
        <ResearchStatusBadge
          label={readable(readiness.launchStatus)}
          tone={readiness.publicEnabled ? "success" : "pending"}
        />
      </div>
      {readiness.blockingKeys.length > 0 && (
        <div className="mt-4">
          <p className="mono-label text-ink-mute">Blocking inputs</p>
          <p className="body-s text-ink-2 mt-1">
            {readiness.blockingKeys.join(", ")}
          </p>
        </div>
      )}
      <form
        className="grid gap-4 mt-5 pt-5"
        style={{ borderTop: "1px solid var(--border)" }}
        onSubmit={submit}
      >
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
        >
          <SelectField
            id={`launch-${readiness.domain}`}
            label="Next launch state"
            value={target}
            options={nextStates.length ? nextStates : PRELAUNCH_LAUNCH_STATUSES}
            onChange={(value) => setTarget(value as PrelaunchLaunchStatus)}
          />
          <TextField
            id={`launch-reason-${readiness.domain}`}
            label="Transition reason"
            value={reason}
            onChange={setReason}
          />
        </div>
        {notice && (
          <p role="alert" className="body-s" style={{ color: "var(--error)" }}>
            {notice}
          </p>
        )}
        <div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Record launch transition"}
          </button>
        </div>
      </form>
    </article>
  );
}

type DefinitionDraft = {
  key: string;
  domain: string;
  label: string;
  description: string;
  whyRequired: string;
  recordType: string;
  recordId: string;
  fieldPath: string;
  blockingLevel: RequiredInputBlockingLevel;
  responsibleRole: PrelaunchRole;
  verificationMethod: string;
  evidenceRequired: string;
  entryMode: RequiredInputEntryMode;
  publicLaunchImpact: string;
  nextAction: string;
  adminEntryHref: string;
};

const EMPTY_DEFINITION: DefinitionDraft = {
  key: "",
  domain: "",
  label: "",
  description: "",
  whyRequired: "",
  recordType: "",
  recordId: "",
  fieldPath: "",
  blockingLevel: "blocks_public_launch",
  responsibleRole: "super_admin",
  verificationMethod: "",
  evidenceRequired: "",
  entryMode: "record_reference",
  publicLaunchImpact: "",
  nextAction: "",
  adminEntryHref: "",
};

function DefineInputForm({
  token,
  onSaved,
}: {
  token: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DEFINITION);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function field<K extends keyof DefinitionDraft>(
    key: K,
    value: DefinitionDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    const result = await defineRequiredInput<{ ok: true }>(token, {
      ...draft,
      recordId: draft.recordId.trim() || null,
      evidenceRequired: draft.evidenceRequired
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean),
    });
    setSaving(false);
    if (result.kind === "ok") {
      setDraft(EMPTY_DEFINITION);
      setOpen(false);
      onSaved();
      return;
    }
    setNotice(
      result.kind === "unavailable"
        ? "The reviewed required-input migration is not available yet."
        : "The input could not be defined. Check the fields and confirm the key is unique.",
    );
  }

  return (
    <section className="card" aria-labelledby="define-required-input">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="mono-label text-ink-mute">Administrator workflow</p>
          <h2 id="define-required-input" className="heading-m mt-1">
            Define an exact required input
          </h2>
          <p className="body-s text-ink-2 mt-2 max-w-[68ch]">
            Name the missing fact, the workflow it blocks, the evidence needed,
            and the responsible reviewer. Do not enter invented operational
            data.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Close form" : "Define input"}
        </button>
      </div>
      {open && (
        <form className="grid gap-5 mt-6" onSubmit={submit}>
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            }}
          >
            <TextField
              id="required-key"
              label="Canonical key"
              value={draft.key}
              onChange={(value) => field("key", value)}
              hint="Example: products.variant.retail_price"
            />
            <TextField
              id="required-domain"
              label="Domain"
              value={draft.domain}
              onChange={(value) => field("domain", value)}
              hint="Lowercase letters, numbers, hyphens, or underscores."
            />
            <TextField
              id="required-label"
              label="Team-facing label"
              value={draft.label}
              onChange={(value) => field("label", value)}
              hint="Example: RETAIL PRICE REQUIRED"
            />
            <TextField
              id="required-record-type"
              label="Record type"
              value={draft.recordType}
              onChange={(value) => field("recordType", value)}
            />
            <TextField
              id="required-record-id"
              label="Record ID"
              required={false}
              value={draft.recordId}
              onChange={(value) => field("recordId", value)}
              hint="Optional until the exact record exists."
            />
            <TextField
              id="required-field-path"
              label="Field path"
              value={draft.fieldPath}
              onChange={(value) => field("fieldPath", value)}
            />
          </div>
          <TextArea
            id="required-description"
            label="Description"
            value={draft.description}
            onChange={(value) => field("description", value)}
          />
          <TextArea
            id="required-why"
            label="Why it is required"
            value={draft.whyRequired}
            onChange={(value) => field("whyRequired", value)}
          />
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            }}
          >
            <SelectField
              id="required-blocking"
              label="Blocking level"
              value={draft.blockingLevel}
              options={REQUIRED_INPUT_BLOCKING_LEVELS}
              onChange={(value) =>
                field("blockingLevel", value as RequiredInputBlockingLevel)
              }
            />
            <SelectField
              id="required-role"
              label="Responsible role"
              value={draft.responsibleRole}
              options={PRELAUNCH_ROLES}
              onChange={(value) =>
                field("responsibleRole", value as PrelaunchRole)
              }
            />
            <SelectField
              id="required-entry-mode"
              label="Entry mode"
              value={draft.entryMode}
              options={REQUIRED_INPUT_ENTRY_MODES}
              onChange={(value) =>
                field("entryMode", value as RequiredInputEntryMode)
              }
            />
          </div>
          <TextArea
            id="required-verification"
            label="Verification method"
            value={draft.verificationMethod}
            onChange={(value) => field("verificationMethod", value)}
          />
          <TextArea
            id="required-evidence"
            label="Evidence required"
            value={draft.evidenceRequired}
            onChange={(value) => field("evidenceRequired", value)}
            hint="One evidence item per line."
          />
          <TextArea
            id="required-impact"
            label="Public launch impact"
            value={draft.publicLaunchImpact}
            onChange={(value) => field("publicLaunchImpact", value)}
          />
          <TextArea
            id="required-next-action"
            label="Next action"
            value={draft.nextAction}
            onChange={(value) => field("nextAction", value)}
          />
          <TextField
            id="required-admin-href"
            label="Exact administrator form"
            value={draft.adminEntryHref}
            onChange={(value) => field("adminEntryHref", value)}
            hint="Internal /admin/... route only."
          />
          {notice && (
            <p role="alert" className="body-s" style={{ color: "var(--error)" }}>
              {notice}
            </p>
          )}
          <div>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save required input"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function RequiredInputCard({
  token,
  item,
  onSaved,
}: {
  token: string;
  item: RequiredInput;
  onSaved: () => void;
}) {
  const [target, setTarget] = useState<RequiredInputState>(
    NEXT_STATES[item.currentState][0] ?? item.currentState,
  );
  const [entry, setEntry] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const nextStates = NEXT_STATES[item.currentState];

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    const body: Record<string, unknown> = {
      expectedVersion: item.version,
      targetState: target,
      reason,
    };
    if (target === "entered") {
      if (item.entryMode === "direct") body.enteredValue = entry;
      else body.externalReferenceName = entry;
    }
    const result = await transitionRequiredInput<{ ok: true }>(
      token,
      item.id,
      body,
    );
    setSaving(false);
    if (result.kind === "ok") {
      onSaved();
      return;
    }
    setNotice(
      "The transition was rejected. Reload the current version and verify the evidence and state sequence.",
    );
  }

  return (
    <article className="card">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div style={{ minWidth: 0 }}>
          <p className="mono-label text-ink-mute">{item.recordType}</p>
          <h3 className="heading-s mt-1">{item.label}</h3>
          <p className="body-s text-ink-2 mt-2 max-w-[72ch]">
            {item.whyRequired}
          </p>
        </div>
        <ResearchStatusBadge
          label={STATE_LABELS[item.currentState]}
          tone={toneFor(item.currentState)}
        />
      </div>
      <dl
        className="grid gap-4 mt-5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}
      >
        <Detail label="Blocks" value={readable(item.blockingLevel)} />
        <Detail label="Responsible role" value={readable(item.responsibleRole)} />
        <Detail label="Verification" value={item.verificationMethod} />
        <Detail label="Next action" value={item.nextAction} />
        <Detail label="Public impact" value={item.publicLaunchImpact} />
      </dl>
      {item.evidenceRequired.length > 0 && (
        <div className="mt-5">
          <p className="mono-label text-ink-mute">Evidence required</p>
          <ul className="body-s text-ink-2 mt-2 grid gap-1">
            {item.evidenceRequired.map((evidence) => (
              <li key={evidence}>— {evidence}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-5">
        <Link href={item.adminEntryHref} className="btn btn-secondary">
          Open final form
        </Link>
      </div>
      <details className="mt-5">
        <summary className="body-s underline">Review audit history</summary>
        {item.auditHistory.length === 0 ? (
          <p className="body-s text-ink-mute mt-3">
            No review transition has been recorded.
          </p>
        ) : (
          <ol className="grid gap-3 mt-3">
            {item.auditHistory.map((event) => (
              <li key={event.id} className="body-s text-ink-2">
                <span className="font-700">
                  {event.fromState
                    ? `${STATE_LABELS[event.fromState]} → `
                    : ""}
                  {STATE_LABELS[event.toState]}
                </span>
                {" — "}
                {event.reason} · {event.actor} ·{" "}
                {new Date(event.occurredAt).toLocaleString("en-US")}
              </li>
            ))}
          </ol>
        )}
      </details>
      {nextStates.length > 0 && (
        <form
          className="grid gap-4 mt-6 pt-5"
          style={{ borderTop: "1px solid var(--border)" }}
          onSubmit={submit}
        >
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <SelectField
              id={`state-${item.id}`}
              label="Next state"
              value={target}
              options={nextStates}
              onChange={(value) => setTarget(value as RequiredInputState)}
            />
            {target === "entered" && (
              <TextField
                id={`entry-${item.id}`}
                label={
                  item.entryMode === "direct"
                    ? "Entered value"
                    : item.entryMode === "external_secret"
                      ? "Secret configuration name"
                      : "Verified record reference"
                }
                value={entry}
                onChange={setEntry}
                hint={
                  item.entryMode === "external_secret"
                    ? "Reference only. Never paste a credential value."
                    : undefined
                }
              />
            )}
          </div>
          <TextArea
            id={`reason-${item.id}`}
            label="Review reason"
            value={reason}
            onChange={setReason}
          />
          {notice && (
            <p role="alert" className="body-s" style={{ color: "var(--error)" }}>
              {notice}
            </p>
          )}
          <div>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Record transition"}
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="mono-label text-ink-mute">{label}</dt>
      <dd className="body-s text-ink-2 mt-1">{value}</dd>
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  hint,
  required = true,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      <input
        id={id}
        className="input-field"
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && <p className="body-s text-ink-mute mt-1">{hint}</p>}
    </div>
  );
}

function TextArea({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      <textarea
        id={id}
        className="input-field"
        rows={3}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && <p className="body-s text-ink-mute mt-1">{hint}</p>}
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      <select
        id={id}
        className="input-field"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {readable(option)}
          </option>
        ))}
      </select>
    </div>
  );
}
