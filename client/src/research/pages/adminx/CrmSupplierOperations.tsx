import { useMemo, useState } from "react";
import type {
  AdminCrmAction,
  AdminCrmSupplierOperationsSnapshot,
  QueueTone,
} from "@shared/research/admin-crm-supplier-operations";
import {
  adminCrmIdempotencyKey,
  getAdminCrmSupplierOperations,
  queueAdminCrmSupplierAction,
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

function QueueButton({
  snapshot,
  onQueue,
  action,
  targetType,
  targetId,
  reason,
  label = "Queue review",
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
  count,
  children,
}: {
  id: string;
  title: string;
  description: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4" aria-labelledby={`${id}-heading`} data-testid={`section-${id}`}>
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 id={`${id}-heading`} className="body-l font-700">{title}</h2>
          <p className="body-s text-ink-2 mt-1 max-w-[72ch]">{description}</p>
        </div>
        <ResearchStatusBadge label={`${count} ${count === 1 ? "item" : "items"}`} tone={count ? "info" : "neutral"} />
      </header>
      {children}
    </section>
  );
}

function Empty({ body }: { body: string }) {
  return <ResearchEmptyState title="Nothing is waiting." body={body} />;
}

export function AdminCrmSupplierOperationsWorkspace({
  snapshot,
  onQueue,
}: {
  snapshot: AdminCrmSupplierOperationsSnapshot;
  onQueue?: QueueRequest;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matches = (...values: Array<string | null | undefined>) => !needle || values.some((v) => v?.toLowerCase().includes(needle));
  const buyers = useMemo(
    () => snapshot.buyerQueue.filter((x) => matches(x.displayName, x.email, x.stage, x.ownerLabel)),
    [snapshot.buyerQueue, needle],
  );
  const organizations = useMemo(
    () => snapshot.organizations.filter((x) => matches(x.legalName, x.accountState, x.ownerLabel)),
    [snapshot.organizations, needle],
  );
  const customers = useMemo(
    () => snapshot.customers.filter((x) => matches(x.displayName, x.email, x.accountState, ...x.tags)),
    [snapshot.customers, needle],
  );
  const operationalOpen = snapshot.availabilityReviews.length + snapshot.priceReviews.length +
    snapshot.invoices.length + snapshot.supplierAssignments.length + snapshot.fulfillment.length;

  return (
    <div className="grid gap-10">
      <section aria-label="CRM and supplier operations summary" className="grid gap-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="mono-label text-ink-mute">Pack 05 · unmounted integration slice</p>
            <p className="body-s text-ink-2 mt-1">Snapshot generated {fmtDateTime(snapshot.generatedAt)}</p>
          </div>
          <ResearchStatusBadge label={`Trust Dial: ${snapshot.trustDial}`} tone={snapshot.trustDial === "never" ? "danger" : "warning"} />
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
          <ResearchMetricCard label="Buyer queue" value={String(snapshot.buyerQueue.length)} summary="People and business buyers needing a next action." />
          <ResearchMetricCard label="B2B organizations" value={String(snapshot.organizations.length)} summary="Commercial accounts in the CRM lifecycle." />
          <ResearchMetricCard label="Operations work" value={String(operationalOpen)} summary="Availability, price, invoice, supplier, and fulfillment records." />
          <ResearchMetricCard label="Exceptions" value={String(snapshot.exceptions.filter((x) => x.state !== "resolved").length)} summary="Open operational exceptions needing human ownership." />
          <ResearchMetricCard label="Mailbox intake" value={String(snapshot.intake.filter((x) => x.state === "needs_human_review").length)} summary="Canonical research mailbox items awaiting triage." />
        </div>
        <label className="grid gap-2" style={{ maxWidth: 520 }}>
          <span className="form-label">Find a buyer, organization, or customer</span>
          <input className="input-field" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, stage, owner, or tag" />
        </label>
      </section>

      <Section id="buyer-queue" title="Buyer queue" count={buyers.length} description="One next action per buyer. Follow-ups enter the approval queue; this workspace never sends them.">
        {buyers.length === 0 ? <Empty body="New buyer conversations and quote requests will appear here." /> : (
          <div className="grid gap-3">{buyers.map((buyer) => (
            <article className="card flex items-center justify-between gap-4 flex-wrap" key={buyer.buyerId}>
              <div><p className="body-m font-700">{buyer.displayName}</p><p className="body-s text-ink-mute">{buyer.email} · {buyer.buyerType}</p><p className="body-s text-ink-2 mt-2">Next: {buyer.nextAction}</p></div>
              <div className="flex items-center gap-3 flex-wrap"><ResearchStatusBadge label={words(buyer.stage)} tone={tone(buyer.stage)} /><QueueButton snapshot={snapshot} onQueue={onQueue} action="buyer_follow_up" targetType="buyer" targetId={buyer.buyerId} reason={`Human review of next buyer action: ${buyer.nextAction}`} label="Queue follow-up" /></div>
            </article>
          ))}</div>
        )}
      </Section>

      <Section id="organizations" title="B2B organizations" count={organizations.length} description="Legal account, buyer coverage, payment terms, and commercial lifecycle—without private member wellness data.">
        {organizations.length === 0 ? <Empty body="B2B prospects and active organizations will appear here." /> : (
          <div className="grid gap-3">{organizations.map((org) => (
            <article className="card" key={org.organizationId}><div className="flex items-start justify-between gap-3 flex-wrap"><div><p className="body-m font-700">{org.legalName}</p><p className="body-s text-ink-mute">{org.buyerCount} buyers · owner {org.ownerLabel ?? "unassigned"}</p></div><ResearchStatusBadge label={words(org.accountState)} tone={tone(org.accountState)} /></div><p className="body-s text-ink-2 mt-3">Terms: {org.paymentTermsLabel ?? "not approved"} · open invoices {money(org.openInvoiceCents, org.currency)}</p><div className="mt-4"><QueueButton snapshot={snapshot} onQueue={onQueue} action="organization_review" targetType="organization" targetId={org.organizationId} reason="Human review of B2B organization account and commercial terms." label="Queue account review" /></div></article>
          ))}</div>
        )}
      </Section>

      <Section id="customer-360" title="Customer 360" count={customers.length} description="Operational account history only: identity, organization, orders, invoices, exceptions, and contact recency.">
        {customers.length === 0 ? <Empty body="Customer operational summaries will appear after verified account activity." /> : (
          <div className="grid gap-3">{customers.map((customer) => (
            <article className="card" key={customer.customerId}><div className="flex items-start justify-between gap-3 flex-wrap"><div><p className="body-m font-700">{customer.displayName}</p><p className="body-s text-ink-mute">{customer.email}</p></div><ResearchStatusBadge label={words(customer.accountState)} tone={tone(customer.accountState)} /></div><dl className="grid sm:grid-cols-3 gap-3 mt-4 body-s"><div><dt className="text-ink-mute">Orders</dt><dd>{customer.orderCount}</dd></div><div><dt className="text-ink-mute">Open invoices</dt><dd>{customer.openInvoiceCount}</dd></div><div><dt className="text-ink-mute">Open exceptions</dt><dd>{customer.openExceptionCount}</dd></div></dl><p className="body-s text-ink-2 mt-3">Tags: {customer.tags.length ? customer.tags.join(", ") : "none"}</p></article>
          ))}</div>
        )}
      </Section>

      <Section id="availability" title="Availability review" count={snapshot.availabilityReviews.length} description="Supplier-backed quantity evidence. Unknown availability stays unknown and cannot be presented as inventory.">
        {snapshot.availabilityReviews.length === 0 ? <Empty body="Availability questions will appear when a quote or order needs supplier evidence." /> : <div className="grid gap-3">{snapshot.availabilityReviews.map((item) => <article className="card flex items-center justify-between gap-4 flex-wrap" key={item.reviewId}><div><p className="body-m font-700">{item.productLabel}</p><p className="body-s text-ink-2">Requested {item.requestedUnits} · available {item.availableUnits ?? "unverified"} · supplier {item.supplierLabel ?? "unassigned"}</p></div><div className="flex gap-3 flex-wrap"><ResearchStatusBadge label={words(item.state)} tone={tone(item.state)} /><QueueButton snapshot={snapshot} onQueue={onQueue} action="availability_review" targetType="availability_review" targetId={item.reviewId} reason="Human review of supplier-backed availability evidence." /></div></article>)}</div>}
      </Section>

      <Section id="price" title="Price review" count={snapshot.priceReviews.length} description="Proposed prices stay under review until source cost evidence and a human decision are recorded.">
        {snapshot.priceReviews.length === 0 ? <Empty body="Price proposals will appear here before publication." /> : <div className="grid gap-3">{snapshot.priceReviews.map((item) => <article className="card flex items-center justify-between gap-4 flex-wrap" key={item.reviewId}><div><p className="body-m font-700">{item.productLabel}</p><p className="body-s text-ink-2">Current {item.currentUnitCents === null ? "not published" : money(item.currentUnitCents, item.currency)} · proposed {money(item.proposedUnitCents, item.currency)} · source cost {item.sourceCostCents === null ? "unverified" : money(item.sourceCostCents, item.currency)}</p></div><div className="flex gap-3 flex-wrap"><ResearchStatusBadge label={words(item.state)} tone={tone(item.state)} /><QueueButton snapshot={snapshot} onQueue={onQueue} action="price_review" targetType="price_review" targetId={item.reviewId} reason="Human review of proposed price and source cost evidence." /></div></article>)}</div>}
      </Section>

      <Section id="invoice-payment" title="Invoice and payment" count={snapshot.invoices.length} description="Invoices and payment reports are reviewed here. No payment is accepted, captured, refunded, or marked received by this page.">
        {snapshot.invoices.length === 0 ? <Empty body="Issued invoices and payment reports will appear here." /> : <div className="grid gap-3">{snapshot.invoices.map((item) => <article className="card flex items-center justify-between gap-4 flex-wrap" key={item.invoiceId}><div><p className="body-m font-700">{item.invoiceNumber} · {money(item.amountCents, item.currency)}</p><p className="body-s text-ink-2">{item.customerLabel} · order {item.orderId} · due {fmtDateTime(item.dueAt) || "not set"}</p></div><div className="flex gap-3 flex-wrap"><ResearchStatusBadge label={`${words(item.invoiceState)} / ${words(item.paymentState)}`} tone={tone(`${item.invoiceState} ${item.paymentState}`)} /><QueueButton snapshot={snapshot} onQueue={onQueue} action="invoice_payment_review" targetType="invoice" targetId={item.invoiceId} reason="Human review of invoice and independently verified payment evidence." label="Queue payment review" /></div></article>)}</div>}
      </Section>

      <Section id="supplier-assignment" title="Supplier assignment" count={snapshot.supplierAssignments.length} description="Assignments remain proposals until a human verifies scope, inventory, and supplier authority.">
        {snapshot.supplierAssignments.length === 0 ? <Empty body="Orders needing a supplier decision will appear here." /> : <div className="grid gap-3">{snapshot.supplierAssignments.map((item) => <article className="card flex items-center justify-between gap-4 flex-wrap" key={item.assignmentId}><div><p className="body-m font-700">Order {item.orderReference}</p><p className="body-s text-ink-2">{item.lineCount} lines · {item.supplierLabel ?? "No supplier proposed"} · target {fmtDateTime(item.targetShipAt) || "not set"}</p></div><div className="flex gap-3 flex-wrap"><ResearchStatusBadge label={words(item.state)} tone={tone(item.state)} /><QueueButton snapshot={snapshot} onQueue={onQueue} action="supplier_assignment" targetType="supplier_assignment" targetId={item.assignmentId} reason="Human approval of supplier assignment after scope and availability review." label="Queue assignment" /></div></article>)}</div>}
      </Section>

      <Section id="fulfillment-tracking" title="Fulfillment and tracking" count={snapshot.fulfillment.length} description="This is the internal cross-supplier trail. It extends the admin; it does not replace the existing Mitch Portal.">
        {snapshot.fulfillment.length === 0 ? <Empty body="Assigned fulfillment work and tracking evidence will appear here." /> : <div className="grid gap-3">{snapshot.fulfillment.map((item) => <article className="card" key={item.fulfillmentId}><div className="flex items-start justify-between gap-3 flex-wrap"><div><p className="body-m font-700">Order {item.orderReference}</p><p className="body-s text-ink-2">{item.supplierLabel ?? "Unassigned"} · {item.carrier ?? "No carrier"} · {item.trackingNumber ?? "No tracking number"}</p></div><ResearchStatusBadge label={words(item.state)} tone={tone(item.state)} /></div><div className="flex gap-3 flex-wrap mt-4"><QueueButton snapshot={snapshot} onQueue={onQueue} action="fulfillment_review" targetType="fulfillment" targetId={item.fulfillmentId} reason="Human review of fulfillment state and shipment evidence." /><QueueButton snapshot={snapshot} onQueue={onQueue} action="tracking_follow_up" targetType="fulfillment" targetId={item.fulfillmentId} reason="Human-reviewed tracking follow-up draft; outbound requires approval." label="Queue tracking follow-up" /></div></article>)}</div>}
      </Section>

      <Section id="exceptions" title="Exceptions" count={snapshot.exceptions.length} description="Cross-lane operational failures with named ownership, due dates, and an auditable review queue.">
        {snapshot.exceptions.length === 0 ? <Empty body="Open buyer, supplier, payment, and fulfillment exceptions will appear here." /> : <div className="grid gap-3">{snapshot.exceptions.map((item) => <article className="card flex items-center justify-between gap-4 flex-wrap" key={item.exceptionId}><div><p className="body-m font-700">{item.title}</p><p className="body-s text-ink-2">{item.domain} · {item.referenceId} · owner {item.ownerLabel ?? "unassigned"} · due {fmtDateTime(item.dueAt) || "not set"}</p></div><div className="flex gap-3 flex-wrap"><ResearchStatusBadge label={`${item.severity} / ${words(item.state)}`} tone={tone(`${item.severity} ${item.state}`)} /><QueueButton snapshot={snapshot} onQueue={onQueue} action="exception_review" targetType="exception" targetId={item.exceptionId} reason="Human review and ownership of an operational exception." /></div></article>)}</div>}
      </Section>

      <Section id="research-intake" title="research@ intake bridge" count={snapshot.intake.length} description="Inbound mail is classified and recorded for human triage. The bridge never replies and never turns message text into medical advice.">
        {snapshot.intake.length === 0 ? <Empty body="New messages to research@xeniostechnology.com will appear after bridge configuration." /> : <div className="grid gap-3">{snapshot.intake.map((item) => <article className="card flex items-center justify-between gap-4 flex-wrap" key={item.intakeId}><div><p className="body-m font-700">{item.subject}</p><p className="body-s text-ink-2">From {item.senderAddress} · received {fmtDateTime(item.receivedAt)} · {words(item.category)}</p></div><div className="flex gap-3 flex-wrap"><ResearchStatusBadge label={`${item.urgency} / ${words(item.state)}`} tone={tone(`${item.urgency} ${item.state}`)} /><QueueButton snapshot={snapshot} onQueue={onQueue} action="intake_triage" targetType="research_intake" targetId={item.intakeId} reason="Human triage of canonical research mailbox intake." /></div></article>)}</div>}
      </Section>

      <Section id="audit" title="Audit" count={snapshot.audit.length} description="Every observed and consequential action, Trust-Dial outcome, refusal, and override is retained as evidence.">
        {snapshot.audit.length === 0 ? <Empty body="Audit evidence will appear when the integrated repository returns it." /> : <div className="card overflow-x-auto"><table className="w-full body-s"><thead><tr className="text-left"><th className="p-2">When</th><th className="p-2">Actor</th><th className="p-2">Action</th><th className="p-2">Target</th><th className="p-2">Outcome</th></tr></thead><tbody>{snapshot.audit.map((event) => <tr key={event.auditId}><td className="p-2">{fmtDateTime(event.occurredAt)}</td><td className="p-2">{event.actorLabel}</td><td className="p-2">{words(event.action)}</td><td className="p-2">{event.targetType} · {event.targetId}</td><td className="p-2"><ResearchStatusBadge label={words(event.outcome)} tone={tone(event.outcome)} /></td></tr>)}</tbody></table></div>}
      </Section>

      <ResearchSecureNotice>
        This workspace contains operational account and order metadata only. It intentionally excludes health, assessment,
        biometric, prescription, and clinical data. All consequential actions remain queued for human approval.
      </ResearchSecureNotice>
    </div>
  );
}

export default function CrmSupplierOperations() {
  return (
    <AdminScreen title="Admin CRM and supplier operations" lead="A single operational trail from buyer intake through organization, invoice, supplier, fulfillment, tracking, exception, and audit review.">
      {(token) => <WorkspaceLoader token={token} />}
    </AdminScreen>
  );
}

function WorkspaceLoader({ token }: { token: string }) {
  const resource = useAdminResource(token, getAdminCrmSupplierOperations);
  const [notice, setNotice] = useState<string | null>(null);

  const onQueue: QueueRequest = async (action, targetType, targetId, reason) => {
    setNotice("Queuing for approval...");
    const result = await queueAdminCrmSupplierAction(token, {
      action, targetType, targetId, reason,
      idempotencyKey: adminCrmIdempotencyKey(action, targetId),
    });
    if (result.kind === "ok") {
      setNotice(result.data.queued.state === "awaiting_approval" ? "Awaiting human approval." : "Added to the approval queue.");
      resource.reload();
    } else {
      setNotice(result.kind === "denied" || result.kind === "forbidden" ? "The Trust Dial or server policy refused this action." : "The action could not be queued.");
    }
  };

  return (
    <AdminBoundary state={resource.state} message={resource.message} deniedCode={resource.deniedCode} onRetry={resource.reload} unavailableTitle="Pack 05 is not mounted." unavailableBody="Rebase or recreate this integration slice, wire the storage-scoped repository, and mount it behind the existing admin guard.">
      {notice && <p role="status" aria-live="polite" className="card body-s mb-4" data-testid="crm-action-notice">{notice}</p>}
      {resource.data?.snapshot && <AdminCrmSupplierOperationsWorkspace snapshot={resource.data.snapshot} onQueue={onQueue} />}
    </AdminBoundary>
  );
}
