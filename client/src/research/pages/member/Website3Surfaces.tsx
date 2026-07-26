import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useResearch } from "../../core";
import {
  getBiomarkerRecord,
  getMetabolicPathways,
  getProductPlatform,
  getSuperpowerOffer,
  joinMetabolicInterest,
  uploadBiomarkerReport,
  type BiomarkerRecord,
  type ProductPlatformResponse,
  type PublicMetabolicPathway,
  type SuperpowerOffer,
} from "../../adapters/products-diagnostics";
import {
  DiagnosticsMemberHome,
  PendingMetabolicCare,
  ResearchEducationCenter,
  StorageAndOrganization,
  SupplementComingSoon,
  SupportCenter,
  type BiomarkerStateView,
  type SuperpowerOfferView,
  type Website3SurfaceState,
} from "../../products-diagnostics";

type LoadState<T> =
  | { phase: "loading" }
  | { phase: "ok"; value: T }
  | { phase: "unavailable" }
  | { phase: "error"; message: string };

function publicSurfaceState<T>(
  state: LoadState<T>,
): Pick<
  Parameters<typeof SupplementComingSoon>[0],
  "state" | "errorMessage"
> {
  if (state.phase === "loading") return { state: "loading" };
  if (state.phase === "unavailable") return { state: "unavailable" };
  if (state.phase === "error") {
    return { state: "error", errorMessage: state.message };
  }
  return { state: "ok" };
}

function useProductPlatform() {
  const { memberToken } = useResearch();
  const [state, setState] = useState<LoadState<ProductPlatformResponse>>({
    phase: "loading",
  });

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    const result = await getProductPlatform(memberToken);
    if (result.kind === "ok") setState({ phase: "ok", value: result.data });
    else if (
      result.kind === "unavailable" ||
      result.kind === "unauthorized" ||
      result.kind === "forbidden" ||
      result.kind === "denied"
    ) {
      setState({ phase: "unavailable" });
    } else {
      setState({ phase: "error", message: result.message });
    }
  }, [memberToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, load };
}

export function MemberSupplements() {
  const { state, load } = useProductPlatform();
  const supplements =
    state.phase === "ok"
      ? state.value.supplements.map((item) => ({
          ...item,
          status: "Coming soon" as const,
        }))
      : [];
  return (
    <SupplementComingSoon
      supplements={supplements}
      {...publicSurfaceState(state)}
      onRetry={() => void load()}
    />
  );
}

export function MemberStorageAndOrganization() {
  const { state, load } = useProductPlatform();
  return (
    <StorageAndOrganization
      accessories={
        state.phase === "ok"
          ? state.value.storageAndOrganization.accessories
          : []
      }
      {...publicSurfaceState(state)}
      onRetry={() => void load()}
    />
  );
}

export function MemberResearchEducation() {
  const { state, load } = useProductPlatform();
  return (
    <ResearchEducationCenter
      topics={state.phase === "ok" ? state.value.education.topics : []}
      storageSources={
        state.phase === "ok" ? state.value.education.storageSources : []
      }
      boundary={
        state.phase === "ok"
          ? state.value.education.boundary
          : "Research education remains separate from human-use instructions."
      }
      {...publicSurfaceState(state)}
      onRetry={() => void load()}
    />
  );
}

export function MemberSupportCenter() {
  const { state, load } = useProductPlatform();
  return (
    <SupportCenter
      categories={state.phase === "ok" ? state.value.supportCategories : []}
      {...publicSurfaceState(state)}
      onRetry={() => void load()}
    />
  );
}

export function MemberMetabolicCare() {
  const { memberToken } = useResearch();
  const [state, setState] = useState<LoadState<PublicMetabolicPathway[]>>({
    phase: "loading",
  });
  const idempotencyKey = useRef("");

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    const result = await getMetabolicPathways(memberToken);
    if (result.kind === "ok") {
      setState({ phase: "ok", value: result.data.pathways });
    } else if (
      result.kind === "unavailable" ||
      result.kind === "unauthorized" ||
      result.kind === "forbidden" ||
      result.kind === "denied"
    ) {
      setState({ phase: "unavailable" });
    } else {
      setState({ phase: "error", message: result.message });
    }
  }, [memberToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const join = async (input: {
    pathwayId: string;
    currentState: string;
    generalGoalCategory: string;
    preferredContact: string;
    interestDate: string;
    attributionSource: string;
  }) => {
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    const result = await joinMetabolicInterest(memberToken, {
      ...input,
      idempotencyKey: idempotencyKey.current,
    });
    if (result.kind !== "ok") throw new Error("interest_not_saved");
    idempotencyKey.current = "";
  };

  return (
    <PendingMetabolicCare
      pathways={state.phase === "ok" ? state.value : []}
      onJoinInterest={join}
      {...publicSurfaceState(state)}
      onRetry={() => void load()}
    />
  );
}

