// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { describe, expect, it } from "vitest";
import {
  CARE_PUBLIC_PATHS,
  CarePortalPage,
  CareSchedulePage,
} from "./CarePublicPages";
import CareSection from "./section";
import TebraSchedulingExperience from "./TebraSchedulingExperience";
import type { TebraConfigurationLoadState } from "./useTebraPublicConfiguration";

const schedulingSource = readFileSync(
  resolve(__dirname, "./TebraSchedulingExperience.tsx"),
  "utf8",
);
const publicPagesSource = readFileSync(
  resolve(__dirname, "./CarePublicPages.tsx"),
  "utf8",
);

function schedulingState(
  scheduling: Record<string, unknown> = {},
): TebraConfigurationLoadState {
  return {
    kind: "ready",
    configuration: {
      schemaVersion: 1,
      authority: "tebra",
      careAvailable: true,
      scheduling: {
        status: "ready",
        mode: "direct_link",
        url: "https://scheduler.example.test/practice/request",
        telehealthEnabled: false,
        requestSemantics: "appointment_request_pending_confirmation",
        ...scheduling,
      },
      portal: { status: "unconfigured" },
    },
  } as unknown as TebraConfigurationLoadState;
}

function renderScheduling(state: TebraConfigurationLoadState) {
  return renderToStaticMarkup(
    <TebraSchedulingExperience state={state} onRetry={() => undefined} />,
  );
}

function renderCareRoute(path: string) {
  return renderToStaticMarkup(
    <Router ssrPath={path}>
      <CareSection />
    </Router>,
  );
}

describe("Tebra scheduling truth boundaries", () => {
  it("describes a tentative request without promising an appointment or clinical outcome", () => {
    const markup = renderScheduling(schedulingState());

    expect(markup).toContain("request for practice review");
    expect(markup).toContain("does not guarantee an appointment");
    expect(markup).toContain("clinical acceptance, treatment, or a prescription");
    expect(markup).toContain("Available times and visit");
    expect(markup).toContain("types are shown in Tebra");
    expect(markup).toContain("request remains pending until the practice confirms it");
    expect(markup).not.toMatch(/appointment (?:booked|confirmed|guaranteed)/i);
    expect(markup).not.toMatch(/(?:treatment|prescription) (?:approved|guaranteed)/i);
  });

  it.each([false, undefined, null, "true", 1])(
    "does not claim telehealth without an exact boolean attestation (%s)",
    (telehealthEnabled) => {
      const markup = renderScheduling(schedulingState({ telehealthEnabled }));
      expect(markup).not.toContain("data-tebra-telehealth-attested");
      expect(markup).not.toContain("required online-scheduling and Telehealth");
    },
  );

  it("shows conditional telehealth language only for an exact true attestation", () => {
    const markup = renderScheduling(
      schedulingState({ telehealthEnabled: true }),
    );

    expect(markup).toContain('data-tebra-telehealth-attested="true"');
    expect(markup).toContain("required online-scheduling and Telehealth");
    expect(markup).toContain("subscriptions and configuration");
    expect(markup).toContain("may show in-office or telehealth request options");
    expect(markup).toContain("Availability is not guaranteed");
  });

  it("renders operator labels as text instead of executable markup", () => {
    const markup = renderScheduling(
      schedulingState({
        practiceName: '<img src=x onerror="window.__carePii=1">',
        locationLabel: "Austin & remote",
      }),
    );

    expect(markup).not.toContain("<img");
    expect(markup).toContain("&lt;img src=x onerror=&quot;window.__carePii=1&quot;&gt;");
    expect(markup).toContain("Austin &amp; remote");
  });
});

describe("Tebra scheduling accessibility and responsive structure", () => {
  it("announces loading and retryable error states without exposing a handoff", () => {
    const loading = renderScheduling({ kind: "loading" });
    const error = renderScheduling({ kind: "error" });

    expect(loading).toContain('aria-live="polite"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).not.toContain("href=");
    expect(error).toContain('role="alert"');
    expect(error).toContain('<button type="button"');
    expect(error).toContain("min-h-11");
    expect(error).not.toContain("href=");
  });

  it("keeps one main landmark and one H1 on the integrated scheduling and portal pages", () => {
    for (const [path, Page] of [
      [CARE_PUBLIC_PATHS.schedule, CareSchedulePage],
      [CARE_PUBLIC_PATHS.portal, CarePortalPage],
    ] as const) {
      const markup = renderToStaticMarkup(
        <Router ssrPath={path}>
          <Page />
        </Router>,
      );
      expect(markup.match(/<main(?:\s|>)/g), path).toHaveLength(1);
      expect(markup.match(/<h1(?:\s|>)/g), path).toHaveLength(1);
      expect(markup).toContain('id="site-main"');
    }
  });

  it("uses mobile-first layouts without fixed pixel minimums or horizontal-scroll dependencies", () => {
    const responsiveSource = `${schedulingSource}\n${publicPagesSource}`;
    expect(responsiveSource).toContain("grid-cols-1");
    expect(schedulingSource).toContain("w-full");
    expect(responsiveSource).not.toMatch(/\bmin-w-\[(?:[1-9]\d*)px\]/);
    expect(responsiveSource).not.toContain("overflow-x-auto");
    expect(responsiveSource).not.toMatch(/style=\{\{[^}]*width:\s*["']\d+px/);
  });
});

describe("Care public route dispatcher", () => {
  it.each([
    [CARE_PUBLIC_PATHS.home, "Start with a secure intake. Continue with licensed clinical review."],
    [CARE_PUBLIC_PATHS.schedule, "Begin your clinical intake."],
    [CARE_PUBLIC_PATHS.portal, "Follow the clinical journey through the authorized Care system."],
    [CARE_PUBLIC_PATHS.howItWorks, "From intake to clinician review, pharmacy, and follow-up."],
    [CARE_PUBLIC_PATHS.providerReview, "Your clinician makes the medical decision."],
    [CARE_PUBLIC_PATHS.support, "Use the support channel that owns the answer."],
  ] as const)("dispatches only the exact public route %s", (path, heading) => {
    const markup = renderCareRoute(path);
    expect(markup).toContain(heading);
    expect(markup.match(/<main(?:\s|>)/g)).toHaveLength(1);
    expect(markup.match(/<h1(?:\s|>)/g)).toHaveLength(1);
  });

  it("normalizes an encoded Care route but fails closed for unknown descendants", () => {
    expect(renderCareRoute("/c%61re/schedule")).toContain(
      "Begin your clinical intake.",
    );

    const unknown = renderCareRoute("/care/schedule/extra");
    expect(unknown).toContain("This Care page is not available.");
    expect(unknown).not.toContain("Tebra appointment-request form");
    expect(unknown.match(/<main(?:\s|>)/g)).toHaveLength(1);
    expect(unknown.match(/<h1(?:\s|>)/g)).toHaveLength(1);
  });
});
