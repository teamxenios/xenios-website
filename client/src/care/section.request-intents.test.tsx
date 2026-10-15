// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import CareSection from "./section";
const route = vi.hoisted(() => ({ path: "/care/request-intents" }));
vi.mock("wouter", () => ({ useLocation: () => [route.path, vi.fn()] }));
vi.mock("./CareRequestIntentPage", () => ({ CARE_REQUEST_INTENT_PATH: "/care/request-intents",
  default: () => <div>Private pending request page</div> }));
vi.mock("./CareClinicianReviewQueuePage", () => ({ CARE_CLINICIAN_REVIEW_PATH: "/care/reviews", default: () => <div>Existing reviews</div> }));
vi.mock("./CarePublicPages", () => ({
  CARE_PUBLIC_PATHS: { home: "/care", schedule: "/care/schedule", portal: "/care/portal", howItWorks: "/care/how-it-works", providerReview: "/care/provider-review", support: "/care/support" },
  CareHomePage: () => <div>Existing Care home</div>, CareSchedulePage: () => null, CarePortalPage: () => null,
  CareHowItWorksPage: () => null, CareProviderReviewPage: () => null, CareSupportPage: () => null,
  CareNotFoundPage: () => <div>Care not found</div>,
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
describe("Care section pending-request routing only", () => {
  it("registers the exact private page and preserves old routes and unknown-path refusal", () => {
    const container = document.createElement("div"), root = createRoot(container);
    for (const [path, text] of [["/care/request-intents", "Private pending request page"],
      ["/care", "Existing Care home"], ["/care/reviews", "Existing reviews"],
      ["/care/request-intents/export", "Care not found"]]) {
      route.path = path; act(() => root.render(<CareSection />)); expect(container.textContent).toBe(text);
    }
    act(() => root.unmount());
  });
});
