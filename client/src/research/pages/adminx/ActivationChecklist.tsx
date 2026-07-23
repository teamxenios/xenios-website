import { useState } from "react";
import { ResearchEmptyState, ResearchStatusBadge } from "../../ui/kit";
import { getActivationChecklist, updateActivationChecklist } from "../../adapters/adminOps";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";
import { fmtDateTime, useAdminResource } from "./auth";

// ---------------------------------------------------------------------------
// /admin/research/activation-checklist: the Day 15 checklist. The manual
// bridge is temporary by design; these are the six exits that must be done
// before it closes. Every check is attributed to the admin who made it and
// persists server-side; nothing here is decorative.
// ---------------------------------------------------------------------------

type ChecklistItem = {
  key: string;
  label: string;
  done: boolean;
  note: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};

export default function ActivationChecklist() {
  return (
    <AdminScreen
      title="Day 15 checklist"
      lead="The exits from the manual payment bridge. Each item persists with who checked it and when; complete all six before the bridge sunsets."
    >
      {(token) => <ChecklistBody token={token} />}
    </AdminScreen>
  );
}

const loadChecklist = (t: string) => getActivationChecklist<{ ok: boolean; items: ChecklistItem[] }>(t);

function ChecklistBody({ token }: { token: string }) {
  const resource = useAdminResource(token, loadChecklist);
  const items = resource.data?.items ?? [];
  const doneCount = items.filter((i) => i.done).length;

  return (
    <AdminBoundary
      state={resource.state}
      message={resource.message}
      deniedCode={resource.deniedCode}
      onRetry={resource.reload}
      unavailableTitle="The checklist is not open."
      unavailableBody="Founding membership activation is not enabled in this environment."
    >
      {items.length === 0 ? (
        <ResearchEmptyState title="No checklist items were returned." />
      ) : (
        <div className="grid gap-4">
          <p className="body-s text-ink-2" data-testid="checklist-progress">
            {doneCount} of {items.length} complete.
          </p>
          {items.map((item) => (
            <ChecklistRow key={item.key} token={token} item={item} onSaved={resource.reload} />
          ))}
        </div>
      )}
    </AdminBoundary>
  );
}

function ChecklistRow({
  token,
  item,
  onSaved,
}: {
  token: string;
  item: ChecklistItem;
  onSaved: () => void;
}) {
  const [note, setNote] = useState(item.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(done: boolean) {
    setBusy(true);
    setError(null);
    const res = await updateActivationChecklist<{ ok: boolean }>(token, item.key, done, note.trim() || null);
    setBusy(false);
    if (res.kind === "ok") onSaved();
    else
      setError(
        res.kind === "denied" || res.kind === "error"
          ? (res.message ?? "The update was refused.")
          : "The update was refused.",
      );
  }

  return (
    <article className="card" data-testid={`checklist-${item.key}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-start gap-3 body-m" htmlFor={`check-${item.key}`}>
          <input
            id={`check-${item.key}`}
            type="checkbox"
            checked={item.done}
            disabled={busy}
            onChange={(e) => void save(e.target.checked)}
            data-testid={`checklist-check-${item.key}`}
          />
          <span className={item.done ? "" : "font-700"}>{item.label}</span>
        </label>
        <ResearchStatusBadge label={item.done ? "Done" : "Open"} tone={item.done ? "success" : "warning"} />
      </div>
      {item.updatedBy && (
        <p className="body-s text-ink-mute mt-2">
          Last updated by {item.updatedBy}
          {item.updatedAt ? ` on ${fmtDateTime(item.updatedAt)}` : ""}.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div style={{ flex: "1 1 240px" }}>
          <label htmlFor={`note-${item.key}`} className="form-label">
            Note (optional)
          </label>
          <input
            id={`note-${item.key}`}
            className="input-field"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            data-testid={`checklist-note-${item.key}`}
          />
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => void save(item.done)}
          data-testid={`checklist-save-${item.key}`}
        >
          Save note
        </button>
      </div>
      {error && (
        <p className="body-s mt-2" role="alert" style={{ color: "var(--error)" }}>
          {error}
        </p>
      )}
    </article>
  );
}
