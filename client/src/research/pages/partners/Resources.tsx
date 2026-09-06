import { useState } from "react";
import { Link } from "wouter";
import {
  RESOURCE_USAGE_POLICY_LABELS,
  type ResourceCardDto,
  type ResourceLibraryResponse,
  type ResourceUsagePolicy,
} from "@shared/research/resource-hub/contract";
import { useResearch } from "../../core";
import { PARTNER_ROUTES } from "../../lib/routes";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchEmptyState, ResearchRouteBoundary, ResearchStatusBadge, type BadgeTone } from "../../ui/kit";
import { downloadPartnerResource, getPartnerResources, resourceAudienceLabel } from "../../adapters/partner";
import { PARTNER_PENDING_TITLE, usePartnerResource } from "./shared";

// ---------------------------------------------------------------------------
// Partner resources (/research/partners/resources): the Resource Hub library
// for the signed-in partner's role. Every card is the server's explicit
// projection (shared/research/resource-hub/contract.ts): title, purpose, one
// of four usage labels, audience, version, size. Access to a version never
// implies permission to forward it, so this page no longer claims that
// everything it lists is cleared for sharing. Actions render strictly from
// card.actions; the download fetches the server-authorized application path
// with the member bearer and saves the streamed bytes. No storage URL is
// ever rendered, and V1 offers no share action for any policy.
// ---------------------------------------------------------------------------

const L = RESOURCE_USAGE_POLICY_LABELS;

const LEAD =
  `Each item Xenios publishes for your role carries one of four usage labels: ` +
  `${L.external_share} (use exactly as published), ${L.private} (yours to read, not to forward), ` +
  `${L.training} (onboarding and internal reference), or ${L.draft} (not approved material); ` +
  `only an item labelled ${L.external_share} is cleared for use outside Xenios.`;

