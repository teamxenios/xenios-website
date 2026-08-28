import { useEffect, useState } from "react";
import { AlertCircle, FileText, LoaderCircle, SearchX, ShieldAlert } from "lucide-react";
import { Link, useParams } from "wouter";
import SeoHead from "@/components/SeoHead";
import {
  normalizePublicLotCode,
  type PublicLotApiResponse,
  type PublicLotRecord,
} from "@shared/research/quality/public-lot";
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  LOT_STATUS_LABELS,
  TEST_CATEGORY_LABELS,
  formatQualityDate,
} from "./content";
import { fetchPublicLot } from "./public-lot-api";
import { LotLookupForm } from "./LotLookupForm";
import "./quality.css";

type ViewState = { kind: "loading" } | PublicLotApiResponse;
type ScopedViewState = { lotCode: string | null; value: ViewState };
type RecordAvailability = "complete" | "partial";

const STATUS_COPY: Record<PublicLotRecord["status"], string> = {
  released: "The public record shows a completed release decision as of the date below.",
  quarantined: "The public record shows this lot in quarantine. It is not represented as released.",
  held: "The public record shows an active hold. It is not represented as released.",
  documentation_pending: "Required documentation review remains pending. No release is inferred.",
  withdrawn: "The public record shows this lot as withdrawn. Earlier availability must not be relied upon.",
};

function LotRecord({
  lot,
  availability,
}: {
  lot: PublicLotRecord;
  availability: RecordAvailability;
}) {
  return (
    <article
      className="quality-result"
      data-kind={availability === "complete" ? "ok" : "partial"}
      data-testid={`public-lot-result-${availability === "complete" ? "ok" : "partial"}`}
    >
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5">
        <div>
          <p className="mono-cap" style={{ color: "var(--quality-copper)" }}>
            {availability === "complete" ? "Exact public match" : "Partial exact public match"}
          </p>
          <h2 className="display-s mt-4">{lot.productName}</h2>
          {lot.variantLabel ? <p className="body-m text-ink-2 mt-2">{lot.variantLabel}</p> : null}
        </div>
        <span className={`ra-badge ${lot.status === "released" ? "ra-badge-success" : lot.status === "withdrawn" ? "ra-badge-danger" : "ra-badge-warning"}`}>
          {LOT_STATUS_LABELS[lot.status]}
        </span>
      </div>
      {availability === "partial" ? (
        <div className="card bg-paper-2 mt-6" role="status" data-testid="public-lot-partial-notice">
          <p className="body-s text-ink-2">
            The exact approved source reports the document set as incomplete. The approved lot facts below are available, but document absence or completeness is not inferred.
          </p>
        </div>
      ) : null}
      <p className="body-m text-ink-2 mt-6">{STATUS_COPY[lot.status]}</p>
      <dl className="quality-facts">
        <div><dt className="mono-label text-ink-mute">Lot code</dt><dd className="tabular">{lot.lotCode}</dd></div>
        <div><dt className="mono-label text-ink-mute">Public status</dt><dd>{LOT_STATUS_LABELS[lot.status]}</dd></div>
        <div><dt className="mono-label text-ink-mute">Status as of</dt><dd>{formatQualityDate(lot.statusAsOf)}</dd></div>
        <div><dt className="mono-label text-ink-mute">Public record source</dt><dd>{lot.sourceLabel}</dd></div>
      </dl>

      <div className="rule-top mt-10 pt-8">
        <h3 className="h3">Approved public documents</h3>
        {lot.documents.length === 0 ? (
          <p className="body-m text-ink-2 mt-4" data-testid="public-lot-no-documents">
            {availability === "complete"
              ? "The complete public source has no currently approved public document to display for this lot. That does not describe private records or infer a test result."
              : "The partial public source returned no approved document metadata. No document absence, private-record state, or test result has been inferred."}
          </p>
        ) : (
          <div className="quality-document-list">
            {lot.documents.map((document) => (
              <section className="quality-document" key={document.documentId}>
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <FileText aria-hidden="true" size={18} />
                    <h4 className="font-700">{document.title}</h4>
                    <span className={`ra-badge ${document.status === "available" ? "ra-badge-success" : "ra-badge-pending"}`}>
                      {DOCUMENT_STATUS_LABELS[document.status]}
                    </span>
                  </div>
                  <p className="body-s text-ink-mute mt-3">
                    {DOCUMENT_TYPE_LABELS[document.documentType]} · Issued {formatQualityDate(document.issuedAt)} · Reviewed {formatQualityDate(document.reviewedAt)}
                  </p>
                  <p className="body-s text-ink-mute mt-2">
                    Source {document.sourceLabel} · Status as of {formatQualityDate(document.statusAsOf)}
                  </p>
                  {document.testCategories.length ? (
                    <div className="quality-tag-list" aria-label="Documented test categories">
                      {document.testCategories.map((category) => <span className="quality-tag" key={category}>{TEST_CATEGORY_LABELS[category]}</span>)}
                    </div>
                  ) : null}
                </div>
                {document.downloadPath ? (
                  <a
                    aria-label={`Download ${document.title} PDF`}
                    className="btn btn-secondary"
                    href={document.downloadPath}
                    referrerPolicy="no-referrer"
                    rel="noreferrer"
                    data-testid="public-lot-document-link"
                  >
                    Download PDF
                  </a>
                ) : <span className="body-s text-ink-mute">No current public download</span>}
              </section>
            ))}
          </div>
        )}
      </div>

      <div className="card bg-paper-2 mt-8">
        <p className="body-s text-ink-2">
          This is a limited public record, not a safety, clinical, potency, sterility, or suitability conclusion. Read each document’s method and scope. For testing context, visit <Link href="/research/testing">Testing explained</Link>.
        </p>
      </div>
    </article>
  );
}

