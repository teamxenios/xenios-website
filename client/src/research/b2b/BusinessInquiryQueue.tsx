import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  businessInquiryPageSchema, businessInquiryRecordSchema,
  type BusinessInquiryRecord,
} from "@shared/research/business-inquiry";
import { BusinessInquiryStaffError, type BusinessInquiryStaffApi } from "./business-inquiry-staff-api";
import { ResearchEmptyState, ResearchLoadingState } from "../ui/kit";
import "./business-inquiry-queue.css";

export interface BusinessInquiryQueueProps {
  api: BusinessInquiryStaffApi | null;
  contextGeneration: string;
  isContextCurrent(generation: string): boolean;
}
type Denial = "unauthenticated" | "denied" | "stale";
type Status = "loading" | "ready" | "unavailable" | "cancelled";
const MAX_PAGES = 20;
const STATE = { needs_human_review: "Needs human review", linked: "Linked", closed: "Closed" } as const;
const PACKAGING = { supplier_brand: "Supplier brand requested", organization_brand: "Organization brand requested", not_sure: "Not sure" } as const;
const REPLENISHMENT = { one_time: "One time", recurring: "Recurring", not_sure: "Not sure" } as const;
const label = (value: string) => value.replaceAll("_", " ");
function AccessState({ code }: { code: Denial }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [code]);
  return <div className="xr-business-queue__message" role="alert">
    <h2 tabIndex={-1} ref={heading}>{code === "denied" ? "Access denied" : code === "unauthenticated" ? "Session expired" : "Session changed"}</h2>
    <p>Private enquiries have been cleared. Reopen this queue through the staff sign-in provided by Xenios.</p>
    <a href="/research/support">Contact support</a>
  </div>;
}

/** Root supplies the canonical staff API and live lifetime; this component grants no access. */
export default function BusinessInquiryQueue({ api, contextGeneration, isContextCurrent }: BusinessInquiryQueueProps) {
  const title = useId();
  const live = useRef({ api, contextGeneration, isContextCurrent });
  live.current = { api, contextGeneration, isContextCurrent };
  const binding = useRef({ api, generation: contextGeneration, serial: 0, denial: null as Denial | null });
  const [, renderRevocation] = useState(0);
  if (binding.current.generation !== contextGeneration) {
    binding.current = { api, generation: contextGeneration, serial: binding.current.serial + 1, denial: null };
  } else if (binding.current.api !== api) {
    binding.current = { ...binding.current, api, serial: binding.current.serial + 1 };
  }
  const serial = binding.current.serial;
  const sameBinding = () => live.current.api === api && live.current.contextGeneration === contextGeneration
    && binding.current.serial === serial;
  const current = () => {
    try {
      return sameBinding() && Boolean(contextGeneration) && binding.current.denial === null
        && live.current.isContextCurrent(contextGeneration) === true;
    } catch { return false; }
  };
  function revoke(code: Denial) {
    // An old API/lifecycle must never revoke a replacement binding. A refusal
    // for this generation stays latched even if only its API object changes.
    if (!sameBinding() || binding.current.denial) return;
    binding.current.denial = code;
    renderRevocation((value) => value + 1);
  }
  let content;
  if (binding.current.denial) content = <AccessState code={binding.current.denial} />;
  else if (!api) content = <div className="xr-business-queue__message" role="status"><h2>Staff queue unavailable</h2><p>The staff data connection is not available in this context.</p></div>;
  else if (!current()) {
    if (contextGeneration) binding.current.denial = "stale";
    content = <AccessState code="stale" />;
  }
  else content = <QueueLifetime key={serial} api={api} sameBinding={sameBinding} isCurrent={current} onRevoke={revoke} />;
  return <section className="xr-business-queue" aria-labelledby={title}>
    <header><p className="mono-cap">Private staff review</p><h1 id={title}>Business enquiries</h1>
      <p>Read submitted business enquiries. A saved enquiry is not a quote, approval or confirmation of availability.</p></header>
    {content}
  </section>;
}