function usageTone(policy: ResourceUsagePolicy): BadgeTone {
  switch (policy) {
    case "external_share":
      return "success";
    case "private":
      return "info";
    case "training":
      return "neutral";
    case "draft":
      return "warning";
    default:
      return "pending";
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fallbackFilename(card: ResourceCardDto): string {
  const stem =
    card.title.replace(/[^A-Za-z0-9 ._()-]+/gu, "-").replace(/^[^A-Za-z0-9]+/u, "").trim() || "resource";
  return `${stem} v${card.versionNumber}.pdf`;
}

// Save server-streamed bytes through a short-lived object URL. The URL is
// local to this browser and revoked after the save starts.
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

type DownloadState = { kind: "idle" } | { kind: "working" } | { kind: "error"; message: string };

function downloadErrorMessage(kind: "unauthorized" | "forbidden" | "unavailable"): string {
  switch (kind) {
    case "unauthorized":
      return "Your session has ended. Sign in again to download this resource.";
    case "forbidden":
      return "This resource is not available to your account. Nothing was downloaded.";
    case "unavailable":
      return "This resource is not available for download right now. Nothing was downloaded.";
  }
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mono-label text-ink-mute">{label}</p>
      <p className="body-s text-ink-2 mt-1" style={{ overflowWrap: "anywhere" }}>
        {value}
      </p>
    </div>
  );
}

function ResourceCard({ card, token }: { card: ResourceCardDto; token: string | null }) {
  const [download, setDownload] = useState<DownloadState>({ kind: "idle" });
  const headingId = `resource-${card.resourceId}-title`;
  const canDownload =
    card.actions.download && typeof card.downloadPath === "string" && card.downloadPath.length > 0;

  async function handleDownload() {
    if (!canDownload || !card.downloadPath) return;
    setDownload({ kind: "working" });
    const result = await downloadPartnerResource(card.downloadPath, token);
    if (result.kind === "ok") {
      saveBlob(result.blob, result.filename ?? fallbackFilename(card));
      setDownload({ kind: "idle" });
      return;
    }
    setDownload({
      kind: "error",
      message: result.kind === "error" ? result.message : downloadErrorMessage(result.kind),
    });
  }

  return (
    <article className="card" aria-labelledby={headingId} data-testid={`resource-${card.resourceId}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div style={{ minWidth: 0 }}>
          <p className="mono-label text-ink-mute">
            {card.kind.toUpperCase()} · v{card.versionNumber}
          </p>
          <h2 id={headingId} className="body-l font-700 mt-1" style={{ overflowWrap: "anywhere" }}>
            {card.title}
          </h2>
        </div>
        <ResearchStatusBadge label={card.usageLabel || L[card.usagePolicy]} tone={usageTone(card.usagePolicy)} />
      </div>

      <div className="mt-4">
        <p className="mono-label text-ink-mute">Who this is for and how to use it</p>
        <p className="body-s text-ink-2 mt-1" style={{ overflowWrap: "anywhere" }}>
          {card.purpose}
        </p>
      </div>

      <div
        className="grid gap-4 mt-5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))" }}
      >
        <Fact label="Audience" value={card.audience.map(resourceAudienceLabel).join(", ") || "Not stated"} />
        <Fact label="Published" value={formatDate(card.publishedAt) || "Date not recorded"} />
        <Fact label="Size" value={formatBytes(card.sizeBytes) || "Unknown"} />
      </div>

      <div className="flex items-center gap-3 flex-wrap mt-5">
        {canDownload ? (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ minHeight: 44 }}
            disabled={download.kind === "working"}
            onClick={() => void handleDownload()}
            aria-label={`Download ${card.title}, version ${card.versionNumber}`}
            data-testid={`download-${card.resourceId}`}
          >
            {download.kind === "working" ? "Preparing download..." : "Download"}
          </button>
        ) : (
          <ResearchStatusBadge label="Download not available" tone="pending" />
        )}
        {/* card.actions.share: V1 offers no external share action for any
            policy, so nothing renders for it even when the label says
            "Approved to share". Sharing arrives with its own slice. */}
      </div>

      {download.kind === "error" && (
        <p className="body-s mt-3" role="alert" style={{ color: "var(--error)", overflowWrap: "anywhere" }}>
          {download.message}
        </p>
      )}
    </article>
  );
}

export default function Resources() {
  const { memberToken } = useResearch();
  const { state, errorMessage, data, reload } = usePartnerResource<ResourceLibraryResponse>(
    getPartnerResources,
    memberToken,
  );

  const resources = data?.resources ?? [];

  return (
    <ResearchPartnerShell title="Resources" lead={LEAD}>
      <div className="card mb-8" style={{ maxWidth: 680 }}>
        <p className="body-m font-700">The label on each item is the permission.</p>
        <p className="body-s text-ink-2 mt-2">
          Anything not labelled &ldquo;{L.external_share}&rdquo;, and any edit, excerpt, or remix of any item,
          needs review before it goes outside Xenios.{" "}
          <Link href={PARTNER_ROUTES.compliance} className="underline">
            Submit content for review on the Compliance page.
          </Link>
        </p>
      </div>

      <ResearchRouteBoundary
        state={state}
        errorMessage={errorMessage}
        onRetry={() => void reload()}
        unavailableTitle={PARTNER_PENDING_TITLE}
        unavailableBody="The resource library is published here when the partner platform launches. Until then, nothing is cleared for sharing."
      >
        {resources.length === 0 ? (
          <ResearchEmptyState
            title="No published resources for your role yet."
            body="Items appear here when Xenios publishes a version to your audience. Until an item appears with its usage label, it is not approved material."
          />
        ) : (
          <div className="grid gap-4" data-testid="resource-library">
            {resources.map((card) => (
              <ResourceCard key={card.versionId} card={card} token={memberToken} />
            ))}
          </div>
        )}
      </ResearchRouteBoundary>
    </ResearchPartnerShell>
  );
}
