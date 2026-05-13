import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { content } from "@/lib/content";

export default function Terms() {
  const t = content.terms;
  return (
    <div className="min-h-screen bg-paper text-ink font-sans">
      <Navbar />
      <article className="container mx-auto px-6 lg:px-16 py-20 lg:py-28 max-w-2xl" data-testid="page-terms">
        <h1 className="font-display text-4xl lg:text-5xl text-ink leading-tight mb-6" data-testid="text-terms-title">{t.h1}</h1>
        <p className="text-mono-500 leading-relaxed mb-8 text-base">{t.lede}</p>
        <p className="text-xs text-mono-300 italic">{t.note}</p>
      </article>
      <Footer />
    </div>
  );
}