function QueueLifetime({ api, sameBinding, isCurrent, onRevoke }: {
  api: BusinessInquiryStaffApi; sameBinding(): boolean; isCurrent(): boolean; onRevoke(code: Denial): void;
}) {
  const ids = useId();
  const [rows, setRows] = useState<BusinessInquiryRecord[]>([]);
  const [listStatus, setListStatus] = useState<Status>("loading");
  const [pageNumber, setPageNumber] = useState(1);
  const [next, setNext] = useState<string | null>(null);
  const [paginationWarning, setPaginationWarning] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<BusinessInquiryRecord | null>(null);
  const [detailStatus, setDetailStatus] = useState<"idle" | Status | "not_found">("idle");
  const listSequence = useRef(0), detailSequence = useRef(0), lifecycle = useRef(0);
  const alive = useRef(false);
  const listController = useRef<AbortController | null>(null), detailController = useRef<AbortController | null>(null);
  const visited = useRef(new Set<string>());
  const requestedPage = useRef<{ before?: string; number: number }>({ number: 1 });
  const selectedRef = useRef<string | null>(null);
  const listPending = useRef(false);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const listMessage = useRef<HTMLDivElement>(null);
  const lifetime = useRef({ sameBinding, isCurrent, onRevoke });
  lifetime.current = { sameBinding, isCurrent, onRevoke };
  function clearPrivate() {
    listSequence.current += 1; detailSequence.current += 1;
    listController.current?.abort(); detailController.current?.abort();
    setRows([]); setDetail(null); setSelected(null); selectedRef.current = null;
    setNext(null); setQuery(""); visited.current.clear();
  }
  function revoke(code: Denial) { clearPrivate(); lifetime.current.onRevoke(code); }
  function cancelPage() {
    listSequence.current += 1; listController.current?.abort(); listController.current = null;
    listPending.current = false; setRows([]); setNext(null); setListStatus("cancelled");
  }
  function cancelDetail() {
    detailSequence.current += 1; detailController.current?.abort(); detailController.current = null;
    setDetail(null); setDetailStatus("cancelled");
  }
  function failure(error: unknown, controller: AbortController, stillBound: () => boolean): boolean {
    if (!stillBound()) return true;
    const code = error instanceof BusinessInquiryStaffError ? error.code : "unavailable";
    // Authentication refusals win over sequence ordering, including an older
    // overlapping request. A local abort's stale result is only cancellation.
    if (code === "unauthenticated" || code === "denied" || (code === "stale" && !controller.signal.aborted)) {
      revoke(code); return true;
    }
    if (!lifetime.current.isCurrent()) { revoke("stale"); return true; }
    return controller.signal.aborted;
  }
  async function load(before?: string, number = 1, reset = false) {
    if (!alive.current || !lifetime.current.isCurrent() || listPending.current) return;
    if (reset) visited.current.clear();
    const sequence = ++listSequence.current, epoch = lifecycle.current;
    const controller = new AbortController(); listController.current = controller; listPending.current = true;
    detailController.current?.abort(); detailSequence.current += 1; selectedRef.current = null;
    setRows([]); setDetail(null); setSelected(null); setDetailStatus("idle"); setQuery("");
    setNext(null); setPaginationWarning(""); setListStatus("loading");
    requestedPage.current = { before, number };
    const stillBound = () => alive.current && lifecycle.current === epoch && lifetime.current.sameBinding();
    try {
      const result = await api.list(before, { signal: controller.signal });
      if (!stillBound()) return;
      if (!lifetime.current.isCurrent()) { revoke("stale"); return; }
      if (controller.signal.aborted || sequence !== listSequence.current) return;
      const page = businessInquiryPageSchema.safeParse(result);
      if (!page.success || new Set(page.data.items.map((row) => row.id)).size !== page.data.items.length
        || (!page.data.items.length && page.data.nextBefore !== null)) throw new BusinessInquiryStaffError("unavailable");
      visited.current.add(before ?? "first");
      const repeated = page.data.nextBefore !== null && visited.current.has(page.data.nextBefore);
      const bounded = number >= MAX_PAGES && page.data.nextBefore !== null;
      setRows(page.data.items); setPageNumber(number); setNext(repeated || bounded ? null : page.data.nextBefore);
      setPaginationWarning(repeated ? "More pages are unavailable because the server repeated a cursor. Return to the first page or contact support."
        : bounded ? "This browsing session has reached its page limit. Return to the first page to continue." : "");
      setListStatus("ready");
    } catch (error) {
      if (failure(error, controller, stillBound) || sequence !== listSequence.current) return;
      setRows([]); setListStatus("unavailable");
    } finally {
      if (stillBound() && sequence === listSequence.current) { listPending.current = false; listController.current = null; }
    }
  }
  async function read(id: string) {
    if (!alive.current || !lifetime.current.isCurrent() || !rows.some((row) => row.id === id)) return;
    detailController.current?.abort();
    const sequence = ++detailSequence.current, epoch = lifecycle.current;
    const controller = new AbortController(); detailController.current = controller;
    selectedRef.current = id; setSelected(id); setDetail(null); setDetailStatus("loading");
    const stillBound = () => alive.current && lifecycle.current === epoch && lifetime.current.sameBinding();
    try {
      const result = await api.read(id, { signal: controller.signal });
      if (!stillBound()) return;
      if (!lifetime.current.isCurrent()) { revoke("stale"); return; }
      if (controller.signal.aborted || sequence !== detailSequence.current) return;
      const record = businessInquiryRecordSchema.safeParse(result);
      if (!record.success || record.data.id !== id) throw new BusinessInquiryStaffError("unavailable");
      setDetail(record.data); setDetailStatus("ready");
    } catch (error) {
      if (failure(error, controller, stillBound) || sequence !== detailSequence.current) return;
      setDetail(null); setDetailStatus(error instanceof BusinessInquiryStaffError && error.code === "not_found" ? "not_found" : "unavailable");
    } finally {
      if (stillBound() && sequence === detailSequence.current) detailController.current = null;
    }
  }
  useLayoutEffect(() => {
    alive.current = true; lifecycle.current += 1; void load();
    return () => {
      alive.current = false; lifecycle.current += 1; listSequence.current += 1; detailSequence.current += 1;
      listPending.current = false; listController.current?.abort(); detailController.current?.abort();
    };
  }, []);
  useEffect(() => { if (detailStatus !== "idle" && detailStatus !== "loading") detailHeading.current?.focus(); }, [detailStatus, detail]);
  useEffect(() => { if (listStatus === "unavailable" || listStatus === "cancelled") listMessage.current?.focus(); }, [listStatus]);
  if (!isCurrent()) return null;
  const normalized = query.trim().toLowerCase();
  const visible = rows.filter((row) => !normalized || [row.reference, row.enquiry.contactName, row.enquiry.organizationName,
    ...row.enquiry.categories].some((value) => value.toLowerCase().includes(normalized)));
  return <>
    <nav className="xr-business-queue__controls" aria-label="Queue pages">
      <button type="button" className="btn btn-secondary" disabled={listStatus === "loading"} onClick={() => void load(undefined, 1, true)}>First page</button>
      <button type="button" className="btn btn-secondary" disabled={listStatus === "loading"} onClick={() => void load(requestedPage.current.before, requestedPage.current.number)}>Refresh page</button>
      <button type="button" className="btn btn-secondary" disabled={listStatus !== "ready" || next === null} onClick={() => { if (next) void load(next, pageNumber + 1); }}>Next page</button>
      {listStatus === "loading" && <button type="button" className="btn btn-secondary" onClick={cancelPage}>Cancel page read</button>}
    </nav>
    <p className="xr-business-queue__hint">Pages follow the server's cursor order, not a date sort. Only the current page is held here.</p>
    {listStatus === "loading" && <ResearchLoadingState label="Loading business enquiries" />}
    {(listStatus === "unavailable" || listStatus === "cancelled") && <div className="xr-business-queue__message" role={listStatus === "cancelled" ? "status" : "alert"} ref={listMessage} tabIndex={-1}>
      <h2>{listStatus === "cancelled" ? "Page read cancelled" : "Enquiries unavailable"}</h2>
      <p>{listStatus === "cancelled" ? "You stopped this read. Retry the page when you are ready." : "The queue could not be loaded. This does not mean it is empty."}</p>
      <button type="button" className="btn btn-secondary" onClick={() => void load(requestedPage.current.before, requestedPage.current.number)}>Retry page</button>
    </div>}
    {listStatus === "ready" && <>
      <div className="xr-business-queue__filter"><label htmlFor={`${ids}-find`}>Find on this page</label>
        <input id={`${ids}-find`} type="search" className="input-field" maxLength={200} value={query} onChange={(event) => setQuery(event.target.value)} aria-describedby={`${ids}-scope`} />
        <p id={`${ids}-scope`}>Searches only this page's reference, contact, organization and categories.</p>
        <p>Page {pageNumber}. {rows.length} {rows.length === 1 ? "enquiry" : "enquiries"} loaded.</p>
      </div>
      {paginationWarning && <p className="xr-business-queue__message" role="status">{paginationWarning}</p>}
      {!rows.length ? <ResearchEmptyState title="No enquiries on this page" body="The staff queue returned no records for this page." /> :
        <div className="xr-business-queue__layout"><div>
          {!visible.length && <ResearchEmptyState title="No matches on this page" body="Clear the search or move to another page." />}
          <ul className="xr-business-queue__list" aria-label="Enquiries on this page">{visible.map((row) => <li key={row.id}>
            <h2>{row.reference}</h2><p>{row.enquiry.contactName} · {row.enquiry.organizationName}</p>
            <dl><div><dt>Categories</dt><dd>{row.enquiry.categories.map(label).join(", ")}</dd></div>
              <div><dt>State</dt><dd>{STATE[row.state]}</dd></div><div><dt>Received</dt><dd><time dateTime={row.receivedAt}>{row.receivedAt}</time></dd></div></dl>
            <button type="button" className="btn btn-secondary" aria-controls={`${ids}-detail`} aria-expanded={selected === row.id}
              aria-label={`Open enquiry ${row.reference}`} onClick={() => void read(row.id)}>Open enquiry</button>
          </li>)}</ul>
        </div>
          <section id={`${ids}-detail`} className="xr-business-queue__detail" aria-labelledby={`${ids}-detail-title`}>
            <h2 id={`${ids}-detail-title`} tabIndex={-1} ref={detailHeading}>{detail ? `Enquiry ${detail.reference}` : "Enquiry detail"}</h2>
            {detailStatus === "idle" && <p>Select an enquiry to load its private detail.</p>}
            {detailStatus === "loading" && <><ResearchLoadingState label="Loading enquiry detail" /><button type="button" className="btn btn-secondary" onClick={cancelDetail}>Cancel detail read</button></>}
            {(detailStatus === "unavailable" || detailStatus === "not_found" || detailStatus === "cancelled") && <div role={detailStatus === "cancelled" ? "status" : "alert"}><p>{detailStatus === "cancelled" ? "You stopped this detail read." : detailStatus === "not_found" ? "This enquiry is no longer available to this read." : "The enquiry detail could not be loaded."}</p>
              <button type="button" className="btn btn-secondary" onClick={() => { if (selectedRef.current) void read(selectedRef.current); }}>Retry detail</button></div>}
            {detailStatus === "ready" && detail && <EnquiryDetail record={detail} />}
          </section>
        </div>}
    </>}
  </>;
}

