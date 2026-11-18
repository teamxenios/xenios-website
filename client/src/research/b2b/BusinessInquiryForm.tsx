import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { businessInquiryInputSchema, type BusinessInquiryReceipt } from "@shared/research/business-inquiry";
import {
  createBusinessInquiryAttemptKey, createBusinessInquiryCommand, submitBusinessInquiry,
  type BusinessInquiryCommand,
} from "./business-inquiry-api";
import "./pathways.css";

export interface BusinessInquiryFormProps {
  /** Root readiness only: default false; not a browser authorization grant. */
  enabled?: boolean;
  /** Root must change this on every owner/session/lifecycle change; never reuse a generation. */
  contextGeneration: string;
  /** Root's synchronous live generation check; not a substitute for server authorization. */
  isContextCurrent(generation: string): boolean;
}
type Selection = { row: number; description: string; variant: string; quantity: string; unit: string };
type Draft = {
  contactName: string; contactEmail: string; organizationName: string; organizationType: string;
  location: string; serviceArea: string; categories: string[]; selections: Selection[];
  packagingPreference: string; siteCount: string; replenishment: string; services: string[];
  timing: string; documentationNeeds: string; context: string; referral: string;
};
type Issue = { path: string; message: string };
type Phase = "editing" | "pending" | "uncertain" | "blocked" | "saved";
const categories = [["clinical", "Clinical"], ["research", "Research"], ["supplements", "Supplements"], ["topicals", "Topicals"], ["other", "Other"]] as const;
const services = [["sourcing", "Sourcing"], ["labeling", "Labeling"], ["fulfillment", "Fulfillment"], ["consultation", "Consultation"], ["other", "Other"]] as const;
const blank = (): Draft => ({
  contactName: "", contactEmail: "", organizationName: "", organizationType: "", location: "", serviceArea: "",
  categories: [], selections: [], packagingPreference: "not_sure", siteCount: "1", replenishment: "not_sure",
  services: [], timing: "", documentationNeeds: "", context: "", referral: "",
});
const optional = (value: string) => value.trim() || undefined;
const number = (value: string) => value.trim() ? Number(value) : Number.NaN;
function input(draft: Draft) {
  return {
    contactName: draft.contactName, contactEmail: draft.contactEmail, organizationName: draft.organizationName,
    organizationType: draft.organizationType, location: draft.location, serviceArea: optional(draft.serviceArea),
    categories: draft.categories, selections: draft.selections.map(({ row: _row, quantity, ...selection }) => ({
      ...selection, quantity: number(quantity),
    })), packagingPreference: draft.packagingPreference, siteCount: number(draft.siteCount),
    replenishment: draft.replenishment, services: draft.services, timing: optional(draft.timing),
    documentationNeeds: optional(draft.documentationNeeds), context: optional(draft.context), referral: optional(draft.referral),
  };
}
function issueMessage(path: string): string {
  if (path === "categories") return "Choose at least one category.";
  if (path === "siteCount") return "Enter a whole site count from 1 to 10,000.";
  if (path.endsWith(".quantity")) return "Enter a quantity greater than zero and no more than 1,000,000.";
  if (path.endsWith(".unit")) return "Choose the quantity unit.";
  if (path.endsWith(".description")) return "Add the exact requested item description (up to 240 characters).";
  if (path.endsWith(".variant")) return "Add the requested presentation or variant (up to 180 characters).";
  const messages: Record<string, string> = {
    contactName: "Add your name (up to 120 characters).", contactEmail: "Add a valid email (up to 254 characters).",
    organizationName: "Add the organization name (up to 180 characters).", organizationType: "Choose an organization type.",
    location: "Add the principal location (up to 180 characters).", serviceArea: "Keep the service area to 240 characters.",
    timing: "Keep timing to 240 characters.", documentationNeeds: "Keep documentation needs to 500 characters.",
    context: "Keep business context to 1,000 characters.", referral: "Keep referral information to 200 characters.",
  };
  return messages[path] ?? "Check this answer.";
}
function SupportLinks() {
  return <p className="body-s mt-5"><a href="/research/support">Contact support</a>{" · "}<a href="/earlyaccess">Browse the catalog</a></p>;
}

