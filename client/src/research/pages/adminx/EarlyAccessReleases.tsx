import { useCallback, useMemo, useState, type FormEvent } from "react";
import {
  ResearchEmptyState,
  ResearchSecureNotice,
  ResearchStatusBadge,
  type BadgeTone,
} from "../../ui/kit";
import {
  getFounderReleaseReview,
  getReleaseHistory,
  recordFounderRelease,
  type EarlyAccessReleaseDto,
  type FirstReleaseCandidateDto,
  type FirstReleaseClassification,
  type FounderReleaseReviewDto,
} from "../../adapters/earlyAccessReleases";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";
import { fmtDateTime, useAdminResource } from "./auth";

// ---------------------------------------------------------------------------
// /admin/research/early-access/releases: the founder release screen.
//
// A founder release is the ONE place a named human overrides Product Control,
// so this screen is written around a single rule:
//
//   THE APPROVAL ACTION IS NOT RENDERED WHEN A NON-WAIVABLE BLOCKER EXISTS.
//
// That rule is enforced on the server too (the route refuses, and the domain
// function refuses again), and it is repeated here because a form a founder
// cannot even see is a form nobody submits by accident. The list of which
// blockers are non-waivable is NEVER computed in the browser: it arrives on
// each candidate, split by the same function the server enforces with, so the
// two cannot disagree.
//
// Everything else follows the family pattern: presentation only, all authority
// server side, 401/403 renders an honest denied state, and the actor recorded
// on a release is whoever the admin guard authenticated, never anything this
// screen sends.
// ---------------------------------------------------------------------------

const CLASSIFICATION_TONE: Record<FirstReleaseClassification, BadgeTone> = {
  APPROVABLE_FOR_EARLY_ACCESS: "success",
  NOT_APPROVABLE_REGULATORY: "danger",
  NOT_APPROVABLE_IDENTITY: "danger",
  NOT_APPROVABLE_FORMULA: "danger",
  NOT_APPROVABLE_STRENGTH: "danger",
  NOT_APPROVABLE_SUPPLIER: "warning",
  NOT_APPROVABLE_FULFILLMENT: "warning",
  NOT_APPROVABLE_PRICE: "warning",
};

const CLASSIFICATION_ORDER: FirstReleaseClassification[] = [
  "APPROVABLE_FOR_EARLY_ACCESS",
  "NOT_APPROVABLE_REGULATORY",
  "NOT_APPROVABLE_IDENTITY",
  "NOT_APPROVABLE_FORMULA",
  "NOT_APPROVABLE_STRENGTH",
  "NOT_APPROVABLE_SUPPLIER",
  "NOT_APPROVABLE_FULFILLMENT",
  "NOT_APPROVABLE_PRICE",
];

/**
 * Whether a founder may be offered the approval action for this unit.
 *
 * One expression, exported so a test can pin it, and deliberately with no
 * second condition: a unit is approvable exactly when the server reported no
 * non-waivable blocker on it. Adding "or" to this line is the mutation that
 * would put an approval button in front of a compound nobody may sell.
 */
export function mayOfferApproval(candidate: FirstReleaseCandidateDto): boolean {
  return candidate.nonwaivableBlockers.length === 0;
}

function money(candidate: FirstReleaseCandidateDto): string {
  if (candidate.priceCents === null) return "No approved amount";
  const amount = (candidate.priceCents / 100).toFixed(2);
  return `${amount} ${candidate.currency}`.trim();
}

function blockerList(blockers: readonly string[]): string {
  return blockers.length === 0 ? "none" : blockers.join(", ");
}

// ---------------------------------------------------------------------------
// One unit
// ---------------------------------------------------------------------------

