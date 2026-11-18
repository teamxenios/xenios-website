import { createContext, useEffect, useId, useRef, useState, type ReactNode, type FormEvent } from "react";
import {
  CATALOG_COUNTRY_CODES, requiresRegionAndPostcode, type CatalogPostalAddress,
} from "../../../../shared/research/assisted-order/admission-address";
export type CatalogAdmissionView = Readonly<{
  admitted: boolean;
  policyRevision: string;
  retentionSeconds?: number;
}>;
type Input = Readonly<{
  fullLegalName: string;
  email: string;
  postalAddress: CatalogPostalAddress;
  policyRevision: string;
}>;
export type CatalogContactDraft = Pick<Input, "fullLegalName" | "email" | "postalAddress">;
// Never reconstruct a draft from a status GET. This context is scoped to the admitted owner.
export const CatalogContactDraftContext = createContext<CatalogContactDraft | null>(null);
export type CatalogAdmissionApi = Readonly<{
  status(signal:AbortSignal):Promise<CatalogAdmissionView>;
  record(contact:Input,signal:AbortSignal):Promise<CatalogAdmissionView>;
}>;
type Props = Readonly<{sessionEpoch:string;api:CatalogAdmissionApi;children:ReactNode}>;
function valid(v: CatalogAdmissionView) {
  return !!v && typeof v.admitted==="boolean" && typeof v.policyRevision==="string" && /^[a-f0-9]{64}$/.test(v.policyRevision);
}
/** Mount only after current waiver acceptance. sessionEpoch is a NON-SECRET render epoch
 * changed by the owner on principal change/logout; never use the actual session token. */
export function PreCatalogContact({sessionEpoch,api,children}:Props) {
  if(!sessionEpoch) return <p role="status">Sign in again to view the catalog.</p>;
  return <CatalogAdmissionGate key={sessionEpoch} api={api}>{children}</CatalogAdmissionGate>;
}

export function CatalogAdmissionGate({
  api, children, recheckOnRestore = false,
}: Pick<Props, "api" | "children"> & { recheckOnRestore?: boolean }) {
  const [attempt, retry] = useState(0);
  const [view, setView] = useState<CatalogAdmissionView | null>(null);
  const [phase, setPhase] = useState<"checking" | "ready" | "saving" | "error">("checking");
  const scope = useRef<AbortController | null>(null);
  const [draft, setDraft] = useState<Input | null>(null);

  useEffect(() => {
    function hide() {
      scope.current?.abort();
      setPhase("checking");
    }

    function check() {
      hide();
      if (recheckOnRestore && document.visibilityState === "hidden") return;
      const controller = new AbortController();
      scope.current = controller;
      void api.status(controller.signal).then(result => {
        if (controller.signal.aborted) return;
        if (!valid(result)) {
          setPhase("error");
          return;
        }
        setDraft(previous => result.admitted && previous?.policyRevision === result.policyRevision ? previous : null);
        setView(result);
        setPhase("ready");
      }, () => {
        if (!controller.signal.aborted) setPhase("error");
      });
    }

    if (recheckOnRestore) {
      document.addEventListener("visibilitychange", check);
      window.addEventListener("pagehide", hide);
      window.addEventListener("pageshow", check);
    }
    check();
    return () => {
      scope.current?.abort();
      if (recheckOnRestore) {
        document.removeEventListener("visibilitychange", check);
        window.removeEventListener("pagehide", hide);
        window.removeEventListener("pageshow", check);
      }
    };
  }, [api, attempt, recheckOnRestore]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const signal = scope.current?.signal;
    if (!signal || signal.aborted || phase !== "ready" || !view || view.admitted) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    function value(field: string) {
      const entry = data.get(field);
      return typeof entry === "string" ? entry.trim() : "";
    }
    const line2 = value("line2");
    const region = value("region");
    const postalCode = value("postalCode");
    const contact: Input = {
      fullLegalName: value("fullLegalName"),
      email: value("email"),
      postalAddress: {
        line1: value("line1"), city: value("city"), countryCode: value("countryCode"),
        ...(line2 && { line2 }), ...(region && { region }), ...(postalCode && { postalCode }),
      },
      policyRevision: view.policyRevision,
    };
    setPhase("saving");
    try {
      const result = await api.record(contact, signal);
      if (signal.aborted) return;
      if (!valid(result) || !result.admitted || result.policyRevision !== view.policyRevision) {
        setPhase("error");
        return;
      }
      setDraft(contact);
      setView(result);
      setPhase("ready");
    } catch {
      if (!signal.aborted) setPhase("error");
    }
  }

  if (phase === "error") {
    return <div role="alert">We couldn’t confirm your catalog access. <button type="button" onClick={() => retry(i => i + 1)}>Check again</button></div>;
  }
  if (!view) return <p role="status">Checking catalog access…</p>;
  // Keep the same owner's draft mounted while a restore is pending. A changed
  // owner/policy revision remounts the entire subtree, even if both are admitted.
  return <div key={view.policyRevision} hidden={phase === "checking"}>
    {view.admitted
      ? <CatalogContactDraftContext.Provider value={draft}>{children}</CatalogContactDraftContext.Provider>
      : <ContactForm saving={phase === "saving"} retentionSeconds={view.retentionSeconds} onSubmit={save} />}
  </div>;
}

