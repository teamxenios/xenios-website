import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { content } from "@/lib/content";
import { motion } from "framer-motion";

export default function Careers() {
  const c = content.careers;
  return (
    <div className="min-h-screen bg-paper text-ink font-sans">
      <Navbar />
      <article className="container mx-auto px-6 lg:px-16 py-20 lg:py-28 max-w-4xl" data-testid="page-careers">
        <h1 className="font-display text-5xl lg:text-7xl text-ink leading-[1.05] tracking-tight mb-6" data-testid="text-careers-title">
          {c.h1}
        </h1>
        <p className="text-mono-500 text-lg lg:text-xl leading-relaxed max-w-2xl mb-16">{c.lede}</p>

        <section className="bg-paper-elevated border border-hairline rounded-2xl p-8 mb-16" data-testid="section-how-we-hire">
          <h2 className="font-display text-2xl text-ink mb-4">{c.howWeHire.title}</h2>
          <p className="text-mono-500 leading-relaxed mb-4">{c.howWeHire.body}</p>
          <p className="text-mono-300 text-sm">{c.howWeHire.footnote}</p>
        </section>

        <h2 className="font-display text-3xl text-ink mb-8">Open roles</h2>
        <div className="space-y-6">
          {c.roles.map((role, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="bg-paper-elevated border border-hairline rounded-2xl p-8"
              data-testid={`role-card-${i}`}
            >
              <h3 className="font-display text-2xl text-ink mb-1">{role.title}</h3>
              <p className="font-mono text-xs uppercase tracking-widest text-orange mb-5">{role.meta}</p>
              <p className="text-mono-500 leading-relaxed mb-4">{role.body}</p>
              <p className="text-mono-500 leading-relaxed mb-4"><span className="font-semibold text-ink">We're looking for:</span> {role.looking.replace(/^We're looking for:\s*/, "")}</p>
              <p className="text-mono-500 leading-relaxed mb-6">{role.bonus}</p>
              <a
                href="mailto:careers@xeniostechnology.com"
                className="inline-flex items-center gap-2 bg-orange text-ink px-5 py-3 rounded-lg font-semibold text-sm hover:bg-[hsl(var(--orange-hover))] transition-colors"
                data-testid={`button-role-apply-${i}`}
              >
                {role.cta} →
              </a>
            </motion.div>
          ))}
        </div>

        <div className="mt-16 pt-10 border-t border-hairline">
          <p className="text-mono-500 text-lg leading-relaxed mb-5">{c.bottomCta.body}</p>
          <a
            href={`mailto:${c.bottomCta.cta}`}
            className="inline-flex items-center gap-2 text-orange font-semibold hover:underline underline-offset-4"
          >
            {c.bottomCta.cta} →
          </a>
        </div>
      </article>
      <Footer />
    </div>
  );
}
