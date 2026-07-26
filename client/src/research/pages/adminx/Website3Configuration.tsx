import { useState, type FormEvent, type ReactNode } from "react";
import {
  getAdminMetabolicPathways,
  getAdminSupplementPlaceholders,
  getAdminSuperpowerOffer,
  updateAdminMetabolicPathway,
  updateAdminSupplementPlaceholder,
  updateAdminSuperpowerOffer,
} from "../../adapters/products-diagnostics";
import { ResearchSecureNotice, ResearchStatusBadge } from "../../ui/kit";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";
import { useAdminResource } from "./auth";

type SaveState = "idle" | "saving" | "saved" | "error";

function ManagedForm({
  title,
  status,
  children,
  onSubmit,
}: {
  title: string;
  status: string;
  children: ReactNode;
  onSubmit: (form: FormData) => Promise<boolean>;
}) {
  const [save, setSave] = useState<SaveState>("idle");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSave("saving");
    setSave((await onSubmit(new FormData(event.currentTarget))) ? "saved" : "error");
  };
  return (
    <form className="card" onSubmit={(event) => void submit(event)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="body-m font-700">{title}</h3>
        <ResearchStatusBadge label={status.replaceAll("_", " ")} tone="pending" />
      </div>
      <div className="mt-5 grid gap-4">{children}</div>
      <button type="submit" className="btn btn-primary mt-5" disabled={save === "saving"}>
        {save === "saving" ? "Saving..." : "Save approved copy"}
      </button>
      <div className="body-s mt-3" aria-live="polite">
        {save === "saved" && <p role="status">Saved to the production-backed configuration record.</p>}
        {save === "error" && <p role="alert">The update was not saved. Review the fields and try again.</p>}
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  value,
  multiline = false,
}: {
  label: string;
  name: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="form-label">{label}</span>
      {multiline ? (
        <textarea className="input-field min-h-28" name={name} defaultValue={value} required />
      ) : (
        <input className="input-field" name={name} defaultValue={value} required />
      )}
    </label>
  );
}

export default function Website3Configuration() {
  return (
    <AdminScreen
      title="Product experience configuration"
      lead="Manage approved public copy for Pending metabolic pathways, supplement categories, and Superpower. External activation, affiliate credentials, prices, inventory, and clinical claims stay outside this screen."
    >
      {(token) => <ConfigurationBody token={token} />}
    </AdminScreen>
  );
}

function ConfigurationBody({ token }: { token: string }) {
  const pathways = useAdminResource(token, getAdminMetabolicPathways);
  const supplements = useAdminResource(token, getAdminSupplementPlaceholders);
  const superpower = useAdminResource(token, getAdminSuperpowerOffer);

  return (
    <div className="grid gap-9">
      <ResearchSecureNotice>
        These controls edit truthful public copy only. They do not enable a clinician,
        pharmacy, product, price, inventory record, or affiliate offer.
      </ResearchSecureNotice>

      <section aria-labelledby="admin-pathways-title">
        <h2 id="admin-pathways-title" className="body-l font-700">Metabolic pathways</h2>
        <div className="mt-4">
          <AdminBoundary
            state={pathways.state}
            message={pathways.message}
            deniedCode={pathways.deniedCode}
            onRetry={pathways.reload}
            unavailableTitle="Pathway configuration is unavailable."
            unavailableBody="No public pathway copy can be changed until durable configuration is available."
          >
            <div className="grid gap-4">
              {(pathways.data?.pathways ?? []).map((pathway) => (
                <ManagedForm
                  key={pathway.pathwayId}
                  title={pathway.publicName}
                  status={pathway.publicStatus}
                  onSubmit={async (form) => {
                    const result = await updateAdminMetabolicPathway(token, pathway.pathwayId, {
                      publicName: String(form.get("publicName") ?? ""),
                      publicStatus: String(form.get("publicStatus") ?? ""),
                      publicCopy: String(form.get("publicCopy") ?? ""),
                    });
                    if (result.kind === "ok") pathways.reload();
                    return result.kind === "ok";
                  }}
                >
                  <Field label="Public name" name="publicName" value={pathway.publicName} />
                  <Field label="Public status" name="publicStatus" value={pathway.publicStatus} />
                  <Field label="Public explanation" name="publicCopy" value={pathway.publicCopy} multiline />
                </ManagedForm>
              ))}
            </div>
          </AdminBoundary>
        </div>
      </section>

      <section aria-labelledby="admin-supplements-title">
        <h2 id="admin-supplements-title" className="body-l font-700">Supplement placeholders</h2>
        <div className="mt-4">
          <AdminBoundary
            state={supplements.state}
            message={supplements.message}
            deniedCode={supplements.deniedCode}
            onRetry={supplements.reload}
            unavailableTitle="Supplement configuration is unavailable."
            unavailableBody="No placeholder copy can be changed until durable configuration is available."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {(supplements.data?.supplements ?? []).map((supplement) => (
                <ManagedForm
                  key={supplement.category}
                  title={supplement.label}
                  status={supplement.status}
                  onSubmit={async (form) => {
                    const result = await updateAdminSupplementPlaceholder(token, supplement.category, {
                      label: String(form.get("label") ?? ""),
                      description: String(form.get("description") ?? ""),
                      launchInterestHref: String(form.get("launchInterestHref") ?? ""),
                    });
                    if (result.kind === "ok") supplements.reload();
                    return result.kind === "ok";
                  }}
                >
                  <Field label="Public label" name="label" value={supplement.label} />
                  <Field label="Public explanation" name="description" value={supplement.description} multiline />
                  <Field label="Interest route" name="launchInterestHref" value={supplement.launchInterestHref} />
                </ManagedForm>
              ))}
            </div>
          </AdminBoundary>
        </div>
      </section>

      <section aria-labelledby="admin-superpower-title">
        <h2 id="admin-superpower-title" className="body-l font-700">Superpower public state</h2>
        <div className="mt-4">
          <AdminBoundary
            state={superpower.state}
            message={superpower.message}
            deniedCode={superpower.deniedCode}
            onRetry={superpower.reload}
            unavailableTitle="Superpower configuration is unavailable."
            unavailableBody="No partner copy can be changed until durable configuration is available."
          >
            {superpower.data?.offer && (
              <ManagedForm
                title={superpower.data.offer.label}
                status={superpower.data.offer.status}
                onSubmit={async (form) => {
                  const result = await updateAdminSuperpowerOffer(token, {
                    label: String(form.get("label") ?? ""),
                    summary: String(form.get("summary") ?? ""),
                    status: String(form.get("status") ?? "") as typeof superpower.data.offer.status,
                    availability: String(form.get("availability") ?? ""),
                    disclosure: String(form.get("disclosure") ?? ""),
                  });
                  if (result.kind === "ok") superpower.reload();
                  return result.kind === "ok";
                }}
              >
                <Field label="Public label" name="label" value={superpower.data.offer.label} />
                <Field label="Public summary" name="summary" value={superpower.data.offer.summary} multiline />
                <label className="grid gap-2">
                  <span className="form-label">Public status</span>
                  <select className="input-field" name="status" defaultValue={superpower.data.offer.status}>
                    <option value="coming_soon">Coming soon</option>
                    <option value="paused">Paused</option>
                    <option value="unavailable">Unavailable</option>
                  </select>
                </label>
                <Field label="Availability explanation" name="availability" value={superpower.data.offer.availability} />
                <Field label="Affiliate disclosure" name="disclosure" value={superpower.data.offer.disclosure} multiline />
              </ManagedForm>
            )}
          </AdminBoundary>
        </div>
      </section>
    </div>
  );
}
