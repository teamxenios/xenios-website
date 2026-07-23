import { ResearchEmptyState, ResearchStatusBadge, type BadgeTone } from "../../ui/kit";
import { getActivationReadiness } from "../../adapters/adminOps";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";
import { useAdminResource } from "./auth";

// ---------------------------------------------------------------------------
// /admin/research/activation-readiness: the go-live readiness report. Every
// item the server reports sits in exactly one of four states (code_ready,
// configuration_missing, external_approval_missing, production_test_missing)
// and the report never carries a secret value: environment checks arrive as
// presence booleans and variable names only. This page renders that
// vocabulary faithfully; it invents nothing and computes nothing.
// ---------------------------------------------------------------------------

type ReadinessState =
  | "code_ready"
  | "configuration_missing"
  | "external_approval_missing"
  | "production_test_missing";

type ReadinessItem = {
  key: string;
  label: string;
  state: ReadinessState;
  detail: string | null;
};

type ReadinessArea = {
  area: string;
  title: string;
  items: ReadinessItem[];
};

type ReadinessDto = {
  ok: boolean;
  generatedAt: string;
  areas: ReadinessArea[];
};

export const READINESS_STATE_PRESENTATION: Record<ReadinessState, { label: string; tone: BadgeTone }> = {
  code_ready: { label: "Code ready", tone: "success" },
  configuration_missing: { label: "Configuration missing", tone: "warning" },
  external_approval_missing: { label: "External approval missing", tone: "pending" },
  production_test_missing: { label: "Production test missing", tone: "info" },
};

export default function ActivationReadiness() {
  return (
    <AdminScreen
      title="Activation readiness"
      lead="What stands between the founding activation flow and go-live, area by area. Each item is code ready, missing configuration, waiting on an external approval, or waiting on a production test. No secret values appear here."
    >
      {(token) => <ReadinessBody token={token} />}
    </AdminScreen>
  );
}

const loadReadiness = (t: string) => getActivationReadiness<ReadinessDto>(t);

function ReadinessBody({ token }: { token: string }) {
  const resource = useAdminResource(token, loadReadiness);
  const areas = resource.data?.areas ?? [];

  return (
    <AdminBoundary
      state={resource.state}
      message={resource.message}
      deniedCode={resource.deniedCode}
      onRetry={resource.reload}
      unavailableTitle="The readiness report is not open."
      unavailableBody="Founding membership activation is not enabled in this environment."
    >
      {areas.length === 0 ? (
        <ResearchEmptyState title="No readiness areas were returned." />
      ) : (
        <div className="grid gap-5">
          {areas.map((area) => (
            <AreaCard key={area.area} area={area} />
          ))}
        </div>
      )}
    </AdminBoundary>
  );
}

function AreaCard({ area }: { area: ReadinessArea }) {
  const readyCount = area.items.filter((item) => item.state === "code_ready").length;
  return (
    <article className="card" data-testid={`readiness-area-${area.area}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="body-m font-700">{area.title}</h2>
        <p className="body-s text-ink-mute" data-testid={`readiness-progress-${area.area}`}>
          {readyCount} of {area.items.length} code ready
        </p>
      </div>
      <div className="mt-4 grid gap-3">
        {area.items.map((item) => (
          <ItemRow key={item.key} area={area.area} item={item} />
        ))}
      </div>
    </article>
  );
}

function ItemRow({ area, item }: { area: string; item: ReadinessItem }) {
  const presentation = READINESS_STATE_PRESENTATION[item.state] ?? {
    label: item.state,
    tone: "neutral" as BadgeTone,
  };
  return (
    <div
      className="flex flex-wrap items-start justify-between gap-3"
      style={{ borderTop: "1px solid var(--border, rgba(0,0,0,0.08))", paddingTop: 12 }}
      data-testid={`readiness-item-${area}-${item.key}`}
    >
      <div style={{ flex: "1 1 320px", minWidth: 0 }}>
        <p className="body-m">{item.label}</p>
        {item.detail && (
          <p className="body-s text-ink-mute mt-1" data-testid={`readiness-detail-${area}-${item.key}`}>
            {item.detail}
          </p>
        )}
      </div>
      <ResearchStatusBadge label={presentation.label} tone={presentation.tone} />
    </div>
  );
}
