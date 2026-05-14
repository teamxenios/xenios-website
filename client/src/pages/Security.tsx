import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES, SITE } from "@/lib/content";

const POSTURE = [
  { name: "Encryption", body: "TLS in transit. AES-256 at rest. No exceptions." },
  { name: "Access control", body: "Role-based access, audit logged, scoped to the practice." },
  { name: "PHI handling", body: "HIPAA-aware logging on every PHI interaction. BAA available on request." },
  { name: "Vendor posture", body: "We use vetted infrastructure providers (cloud, payments, comms). BAAs in place where required." },
  { name: "Monitoring", body: "24/7 monitoring, alerting, and on-call rotation across the platform." },
  { name: "Backup and recovery", body: "Point-in-time backups. Tested recovery. Documented RTO and RPO targets." },
];

export default function Security() {
  return (
    <PageShell>
      <SeoHead {...PAGES.security} />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">SECURITY</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "18ch" }}>The infrastructure your clients expect.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[60ch]">
          xenios is built for coaches, trainers, and practitioners who hold real relationships with real people. The security floor is treated as such.
        </p>
      </section>

      <section className="container-x py-16 rule-top">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {POSTURE.map((p) => (
            <div key={p.name} className="rule-all p-6 rounded-[12px]" data-testid={`card-${p.name.replace(/\s+/g, "-").toLowerCase()}`}>
              <h3 className="h3 mb-2">{p.name}</h3>
              <p className="body-m text-ink-2">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-4">RESPONSIBLE DISCLOSURE</p>
        <p className="body-l text-ink-2 max-w-[60ch]">
          Found something? Email security@xeniostechnology.com (or {SITE.email}) with the subject prefix [Security]. We respond inside two business days.
        </p>
      </section>
    </PageShell>
  );
}
