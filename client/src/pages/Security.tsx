import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { content } from "@/lib/content";

export default function Security() {
  const s = content.security;
  return (
    <div className="min-h-screen bg-paper text-ink font-sans">
      <Navbar />
      <article className="container mx-auto px-6 lg:px-16 py-20 lg:py-28 max-w-3xl" data-testid="page-security">
        <h1 className="font-display text-4xl lg:text-5xl text-ink leading-tight mb-8" data-testid="text-security-title">{s.h1}</h1>
        <p className="text-mono-500 text-lg leading-relaxed mb-12">{s.intro}</p>

        <section className="mb-10">
          <h2 className="font-display text-2xl text-ink mb-5">{s.today.title}</h2>
          <ul className="space-y-3">
            {s.today.items.map((it, i) => (
              <li key={i} className="flex gap-3 text-mono-500 text-[15px] leading-relaxed">
                <span className="text-orange font-mono">—</span>
                <span>{it}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="font-display text-2xl text-ink mb-5">{s.coming.title}</h2>
          <ul className="space-y-3">
            {s.coming.items.map((it, i) => (
              <li key={i} className="flex gap-3 text-mono-500 text-[15px] leading-relaxed">
                <span className="text-orange font-mono">—</span>
                <span>{it}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-ink text-cream rounded-2xl p-8 mt-12">
          <ul className="space-y-3">
            {s.promises.map((p, i) => (
              <li key={i} className="text-mono-100 text-[15px] leading-relaxed">{p}</li>
            ))}
          </ul>
        </section>
      </article>
      <Footer />
    </div>
  );
}
