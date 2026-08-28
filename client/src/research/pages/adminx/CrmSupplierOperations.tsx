import { useMemo, useRef, useState } from "react";
import type {
  AdminCrmAction,
  AdminCrmSupplierOperationsSnapshot,
  AdminOperationsAvailability,
  AdminOperationsSource,
  QueueTone,
} from "@shared/research/admin-crm-supplier-operations";
import { ADMIN_CRM_ACTION_EVIDENCE } from "@shared/research/admin-crm-supplier-operations";
import {
  adminCrmIdempotencyKey,
  getAdminCrmSupplierOperations,
  recordAdminCrmRecommendation,
} from "../../adapters/adminCrmSupplierOperations";
import {
  ResearchEmptyState,
  ResearchMetricCard,
  ResearchSecureNotice,
  ResearchStatusBadge,
} from "../../ui/kit";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";
import { fmtDateTime, useAdminResource } from "./auth";

type QueueRequest = (action: AdminCrmAction, targetType: string, targetId: string, reason: string) => void | Promise<void>;
const EMPTY_ITEMS: never[] = [];

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function words(value: string): string {
  return value.replaceAll("_", " ");
}

function tone(state: string): QueueTone {
  if (/critical|blocked|overdue|rejected|exception|lost|void/.test(state)) return "danger";
  if (/waiting|review|pending|reported|proposed|open/.test(state)) return "warning";
  if (/active|ready|verified|paid|assigned|shipped|delivered|resolved|closed/.test(state)) return "success";
  return "neutral";
}

function sourceMetric<Item>(source: AdminOperationsSource<Item>, predicate?: (item: Item) => boolean): string {
  if (source.availability === "unavailable") return "—";
  const count = predicate ? source.items.filter(predicate).length : source.items.length;
  return source.availability === "partial" ? `${count} visible` : String(count);
}

function aggregateMetric(sources: Array<{
  availability: AdminOperationsAvailability;
  items: readonly unknown[] | null;
}>): string {
  if (sources.some((source) => source.availability === "unavailable")) return "—";
  const visible = sources.reduce((total, source) => total + (source.items?.length ?? 0), 0);
  return sources.some((source) => source.availability === "partial") ? `${visible} visible` : String(visible);
}

function QueueButton({
  snapshot,
  onQueue,
  action,
  targetType,
  targetId,
  reason,
  label = "Record review request",
}: {
  snapshot: AdminCrmSupplierOperationsSnapshot;
  onQueue?: QueueRequest;
  action: AdminCrmAction;
  targetType: string;
  targetId: string;
  reason: string;
  label?: string;
}) {
  const disabled = snapshot.trustDial === "never" || !onQueue;
  return (
    <button
      type="button"
      className="btn btn-secondary"
      style={{ minHeight: 44 }}
      disabled={disabled}
      onClick={() => void onQueue?.(action, targetType, targetId, reason)}
      data-testid={`queue-${action}-${targetId}`}
    >
      {snapshot.trustDial === "never" ? "Disabled by Trust Dial" : label}
    </button>
  );
}
function Section({
  id,
  title,
  description,
  source,
  count,
  sourceCount = count,
  filterActive = false,
  children,
}: {
  id: string;
  title: string;
  description: string;
  source: { availability: AdminOperationsAvailability; message: string; checkedAt: string };
  count: number;
  sourceCount?: number;
  filterActive?: boolean;
  children: React.ReactNode;
}) {
  const badgeLabel = source.availability === "unavailable"
    ? "Source unavailable"
    : source.availability === "partial"
      ? filterActive
        ? `${count} visible ${count === 1 ? "match" : "matches"} · ${sourceCount} visible source ${sourceCount === 1 ? "row" : "rows"} · total unknown`
        : `${count} visible · total unknown`
      : filterActive
        ? `${count} ${count === 1 ? "match" : "matches"} · ${sourceCount} source ${sourceCount === 1 ? "item" : "items"}`
        : `${count} ${count === 1 ? "item" : "items"}`;

  return (
    <section id={id} className="grid gap-4 scroll-mt-24" aria-labelledby={`${id}-heading`} data-testid={`section-${id}`}>
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 id={`${id}-heading`} className="body-l font-700">{title}</h2>
          <p className="body-s text-ink-2 mt-1 max-w-[72ch]">{description}</p>
          <p className="mono-label text-ink-mute mt-2">Source checked {fmtDateTime(source.checkedAt)}</p>
        </div>
        <ResearchStatusBadge
          label={badgeLabel}
          tone={source.availability === "unavailable" ? "danger" : source.availability === "partial" ? "warning" : count ? "info" : "neutral"}
        />
      </header>
      {source.availability === "unavailable" ? (
        <ResearchEmptyState title="Source unavailable." body={source.message} />
      ) : source.availability === "partial" ? (
        <>
          <div role="status" className="card body-s text-ink-2">
            This source returned partial evidence. Visible records are shown; the total remains unknown.
          </div>
          {count === 0
            ? filterActive && sourceCount > 0
              ? <ResearchEmptyState title="No visible records match this filter." body={`The partial evidence window still contains ${sourceCount} visible ${sourceCount === 1 ? "record" : "records"}; the authoritative total remains unknown.`} />
              : <ResearchEmptyState title="No records visible." body="The connected evidence window is partial, so this is not an authoritative zero." />
            : children}
        </>
      ) : children}
    </section>
  );
}

