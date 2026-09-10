import { createApprovedRequestFactory, isEntrypoint, QualificationBoundaryError } from "./managed-runtime";
import { createManagedHttpPort, createManagedDatabasePort, createManagedProviderPort } from "./managed-ports";
// The executable entry point for a managed connected-checkout qualification run.
//
//   node --import tsx server/research/commerce/qualification/managed-journey-run.ts
//
// It builds the real ports, runs the existing scenario runner against the
// mounted application, and prints a receipt that contains no secret. It exits
// non-zero unless the run qualified, so it can gate a release rather than
// decorate one.
//
// It performs no writes of its own beyond the journey's own checkout requests
// against synthetic members on an authorized test project, and it will not
// start at all if the configuration does not name one.
import {
  assertQualificationTarget,
  runConnectedCheckoutJourney,
  type JourneyReceipt,
  type ScenarioName,
} from "./connected-checkout-journey";
import {
  createManagedJourneySurface,
  type BrowserPort,
  type DatabasePort,
  type FaultPort,
  type HttpPort,
  type ProcessPort,
  type ProviderPort,
  type ManagedJourneyPorts,
} from "./managed-journey-binding";
import {
  describeConfig,
  ManagedJourneyNotRun,
  readManagedJourneyConfig,
  type ManagedJourneyConfig,
} from "./managed-journey-config";
import type { CheckoutRequest } from "@shared/research/commerce-api";

// ---------------------------------------------------------------------------
// Real ports
// ---------------------------------------------------------------------------

/** The mounted application, over the network, exactly as a browser reaches it. */
export function createFetchHttpPort(config: ManagedJourneyConfig): HttpPort { return createManagedHttpPort(config); }

/** Canonical reads through PostgREST, service role, on the approved project. */
export function createPostgrestDatabasePort(config: ManagedJourneyConfig): DatabasePort { return createManagedDatabasePort(config); }

/** The provider's own truth, read-only, in test mode. */
export function createStripeProviderPort(config: ManagedJourneyConfig): ProviderPort { return createManagedProviderPort(config); }

/**
 * A real isolated process restarted over the same persisted records.
 *
 * Rebuilding an object graph is not this, which is why the local binding
 * declares `processRestart: false`. The command is the operator's, run in a
 * shell, and the harness waits for it before continuing.
 */
export function createProcessPort(config: ManagedJourneyConfig): ProcessPort | undefined {
  if (config.restartCommand === null) return undefined;
  throw new ManagedJourneyNotRun("owned_qualification_launcher_required", "Use qualification-launch.ts for owned browser, fault control and process restart evidence.");
}

/**
 * The loopback control channel of an application THIS harness started from the
 * qualification entry point.
 *
 * The configuration refuses a non-loopback URL, so a deployed application can
 * never present one. When it is absent the fault capabilities are false and the
 * two scenarios that need them skip, naming the capability.
 */
export function createFaultPort(config: ManagedJourneyConfig): FaultPort | undefined {
  if (config.faultControlUrl === null) return undefined;
  throw new ManagedJourneyNotRun("owned_qualification_launcher_required", "Use qualification-launch.ts for owned browser, fault control and process restart evidence.");
}

/**
 * Drives the provider's own hosted authentication challenge in a real browser.
 *
 * This is the only thing that proves the challenge path; a test method that
 * authenticates straight through does not. It uses the repository's existing
 * CDP session rather than adding a browser dependency, loaded through a
 * computed path so the qualification harness stays out of the application's
 * compiled program.
 *
 * IMPORTANT: the repository's evidence harness deliberately seals its browser
 * to loopback (a closed proxy, a null host-resolver rule, and request blocking
 * for off-origin hosts). A hosted challenge lives at the provider, so this
 * launcher must be run with that boundary opened for the provider's domains
 * only. That is a decision to make explicitly, not a default, which is why
 * this port exists only when a browser path is configured.
 */
