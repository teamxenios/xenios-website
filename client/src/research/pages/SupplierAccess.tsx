import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { ResearchPublicShell } from "../ui/shells";

const SUPPLIER_SCOPE = [
  "Only orders and lines assigned to your supplier account",
  "Acknowledgement, lot, COA, packing, shipment, tracking, delay, exception, and recall updates",
  "Xenios relay contact details rather than a buyer's direct commercial relationship",
  "No access to affiliate attribution, customer pricing, Xenios margin, payment evidence, or another supplier's work",
] as const;

export default function SupplierAccess() {
  return (
    <>
      <SeoHead
        title="Supplier and fulfillment access, Xenios Research"
        description="Invitation-only fulfillment access for approved Xenios Research suppliers and laboratories."
        path="/research/supplier-access"
      />
      <ResearchPublicShell
        eyebrow="Supplier and fulfillment access"
        title="Invitation-only operational access."
        lead="Approved suppliers and laboratories receive the minimum information needed to fulfill work assigned to them."
      >
        <section className="card" aria-labelledby="supplier-scope">
          <h2 id="supplier-scope" className="body-l font-700">What an approved supplier workspace contains</h2>
          <ul className="mt-4 grid gap-3">
            {SUPPLIER_SCOPE.map((item) => <li className="body-s text-ink-2" key={item}>• {item}</li>)}
          </ul>
        </section>

        <section className="card mt-6" aria-labelledby="supplier-start">
          <p className="mono-label text-ink-mute">Access</p>
          <h2 id="supplier-start" className="body-l font-700 mt-2">Use the invitation sent to your approved business email.</h2>
          <p className="body-s text-ink-2 mt-3 max-w-[64ch]">
            Supplier access is not created from a public signup. Xenios first verifies the commercial relationship, product assignments, documentation responsibilities, authorized users, and fulfillment scope.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href="mailto:research@xeniostechnology.com?subject=Xenios%20supplier%20access" className="btn btn-primary">Contact supplier operations</a>
            <Link href="/research/support" className="btn btn-secondary">Get support</Link>
          </div>
        </section>
      </ResearchPublicShell>
    </>
  );
}
