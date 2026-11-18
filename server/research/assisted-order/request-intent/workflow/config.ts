import { z } from "zod";

const scope = z.string().regex(/^[a-z][a-z0-9_-]{2,63}$/);
const instant = z.string().datetime({ offset: true });
export type WorkflowScope = Readonly<{ environment: string; startAt: string }>;
/** DB independently pins the same deployment/cutoff. No runtime configuration writes. */
export function requestWorkflowConfig(env: Readonly<Record<string, string | undefined>>): WorkflowScope | null {
  if (env.RESEARCH_REQUEST_WORKFLOW_ENABLED !== "true") return null;
  const environment = scope.safeParse(env.RESEARCH_REQUEST_WORKFLOW_ENVIRONMENT);
  const startAt = instant.safeParse(env.RESEARCH_REQUEST_WORKFLOW_START_AT);
  if (!environment.success || !startAt.success) return null;
  return Object.freeze({ environment: environment.data, startAt: new Date(startAt.data).toISOString() });
}
