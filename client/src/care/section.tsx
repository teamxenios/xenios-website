import { useLocation } from "wouter";
import { normalizeCarePath } from "@shared/care/paths";
import CareClinicianReviewQueuePage, {
  CARE_CLINICIAN_REVIEW_PATH,
} from "./CareClinicianReviewQueuePage";
import {
  CARE_PUBLIC_PATHS,
  CareHomePage,
  CareHowItWorksPage,
  CareNotFoundPage,
  CarePortalPage,
  CareProviderReviewPage,
  CareSchedulePage,
  CareSupportPage,
} from "./CarePublicPages";

/**
 * The broad Care route resolves here. Care-owned sub-surfaces are selected
 * inside the Care module, so a new Care screen never needs a change to the
 * protected application router. Anything unrecognized renders an explicit
 * not-found page, which is the fail-closed default.
 */
export default function CareSection() {
  const [location] = useLocation();
  const path = normalizeCarePath(location);

  switch (path) {
    case CARE_CLINICIAN_REVIEW_PATH:
      return <CareClinicianReviewQueuePage />;
    case CARE_PUBLIC_PATHS.home:
      return <CareHomePage />;
    case CARE_PUBLIC_PATHS.schedule:
      return <CareSchedulePage />;
    case CARE_PUBLIC_PATHS.portal:
      return <CarePortalPage />;
    case CARE_PUBLIC_PATHS.howItWorks:
      return <CareHowItWorksPage />;
    case CARE_PUBLIC_PATHS.providerReview:
      return <CareProviderReviewPage />;
    case CARE_PUBLIC_PATHS.support:
      return <CareSupportPage />;
    default:
      return <CareNotFoundPage />;
  }
}
