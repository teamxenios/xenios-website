import { useEffect, useState } from "react";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { trackViewContent } from "@/lib/tracking";

interface Concept {
  id: string | number;
  title: string;
  description: string;
  image_url: string | null;
  status: string;
  date: string;
  visible: boolean;
  sort_order: number;
}

export default function Concepts() {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    trackViewContent();
    let cancelled = false;
    fetch("/api/concepts")
      .then((r) => (r.ok ? r.json() : { success: false, data: [] }))
      .then((res) => {
        if (cancelled) return;
        if (res && res.success && Array.isArray(res.data)) {
          setConcepts(res.data as Concept[]);
        }
      })
      .catch(() => {
        /* keep empty state on failure */
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageShell>
      <SeoHead
        title="Early concepts from xenios"
        description="A look at early concepts in development at xenios."
        path="/concepts"
      />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">CONCEPTS</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "18ch" }}>Early concepts</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[60ch]">
          A look at the ideas the xenios team is exploring, building, and shipping.
        </p>
      </section>

      <section className="container-x py-16 rule-top">
        {loaded && concepts.length === 0 ? (
          <p className="body-l text-ink-2" data-testid="text-concepts-empty">New concepts are on the way.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {concepts.map((c) => (
              <article
                key={c.id}
                className="border border-[color:var(--line)] rounded-lg overflow-hidden flex flex-col"
                data-testid={`card-concept-${c.id}`}
              >
                {c.image_url && (
                  <img src={c.image_url} alt={c.title} className="w-full h-48 object-cover" data-testid={`img-concept-${c.id}`} />
                )}
                <div className="p-6 flex flex-col gap-3 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="mono-cap text-pulse" data-testid={`badge-status-${c.id}`}>{c.status}</span>
                    {c.date && <span className="mono-cap text-ink-mute" data-testid={`text-date-${c.id}`}>{c.date}</span>}
                  </div>
                  <h2 className="display-s" data-testid={`text-title-${c.id}`}>{c.title}</h2>
                  <p className="body-s text-ink-2" data-testid={`text-description-${c.id}`}>{c.description}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}
