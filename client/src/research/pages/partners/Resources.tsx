import { Link } from "wouter";
import { useResearch } from "../../core";
import { PARTNER_ROUTES } from "../../lib/routes";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchDocumentCard, ResearchEmptyState, ResearchRouteBoundary, ResearchStatusBadge } from "../../ui/kit";
import { PARTNER_PENDING_TITLE, usePartnerResource } from "./shared";

// ---------------------------------------------------------------------------
// Partner resources (/research/partners/resources). The approved asset
// library: the only materials cleared for sharing without a separate review.
// Assets and their download links come exclusively from the partner API;
// a missing signed link renders "Download pending", never a fabricated URL.
// ---------------------------------------------------------------------------

interface ApprovedAsset {
  id: string;
  title: string;
  type: string;
  version: string;
  updatedAt?: string | null;
  signedUrl?: string | null;
}

type ResourcesPayload = { assets?: ApprovedAsset[] };

export default function Resources() {
  const { memberToken } = useResearch();
  const { state, errorMessage, data, reload } = usePartnerResource<ResourcesPayload>(
    "/api/research/partner/resources",
    memberToken,
  );

  const assets = data?.assets ?? [];

  return (
    <ResearchPartnerShell
      title="Resources"
      lead="The approved asset library. Everything here is cleared for sharing as-is; anything else goes through compliance review first."
    >
      <div className="card mb-8" style={{ maxWidth: 680 }}>
        <p className="body-m font-700">Only this library is pre-approved.</p>
        <p className="body-s text-ink-2 mt-2">
          Use assets exactly as published. Edits, excerpts, and remixes count as your own content and need review before
          use.{" "}
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
        unavailableBody="The approved asset library is published here when the partner platform launches. Until then, nothing is cleared for sharing."
      >
        {assets.length === 0 ? (
          <ResearchEmptyState
            title="No approved assets published yet."
            body="Assets appear here as the team publishes them. Until an asset appears in this library, it is not approved for sharing."
          />
        ) : (
          <div className="grid gap-4">
            {assets.map((asset) => (
              <ResearchDocumentCard
                key={asset.id}
                title={asset.title}
                docType={asset.type}
                version={asset.version}
                publishedAt={asset.updatedAt}
                action={
                  asset.signedUrl ? (
                    <a
                      className="btn btn-secondary"
                      href={asset.signedUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Download ${asset.title}, version ${asset.version}`}
                    >
                      Download
                    </a>
                  ) : (
                    <ResearchStatusBadge label="Download pending" tone="pending" />
                  )
                }
              />
            ))}
          </div>
        )}
      </ResearchRouteBoundary>
    </ResearchPartnerShell>
  );
}