export default function BusinessInquiryForm({ enabled = false, contextGeneration, isContextCurrent }: BusinessInquiryFormProps) {
  const live = useRef({ enabled, contextGeneration, isContextCurrent });
  live.current = { enabled, contextGeneration, isContextCurrent };
  const current = (generation: string) => {
    const value = live.current;
    try {
      return value.enabled === true && generation === value.contextGeneration
        && typeof value.isContextCurrent === "function" && value.isContextCurrent(generation) === true;
    } catch { return false; }
  };
  if (!enabled || !contextGeneration || !current(contextGeneration)) {
    return <section className="xr-b2b-inquiry"><h2 className="display-s">Business enquiries</h2>
      <p className="body-m mt-4">Online business enquiries are not available in this session. Contact the team for help.</p><SupportLinks /></section>;
  }
  return <OnlineForm key={contextGeneration} isCurrent={() => current(contextGeneration)} />;
}

function OnlineForm({ isCurrent }: { isCurrent(): boolean }) {
  const prefix = useId();
  const [draft, setDraft] = useState<Draft>(blank);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [phase, setPhase] = useState<Phase>("editing");
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<BusinessInquiryReceipt | null>(null);
  const phaseRef = useRef<Phase>("editing");
  const frozen = useRef<{ command: BusinessInquiryCommand; ambiguous: boolean } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const lifecycle = useRef(0);
  const alive = useRef(false);
  const fence = useRef(isCurrent);
  fence.current = isCurrent;
  const nextRow = useRef(0);
  const summary = useRef<HTMLDivElement>(null);
  const saved = useRef<HTMLHeadingElement>(null);
  const id = (path: string) => `${prefix}-${path.replaceAll(".", "-")}`;
  const locked = phase !== "editing";
  useLayoutEffect(() => {
    alive.current = true;
    lifecycle.current += 1;
    return () => { alive.current = false; lifecycle.current += 1; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    if (phase === "saved") saved.current?.focus();
    else if (issues.length || (message && phase !== "pending")) summary.current?.focus();
  }, [issues, message, phase]);
  function transition(value: Phase) { phaseRef.current = value; setPhase(value); }
  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    if (phaseRef.current !== "editing") return;
    setDraft((prior) => ({ ...prior, [key]: value })); setIssues([]); setMessage("");
  }
  function toggle(key: "categories" | "services", value: string) {
    update(key, draft[key].includes(value) ? draft[key].filter((item) => item !== value) : [...draft[key], value]);
  }
  function selection(index: number, key: keyof Omit<Selection, "row">, value: string) {
    update("selections", draft.selections.map((item, at) => at === index ? { ...item, [key]: value } : item));
  }
  function error(path: string) { return issues.find((issue) => issue.path === path)?.message; }
  function attributes(path: string) {
    return { id: id(path), "aria-invalid": Boolean(error(path)) || undefined,
      "aria-describedby": error(path) ? `${id(path)}-error` : undefined };
  }
  function field(path: string, label: string, control: ReactNode, wide = false) {
    return <div className={`xr-b2b-field${wide ? " xr-b2b-field-wide" : ""}`} key={path} style={{ minWidth: 0 }}>
      <label htmlFor={id(path)} className="form-label">{label}</label>{control}
      {error(path) && <p className="xr-b2b-field-error body-s" id={`${id(path)}-error`}>{error(path)}</p>}
    </div>;
  }
  function text(key: keyof Pick<Draft, "contactName" | "contactEmail" | "organizationName" | "location" | "serviceArea" | "timing" | "documentationNeeds" | "context" | "referral">,
    label: string, max: number, options: { required?: boolean; type?: string; autoComplete?: string; multiline?: boolean } = {}) {
    const common = { ...attributes(key), name: key, className: "input-field", value: draft[key], maxLength: max,
      required: options.required, onChange: (event: { target: { value: string } }) => update(key, event.target.value) };
    return field(key, label, options.multiline ? <textarea {...common} rows={4} />
      : <input {...common} type={options.type ?? "text"} autoComplete={options.autoComplete} />, options.multiline);
  }
  async function send() {
    if (!frozen.current || phaseRef.current === "pending" || !fence.current()) return;
    const pending = frozen.current;
    const generation = lifecycle.current;
    const abort = new AbortController(); controller.current = abort;
    const current = () => alive.current && lifecycle.current === generation && fence.current();
    transition("pending"); setMessage("Sending your enquiry. Wait for confirmation before leaving this page.");
    const result = await submitBusinessInquiry(pending.command, { signal: abort.signal, isCurrent: current });
    if (!current()) return;
    controller.current = null;
    if (result.kind === "saved") { setReceipt(result.receipt); setMessage(""); transition("saved"); return; }
    if ((result.kind === "rejected" && result.code === "invalid_request" && !pending.ambiguous)
      || (result.kind === "invalid_command" && !pending.ambiguous)) {
      frozen.current = null; transition("editing");
      setMessage("Those details were rejected. Review your answers before sending a new enquiry."); return;
    }
    if (result.kind === "discarded") return;
    if (result.kind === "uncertain" || result.kind === "conflict") pending.ambiguous = true;
    transition(pending.ambiguous ? "uncertain" : "blocked");
    setMessage(pending.ambiguous
      ? "We could not confirm whether your enquiry was saved. Your details are locked. Retry the unchanged enquiry to check the same attempt, or contact support."
      : "This session cannot complete the enquiry. A saved reference has not been confirmed. You can retry the unchanged enquiry or contact support.");
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phaseRef.current !== "editing" || !fence.current()) return;
    const parsed = businessInquiryInputSchema.safeParse(input(draft));
    if (!parsed.success) {
      const paths = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
      setIssues(paths.map((path) => ({ path, message: issueMessage(path) }))); setMessage(""); return;
    }
    try { frozen.current = { command: createBusinessInquiryCommand(createBusinessInquiryAttemptKey(), parsed.data), ambiguous: false }; }
    catch { setMessage("Online submission is unavailable. Your enquiry has not been sent. Contact support for help."); return; }
    setIssues([]); void send();
  }
  if (receipt && phase === "saved") return <section className="xr-b2b-inquiry" aria-labelledby={id("received")}>
    <h2 className="display-s" id={id("received")} tabIndex={-1} ref={saved}>Enquiry received</h2>
    <p className="body-l mt-4">Reference: <strong style={{ overflowWrap: "anywhere" }}>{receipt.reference}</strong></p>
    <p className="body-s mt-3">Received <time dateTime={receipt.receivedAt}>{new Date(receipt.receivedAt).toLocaleString()}</time>. Awaiting team review.</p>
    <SupportLinks />
  </section>;
  return <section className="xr-b2b-inquiry" aria-labelledby={id("heading")}>
    <h2 className="display-s" id={id("heading")}>Send a business enquiry</h2>
    <p className="body-m mt-4">Tell the Xenios team about your organization and requested items. Submission does not confirm availability, pricing, account access or approval.</p>
    <p className="body-s mt-3" id={id("privacy")}>Include business information only. Do not include patient details, payment data or secrets.</p>
    <form onSubmit={submit} noValidate className="xr-b2b-form mt-8" aria-describedby={id("privacy")} aria-busy={phase === "pending"}>
      {(issues.length > 0 || message) && <div ref={summary} className="xr-b2b-form-errors mb-6" tabIndex={-1}
        role={phase === "pending" ? "status" : "alert"}>
        <p className="body-m">{issues.length ? "Check the marked answers." : message}</p>
        {issues.length > 0 && <ul>{issues.map((issue) => <li key={issue.path}><a href={`#${id(issue.path)}`}>{issue.message}</a></li>)}</ul>}
      </div>}
      <fieldset disabled={locked} style={{ minWidth: 0 }}>
        <legend className="body-l font-700 mb-4">Contact and organization</legend>
        <div className="xr-b2b-form-grid">
          {text("contactName", "Your name", 120, { required: true, autoComplete: "name" })}
          {text("contactEmail", "Email", 254, { required: true, type: "email", autoComplete: "email" })}
          {text("organizationName", "Organization name", 180, { required: true, autoComplete: "organization" })}
          {field("organizationType", "Organization type", <select {...attributes("organizationType")} name="organizationType" className="input-field" required
            value={draft.organizationType} onChange={(event) => update("organizationType", event.target.value)}>
            <option value="">Choose a type</option>{[["clinic", "Clinic"], ["pharmacy", "Pharmacy"], ["research", "Research organization"], ["retailer", "Retailer"], ["distributor", "Distributor"], ["other", "Other"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>)}
          {text("location", "Principal location", 180, { required: true })}
          {text("serviceArea", "Service area (optional)", 240)}
        </div>
        <fieldset className="mt-6" style={{ minWidth: 0 }} aria-invalid={Boolean(error("categories")) || undefined} aria-describedby={error("categories") ? `${id("categories")}-error` : undefined}>
          <legend className="form-label">Categories — choose at least one</legend>
          <div className="flex flex-wrap gap-4" id={id("categories")} tabIndex={-1}>{categories.map(([value, label]) => <label key={value} className="flex items-center gap-2">
            <input type="checkbox" name="categories" value={value} checked={draft.categories.includes(value)} onChange={() => toggle("categories", value)} />{label}
          </label>)}</div>
          {error("categories") && <p className="xr-b2b-field-error body-s" id={`${id("categories")}-error`}>{error("categories")}</p>}
        </fieldset>
        <fieldset className="mt-8" style={{ minWidth: 0 }}>
          <legend className="body-l font-700">Requested items (optional)</legend>
          <p className="body-s mt-2">For each item, include the exact description, presentation and quantity unit. Leave this section empty for an exploratory enquiry.</p>
          {draft.selections.map((item, index) => <fieldset key={item.row} className="mt-6" style={{ minWidth: 0 }}>
            <legend className="form-label">Requested item {index + 1}</legend>
            <div className="xr-b2b-form-grid">
              {field(`selections.${index}.description`, "Exact item description", <input {...attributes(`selections.${index}.description`)} name={`selections.${index}.description`} className="input-field" maxLength={240} required value={item.description} onChange={(event) => selection(index, "description", event.target.value)} />)}
              {field(`selections.${index}.variant`, "Presentation or variant", <input {...attributes(`selections.${index}.variant`)} name={`selections.${index}.variant`} className="input-field" maxLength={180} required value={item.variant} onChange={(event) => selection(index, "variant", event.target.value)} />)}
              {field(`selections.${index}.quantity`, "Quantity", <input {...attributes(`selections.${index}.quantity`)} name={`selections.${index}.quantity`} className="input-field" type="number" inputMode="decimal" step="any" min="0" max="1000000" required value={item.quantity} onChange={(event) => selection(index, "quantity", event.target.value)} />)}
              {field(`selections.${index}.unit`, "Quantity unit", <select {...attributes(`selections.${index}.unit`)} name={`selections.${index}.unit`} className="input-field" required value={item.unit} onChange={(event) => selection(index, "unit", event.target.value)}>
                <option value="">Choose a unit</option>{["vial", "bottle", "tube", "jar", "kit", "unit"].map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </select>)}
            </div><button type="button" className="btn btn-secondary mt-3" onClick={() => update("selections", draft.selections.filter((_, at) => at !== index))}>Remove item {index + 1}</button>
          </fieldset>)}
          <button type="button" className="btn btn-secondary mt-4" disabled={draft.selections.length >= 40}
            onClick={() => update("selections", [...draft.selections, { row: nextRow.current++, description: "", variant: "", quantity: "", unit: "" }])}>Add requested item</button>
        </fieldset>
        <div className="xr-b2b-form-grid mt-8">
          {field("packagingPreference", "Packaging preference", <select {...attributes("packagingPreference")} name="packagingPreference" className="input-field" value={draft.packagingPreference} onChange={(event) => update("packagingPreference", event.target.value)}>
            <option value="not_sure">Not sure</option><option value="supplier_brand">Supplier brand</option><option value="organization_brand">Organization brand</option>
          </select>)}
          {field("siteCount", "Number of sites", <input {...attributes("siteCount")} name="siteCount" className="input-field" type="number" inputMode="numeric" min="1" max="10000" step="1" required value={draft.siteCount} onChange={(event) => update("siteCount", event.target.value)} />)}
          {field("replenishment", "Replenishment", <select {...attributes("replenishment")} name="replenishment" className="input-field" value={draft.replenishment} onChange={(event) => update("replenishment", event.target.value)}>
            <option value="not_sure">Not sure</option><option value="one_time">One time</option><option value="recurring">Recurring</option>
          </select>)}
        </div>
        <fieldset className="mt-6" style={{ minWidth: 0 }}><legend className="form-label">Services (optional)</legend>
          <div className="flex flex-wrap gap-4">{services.map(([value, label]) => <label key={value} className="flex items-center gap-2"><input type="checkbox" name="services" value={value} checked={draft.services.includes(value)} onChange={() => toggle("services", value)} />{label}</label>)}</div>
        </fieldset>
        <div className="xr-b2b-form-grid mt-6">
          {text("timing", "Timing (optional)", 240)}{text("referral", "Who referred you? (optional)", 200)}
          {text("documentationNeeds", "Documentation needs (optional)", 500, { multiline: true })}
          {text("context", "Business context (optional)", 1000, { multiline: true })}
        </div>
        <button type="submit" className="btn btn-primary mt-6">Send business enquiry</button>
      </fieldset>
      {(phase === "uncertain" || phase === "blocked") && <button type="button" className="btn btn-primary mt-5" onClick={() => void send()}>Retry unchanged enquiry</button>}
    </form><SupportLinks />
  </section>;
}
