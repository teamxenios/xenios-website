import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "wouter";
import type {
  AccountAddress,
  AccountOrderDto,
  BusinessProfile,
  OrganizationDashboardDto,
  OrganizationRole,
} from "@shared/research/account-identity";
import { PageIntro } from "../components";
import {
  getOrganizationDashboard,
  inviteOrganizationUser,
  requestOrderAgain,
  updateBusinessProfile,
} from "./api";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

function Address({ value, empty }: { value: AccountAddress | null; empty: string }) {
  if (!value) return <p className="body-s text-ink-mute">{empty}</p>;
  return (
    <address className="body-s text-ink-2 not-italic">
      {value.recipient}<br />{value.company && <>{value.company}<br /></>}{value.line1}<br />
      {value.line2 && <>{value.line2}<br /></>}{value.city}, {value.region} {value.postalCode}<br />{value.countryCode}
    </address>
  );
}

function OrderCard({ organizationId, order }: { organizationId: string; order: AccountOrderDto }) {
  const [requestState, setRequestState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  async function requestAgain() {
    setRequestState("busy");
    const result = await requestOrderAgain(organizationId, order.source, order.sourceOrderId);
    setRequestState(result.kind === "ok" ? "sent" : "error");
  }
  return (
    <article className="card" data-testid={`organization-order-${order.sourceOrderId}`}>
      <div className="flex flex-wrap justify-between gap-4">
        <div><p className="mono-label text-ink-mute">{order.orderNumber}</p><h3 className="body-m font-700 mt-1">{order.state}</h3><p className="body-s text-ink-2 mt-1">Placed {new Date(order.placedAt).toLocaleDateString()}</p></div>
        <p className="body-m font-700 tabular">{money(order.totalCents, order.currency)}</p>
      </div>
      <div className="mt-4 grid gap-2">
        {order.lines.map((line) => <div key={`${line.sku}:${line.quantity}`} className="body-s flex justify-between gap-3"><span>{line.displayName}</span><span className="tabular">Qty {line.quantity}</span></div>)}
      </div>
      <div className="mt-4 grid md:grid-cols-2 gap-4">
        <section>
          <h4 className="mono-label text-ink-mute">Invoice</h4>
          {order.invoice ? <p className="body-s text-ink-2 mt-1">{order.invoice.invoiceNumber} · {order.invoice.status} · {money(order.invoice.totalCents, order.invoice.currency)}</p> : <p className="body-s text-ink-mute mt-1">No invoice available.</p>}
        </section>
        <section>
          <h4 className="mono-label text-ink-mute">Tracking</h4>
          {order.tracking.length ? order.tracking.map((tracking, index) => <p key={`${tracking.trackingNumber}:${index}`} className="body-s text-ink-2 mt-1">{tracking.carrier ?? "Carrier pending"} · {tracking.trackingNumber ?? "Tracking pending"} · {tracking.status}</p>) : <p className="body-s text-ink-mute mt-1">Tracking appears when fulfillment begins.</p>}
        </section>
      </div>
      {order.canRequestAgain && <div className="mt-4"><button type="button" className="btn btn-secondary" onClick={() => void requestAgain()} disabled={requestState === "busy" || requestState === "sent"}>{requestState === "busy" ? "Sending" : requestState === "sent" ? "Request sent" : "Request again"}</button>{requestState === "error" && <p role="alert" className="body-s mt-2" style={{ color: "var(--error)" }}>The request could not be sent.</p>}</div>}
    </article>
  );
}

export function OrganizationDashboardView({ data, onProfileSaved }: { data: OrganizationDashboardDto; onProfileSaved: (profile: BusinessProfile) => void }) {
  const canManage = data.organization.roles.some((role) => role === "organization_owner" || role === "organization_admin");
  const [editing, setEditing] = useState(false);
  const [billingEmail, setBillingEmail] = useState(data.profile.billingEmail);
  const [purchasingEmail, setPurchasingEmail] = useState(data.profile.purchasingEmail);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrganizationRole>("business_buyer");
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setProfileError(null);
    const result = await updateBusinessProfile(data.organization.id, { billingEmail, purchasingEmail });
    if (result.kind !== "ok") return setProfileError(result.message);
    onProfileSaved(result.data);
    setEditing(false);
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    const result = await inviteOrganizationUser(data.organization.id, inviteEmail, [inviteRole]);
    if (result.kind !== "ok") return setInviteNotice(result.message);
    setInviteEmail("");
    setInviteNotice("Invitation created for the verified-email acceptance flow.");
  }

  return (
    <main className="container-x pb-20 grid gap-10">
      <section aria-labelledby="business-profile">
        <div className="flex flex-wrap justify-between gap-3"><h2 id="business-profile" className="body-l font-700">Business profile</h2>{canManage && <button type="button" className="btn btn-ghost" onClick={() => setEditing((value) => !value)}>{editing ? "Cancel" : "Edit profile"}</button>}</div>
        {editing ? (
          <form onSubmit={saveProfile} className="card mt-4 grid gap-4 max-w-[680px]">
            <div><label className="form-label" htmlFor="business-purchasing-email">Purchasing email</label><input id="business-purchasing-email" type="email" className="input-field" required value={purchasingEmail} onChange={(event) => setPurchasingEmail(event.target.value)} /></div>
            <div><label className="form-label" htmlFor="business-billing-email">Billing email</label><input id="business-billing-email" type="email" className="input-field" required value={billingEmail} onChange={(event) => setBillingEmail(event.target.value)} /></div>
            {profileError && <p role="alert" className="body-s" style={{ color: "var(--error)" }}>{profileError}</p>}
            <button className="btn btn-primary" type="submit">Save profile</button>
          </form>
        ) : (
          <div className="grid md:grid-cols-3 gap-4 mt-4">
            <div className="card"><h3 className="mono-label text-ink-mute">Business</h3><p className="body-s text-ink-2 mt-2">{data.profile.legalName}<br />Purchasing: {data.profile.purchasingEmail}<br />Billing: {data.profile.billingEmail}</p></div>
            <div className="card"><h3 className="mono-label text-ink-mute">Billing address</h3><div className="mt-2"><Address value={data.profile.billingAddress} empty="Add a billing address before invoicing." /></div></div>
            <div className="card"><h3 className="mono-label text-ink-mute">Shipping address</h3><div className="mt-2"><Address value={data.profile.shippingAddress} empty="Add a default shipping address before ordering." /></div></div>
          </div>
        )}
      </section>

      <section aria-labelledby="business-orders">
        <div className="flex flex-wrap justify-between gap-3"><div><h2 id="business-orders" className="body-l font-700">Orders and invoices</h2><p className="body-s text-ink-2 mt-1">Existing order records owned by {data.organization.displayName}, including claimed history.</p></div><Link href="/research/account/claim-history" className="btn btn-ghost">Claim prior history</Link></div>
        <div className="grid gap-4 mt-4">{data.orders.length ? data.orders.map((order) => <OrderCard key={`${order.source}:${order.sourceOrderId}`} organizationId={data.organization.id} order={order} />) : <div className="card"><p className="body-s text-ink-mute">No organization orders are linked yet.</p></div>}</div>
      </section>

      <section aria-labelledby="business-users">
        <h2 id="business-users" className="body-l font-700">Organization users</h2>
        <div className="grid gap-3 mt-4">{data.users.map((user) => <div className="card flex flex-wrap justify-between gap-3" key={user.membershipId}><div><p className="body-s font-700">{user.email}</p><p className="body-s text-ink-2 mt-1">{user.roles.join(" · ")}</p></div><span className="mono-label text-ink-mute">{user.state}</span></div>)}</div>
        {canManage && <form onSubmit={invite} className="card mt-4 grid md:grid-cols-[1fr_220px_auto] gap-3 items-end"><div><label className="form-label" htmlFor="organization-invite-email">Add a user</label><input id="organization-invite-email" className="input-field" type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} /></div><div><label className="form-label" htmlFor="organization-invite-role">Role</label><select id="organization-invite-role" className="input-field" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as OrganizationRole)}><option value="business_buyer">Business buyer</option><option value="organization_admin">Organization admin</option><option value="billing_viewer">Billing viewer</option></select></div><button className="btn btn-secondary" type="submit">Send invite</button>{inviteNotice && <p role="status" className="body-s md:col-span-3">{inviteNotice}</p>}</form>}
      </section>
    </main>
  );
}

export default function OrganizationDashboard() {
  const params = useParams<{ organizationId: string }>();
  const [, navigate] = useLocation();
  const organizationId = params.organizationId;
  const [data, setData] = useState<OrganizationDashboardDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void getOrganizationDashboard(organizationId).then((result) => {
      if (!alive) return;
      if (result.kind === "ok") setData(result.data);
      else if (result.kind === "denied" && result.code === "PASSWORD_CHANGE_REQUIRED") navigate("/research/account/security/initial-password");
      else setError(result.message);
    });
    return () => { alive = false; };
  }, [navigate, organizationId]);

  return (
    <>
      <PageIntro eyebrow="Business account" title={data?.organization.displayName ?? "Organization dashboard"} lead="Business profile, team access, orders, invoices, tracking, and request-again history." />
      {!data && !error && <main className="container-x pb-20"><p role="status" className="body-s text-ink-mute">Loading organization…</p></main>}
      {error && <main className="container-x pb-20"><p role="alert" className="body-s" style={{ color: "var(--error)" }}>{error}</p></main>}
      {data && <OrganizationDashboardView data={data} onProfileSaved={(profile) => setData({ ...data, profile })} />}
    </>
  );
}