function Empty({ body, title = "No records to show." }: { body: string; title?: string }) {
  return <ResearchEmptyState title={title} body={body} />;
}

export function AdminCrmSupplierOperationsWorkspace({
  snapshot,
  onQueue,
}: {
  snapshot: AdminCrmSupplierOperationsSnapshot;
  onQueue?: QueueRequest;
}) {
  const [query, setQuery] = useState("");
  const sources = snapshot.sources;
  const buyerQueue = sources.buyerQueue.items ?? EMPTY_ITEMS;
  const organizationRecords = sources.organizations.items ?? EMPTY_ITEMS;
  const customerRecords = sources.customers.items ?? EMPTY_ITEMS;
  const availabilityReviews = sources.availabilityReviews.items ?? EMPTY_ITEMS;
  const priceReviews = sources.priceReviews.items ?? EMPTY_ITEMS;
  const invoices = sources.invoices.items ?? EMPTY_ITEMS;
  const supplierAssignments = sources.supplierAssignments.items ?? EMPTY_ITEMS;
  const fulfillment = sources.fulfillment.items ?? EMPTY_ITEMS;
  const returnsReships = sources.returnsReships.items ?? EMPTY_ITEMS;
  const supportCases = sources.supportCases.items ?? EMPTY_ITEMS;
  const reports = sources.reports.items ?? EMPTY_ITEMS;
  const exceptions = sources.exceptions.items ?? EMPTY_ITEMS;
  const controls = sources.controls.items ?? EMPTY_ITEMS;
  const audit = sources.audit.items ?? EMPTY_ITEMS;
  const intake = sources.intake.items ?? EMPTY_ITEMS;
  const needle = query.trim().toLowerCase();
  const matches = (...values: Array<string | null | undefined>) => !needle || values.some((v) => v?.toLowerCase().includes(needle));
  const buyers = useMemo(
    () => buyerQueue.filter((x) => matches(x.displayName, x.email, x.stage, x.ownerLabel)),
    [buyerQueue, needle],
  );
  const organizations = useMemo(
    () => organizationRecords.filter((x) => matches(x.legalName, x.accountState, x.ownerLabel)),
    [organizationRecords, needle],
  );
  const customers = useMemo(
    () => customerRecords.filter((x) => matches(x.displayName, x.email, x.accountState, ...x.tags)),
    [customerRecords, needle],
  );
  const operationalSources = [
    sources.availabilityReviews,
    sources.priceReviews,
    sources.invoices,
    sources.supplierAssignments,
    sources.fulfillment,
    sources.returnsReships,
    sources.supportCases,
  ];

  return (
    <div className="grid gap-10">
      <section aria-label="CRM and supplier operations summary" className="grid gap-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="mono-label text-ink-mute">Operations evidence snapshot</p>
            <p className="body-s text-ink-2 mt-1">Snapshot generated {fmtDateTime(snapshot.generatedAt)}</p>
          </div>
          <ResearchStatusBadge label={`Trust Dial: ${snapshot.trustDial}`} tone={snapshot.trustDial === "never" ? "danger" : "warning"} />
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
          <ResearchMetricCard label="Buyer queue" value={sourceMetric(sources.buyerQueue)} summary="Exact only when the buyer source is fully available." />
          <ResearchMetricCard label="B2B organizations" value={sourceMetric(sources.organizations)} summary="Exact only when the organization source is fully available." />
          <ResearchMetricCard label="Operations work" value={aggregateMetric(operationalSources)} summary="Availability, price, invoice, supplier, fulfillment, return, and support totals are hidden if any source is unavailable." />
          <ResearchMetricCard label="Exceptions" value={sourceMetric(sources.exceptions, (item) => item.state !== "resolved")} summary="Open operational exceptions visible in current evidence." />
          <ResearchMetricCard label="Mailbox intake" value={sourceMetric(sources.intake, (item) => item.state === "needs_human_review")} summary="Canonical research mailbox items visible in current evidence." />
        </div>
        <label className="grid gap-2" style={{ maxWidth: 520 }}>
          <span className="form-label">Find a buyer, organization, or customer</span>
          <input className="input-field" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, stage, owner, or tag" />
        </label>
        <nav aria-label="Operations workspace sections" className="flex gap-3 flex-wrap body-s">
          {[
            ["#customer-360", "Customers"],
            ["#supplier-assignment", "Suppliers"],
            ["#returns-reships", "Returns / reships"],
            ["#support-cases", "Support / SLA"],
            ["#operating-controls", "Readiness controls"],
            ["#operations-reports", "Reports"],
            ["#exceptions", "Incidents"],
            ["#audit", "Audit"],
          ].map(([href, label]) => <a className="link" href={href} key={href}>{label}</a>)}
        </nav>
      </section>

      <Section id="buyer-queue" title="Buyer queue" source={sources.buyerQueue} count={buyers.length} sourceCount={buyerQueue.length} filterActive={Boolean(needle) && buyerQueue.length > 0} description="One next action per buyer. Review requests are recorded for a person; this workspace never sends messages.">
        {buyers.length === 0 ? <Empty title={needle && buyerQueue.length > 0 ? "No matching records." : undefined} body={needle && buyerQueue.length > 0 ? "No buyer records match this filter. Clear or change it to see the source rows." : "New buyer conversations and quote requests will appear here."} /> : (
          <div className="grid gap-3">{buyers.map((buyer) => (
            <article className="card flex items-center justify-between gap-4 flex-wrap" key={buyer.buyerId}>
              <div><p className="body-m font-700">{buyer.displayName}</p><p className="body-s text-ink-mute">{buyer.email} · {buyer.buyerType}</p><p className="body-s text-ink-2 mt-2">Next: {buyer.nextAction}</p></div>
              <div className="flex items-center gap-3 flex-wrap"><ResearchStatusBadge label={words(buyer.stage)} tone={tone(buyer.stage)} /><QueueButton snapshot={snapshot} onQueue={onQueue} action="buyer_follow_up" targetType="buyer" targetId={buyer.buyerId} reason={`Human review of next buyer action: ${buyer.nextAction}`} label="Record follow-up review" /></div>
            </article>
          ))}</div>
        )}
      </Section>

      <Section id="organizations" title="B2B organizations" source={sources.organizations} count={organizations.length} sourceCount={organizationRecords.length} filterActive={Boolean(needle) && organizationRecords.length > 0} description="Legal account, buyer coverage, payment terms, and commercial lifecycle—without private member wellness data.">
        {organizations.length === 0 ? <Empty title={needle && organizationRecords.length > 0 ? "No matching records." : undefined} body={needle && organizationRecords.length > 0 ? "No organization records match this filter. Clear or change it to see the source rows." : "B2B prospects and active organizations will appear here."} /> : (
          <div className="grid gap-3">{organizations.map((org) => (
            <article className="card" key={org.organizationId}><div className="flex items-start justify-between gap-3 flex-wrap"><div><p className="body-m font-700">{org.legalName}</p><p className="body-s text-ink-mute">{org.buyerCount} buyers · owner {org.ownerLabel ?? "unassigned"}</p></div><ResearchStatusBadge label={words(org.accountState)} tone={tone(org.accountState)} /></div><p className="body-s text-ink-2 mt-3">Terms: {org.paymentTermsLabel ?? "not approved"} · open invoices {money(org.openInvoiceCents, org.currency)}</p><div className="mt-4"><QueueButton snapshot={snapshot} onQueue={onQueue} action="organization_review" targetType="organization" targetId={org.organizationId} reason="Human review of B2B organization account and commercial terms." label="Record account review" /></div></article>
          ))}</div>
        )}
      </Section>

      <Section id="customer-360" title="Customer 360" source={sources.customers} count={customers.length} sourceCount={customerRecords.length} filterActive={Boolean(needle) && customerRecords.length > 0} description="Operational account history only: identity, organization, orders, invoices, exceptions, and contact recency.">
        {customers.length === 0 ? <Empty title={needle && customerRecords.length > 0 ? "No matching records." : undefined} body={needle && customerRecords.length > 0 ? "No customer records match this filter. Clear or change it to see the source rows." : "Customer operational summaries will appear after verified account activity."} /> : (
          <div className="grid gap-3">{customers.map((customer) => (
            <article className="card" key={customer.customerId}><div className="flex items-start justify-between gap-3 flex-wrap"><div><p className="body-m font-700">{customer.displayName}</p><p className="body-s text-ink-mute">{customer.email}</p></div><ResearchStatusBadge label={words(customer.accountState)} tone={tone(customer.accountState)} /></div><dl className="grid sm:grid-cols-3 gap-3 mt-4 body-s"><div><dt className="text-ink-mute">Orders</dt><dd>{customer.orderCount}</dd></div><div><dt className="text-ink-mute">Open invoices</dt><dd>{customer.openInvoiceCount}</dd></div><div><dt className="text-ink-mute">Open exceptions</dt><dd>{customer.openExceptionCount}</dd></div></dl><p className="body-s text-ink-2 mt-3">Tags: {customer.tags.length ? customer.tags.join(", ") : "none"}</p></article>
          ))}</div>
        )}
      </Section>

      <Section id="availability" title="Availability review" source={sources.availabilityReviews} count={availabilityReviews.length} description="Supplier-backed quantity evidence. Unknown availability stays unknown and cannot be presented as inventory.">
        {availabilityReviews.length === 0 ? <Empty body="No availability reviews are recorded in the authoritative source." /> : <div className="grid gap-3">{availabilityReviews.map((item) => <article className="card flex items-center justify-between gap-4 flex-wrap" key={item.reviewId}><div><p className="body-m font-700">{item.productLabel}</p><p className="body-s text-ink-2">Requested {item.requestedUnits} · available {item.availableUnits ?? "unverified"} · supplier {item.supplierLabel ?? "unassigned"}</p></div><div className="flex gap-3 flex-wrap"><ResearchStatusBadge label={words(item.state)} tone={tone(item.state)} /><QueueButton snapshot={snapshot} onQueue={onQueue} action="availability_review" targetType="availability_review" targetId={item.reviewId} reason="Human review of supplier-backed availability evidence." /></div></article>)}</div>}
      </Section>

      <Section id="price" title="Price review" source={sources.priceReviews} count={priceReviews.length} description="Proposed prices stay under review until source cost evidence and a human decision are recorded.">
        {priceReviews.length === 0 ? <Empty body="No price proposals are recorded in the authoritative source." /> : <div className="grid gap-3">{priceReviews.map((item) => <article className="card flex items-center justify-between gap-4 flex-wrap" key={item.reviewId}><div><p className="body-m font-700">{item.productLabel}</p><p className="body-s text-ink-2">Current {item.currentUnitCents === null ? "not published" : money(item.currentUnitCents, item.currency)} · proposed {money(item.proposedUnitCents, item.currency)} · source cost {item.sourceCostCents === null ? "unverified" : money(item.sourceCostCents, item.currency)}</p></div><div className="flex gap-3 flex-wrap"><ResearchStatusBadge label={words(item.state)} tone={tone(item.state)} /><QueueButton snapshot={snapshot} onQueue={onQueue} action="price_review" targetType="price_review" targetId={item.reviewId} reason="Human review of proposed price and source cost evidence." /></div></article>)}</div>}
      </Section>

      <Section id="invoice-payment" title="Invoice and payment" source={sources.invoices} count={invoices.length} description="Invoices and payment reports are read-only evidence here. No payment is accepted, captured, refunded, or marked received by this page.">
        {invoices.length === 0 ? <Empty body="No invoice or payment-review records are present in the authoritative source." /> : <div className="grid gap-3">{invoices.map((item) => <article className="card flex items-center justify-between gap-4 flex-wrap" key={item.invoiceId}><div><p className="body-m font-700">{item.invoiceNumber} · {money(item.amountCents, item.currency)}</p><p className="body-s text-ink-2">{item.customerLabel} · order {item.orderId} · due {fmtDateTime(item.dueAt) || "not set"}</p></div><div className="flex gap-3 flex-wrap"><ResearchStatusBadge label={`${words(item.invoiceState)} / ${words(item.paymentState)}`} tone={tone(`${item.invoiceState} ${item.paymentState}`)} /><QueueButton snapshot={snapshot} onQueue={onQueue} action="invoice_payment_review" targetType="invoice" targetId={item.invoiceId} reason="Human review of invoice and independently verified payment evidence." label="Record payment review" /></div></article>)}</div>}
      </Section>

      <Section id="supplier-assignment" title="Supplier assignment" source={sources.supplierAssignments} count={supplierAssignments.length} description="Assignments remain proposals until a human verifies scope, inventory, and supplier authority.">
        {supplierAssignments.length === 0 ? <Empty body="No supplier-assignment proposals are present in the authoritative source." /> : <div className="grid gap-3">{supplierAssignments.map((item) => <article className="card flex items-center justify-between gap-4 flex-wrap" key={item.assignmentId}><div><p className="body-m font-700">Order {item.orderReference}</p><p className="body-s text-ink-2">{item.lineCount} lines · {item.supplierLabel ?? "No supplier proposed"} · target {fmtDateTime(item.targetShipAt) || "not set"}</p></div><div className="flex gap-3 flex-wrap"><ResearchStatusBadge label={words(item.state)} tone={tone(item.state)} /><QueueButton snapshot={snapshot} onQueue={onQueue} action="supplier_assignment" targetType="supplier_assignment" targetId={item.assignmentId} reason="Human approval of supplier assignment after scope and availability review." label="Record assignment review" /></div></article>)}</div>}
      </Section>

      <Section id="fulfillment-tracking" title="Fulfillment and tracking" source={sources.fulfillment} count={fulfillment.length} description="This is a read-only internal cross-supplier trail. It extends the admin; it does not replace the existing Mitch Portal.">
        {fulfillment.length === 0 ? <Empty body="No fulfillment or tracking records are present in the authoritative source." /> : <div className="grid gap-3">{fulfillment.map((item) => <article className="card" key={item.fulfillmentId}><div className="flex items-start justify-between gap-3 flex-wrap"><div><p className="body-m font-700">Order {item.orderReference}</p><p className="body-s text-ink-2">{item.supplierLabel ?? "Unassigned"} · {item.carrier ?? "No carrier"} · {item.trackingNumber ?? "No tracking number"}</p></div><ResearchStatusBadge label={words(item.state)} tone={tone(item.state)} /></div><div className="flex gap-3 flex-wrap mt-4"><QueueButton snapshot={snapshot} onQueue={onQueue} action="fulfillment_review" targetType="fulfillment" targetId={item.fulfillmentId} reason="Human review of fulfillment state and shipment evidence." /><QueueButton snapshot={snapshot} onQueue={onQueue} action="tracking_follow_up" targetType="fulfillment" targetId={item.fulfillmentId} reason="Human-reviewed tracking follow-up draft; outbound requires approval." label="Record tracking review" /></div></article>)}</div>}
      </Section>

      <Section id="returns-reships" title="Returns and reships" source={sources.returnsReships} count={returnsReships.length} description="Requests retain their reason, owner, due date, and next action. Recording a review never authorizes a return, shipment, refund, or replacement.">
        {returnsReships.length === 0 ? <Empty body="No return or reship requests are present in the authoritative source." /> : <div className="grid gap-3">{returnsReships.map((item) => <article className="card flex items-center justify-between gap-4 flex-wrap" key={item.requestId}><div><p className="body-m font-700">{words(item.requestType)} · order {item.orderReference}</p><p className="body-s text-ink-2">{item.reason}</p><p className="body-s text-ink-mute mt-2">Owner {item.ownerLabel ?? "unassigned"} · due {fmtDateTime(item.dueAt) || "not set"} · next {item.nextAction}</p></div><div className="flex gap-3 flex-wrap"><ResearchStatusBadge label={words(item.state)} tone={tone(item.state)} /><QueueButton snapshot={snapshot} onQueue={onQueue} action="return_reship_review" targetType="return_reship" targetId={item.requestId} reason="Human review of the return or reship request and its evidence." /></div></article>)}</div>}
      </Section>

      <Section id="support-cases" title="Support cases and SLA" source={sources.supportCases} count={supportCases.length} description="Support work is organized by priority, owner, due date, next action, and explicit SLA state.">
        {supportCases.length === 0 ? <Empty body="No support cases are present in the authoritative source." /> : <div className="grid gap-3">{supportCases.map((item) => <article className="card flex items-center justify-between gap-4 flex-wrap" key={item.caseId}><div><p className="body-m font-700">{item.subject}</p><p className="body-s text-ink-2">Reference {item.referenceId ?? "not linked"} · owner {item.ownerLabel ?? "unassigned"} · due {fmtDateTime(item.dueAt) || "not set"}</p><p className="body-s text-ink-mute mt-2">Next: {item.nextAction}</p></div><div className="flex gap-3 flex-wrap"><ResearchStatusBadge label={`${words(item.priority)} / ${words(item.slaState)}`} tone={tone(`${item.priority} ${item.slaState}`)} /><QueueButton snapshot={snapshot} onQueue={onQueue} action="support_case_review" targetType="support_case" targetId={item.caseId} reason="Human review of support ownership, next action, and SLA evidence." /></div></article>)}</div>}
      </Section>

      <Section id="operating-controls" title="Operating control plane" source={sources.controls} count={controls.length} description="Canonical readiness evidence across product, supplier, documentation, inventory, fulfillment, support, quality, attribution, release, and feature controls.">
        {controls.length === 0 ? <Empty body="No control-plane evidence is present in the authoritative source." /> : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {controls.map((control) => (
              <article className="card" key={control.area} data-testid={`control-${control.area}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="body-m font-700">{control.label}</p>
                  <ResearchStatusBadge label={words(control.state)} tone={tone(control.state)} />
                </div>
                <p className="body-s text-ink-2 mt-3">{control.summary}</p>
                <dl className="body-s mt-4 grid gap-2">
                  <div><dt className="text-ink-mute">Owner</dt><dd>{control.ownerLabel ?? "Unassigned"}</dd></div>
                  <div><dt className="text-ink-mute">Due</dt><dd>{fmtDateTime(control.dueAt) || "Not set"}</dd></div>
                  <div><dt className="text-ink-mute">Next action</dt><dd>{control.nextAction}</dd></div>
                  <div><dt className="text-ink-mute">Evidence updated</dt><dd>{fmtDateTime(control.evidenceUpdatedAt) || "Unavailable"}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </Section>

      <Section id="operations-reports" title="Operations reports" source={sources.reports} count={reports.length} description="Read-only report readiness and exception totals. Missing or partial reporting never becomes a fabricated zero.">
        {reports.length === 0 ? <Empty body="No operations reports are present in the authoritative source." /> : <div className="grid gap-3">{reports.map((report) => <article className="card flex items-center justify-between gap-4 flex-wrap" key={report.reportId}><div><p className="body-m font-700">{report.label}</p><p className="body-s text-ink-2">{report.periodLabel} · exceptions {report.exceptionCount ?? "unavailable"} · generated {fmtDateTime(report.generatedAt) || "not available"}</p><p className="body-s text-ink-mute mt-2">Next: {report.nextAction}</p></div><ResearchStatusBadge label={words(report.state)} tone={tone(report.state)} /></article>)}</div>}
      </Section>

      <Section id="exceptions" title="Exceptions and incidents" source={sources.exceptions} count={exceptions.length} description="Cross-lane operational failures and quality incidents with named ownership, due dates, and an auditable human-review record.">
        {exceptions.length === 0 ? <Empty body="No exceptions are present in the authoritative source." /> : <div className="grid gap-3">{exceptions.map((item) => <article className="card flex items-center justify-between gap-4 flex-wrap" key={item.exceptionId}><div><p className="body-m font-700">{item.title}</p><p className="body-s text-ink-2">{item.domain} · {item.referenceId} · owner {item.ownerLabel ?? "unassigned"} · due {fmtDateTime(item.dueAt) || "not set"}</p></div><div className="flex gap-3 flex-wrap"><ResearchStatusBadge label={`${item.severity} / ${words(item.state)}`} tone={tone(`${item.severity} ${item.state}`)} /><QueueButton snapshot={snapshot} onQueue={onQueue} action="exception_review" targetType="exception" targetId={item.exceptionId} reason="Human review and ownership of an operational exception." /></div></article>)}</div>}
      </Section>

      <Section id="research-intake" title="research@ intake bridge" source={sources.intake} count={intake.length} description="Inbound mail is classified and recorded for human triage. The bridge never replies and never turns message text into medical advice.">
        {intake.length === 0 ? <Empty body="No intake records are present in the authoritative source." /> : <div className="grid gap-3">{intake.map((item) => <article className="card flex items-center justify-between gap-4 flex-wrap" key={item.intakeId}><div><p className="body-m font-700">{item.subject}</p><p className="body-s text-ink-2">From {item.senderAddress} · received {fmtDateTime(item.receivedAt)} · {words(item.category)}</p></div><div className="flex gap-3 flex-wrap"><ResearchStatusBadge label={`${item.urgency} / ${words(item.state)}`} tone={tone(`${item.urgency} ${item.state}`)} /><QueueButton snapshot={snapshot} onQueue={onQueue} action="intake_triage" targetType="research_intake" targetId={item.intakeId} reason="Human triage of canonical research mailbox intake." /></div></article>)}</div>}
      </Section>

      <Section id="audit" title="Audit" source={sources.audit} count={audit.length} description="Observed actions, Trust-Dial outcomes, refusals, and review records are retained as evidence.">
        {audit.length === 0 ? <Empty body="No audit events are present in the authoritative source." /> : <div className="card overflow-x-auto"><table className="w-full body-s"><thead><tr className="text-left"><th className="p-2">When</th><th className="p-2">Actor</th><th className="p-2">Action</th><th className="p-2">Target</th><th className="p-2">Outcome</th></tr></thead><tbody>{audit.map((event) => <tr key={event.auditId}><td className="p-2">{fmtDateTime(event.occurredAt)}</td><td className="p-2">{event.actorLabel}</td><td className="p-2">{words(event.action)}</td><td className="p-2">{event.targetType} · {event.targetId}</td><td className="p-2"><ResearchStatusBadge label={words(event.outcome)} tone={tone(event.outcome)} /></td></tr>)}</tbody></table></div>}
      </Section>

      <ResearchSecureNotice>
        This workspace contains operational account and order metadata only. It intentionally excludes health, assessment,
        biometric, prescription, and clinical data. Review requests are only recorded with audit evidence; this module
        has no executor and produces no outbound, payment, supplier, fulfillment, or other external effect.
      </ResearchSecureNotice>
    </div>
  );
}

function OperationsWorkspacePage({ title, lead }: { title: string; lead: string }) {
  return (
    <AdminScreen title={title} lead={lead}>
      {(token) => <WorkspaceLoader token={token} />}
    </AdminScreen>
  );
}

export default function CrmSupplierOperations() {
  return <OperationsWorkspacePage title="Admin CRM and supplier operations" lead="A single evidence trail from buyer intake through organization, invoice, supplier, fulfillment, support, exception, controls, reporting, and audit review." />;
}

export function AdminCustomerOperations() {
  return <OperationsWorkspacePage title="Customer operations" lead="Authorized operational account evidence, order and invoice context, support ownership, exceptions, and audit history—without clinical or wellness data." />;
}

export function AdminSupplierOperations() {
  return <OperationsWorkspacePage title="Supplier operations" lead="Supplier readiness, assignment proposals, inventory evidence, fulfillment, tracking, documentation controls, and exceptions." />;
}

export function AdminAffiliateOperations() {
  return <OperationsWorkspacePage title="Affiliate and partner operations" lead="Organization evidence, partner attribution readiness, owner follow-up, exceptions, and audit history." />;
}

export function AdminPharmacyDocumentation() {
  return <OperationsWorkspacePage title="Pharmacy documentation status" lead="Administrative documentation readiness only. Prescription decisions and fulfillment remain pharmacy-controlled." />;
}

export function AdminTebraConfigurationStatus() {
  return <OperationsWorkspacePage title="Tebra configuration status" lead="Configuration evidence, ownership, blockers, due dates, and next actions without claiming external setup is complete." />;
}

export function AdminSupportOperations() {
  return <OperationsWorkspacePage title="Support and SLA operations" lead="Support ownership, priority, due dates, explicit SLA state, returns or reships, incidents, and audit evidence." />;
}

export function AdminIncidentOperations() {
  return <OperationsWorkspacePage title="Operations incidents" lead="Cross-lane exceptions and quality incidents with severity, ownership, due dates, next actions, and review evidence." />;
}

export function AdminOperationsReports() {
  return <OperationsWorkspacePage title="Operations reports" lead="Read-only report readiness, visible exception totals, source coverage, and the next action when evidence is incomplete." />;
}

export function AdminOperationsSettings() {
  return <OperationsWorkspacePage title="Operations settings and release controls" lead="Feature-flag, release-status, integration, and operating-control evidence. This surface records no production change." />;
}

function WorkspaceLoader({ token }: { token: string }) {
  const resource = useAdminResource(token, getAdminCrmSupplierOperations);
  const [notice, setNotice] = useState<string | null>(null);
  const intentKeys = useRef(new Map<string, string>());
  const inFlightIntents = useRef(new Set<string>());

  const onQueue: QueueRequest = async (action, targetType, targetId, reason) => {
    const evidenceSource = ADMIN_CRM_ACTION_EVIDENCE[action].source;
    const evidenceCheckedAt = resource.data?.snapshot.sources[evidenceSource].checkedAt ?? "source-unavailable";
    const intent = `${action}:${targetType}:${targetId}:${evidenceCheckedAt}`;
    if (inFlightIntents.current.has(intent)) return;
    inFlightIntents.current.add(intent);
    const idempotencyKey = intentKeys.current.get(intent) ?? adminCrmIdempotencyKey(action, targetId);
    intentKeys.current.set(intent, idempotencyKey);
    setNotice("Recording a non-executing review request...");
    try {
      const result = await recordAdminCrmRecommendation(token, {
        action, targetType, targetId, reason, idempotencyKey,
      });
      if (result.kind === "ok") {
        setNotice(result.data.recommendation.recordState === "awaiting_human_review"
          ? "Recorded for human review. No external action was executed."
          : "Review request recorded. No external action was executed.");
        resource.reload();
      } else {
        setNotice(result.kind === "denied" || result.kind === "forbidden"
          ? "The Trust Dial or server policy refused this review request."
          : "The review request could not be recorded.");
      }
    } catch {
      setNotice("The review request could not be recorded.");
    } finally {
      inFlightIntents.current.delete(intent);
    }
  };

  return (
    <AdminBoundary state={resource.state} message={resource.message} deniedCode={resource.deniedCode} onRetry={resource.reload} unavailableTitle="Operations evidence is unavailable." unavailableBody="The server module or its authoritative source projections are not available in this environment. No status or zero count is inferred.">
      {notice && <p role="status" aria-live="polite" className="card body-s mb-4" data-testid="crm-action-notice">{notice}</p>}
      {resource.data?.snapshot && <AdminCrmSupplierOperationsWorkspace snapshot={resource.data.snapshot} onQueue={onQueue} />}
    </AdminBoundary>
  );
}