function EnquiryDetail({ record }: { record: BusinessInquiryRecord }) {
  const enquiry = record.enquiry;
  return <>
    <dl className="xr-business-queue__facts">
      {[["State", STATE[record.state]], ["Received", record.receivedAt], ["Contact", enquiry.contactName],
        ["Email", enquiry.contactEmail], ["Organization", enquiry.organizationName], ["Organization type", label(enquiry.organizationType)],
        ["Location", enquiry.location], ["Service area", enquiry.serviceArea], ["Categories", enquiry.categories.map(label).join(", ")],
        ["Packaging preference", PACKAGING[enquiry.packagingPreference]], ["Site count", String(enquiry.siteCount)],
        ["Replenishment", REPLENISHMENT[enquiry.replenishment]], ["Services", enquiry.services.length ? enquiry.services.map(label).join(", ") : "None specified"],
        ["Timing", enquiry.timing], ["Documentation needs", enquiry.documentationNeeds], ["Business context", enquiry.context],
        ["Reported referral — unverified attribution", enquiry.referral]].filter((entry) => entry[1] !== undefined).map(([name, value]) =>
        <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}
    </dl>
    <h3>Requested items</h3>
    {!enquiry.selections.length ? <p>No items specified.</p> : <ol className="xr-business-queue__items">{enquiry.selections.map((item, index) => <li key={index}>
      <h4>{item.description}</h4><p>Presentation: {item.variant}</p><p>Quantity: {String(item.quantity)} {item.unit}</p>
    </li>)}</ol>}
    <p className="xr-business-queue__hint">Requested quantities and packaging are enquiry details. No quote, approval or notification delivery is established by this record.</p>
  </>;
}
