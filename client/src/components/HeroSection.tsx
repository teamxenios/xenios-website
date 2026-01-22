import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { useRef } from "react";
import { content } from "@/lib/content";
import { Link } from "wouter";

export default function HeroSection() {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  });

  const y = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  return (
    <section ref={containerRef} className="relative pt-32 pb-12 lg:pt-48 lg:pb-32 px-6 border-b border-border min-h-[90vh] flex items-start overflow-hidden">
       <div className="absolute inset-0 -z-10 bg-[radial-gradient(#e5e5e5_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,#000_70%,transparent_100%)] opacity-50"></div>
       <div className="absolute -right-32 -top-32 -z-20 opacity-[0.03] pointer-events-none">
         <img src="/xenios-mark-outline.png" alt="" className="w-[800px] h-auto" />
       </div>
      
      <div className="container mx-auto grid lg:grid-cols-2 gap-16 items-start relative">
        <motion.div style={{ y, opacity }} className="flex flex-col gap-8 sticky top-32">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-display font-semibold tracking-tighter leading-[0.95] text-balance">
              {content.hero.title.line1} <br />
              <span className="text-muted-foreground">{content.hero.title.line2}</span> <br />
              {content.hero.title.line3}
            </h1>
          </motion.div>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl md:text-2xl text-muted-foreground max-w-xl font-light leading-relaxed"
          >
            {content.hero.subtitle}
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-wrap gap-4"
          >
             <button onClick={() => document.getElementById('waitlist')?.scrollIntoView({behavior: 'smooth'})} className="bg-primary text-primary-foreground h-14 px-8 rounded-full text-lg font-medium hover:scale-105 transition-transform active:scale-95">
               {content.hero.cta}
             </button>
             <Link href="/coaches">
               <button className="h-14 px-8 rounded-full text-lg font-medium border border-border bg-background hover:bg-secondary/50 transition-colors">
                 {content.hero.ctaSecondary}
               </button>
             </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="pt-4"
          >
            <p className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-4">Built for:</p>
            <div className="flex flex-wrap gap-2">
              {content.hero.builtFor.map((role, i) => (
                <span key={i} className="px-3 py-1 bg-secondary/50 text-secondary-foreground text-sm font-medium rounded-full border border-border/50">
                  {role}
                </span>
              ))}
            </div>
          </motion.div>
        </motion.div>

        <div className="flex flex-col gap-4 lg:pt-32">
          {content.hero.features.map((feature, i) => (
            <FeatureTile 
              key={i}
              icon={feature.icon}
              title={feature.title} 
              text={feature.text}
              delay={0.5 + (i * 0.1)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureTile({ icon: Icon, title, text, delay }: { icon: any, title: string, text: string, delay: number }) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6, delay }}
      className="group p-8 border border-border bg-background hover:bg-secondary/20 transition-colors flex gap-6 items-start rounded-xl cursor-pointer hover:shadow-lg hover:-translate-y-1 duration-300"
    >
      <div className="p-3 bg-secondary rounded-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
        <Icon size={24} strokeWidth={1.5} />
      </div>
      <div>
        <h3 className="text-xl font-display font-medium mb-2 flex items-center gap-2 group-hover:text-primary transition-colors">
          {title} <ArrowUpRight size={16} className="opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
        </h3>
        <p className="text-muted-foreground leading-relaxed">{text}</p>
      </div>
    </motion.div>
  );
}
