import { useEffect, useState, type FormEvent } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import {
  LOT_QUALITY_TEST_KEYS,
  type CoaUploadMetadata,
  type InventoryLotAdmin,
  type LotQualityAccessPurpose,
  type LotQualityDocumentAdmin,
  type LotQualityTestAdmin,
  type LotQualityTestKey,
  type LotQualityTestState,
} from "@shared/research/inventory-admin";
import {
  ResearchEmptyState,
  ResearchErrorState,
  ResearchLoadingState,
  ResearchStatusBadge,
} from "../../ui/kit";
import {
  cancelCoaUpload,
  confirmCoaUpload,
  listInventoryLots,
  listLotQualityDocuments,
  prepareCoaUpload,
  putPrivateCoaFile,
  requestCoaReadGrant,
  reviewLotQualityDocument,
  sha256Hex,
} from "../../adapters/inventory-admin";
import { useAdminResource } from "./auth";
import { AdminScreen } from "./AdminResearchHome";

type UploadRetryState = {
  principalId: string;
  fingerprint: string;
  metadata: CoaUploadMetadata;
  preparationIdempotencyKey: string;
  confirmationIdempotencyKey: string;
  cancellationIdempotencyKey: string;
  documentId: string | null;
  preparedVersion: number;
  storageKey: string | null;
  objectUploaded: boolean;
  signOutCleanupPending: boolean;
};

const UPLOAD_RETRY_STORAGE_PREFIX = "xenios.research.coa-upload-retry.v1.";

function authenticatedPrincipalId(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(
      atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")),
    ) as { sub?: unknown };
    return typeof decoded.sub === "string" && decoded.sub.length > 0 && decoded.sub.length <= 128
      ? decoded.sub
      : null;
  } catch {
    return null;
  }
}

function clearOtherPrincipalRetries(activeKey: string | null): void {
  if (typeof window === "undefined") return;
  for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = window.sessionStorage.key(index);
    if (
      key?.startsWith(UPLOAD_RETRY_STORAGE_PREFIX)
      && key !== activeKey
    ) {
      try {
        const value = JSON.parse(
          window.sessionStorage.getItem(key) ?? "null",
        ) as Partial<UploadRetryState> | null;
        if (value?.signOutCleanupPending === true) continue;
      } catch {
        // Invalid recovery state is removed below.
      }
      window.sessionStorage.removeItem(key);
    }
  }
}

function retryStorageKey(principalId: string): string {
  return `${UPLOAD_RETRY_STORAGE_PREFIX}${principalId}`;
}

function readUploadRetry(principalId: string | null): UploadRetryState | null {
  if (typeof window === "undefined") return null;
  try {
    const storageKey = principalId ? retryStorageKey(principalId) : null;
    clearOtherPrincipalRetries(storageKey);
    if (!storageKey) return null;
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<UploadRetryState>;
    const metadata = value.metadata as Partial<CoaUploadMetadata> | undefined;
    if (
      value.principalId !== principalId
      || !metadata
      || typeof metadata.lotId !== "string"
      || typeof metadata.filename !== "string"
      || metadata.contentType !== "application/pdf"
      || typeof metadata.sizeBytes !== "number"
      || typeof metadata.sha256 !== "string"
      || typeof metadata.reportIssuer !== "string"
      || typeof metadata.reportNumber !== "string"
      || typeof metadata.reportDate !== "string"
      || value.fingerprint !== JSON.stringify(metadata)
      || typeof value.preparationIdempotencyKey !== "string"
      || typeof value.confirmationIdempotencyKey !== "string"
      || typeof value.cancellationIdempotencyKey !== "string"
      || value.preparedVersion !== 1
      || !(value.documentId === null || typeof value.documentId === "string")
      || !(value.storageKey === null || typeof value.storageKey === "string")
      || typeof value.objectUploaded !== "boolean"
      || typeof value.signOutCleanupPending !== "boolean"
      || (value.objectUploaded && (!value.documentId || !value.storageKey))
    ) {
      window.sessionStorage.removeItem(storageKey);
      return null;
    }
    return value as UploadRetryState;
  } catch {
    return null;
  }
}