const BIOMARKER_LABELS: Record<BiomarkerRecord["state"], BiomarkerStateView["state"]> =
  {
    not_started: "Not started",
    coming_soon: "Coming soon",
    test_ordered: "Test ordered",
    collection_scheduled: "Collection scheduled",
    results_pending: "Results pending",
    results_available_through_partner: "Results available through partner",
    report_uploaded: "Report uploaded",
    review_requested: "Review requested",
    qualified_review_complete: "Qualified review complete",
    follow_up_due: "Follow-up due",
    closed: "Closed",
  };

function formatPrice(cents: number | null): string | null {
  if (cents === null) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function MemberDiagnostics() {
  const { memberToken } = useResearch();
  const [state, setState] = useState<
    LoadState<{
      offer: SuperpowerOffer;
      biomarker: BiomarkerRecord;
      reportUploadEnabled: boolean;
    }>
  >({ phase: "loading" });

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    const [offer, biomarker] = await Promise.all([
      getSuperpowerOffer(memberToken),
      getBiomarkerRecord(memberToken),
    ]);
    if (offer.kind === "ok" && biomarker.kind === "ok") {
      setState({
        phase: "ok",
        value: {
          offer: offer.data.offer,
          biomarker: biomarker.data.biomarker,
          reportUploadEnabled: biomarker.data.reportUploadEnabled,
        },
      });
      return;
    }
    const unavailable = [offer, biomarker].some(
      (result) =>
        result.kind === "unavailable" ||
        result.kind === "unauthorized" ||
        result.kind === "forbidden" ||
        result.kind === "denied",
    );
    if (unavailable) {
      setState({ phase: "unavailable" });
      return;
    }
    const failed = [offer, biomarker].find(
      (result): result is Extract<typeof result, { kind: "error" }> =>
        result.kind === "error",
    );
    setState({
      phase: "error",
      message: failed?.message ?? "Diagnostics could not be loaded.",
    });
  }, [memberToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const view = useMemo(() => {
    if (state.phase !== "ok") return null;
    const offer: SuperpowerOfferView = {
      ...state.value.offer,
      priceLabel: formatPrice(state.value.offer.priceCents),
    };
    const biomarker: BiomarkerStateView = {
      state: BIOMARKER_LABELS[state.value.biomarker.state],
      updatedAt: state.value.biomarker.updatedAt,
    };
    return { offer, biomarker };
  }, [state]);

  const surface = publicSurfaceState(state);
  const placeholderOffer: SuperpowerOfferView = {
    label: "Superpower Diagnostics",
    summary: "Partner diagnostics are being prepared.",
    status: "coming_soon",
    availability: "Not currently enabled",
    collectionMethod: null,
    priceLabel: null,
    priceEffectiveDate: null,
    lastVerificationDate: null,
    lastReviewedDate: null,
    verifiedPriceDate: null,
    disclosure: "No affiliate offer is active.",
    affiliateUrl: null,
    researchBoundary:
      "Diagnostics remain separate from Research products.",
  };
  const placeholderBiomarker: BiomarkerStateView = {
    state: "Coming soon",
    updatedAt: null,
  };

  const upload = async (input: { file: File; consentAccepted: boolean }) => {
    const result = await uploadBiomarkerReport(memberToken, input);
    if (result.kind !== "ok") throw new Error("private_upload_failed");
    await load();
  };

  return (
    <DiagnosticsMemberHome
      offer={view?.offer ?? placeholderOffer}
      biomarker={view?.biomarker ?? placeholderBiomarker}
      {...surface}
      onRetry={() => void load()}
      onUpload={
        state.phase === "ok" && state.value.reportUploadEnabled
          ? upload
          : undefined
      }
    />
  );
}

export type { Website3SurfaceState };