const displayNames = typeof Intl.DisplayNames === "function"
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : undefined;
const countries = CATALOG_COUNTRY_CODES.map(code => ({ code, name: displayNames?.of(code) ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name, "en"));
const hasText = ".*\\S.*";

function expiryNotice(seconds?: number) {
  if (seconds === undefined || !Number.isInteger(seconds) || seconds < 60 || seconds > 86400) return "";
  // The privacy owner's approved wording for the production setting (two hours, five-minute cleanup).
  if (seconds === 7200) {
    return " Your catalog access expires after two hours. We run a cleanup every five minutes to remove expired access records.";
  }
  const minutes = seconds / 60;
  if (Number.isInteger(minutes)) return ` Your catalog access expires after ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  return ` Your catalog access expires after ${seconds} seconds.`;
}

function ContactForm({ saving, retentionSeconds, onSubmit }: {
  saving: boolean;
  retentionSeconds?: number;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
}) {
  const noticeId = useId();
  const addressHeading = useId();
  const [country, setCountry] = useState("");
  const regionalFieldsRequired = requiresRegionAndPostcode(country);
  return <div className="xenios-order-page xenios-order-page--embedded xenios-ea-entry-contact">
    <form method="post" onSubmit={onSubmit} className="xenios-order-panel"
      aria-label="Contact information for catalog access" aria-describedby={noticeId} aria-busy={saving}>
      <h2>Before you view the catalog</h2>
      <p id={noticeId}>
        We use your name, work email and postal address to give you access to the Early Access catalog.
        {expiryNotice(retentionSeconds)}
        {" "}If you submit a request, we keep the request and any resulting quote separately so our team can respond.
      </p>
      <div className="xenios-order-grid">
        <label>Full name
          <input name="fullLegalName" autoComplete="name" maxLength={200} pattern={hasText} required />
        </label>
        <label>Email address
          <input name="email" type="email" autoComplete="email" maxLength={254}
            pattern={"[^\\s@]+@[^\\s@]+\\.[^\\s@]+"} required />
        </label>
      </div>
      <h3 id={addressHeading}>Postal address</h3>
      <div className="xenios-order-grid" role="group" aria-labelledby={addressHeading}>
        <label className="is-wide">Country or territory
          <select name="countryCode" autoComplete="country" defaultValue="" required
            onChange={event => setCountry(event.currentTarget.value)}>
            <option value="">Select a country or territory</option>
            {countries.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
          </select>
        </label>
        <label className="is-wide">Address line 1
          <input name="line1" autoComplete="address-line1" maxLength={200} pattern={hasText} required />
        </label>
        <label className="is-wide">Address line 2 (optional)
          <input name="line2" autoComplete="address-line2" maxLength={200} />
        </label>
        <label>City, town or locality
          <input name="city" autoComplete="address-level2" maxLength={120} pattern={hasText} required />
        </label>
        <label>State, province or region{regionalFieldsRequired ? " (required)" : " (if applicable)"}
          <input name="region" autoComplete="address-level1" maxLength={120}
            pattern={regionalFieldsRequired ? hasText : undefined} required={regionalFieldsRequired} />
        </label>
        <label>Postal or ZIP code{regionalFieldsRequired ? " (required)" : " (if applicable)"}
          <input name="postalCode" autoComplete="postal-code" maxLength={40}
            pattern={regionalFieldsRequired ? hasText : undefined} required={regionalFieldsRequired} />
        </label>
      </div>
      <div className="xenios-order-actions">
        <button className="xenios-order-button" disabled={saving} type="submit">{saving ? "Saving…" : "View catalog"}</button>
      </div>
    </form>
  </div>;
}
