/**
 * Owns exactly one isolated qualification application and its private control channel.
 * Execute only with approved synthetic fixtures, installed staging schema and test-mode credentials.
 * Does not mutate production, provision accounts, approve products or start the outbox worker.
 */
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QualificationSupervisor } from './qualification-supervisor';
import { createAuthenticatedFaultPort } from './managed-ports';
import { driveStripeChallenge, driveStripeNoChallenge, type AuthenticationExpectation } from './qualification-browser';
import { fail, originOf, requiredString, readApprovedCheckoutSeed, isEntrypoint, QualificationBoundaryError } from './managed-runtime';
import { readManagedJourneyConfig, ManagedJourneyNotRun } from './managed-journey-config';
import { assertQualificationTarget } from './connected-checkout-journey';
import { runManagedJourney, formatReceipt } from './managed-journey-run';
import type { BrowserPort } from './managed-journey-binding';

export async function launchOwnedQualification(input: Record<string, string | undefined> = process.env) {
  if (input.NODE_ENV === 'production' || input.RENDER_SERVICE_ID || input.RENDER === 'true' || input.VERCEL === '1') fail('qualification_deployed_process_refused');
  const sourceSha = requiredString(input.XENIOS_QUALIFY_SOURCE_SHA, 'qualification_source_sha_required');
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) fail('qualification_source_sha_invalid');
  // Validate a complete agreed synthetic request before starting an application or contacting anything.
  readApprovedCheckoutSeed(input.XENIOS_QUALIFY_REQUEST_TEMPLATE);
  requiredString(input.SUPABASE_ANON_KEY, 'qualification_auth_anon_key_missing');
  const env = { ...input, XENIOS_QUALIFY_BASE_URL: 'http://127.0.0.1:1',
    XENIOS_QUALIFY_RESTART_COMMAND: 'owned-supervisor', XENIOS_QUALIFY_FAULT_CONTROL_URL: 'http://127.0.0.1:1' };
  const config = readManagedJourneyConfig(env); assertQualificationTarget(config.target);
  const approvalPath = requiredString(input.XENIOS_QUALIFY_APPROVAL_FILE, 'qualification_approval_file_missing');
  const approvalBytes = await readFile(approvalPath).catch(() => fail('qualification_approval_file_unreadable'));
  if (createHash('sha256').update(approvalBytes).digest('hex') !== config.target.ownerApprovalSha256) fail('qualification_approval_bytes_mismatch');
  const runId = `qa-${randomUUID()}`;
  let browserOrigins: string[] = [];
  if (config.chromePath) {
    if (!/^[a-f0-9]{64}$/.test(input.XENIOS_QUALIFY_BROWSER_APPROVAL_SHA256 ?? '')) fail('browser_scope_approval_missing');
    let raw: unknown; try { raw = JSON.parse(input.XENIOS_QUALIFY_BROWSER_ORIGINS ?? ''); } catch { fail('browser_origins_missing'); }
    if (!Array.isArray(raw) || !raw.length || raw.some(v => typeof v !== 'string')) fail('browser_origins_invalid');
    browserOrigins = (raw as string[]).map(s => originOf(s));
    if (!browserOrigins.includes('https://js.stripe.com')) fail('browser_stripe_js_origin_missing');
  }
  const supervisor = new QualificationSupervisor({
    modulePath: fileURLToPath(new URL('./qualification-app.ts', import.meta.url)), cwd: resolve('.'),
    runId, projectRef: config.projectRef, sourceSha, env, execArgv: ['--import', 'tsx'], startupMs: 60_000,
  });
  const restartEvidence: Array<{ beforePid: number; afterPid: number; beforeBootId: string; afterBootId: string }> = [];
  const browserEvidence: Array<{ expectation: AuthenticationExpectation; challengeObserved: boolean; trustedInputEvents: number; blockedOrigins: string[] }> = [];
  try {
    const initial = await supervisor.start();
    const runEnv = { ...env, XENIOS_QUALIFY_BASE_URL: initial.appOrigin,
      XENIOS_QUALIFY_FAULT_CONTROL_URL: initial.controlOrigin, XENIOS_QUALIFY_RUN_ID: runId };
    const fault = createAuthenticatedFaultPort(initial.controlOrigin, supervisor.controlToken, { runId, projectRef: config.projectRef, sourceSha });
    const processPort = { async restart() {
      const before = supervisor.current(), after = await supervisor.restart();
      restartEvidence.push({ beforePid: before.pid, afterPid: after.pid, beforeBootId: before.bootId, afterBootId: after.bootId });
    } };
    const browser: BrowserPort | undefined = config.chromePath ? {
      // Redirect URLs are deliberately not the authority. Modern Stripe.js flows can expose use_stripe_sdk instead.
      async completeHostedChallenge() { fail('use_owned_payment_authentication'); },
      async completePaymentAuthentication({ clientSecret, reference, expectation }) {
        const current = supervisor.current();
        if (!clientSecret.startsWith(`${reference}_secret_`)) fail('browser_payment_secret_mismatch');
        const drive = expectation === 'challenge' ? driveStripeChallenge : driveStripeNoChallenge;
        const evidence = await drive({ chromePath: config.chromePath!, appOrigin: current.appOrigin,
          publishableKey: input.STRIPE_PUBLISHABLE_KEY!, clientSecret, approvedOrigins: browserOrigins });
        browserEvidence.push({ expectation, ...evidence });
      },
    } : undefined;
    const result = await runManagedJourney(runEnv, { fault, process: processPort, browser });
    return { ...result, ownedProcess: { sourceSha, projectRef: config.projectRef, runId, initialPid: initial.pid,
      restarts: restartEvidence, browser: browserEvidence,
      scope: 'Native HTTP registrars in an isolated app; not a production deployment or full checkout-page browser acceptance.' } };
  } finally { await supervisor.close(); }
}
if (isEntrypoint(import.meta.url, process.argv[1])) {
  launchOwnedQualification().then(result => {
    process.stdout.write(`${formatReceipt(result)}\n${JSON.stringify(result.ownedProcess, null, 2)}\n`);
    process.exitCode = result.receipt.qualified ? 0 : 1;
  }).catch(error => {
    const code = error instanceof QualificationBoundaryError ? error.code : error instanceof ManagedJourneyNotRun ? error.code : 'qualification_run_failed';
    process.stdout.write(`NOT_QUALIFIED ${code}\n`); process.exitCode = 2;
  });
}
