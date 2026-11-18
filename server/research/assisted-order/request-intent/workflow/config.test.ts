import { expect, it } from "vitest";
import { requestWorkflowConfig } from "./config";

it("requires explicit enabled scope and finite deployment cutoff without defaults", () => {
  const env = { RESEARCH_REQUEST_WORKFLOW_ENABLED: "true", RESEARCH_REQUEST_WORKFLOW_ENVIRONMENT: "ea-fixture",
    RESEARCH_REQUEST_WORKFLOW_START_AT: "2026-11-18T03:00:00+00:00" };
  expect(requestWorkflowConfig(env)).toEqual({ environment: "ea-fixture", startAt: "2026-11-18T03:00:00.000Z" });
  for (const RESEARCH_REQUEST_WORKFLOW_ENABLED of [undefined, "false", "1", "TRUE", " true"]) {
    expect(requestWorkflowConfig({ ...env, RESEARCH_REQUEST_WORKFLOW_ENABLED })).toBeNull();
  }
  for (const RESEARCH_REQUEST_WORKFLOW_START_AT of [undefined, "yesterday", "infinity", "2026-11-18"]) {
    expect(requestWorkflowConfig({ ...env, RESEARCH_REQUEST_WORKFLOW_START_AT })).toBeNull();
  }
  expect(requestWorkflowConfig({ ...env, RESEARCH_REQUEST_WORKFLOW_ENVIRONMENT: "https://evil.invalid" })).toBeNull();
});