function writeUploadRetry(value: UploadRetryState): void {
  if (typeof window === "undefined") {
    throw new Error("upload retry storage unavailable");
  }
  const storageKey = retryStorageKey(value.principalId);
  clearOtherPrincipalRetries(storageKey);
  window.sessionStorage.setItem(storageKey, JSON.stringify(value));
}

function removeUploadRetry(principalId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (principalId) {
      window.sessionStorage.removeItem(retryStorageKey(principalId));
    }
  } catch {
    // A confirmed server command remains safely replayable even if local cleanup fails.
  }
}

function newUploadAttempt(
  principalId: string,
  metadata: CoaUploadMetadata,
  fingerprint: string,
): UploadRetryState {
  return {
    principalId,
    fingerprint,
    metadata,
    preparationIdempotencyKey: crypto.randomUUID(),
    confirmationIdempotencyKey: crypto.randomUUID(),
    cancellationIdempotencyKey: crypto.randomUUID(),
    documentId: null,
    preparedVersion: 1,
    storageKey: null,
    objectUploaded: false,
    signOutCleanupPending: false,
  };
}

const REQUIRED_TESTS: LotQualityTestKey[] = [...LOT_QUALITY_TEST_KEYS];
const ALL_TEST_LABELS: Record<LotQualityTestKey, string> = {
  identity: "Identity",
  assay: "Assay",
  purity: "Purity",
  sterility: "Sterility",
  endotoxin: "Endotoxin",
  particulate: "Particulate",
  residual_solvents: "Residual solvents",
  elemental_impurities: "Elemental impurities",
  chain_of_custody: "Chain of custody",
};
const inputClass = "input-field w-full min-w-0";
const labelClass = "form-label";

export default function LotCoasAdmin() {
  return (
    <AdminScreen
      title="Exact-lot COAs"
      lead="Private upload references, explicit missing-test states, independent review, and controlled publication."
    >
      {(token) => <LotCoasBody token={token} />}
    </AdminScreen>
  );
}

