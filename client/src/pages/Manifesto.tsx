import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { content } from "@/lib/content";
import { Link } from "wouter";
import { motion } from "framer-motion";

export default function Manifesto() {
  const m = content.manifesto;
  return (
    <div className="min-h-screen bg-paper text-ink font-sans">
      <Navbar />
      <article className="container mx-auto px-6 lg:px-16 py-20 lg:py-28 max-w-3xl" data-testid="page-manifesto">
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="font-display text-5xl lg:text-7xl text-ink leading-[1.05] tracking-[-0.02em] mb-6"
          data-testid="text-manifesto-title"
        >
          {m.title}
        </motion.h1>
        <p className="font-mono text-sm text-mono-300 uppercase tracking-widest mb-16">{m.subhead}</p>

        <div className="space-y-16">
          {m.sections.map((s, i) => (
            <motion.section
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.1 }}
              transition={{ duration: 0.45 }}
              data-testid={`manifesto-section-${i}`}
            >
              <h2 className="font-display text-3xl lg:text-4xl text-ink mb-6 leading-snug">{s.heading}</h2>
              <div className="space-y-5 text-mono-500 text-lg leading-relaxed">
                {s.paragraphs.map((p, j) => <p key={j}>{p}</p>)}
              </div>
            </motion.section>
          ))}
        </div>

        <div className="mt-20 pt-10 border-t border-hairline flex flex-wrap gap-4">
          <Link
            href="/waitlist"
            className="inline-flex items-center gap-2 bg-orange text-ink px-6 py-3.5 rounded-lg font-semibold hover:bg-[hsl(var(--orange-hover))] transition-colors"
            data-testid="button-manifesto-waitlist"
          >
            Join the waitlist →
          </Link>
          <Link
            href="/careers"
            className="inline-flex items-center gap-2 border border-ink text-ink px-6 py-3.5 rounded-lg font-semibold hover:bg-ink hover:text-cream transition-colors"
          >
            See open roles →
          </Link>
        </div>
      </article>
      <Footer />
    </div>
  );
}