export function CandidateCard({
  candidate,
  releases,
  token,
  onRecorded,
}: {
  candidate: FirstReleaseCandidateDto;
  releases: readonly EarlyAccessReleaseDto[];
  token: string;
  onRecorded: () => void;
}) {
  const key = `${candidate.productId}::${candidate.variantId}`;
  const approvable = mayOfferApproval(candidate);
  const history = useMemo(
    () =>
      releases.filter(
        (release) =>
          release.productId === candidate.productId &&
          release.variantId === candidate.variantId,
      ),
    [releases, candidate.productId, candidate.variantId],
  );

  return (
    <article className="card mt-5" data-testid={`ea-release-card-${key}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="mono-label text-ink-mute">{candidate.sku}</p>
          <h3 className="body-l font-700 mt-1">{candidate.product}</h3>
          <p className="body-s text-ink-2 mt-1">
            {candidate.canonicalName} &middot; {candidate.strength ?? "strength not recorded"}{" "}
            &middot; {candidate.presentation ?? "presentation not recorded"}
          </p>
        </div>
        <ResearchStatusBadge
          label={candidate.classification}
          tone={CLASSIFICATION_TONE[candidate.classification]}
        />
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
        <div>
          <dt className="mono-label text-ink-mute">Price</dt>
          <dd className="body-s" data-testid={`ea-release-price-${key}`}>
            {money(candidate)}
          </dd>
        </div>
        <div>
          <dt className="mono-label text-ink-mute">Product Control version</dt>
          <dd className="body-s break-all" data-testid={`ea-release-version-${key}`}>
            {candidate.productVersion}
          </dd>
        </div>
        <div>
          <dt className="mono-label text-ink-mute">Supplier</dt>
          <dd className="body-s">{candidate.supplier ?? "None assigned"}</dd>
        </div>
        <div>
          <dt className="mono-label text-ink-mute">Fulfilment</dt>
          <dd className="body-s">{candidate.fulfillmentMethod}</dd>
        </div>
        <div>
          <dt className="mono-label text-ink-mute">Inventory</dt>
          <dd className="body-s">{candidate.inventoryState}</dd>
        </div>
        <div>
          <dt className="mono-label text-ink-mute">Quantity limit</dt>
          <dd className="body-s">
            {candidate.quantityLimit === null ? "None set" : candidate.quantityLimit}
          </dd>
        </div>
        <div>
          <dt className="mono-label text-ink-mute">Waivable blockers</dt>
          <dd className="body-s" data-testid={`ea-release-waivable-${key}`}>
            {blockerList(candidate.waivableBlockers)}
          </dd>
        </div>
        <div>
          <dt className="mono-label text-ink-mute">Non-waivable blockers</dt>
          <dd className="body-s" data-testid={`ea-release-nonwaivable-${key}`}>
            {blockerList(candidate.nonwaivableBlockers)}
          </dd>
        </div>
      </dl>

      {candidate.regulatoryHoldReason && (
        <p className="body-s text-ink-2 mt-4" data-testid={`ea-release-hold-${key}`}>
          {candidate.regulatoryHoldReason}
        </p>
      )}

      <p className="body-s text-ink-2 mt-4">{candidate.recommendedAction}</p>

      <ReleaseHistory history={history} unitKey={key} />

      {approvable ? (
        <ApprovalForm candidate={candidate} token={token} onRecorded={onRecorded} />
      ) : (
        <p
          className="body-s mt-5"
          role="note"
          data-testid={`ea-release-blocked-${key}`}
        >
          No release may be recorded for this unit. A non-waivable blocker is not a
          gap in operations; it is uncertainty about what is in the vial or whether it
          may lawfully ship, and resolving it happens in Product Control or with
          counsel, not here.
        </p>
      )}
    </article>
  );
}

function ReleaseHistory({
  history,
  unitKey,
}: {
  history: readonly EarlyAccessReleaseDto[];
  unitKey: string;
}) {
  return (
    <div className="mt-5">
      <p className="mono-label text-ink-mute">Release history</p>
      {history.length === 0 ? (
        <p className="body-s text-ink-2 mt-2" data-testid={`ea-release-history-empty-${unitKey}`}>
          No release has ever been recorded for this unit.
        </p>
      ) : (
        <ol className="mt-2" data-testid={`ea-release-history-${unitKey}`}>
          {history.map((release) => (
            <li key={release.releaseId} className="body-s text-ink-2 mt-2">
              <strong>{release.status}</strong> by {release.actor} at{" "}
              {fmtDateTime(release.recordedAt)}. Waived: {blockerList(release.waivedBlockers)}.
              Reason: {release.reason}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The approval action
// ---------------------------------------------------------------------------

function ApprovalForm({
  candidate,
  token,
  onRecorded,
}: {
  candidate: FirstReleaseCandidateDto;
  token: string;
  onRecorded: () => void;
}) {
  const key = `${candidate.productId}::${candidate.variantId}`;
  const [releaseId, setReleaseId] = useState("");
  const [price, setPrice] = useState("");
  const [quantityLimit, setQuantityLimit] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const amount = Number.parseFloat(price);
    const result = await recordFounderRelease(token, {
      releaseId: releaseId.trim(),
      productId: candidate.productId,
      variantId: candidate.variantId,
      // The fingerprint this screen SHOWED. The server recomputes it and
      // refuses a mismatch, so a unit that changed while the founder was
      // reading cannot be approved unseen.
      productVersion: candidate.productVersion,
      status: "approved",
      approvedPriceCents: Number.isFinite(amount) ? Math.round(amount * 100) : Number.NaN,
      currency: "USD",
      approvedQuantityLimit: Number.parseInt(quantityLimit, 10),
      expiresAt: expiresAt.trim() === "" ? null : new Date(expiresAt).toISOString(),
      // Exactly the operational blockers the server split out. The browser
      // never adds to this list.
      waivedBlockers: candidate.waivableBlockers,
      reason: reason.trim(),
    });
    setSubmitting(false);
    if (result.kind === "ok") {
      onRecorded();
      return;
    }
    setError(
      result.kind === "error" || result.kind === "forbidden" || result.kind === "denied"
        ? (result.message ?? "The release was refused.")
        : "The release was refused.",
    );
  };

  return (
    <form
      className="mt-5"
      onSubmit={(event) => void submit(event)}
      aria-label={`Record a founder release for ${candidate.sku}`}
      data-testid={`ea-release-form-${key}`}
    >
      <ResearchSecureNotice>
        This release is recorded against the account you signed in with. It waives{" "}
        {blockerList(candidate.waivableBlockers)} for this exact unit only, inside Private
        Early Access only, and goes stale automatically if any product fact changes.
      </ResearchSecureNotice>

      <div className="mt-4">
        <label htmlFor={`release-id-${key}`} className="form-label">
          Release id
        </label>
        <input
          id={`release-id-${key}`}
          className="input-field"
          required
          value={releaseId}
          onChange={(event) => setReleaseId(event.target.value)}
        />
      </div>
      <div className="mt-4">
        <label htmlFor={`release-price-${key}`} className="form-label">
          Approved price, USD
        </label>
        <input
          id={`release-price-${key}`}
          className="input-field"
          required
          inputMode="decimal"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
        />
      </div>
      <div className="mt-4">
        <label htmlFor={`release-quantity-${key}`} className="form-label">
          Per-order quantity limit
        </label>
        <input
          id={`release-quantity-${key}`}
          className="input-field"
          required
          inputMode="numeric"
          value={quantityLimit}
          onChange={(event) => setQuantityLimit(event.target.value)}
        />
      </div>
      <div className="mt-4">
        <label htmlFor={`release-expiry-${key}`} className="form-label">
          Expires at, or blank for no expiry
        </label>
        <input
          id={`release-expiry-${key}`}
          className="input-field"
          type="datetime-local"
          value={expiresAt}
          onChange={(event) => setExpiresAt(event.target.value)}
        />
      </div>
      <div className="mt-4">
        <label htmlFor={`release-reason-${key}`} className="form-label">
          Reason
        </label>
        <textarea
          id={`release-reason-${key}`}
          className="input-field"
          required
          minLength={12}
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>

      {error && (
        <p className="body-s mt-3" role="alert" style={{ color: "var(--error)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        className="btn btn-primary mt-5"
        disabled={submitting}
        data-testid={`ea-release-approve-${key}`}
      >
        {submitting ? "Recording..." : "Record founder release"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

export function EarlyAccessReleasesBody({ token }: { token: string }) {
  const resource = useAdminResource<FounderReleaseReviewDto>(
    token,
    useCallback((accessToken: string) => getFounderReleaseReview(accessToken), []),
  );
  const review = resource.data;

  return (
    <AdminBoundary
      state={resource.state}
      message={resource.message}
      deniedCode={resource.deniedCode}
      onRetry={resource.reload}
      unavailableTitle="The Early Access catalog could not be read."
      unavailableBody="This is not an empty catalog. Product Control could not be reached, so nothing can be said about what is releasable until it can."
    >
      {review && (
        <>
          <p className="body-s text-ink-2" data-testid="ea-release-evaluated-at">
            Evaluated at {fmtDateTime(review.evaluatedAt)}. {review.candidates.length} exact
            units.
          </p>

          <div className="ra-table-wrap mt-5" data-testid="ea-release-counts">
            <table className="ra-table">
              <thead>
                <tr>
                  <th scope="col">Classification</th>
                  <th scope="col">Units</th>
                </tr>
              </thead>
              <tbody>
                {CLASSIFICATION_ORDER.filter(
                  (classification) => (review.counts[classification] ?? 0) > 0,
                ).map((classification) => (
                  <tr key={classification}>
                    <td>{classification}</td>
                    <td>{review.counts[classification]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {review.candidates.length === 0 ? (
            <ResearchEmptyState
              title="No unit is in the Early Access projection."
              body="Product Control returned no publicly published product with a variant."
            />
          ) : (
            CLASSIFICATION_ORDER.flatMap((classification) =>
              review.candidates
                .filter((candidate) => candidate.classification === classification)
                .map((candidate) => (
                  <CandidateCard
                    key={`${candidate.productId}::${candidate.variantId}`}
                    candidate={candidate}
                    releases={review.releases}
                    token={token}
                    onRecorded={resource.reload}
                  />
                )),
            )
          )}
        </>
      )}
    </AdminBoundary>
  );
}

export default function EarlyAccessReleases() {
  return (
    <AdminScreen
      title="Early Access releases"
      lead="Every exact unit, classified, with the append-only record of every founder decision made about it. A unit with a non-waivable blocker carries no approval action, here or on the server."
    >
      {(token) => <EarlyAccessReleasesBody token={token} />}
    </AdminScreen>
  );
}

export { getReleaseHistory };
