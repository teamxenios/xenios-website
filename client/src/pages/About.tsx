import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { content } from "@/lib/content";
import { Link } from "wouter";

export default function About() {
  const a = content.about;
  return (
    <div className="min-h-screen bg-paper text-ink font-sans">
      <Navbar />
      <article className="container mx-auto px-6 lg:px-16 py-20 lg:py-28 max-w-3xl" data-testid="page-about">
        <h1 className="font-display text-5xl lg:text-6xl text-ink leading-tight mb-8" data-testid="text-about-title">{a.h1}</h1>
        <p className="font-display text-2xl lg:text-[28px] text-mono-500 leading-snug mb-16">{a.lede}</p>

        <div className="space-y-14">
          {a.sections.map((s, i) => (
            <section key={i} data-testid={`about-section-${i}`}>
              <h2 className="font-display text-3xl text-ink mb-5">{s.heading}</h2>
              <div className="space-y-4 text-mono-500 text-lg leading-relaxed">
                {s.paragraphs.map((p, j) => <p key={j}>{p}</p>)}
              </div>
              {s.bullets && (
                <ul className="space-y-3 mt-6">
                  {s.bullets.map((b, j) => (
                    <li key={j} className="flex gap-3 text-mono-500 text-[15px]">
                      <span className="text-orange font-mono">—</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
              {s.outro && <p className="mt-6 text-mono-500 text-lg leading-relaxed">{s.outro}</p>}
              {s.emails && (
                <ul className="space-y-2 mt-6 font-mono text-sm">
                  {s.emails.map((e) => (
                    <li key={e}>
                      <a href={`mailto:${e}`} className="text-orange hover:underline underline-offset-4">{e}</a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <div className="mt-20 pt-10 border-t border-hairline">
          <h3 className="font-display text-2xl text-ink mb-5">{a.cta.title}</h3>
          <Link
            href="/careers"
            className="inline-flex items-center gap-2 bg-orange text-ink px-6 py-3.5 rounded-lg font-semibold hover:bg-[hsl(var(--orange-hover))] transition-colors"
            data-testid="button-about-careers"
          >
            {a.cta.button} →
          </Link>
        </div>
      </article>
      <Footer />
    </div>
  );
}