export function createBrowserPort(config: ManagedJourneyConfig): BrowserPort | undefined {
  if (config.chromePath === null) return undefined;
  throw new ManagedJourneyNotRun("owned_qualification_launcher_required", "Use qualification-launch.ts for owned browser, fault control and process restart evidence.");
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/** A request the journey can vary per call. Amounts stay small and synthetic. */
function requestFactory(env: Record<string, string | undefined>): (overrides?: Partial<CheckoutRequest>) => CheckoutRequest {
  return createApprovedRequestFactory(env.XENIOS_QUALIFY_REQUEST_TEMPLATE, env.XENIOS_QUALIFY_RUN_ID);
}

export interface ManagedRunResult {
  receipt: JourneyReceipt;
  binding: Record<string, unknown>;
  config: Record<string, unknown>;
}

export async function runManagedJourney(env: Record<string, string | undefined> = process.env, overrides: Pick<ManagedJourneyPorts, "browser" | "process" | "fault"> = {}): Promise<ManagedRunResult> {
  const config = readManagedJourneyConfig(env);
  // The plan gate, on the declared target. The live-client gate runs inside the
  // journey against what the constructed clients report about themselves.
  const target = assertQualificationTarget(config.target);
  const requests = requestFactory(env);

  const binding = createManagedJourneySurface(config, {
    http: createFetchHttpPort(config),
    database: createPostgrestDatabasePort(config),
    provider: createStripeProviderPort(config),
    browser: overrides.browser ?? createBrowserPort(config),
    process: overrides.process ?? createProcessPort(config),
    fault: overrides.fault ?? createFaultPort(config),
  });

  const receipt = await runConnectedCheckoutJourney({
    surface: binding.surface,
    target,
    memberFor: (scenario: ScenarioName) => config.memberFor(scenario),
    request: requests,
    decliningPaymentMethod: config.paymentMethods.decline,
    nonChallengePaymentMethod: config.paymentMethods.nonChallenge,
    challengePaymentMethod: config.paymentMethods.challenge,
  });

  return { receipt, binding: binding.describe(), config: describeConfig(config) };
}

/** What an operator sees. Contains no secret, no client secret, no customer row. */
export function formatReceipt(result: ManagedRunResult): string {
  const { receipt } = result;
  const lines: string[] = [
    `binding: ${receipt.binding}   mode: ${receipt.mode}   project: ${receipt.projectRef ?? "none"}`,
    `evidence: ${receipt.evidenceClass}`,
    `webhook evidence: ${String(result.binding.webhookEvidence)}`,
    `qualified: ${receipt.qualified}`,
    `passed ${receipt.passed}   failed ${receipt.failed}   skipped ${receipt.skipped}`,
    "",
  ];
  for (const scenario of receipt.scenarios) {
    const mark = scenario.status === "passed" ? "PASS" : scenario.status === "failed" ? "FAIL" : "SKIP";
    lines.push(`${mark}  ${scenario.scenario}`);
    if (scenario.failure) lines.push(`      failure: ${scenario.failure}`);
    if (scenario.missingCapability) lines.push(`      missing: ${scenario.missingCapability}`);
  }
  if (receipt.missingRequired.length > 0) {
    lines.push("", `required scenarios that did not execute: ${receipt.missingRequired.join(", ")}`);
  }
  return lines.join("\n");
}

/** True when this module is the process entry point. */
const isEntryPoint = isEntrypoint(import.meta.url, process.argv[1]);

if (isEntryPoint) {
  runManagedJourney()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result.config, null, 2)}\n\n${formatReceipt(result)}\n`);
      // A run that did not qualify must not look like a success to a pipeline.
      process.exitCode = result.receipt.qualified ? 0 : 1;
    })
    .catch((error: unknown) => {
      if (error instanceof ManagedJourneyNotRun) {
        // NOT_RUN is a distinct outcome from a failure: nothing was attempted,
        // and exactly one thing is missing.
        process.stdout.write(`NOT_RUN ${error.code}\n${error.missing}\n`);
        process.exitCode = 2;
        return;
      }
      process.stdout.write(`the qualification run could not complete: ${error instanceof QualificationBoundaryError ? error.code : "qualification_error"}\n`);
      process.exitCode = 1;
    });
}