function StateMessage({
  state,
}: {
  state: { kind: "loading" } | Exclude<PublicLotApiResponse, { kind: "ok" | "partial" }>;
}) {
  if (state.kind === "loading") {
    return (
      <div className="quality-result" data-kind="loading" data-testid="public-lot-result-loading" role="status">
        <LoaderCircle aria-hidden="true" className="quality-loading-spinner animate-spin" size={22} />
        <h2 className="h3 mt-5">Checking the approved public source…</h2>
        <p className="body-s text-ink-2 mt-3">No status is shown until the exact response is verified.</p>
      </div>
    );
  }

  const presentation = {
    invalid_request: { icon: AlertCircle, title: "Check the lot code.", body: "Enter the lot code exactly as it appears on the label." },
    not_found: { icon: SearchX, title: "No approved public match.", body: "No approved public record matched that exact code. Recheck the label or contact support; this result does not describe private records." },
    unavailable: { icon: ShieldAlert, title: "Verification is unavailable.", body: "The approved public source could not be verified. No lot status, document state, or absence has been inferred. Try again later." },
    rate_limited: { icon: ShieldAlert, title: "Try again shortly.", body: "Public verification is temporarily busy. No lot status, document state, or absence has been inferred." },
  }[state.kind];
  const Icon = presentation.icon;

  return (
    <div className="quality-result" data-kind={state.kind} data-testid={`public-lot-result-${state.kind}`} role={state.kind === "invalid_request" ? "alert" : "status"}>
      <Icon aria-hidden="true" size={22} />
      <h2 className="h3 mt-5">{presentation.title}</h2>
      <p className="body-m text-ink-2 mt-3">{presentation.body}</p>
      <Link className="btn btn-secondary mt-6" href="/research/support">Contact support</Link>
    </div>
  );
}

export default function LotVerificationPage() {
  const params = useParams<{ lotCode: string }>();
  const lotCode = normalizePublicLotCode(params.lotCode);
  const [requestRevision, setRequestRevision] = useState(0);
  const [scopedState, setScopedState] = useState<ScopedViewState>(() => ({
    lotCode,
    value: lotCode === null
      ? { kind: "invalid_request", code: "invalid_lot_code", message: "Enter the lot code exactly as it appears on the label." }
      : { kind: "loading" },
  }));

  const state: ViewState = scopedState.lotCode === lotCode
    ? scopedState.value
    : lotCode === null
      ? { kind: "invalid_request", code: "invalid_lot_code", message: "Enter the lot code exactly as it appears on the label." }
      : { kind: "loading" };

  useEffect(() => {
    if (lotCode === null) {
      setScopedState({
        lotCode: null,
        value: { kind: "invalid_request", code: "invalid_lot_code", message: "Enter the lot code exactly as it appears on the label." },
      });
      return;
    }
    const controller = new AbortController();
    setScopedState({ lotCode, value: { kind: "loading" } });
    void fetchPublicLot(lotCode, controller.signal).then((result) => {
      if (!controller.signal.aborted) setScopedState({ lotCode, value: result });
    }).catch(() => undefined);
    return () => controller.abort();
  }, [lotCode, requestRevision]);

  const canonicalPath = lotCode ? `/research/lots/${encodeURIComponent(lotCode)}` : "/research/documents";
  return (
    <div className="quality-page">
      <SeoHead title="Verify a lot | Xenios Research" description="Check an exact lot code against the approved Xenios Research public quality record." path={canonicalPath} robots="noindex, nofollow" />
      <section className="container-x" style={{ paddingTop: 64, paddingBottom: 40 }}>
        <p className="mono-cap text-ink-mute mb-5">Public lot verification</p>
        <h1 className="display-m text-balance max-w-[20ch]">Verify the record, not a resemblance.</h1>
        <p className="body-l text-ink-2 mt-6 max-w-[62ch]">Enter the exact code from the label. The lookup is case-normalized, but it never uses partial or approximate matching.</p>
        <div className="mt-8">
          <LotLookupForm
            initialLotCode={lotCode ?? params.lotCode ?? ""}
            onExactSubmit={(submittedLotCode) => {
              if (submittedLotCode !== lotCode) return false;
              setRequestRevision((revision) => revision + 1);
              return true;
            }}
          />
        </div>
      </section>
      <section className="container-x pb-16" aria-live="polite" aria-atomic="true">
        {state.kind === "ok" || state.kind === "partial"
          ? <LotRecord lot={state.lot} availability={state.kind === "ok" ? "complete" : "partial"} />
          : <StateMessage state={state} />}
      </section>
    </div>
  );
}
