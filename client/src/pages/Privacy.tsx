import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { content } from "@/lib/content";

export default function Privacy() {
  const p = content.privacy;
  return (
    <div className="min-h-screen bg-paper text-ink font-sans">
      <Navbar />
      <article className="container mx-auto px-6 lg:px-16 py-20 lg:py-28 max-w-2xl" data-testid="page-privacy">
        <h1 className="font-display text-4xl lg:text-5xl text-ink leading-tight mb-6" data-testid="text-privacy-title">{p.h1}</h1>
        <p className="text-mono-500 leading-relaxed mb-12 text-base">{p.lede}</p>
        <div className="space-y-10">
          {p.sections.map((s, i) => (
            <section key={i}>
              <h2 className="font-display text-xl text-ink mb-3">{s.heading}</h2>
              <p className="text-mono-500 text-[15px] leading-relaxed">{s.body}</p>
            </section>
          ))}
        </div>
        <p className="text-xs text-mono-300 mt-12 italic">{p.note}</p>
      </article>
      <Footer />
    </div>
  );
}
