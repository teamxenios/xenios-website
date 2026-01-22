import { motion } from "framer-motion";
import { ArrowRight, Box, Layers, Zap, Globe, Shield, Activity } from "lucide-react";
import Navbar from "@/components/Navbar";
import Section from "@/components/Section";
import FeatureCard from "@/components/FeatureCard";
import Ticker from "@/components/Ticker";
import Accordion from "@/components/Accordion";
import WaitlistForm from "@/components/WaitlistForm";

export default function Home() {
  const fadeIn = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: "easeOut" }
  };

  const stagger = {
    animate: {
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary selection:text-primary-foreground">
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 lg:pt-48 lg:pb-32 px-6 border-b border-border overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(#e5e5e5_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)]"></div>
        
        <div className="container mx-auto max-w-5xl">
          <motion.div 
            initial="initial"
            animate="animate"
            variants={stagger}
            className="flex flex-col items-center text-center gap-8"
          >
            <motion.div variants={fadeIn} className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-sm text-muted-foreground">
              <span className="flex h-2 w-2 rounded-full bg-primary mr-2"></span>
              v2.0 is now available
            </motion.div>
            
            <motion.h1 variants={fadeIn} className="text-6xl md:text-8xl lg:text-9xl font-display font-semibold tracking-tighter leading-[0.9]">
              PURE <br className="hidden md:block" />
              <span className="text-muted-foreground/50">FUNCTION.</span>
            </motion.h1>
            
            <motion.p variants={fadeIn} className="text-xl md:text-2xl text-muted-foreground max-w-2xl font-light leading-relaxed">
              Strip away the noise. Focus on the essential. A minimal foundation for building timeless digital products.
            </motion.p>
            
            <motion.div variants={fadeIn} className="pt-8 flex flex-col sm:flex-row gap-4">
              <button onClick={() => document.getElementById('waitlist')?.scrollIntoView({behavior: 'smooth'})} className="bg-primary text-primary-foreground h-12 px-8 text-base font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-all">
                Start Building <ArrowRight size={18} />
              </button>
              <button className="border border-border bg-transparent h-12 px-8 text-base font-medium hover:bg-muted/50 transition-all">
                Read Documentation
              </button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <Ticker />

      {/* Features Grid */}
      <Section id="features" className="bg-background">
        <div className="mb-16">
          <h2 className="text-4xl md:text-5xl font-display font-medium tracking-tight mb-6">
            Designed for <span className="text-muted-foreground">clarity.</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl">
            Everything you need to build a high-performance website, without the bloat.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <FeatureCard 
            index={0}
            icon={Box}
            title="Modular Components"
            description="Pre-built, accessible components that snap together perfectly. Built on Radix UI primitives."
          />
          <FeatureCard 
            index={1}
            icon={Zap}
            title="Zero Runtime"
            description="Static extraction for CSS ensures optimal performance. No layout shifts, ever."
          />
          <FeatureCard 
            index={2}
            icon={Layers}
            title="Atomic Design"
            description="Organized specifically for scale. From atoms to pages, everything has its place."
          />
          <FeatureCard 
            index={3}
            icon={Globe}
            title="Global Edge"
            description="Deployed instantly to 200+ edge locations. Your site is fast, everywhere."
          />
          <FeatureCard 
            index={4}
            icon={Shield}
            title="Type Safe"
            description="End-to-end type safety with TypeScript and Zod. Catch errors before they happen."
          />
          <FeatureCard 
            index={5}
            icon={Activity}
            title="Real-time Metrics"
            description="Built-in analytics that respect user privacy while giving you the data you need."
          />
        </div>
      </Section>

      {/* Big Text / Philosophy Section */}
      <section className="py-32 border-b border-border bg-secondary/30">
        <div className="container mx-auto px-6 max-w-5xl">
          <p className="text-3xl md:text-5xl font-display leading-tight tracking-tight">
            "Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away."
          </p>
          <p className="mt-8 text-lg font-mono text-muted-foreground">— Antoine de Saint-Exupéry</p>
        </div>
      </section>

      {/* FAQ */}
      <Section id="faq">
        <div className="flex flex-col md:flex-row gap-12">
          <div className="md:w-1/3">
            <h2 className="text-3xl font-display font-medium tracking-tight mb-4">Common Questions</h2>
            <p className="text-muted-foreground">Everything you need to know about the platform.</p>
          </div>
          <div className="md:w-2/3">
            <Accordion items={[
              {
                question: "Is this suitable for production?",
                answer: "Absolutely. We rely on battle-tested primitives and modern build tools to ensure your site is production-ready from day one."
              },
              {
                question: "Can I customize the design?",
                answer: "Yes. The system is built on Tailwind CSS, giving you complete control over every pixel. We provide the foundation, you provide the brand."
              },
              {
                question: "How does deployment work?",
                answer: "Push to git, and we handle the rest. Automatic builds, preview deployments, and instant rollbacks are built-in."
              },
              {
                question: "What about SEO?",
                answer: "We include best-practice SEO meta tags, structured data, and sitemap generation out of the box."
              }
            ]} />
          </div>
        </div>
      </Section>

      {/* Waitlist / CTA */}
      <Section id="waitlist" className="bg-background text-center py-32">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="max-w-xl mx-auto space-y-8"
        >
          <h2 className="text-5xl font-display font-semibold tracking-tighter">Ready to simplify?</h2>
          <p className="text-xl text-muted-foreground">
            Join 10,000+ developers building the future of the web.
          </p>
          <div className="pt-4">
            <WaitlistForm />
          </div>
          <p className="text-sm text-muted-foreground pt-8">
            Free for open source. No credit card required.
          </p>
        </motion.div>
      </Section>

      {/* Footer */}
      <footer className="py-12 border-t border-border bg-background">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-xl font-display font-bold tracking-tight">MONO.</div>
          <div className="flex gap-8 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">Twitter</a>
            <a href="#" className="hover:text-foreground transition-colors">GitHub</a>
            <a href="#" className="hover:text-foreground transition-colors">Discord</a>
          </div>
          <div className="text-sm text-muted-foreground">
            © 2024 Mono Inc. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