export function LotCoasBody({ token }: { token: string }) {
  const principalId = authenticatedPrincipalId(token);
  const lots = useAdminResource<{ ok: true; lots: InventoryLotAdmin[] }>(token, listInventoryLots);
  const documents = useAdminResource<{ ok: true; documents: LotQualityDocumentAdmin[] }>(
    token,
    listLotQualityDocuments,
  );
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [uploadRetry, setUploadRetry] = useState<UploadRetryState | null>(
    () => readUploadRetry(principalId),
  );
  const activeUploadRetry = uploadRetry?.principalId === principalId ? uploadRetry : null;
  const selected = documents.data?.documents.find((document) => document.id === selectedId) ?? null;

  useEffect(() => {
    setUploadRetry(readUploadRetry(principalId));
  }, [principalId]);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void getSupabaseBrowser().then((client) => {
      if (!active || !client) return;
      const { data } = client.auth.onAuthStateChange((event) => {
        if (event !== "SIGNED_OUT") return;
        const retained = readUploadRetry(principalId);
        if (!retained) {
          if (active) setUploadRetry(null);
          return;
        }
        const cleanupAttempt = {
          ...retained,
          signOutCleanupPending: true,
        };
        writeUploadRetry(cleanupAttempt);
        if (active) setUploadRetry(cleanupAttempt);
        void (async () => {
          try {
            const prepared = await prepareCoaUpload(token, {
              ...cleanupAttempt.metadata,
              idempotencyKey: cleanupAttempt.preparationIdempotencyKey,
            });
            if (prepared.kind !== "ok") return;
            if (
              (cleanupAttempt.documentId
                && cleanupAttempt.documentId !== prepared.data.upload.documentId)
              || (cleanupAttempt.storageKey
                && cleanupAttempt.storageKey !== prepared.data.upload.storageKey)
              || prepared.data.upload.documentVersion < cleanupAttempt.preparedVersion
            ) {
              return;
            }
            if (prepared.data.upload.uploadRequired) {
              const cancelled = await cancelCoaUpload(token, {
                ...cleanupAttempt.metadata,
                expectedVersion: cleanupAttempt.preparedVersion,
                preparationIdempotencyKey: cleanupAttempt.preparationIdempotencyKey,
                idempotencyKey: cleanupAttempt.cancellationIdempotencyKey,
              });
              if (cancelled.kind !== "ok") return;
            }
            removeUploadRetry(principalId);
            if (active) setUploadRetry(null);
          } catch {
            // Keep the exact command envelope so the same principal can recover later.
          }
        })();
      });
      unsubscribe = () => data.subscription.unsubscribe();
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [principalId]);

  function rememberUploadRetry(value: UploadRetryState): void {
    if (!principalId || value.principalId !== principalId) {
      throw new Error("authenticated upload recovery principal unavailable");
    }
    writeUploadRetry(value);
    setUploadRetry(value);
  }

  function clearUploadRetry(): void {
    removeUploadRetry(principalId);
    setUploadRetry(null);
  }

  if (lots.state === "loading" || documents.state === "loading") {
    return <ResearchLoadingState label="Loading exact-lot quality records" />;
  }
  if (lots.state === "error" || documents.state === "error") {
    return (
      <ResearchErrorState
        message={lots.message ?? documents.message}
        onRetry={() => {
          lots.reload();
          documents.reload();
        }}
      />
    );
  }
  if (lots.state !== "ok" || documents.state !== "ok") {
    return (
      <ResearchEmptyState
        title="Exact-lot quality administration is not connected."
        body="Website 2 must register the focused server module. No public or client-only upload fallback is used."
      />
    );
  }

  function fail(text = "The quality update failed. No approval or publication was recorded.") {
    setFeedback({ tone: "error", text });
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const fileControl = form.elements.namedItem("file");
    const file = fileControl instanceof HTMLInputElement
      ? fileControl.files?.[0] ?? null
      : null;
    const lotId = String(data.get("lotId") ?? "");
    if (!(file instanceof File) || file.type !== "application/pdf") {
      fail("Select one PDF COA file.");
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const digest = await sha256Hex(file);
      const normalized: CoaUploadMetadata = {
        lotId,
        filename: file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120),
        contentType: "application/pdf" as const,
        sizeBytes: file.size,
        sha256: digest,
        reportIssuer: String(data.get("reportIssuer") ?? "").trim(),
        reportNumber: String(data.get("reportNumber") ?? "").trim(),
        reportDate: String(data.get("reportDate") ?? ""),
      };
      const fingerprint = JSON.stringify(normalized);
      if (!principalId) {
        return fail("Your authenticated session could not be verified for safe upload recovery.");
      }
      let attempt = activeUploadRetry;
      if (attempt && attempt.fingerprint !== fingerprint) {
        const cancelled = await cancelCoaUpload(token, {
          ...attempt.metadata,
          expectedVersion: attempt.preparedVersion,
          preparationIdempotencyKey: attempt.preparationIdempotencyKey,
          idempotencyKey: attempt.cancellationIdempotencyKey,
        });
        if (cancelled.kind !== "ok") {
          return fail(
            "The prior unconfirmed upload could not be safely retired. Retry before changing report metadata.",
          );
        }
        attempt = newUploadAttempt(principalId, normalized, fingerprint);
      } else if (!attempt) {
        attempt = newUploadAttempt(principalId, normalized, fingerprint);
      }
      rememberUploadRetry(attempt);
      const prepared = await prepareCoaUpload(token, {
        ...normalized,
        idempotencyKey: attempt.preparationIdempotencyKey,
      });
      if (prepared.kind !== "ok") return fail("A private upload grant could not be prepared.");
      if (
        (attempt.documentId && attempt.documentId !== prepared.data.upload.documentId)
        || (attempt.storageKey && attempt.storageKey !== prepared.data.upload.storageKey)
        || prepared.data.upload.documentVersion < attempt.preparedVersion
      ) {
        return fail("The prepared upload identity changed unexpectedly. No file was uploaded.");
      }
      let preparedAttempt: UploadRetryState = {
        ...attempt,
        documentId: prepared.data.upload.documentId,
        storageKey: prepared.data.upload.storageKey,
      };
      rememberUploadRetry(preparedAttempt);
      if (!preparedAttempt.objectUploaded) {
        if (!prepared.data.upload.uploadRequired || !prepared.data.upload.uploadUrl) {
          return fail(
            "The server reports an already-confirmed object without this upload session. Reload the records before continuing.",
          );
        }
        const uploaded = await putPrivateCoaFile(prepared.data.upload.uploadUrl, file);
        if (!uploaded) return fail("The private object upload did not complete.");
        preparedAttempt = { ...preparedAttempt, objectUploaded: true };
        rememberUploadRetry(preparedAttempt);
      }
      const confirmed = await confirmCoaUpload(
        token,
        prepared.data.upload.documentId,
        {
          expectedVersion: preparedAttempt.preparedVersion,
          idempotencyKey: preparedAttempt.confirmationIdempotencyKey,
        },
      );
      if (confirmed.kind !== "ok") return fail("The uploaded object could not be verified.");
      form.reset();
      clearUploadRetry();
      setSelectedId(prepared.data.upload.documentId);
      setFeedback({
        tone: "success",
        text: "Private COA object verified. Review the exact-lot tests before approval.",
      });
      documents.reload();
    } catch {
      fail("The private upload was interrupted. Retry with the same unchanged file and metadata.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const action = String(form.get("action")) as "approve" | "reject" | "publish" | "withdraw";
    const tests: LotQualityTestAdmin[] = action === "approve" ? REQUIRED_TESTS.map((testKey) => ({
      testKey,
      state: String(form.get(`${testKey}.state`)) as LotQualityTestState,
      method: String(form.get(`${testKey}.method`) || "") || null,
      result: String(form.get(`${testKey}.result`) || "") || null,
      unit: null,
      reviewedBy: null,
      reviewedAt: null,
    })) : [];
    setBusy(true);
    setFeedback(null);
    const result = await reviewLotQualityDocument(token, selected.id, {
      action,
      expectedVersion: selected.version,
      idempotencyKey: crypto.randomUUID(),
      reason: String(form.get("reason")),
      tests,
    });
    setBusy(false);
    if (result.kind !== "ok") return fail();
    setFeedback({
      tone: "success",
      text: `Quality action recorded: ${action}.`,
    });
    documents.reload();
  }

  async function openPrivateFile() {
    if (!selected) return;
    setBusy(true);
    const result = await requestCoaReadGrant(
      token,
      selected.id,
      "quality_review" satisfies LotQualityAccessPurpose,
    );
    setBusy(false);
    if (result.kind !== "ok") return fail("The private file could not be opened.");
    window.open(result.data.grant.signedUrl, "_blank", "noopener,noreferrer");
  }

  const records = documents.data?.documents ?? [];
  return (
    <div className="grid gap-6">
      {feedback && (
        <div role={feedback.tone === "error" ? "alert" : "status"} aria-live="polite" className="card">
          <p className="body-s">{feedback.text}</p>
        </div>
      )}

      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,.9fr)] gap-6 items-start">
        <section className="card min-w-0" aria-labelledby="coa-records-title">
          <p className="mono-label text-ink-mute">Private quality records</p>
          <h2 id="coa-records-title" className="heading-s mt-2">Exact-lot documents</h2>
          {records.length === 0 ? (
            <div className="mt-5">
              <ResearchEmptyState
                title="LOT-SPECIFIC COA REQUIRED"
                body="Upload and verify the report tied to the exact lot. Product-level documentation does not release inventory."
              />
            </div>
          ) : (
            <div className="grid gap-3 mt-5">
              {records.map((document) => (
                <button
                  type="button"
                  key={document.id}
                  className="card ra-select-card !flex-col text-left w-full min-w-0"
                  aria-pressed={document.id === selectedId}
                  onClick={() => setSelectedId(document.id)}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="mono-label text-ink-mute">{document.sku}</p>
                      <p className="body-m font-700 mt-1">{document.lotCode}</p>
                      <p className="body-s text-ink-2 mt-1">
                        {document.originalFilename ?? "COA FILE REQUIRED"}
                      </p>
                    </div>
                    <ResearchStatusBadge
                      label={document.publishedAt ? "Published" : document.documentState}
                      tone={document.publishedAt ? "success" : "pending"}
                    />
                  </div>
                  <div className="flex min-w-0 gap-2 flex-wrap mt-4 [&_.ra-badge]:max-w-full [&_.ra-badge]:whitespace-normal [&_.ra-badge]:break-words">
                    {document.tests.map((test) => (
                      <ResearchStatusBadge
                        key={test.testKey}
                        label={`${ALL_TEST_LABELS[test.testKey]}: ${test.state.replaceAll("_", " ")}`}
                        tone={test.state === "passed" ? "success" : test.state === "failed" ? "danger" : "warning"}
                      />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <form className="card grid min-w-0 gap-4" onSubmit={handleUpload}>
          <div>
            <p className="mono-label text-ink-mute">Private Storage</p>
            <h2 className="heading-s mt-2">Upload exact-lot report</h2>
            <p className="body-s text-ink-2 mt-2">
              PDF only, maximum 20 MB. The server verifies size, type, PDF signature, and SHA-256 before confirmation.
            </p>
          </div>
          <label className="grid gap-2">
            <span className={labelClass}>Lot</span>
            <select className={inputClass} name="lotId" required defaultValue="">
              <option value="" disabled>Select a lot</option>
              {(lots.data?.lots ?? []).map((lot) => (
                <option key={lot.id} value={lot.id}>{lot.lotCode} — {lot.sku}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className={labelClass}>COA PDF</span>
            <input className={inputClass} type="file" name="file" accept="application/pdf,.pdf" required />
          </label>
          <label className="grid gap-2">
            <span className={labelClass}>Laboratory or report issuer</span>
            <input className={inputClass} name="reportIssuer" minLength={2} maxLength={200} required />
          </label>
          <label className="grid gap-2">
            <span className={labelClass}>Report number</span>
            <input className={inputClass} name="reportNumber" minLength={2} maxLength={160} required />
          </label>
          <label className="grid gap-2">
            <span className={labelClass}>Report date</span>
            <input className={inputClass} type="date" name="reportDate" required />
          </label>
          <button type="submit" className="btn btn-primary justify-self-start" disabled={busy}>
            {busy
              ? "Verifying..."
              : activeUploadRetry
                ? "Retry private COA upload"
                : "Upload private COA"}
          </button>
        </form>
      </div>

      {selected && (
        <form key={selected.id} className="card grid min-w-0 gap-5" onSubmit={handleReview}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="mono-label text-ink-mute">Independent review</p>
              <h2 className="heading-s mt-2">{selected.lotCode} quality decision</h2>
              <p className="body-s text-ink-2 mt-2">Version {selected.version}. Missing tests are never treated as passed.</p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={openPrivateFile} disabled={busy}>
              Open private file
            </button>
          </div>
          <div className="grid min-w-0 md:grid-cols-2 gap-4">
            {REQUIRED_TESTS.map((testKey) => {
              const current = selected.tests.find((test) => test.testKey === testKey);
              return (
                <fieldset key={testKey} className="card grid min-w-0 gap-3">
                  <legend className="body-m font-700 px-1">{ALL_TEST_LABELS[testKey]}</legend>
                  <label className="grid gap-2">
                    <span className={labelClass}>State</span>
                    <select
                      className={inputClass}
                      name={`${testKey}.state`}
                      defaultValue={current?.state ?? "not_provided"}
                    >
                      <option value="not_provided">Not provided</option>
                      <option value="not_tested">Not tested</option>
                      <option value="under_review">Under review</option>
                      <option value="passed">Passed</option>
                      <option value="failed">Failed</option>
                      <option value="not_applicable">Not applicable</option>
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className={labelClass}>Method</span>
                    <input className={inputClass} name={`${testKey}.method`} defaultValue={current?.method ?? ""} />
                  </label>
                  <label className="grid gap-2">
                    <span className={labelClass}>Result</span>
                    <input className={inputClass} name={`${testKey}.result`} defaultValue={current?.result ?? ""} />
                  </label>
                </fieldset>
              );
            })}
          </div>
          <label className="grid gap-2">
            <span className={labelClass}>Review reason</span>
            <textarea className={inputClass} name="reason" minLength={3} maxLength={500} required />
          </label>
          <label className="grid gap-2 max-w-sm">
            <span className={labelClass}>Action</span>
            <select className={inputClass} name="action">
              <option value="approve">Approve review</option>
              <option value="reject">Reject review</option>
              <option value="publish">Publish approved COA</option>
              <option value="withdraw">Withdraw COA</option>
            </select>
          </label>
          <button type="submit" className="btn btn-primary justify-self-start" disabled={busy}>
            Record quality action
          </button>
        </form>
      )}
    </div>
  );
}
