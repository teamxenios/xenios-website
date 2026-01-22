import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowUpRight, Activity, Heart, Zap } from "lucide-react";
import { useRef } from "react";

export default function HeroSection() {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  });

  const y = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  return (
    <section ref={containerRef} className="relative pt-32 pb-12 lg:pt-48 lg:pb-32 px-6 border-b border-border min-h-[90vh] flex items-start">
       <div className="absolute inset-0 -z-10 bg-[radial-gradient(#e5e5e5_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,#000_70%,transparent_100%)] opacity-50"></div>
      
      <div className="container mx-auto grid lg:grid-cols-2 gap-16 items-start relative">
        <motion.div style={{ y, opacity }} className="flex flex-col gap-8 sticky top-32">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-6xl md:text-8xl font-display font-semibold tracking-tighter leading-[0.9]">
              PREDICT <br />
              <span className="text-muted-foreground">PREVENT</span> <br />
              PROSPER.
            </h1>
          </motion.div>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl md:text-2xl text-muted-foreground max-w-xl font-light leading-relaxed"
          >
            The first proactive health platform that doesn't just track your data—it understands it.
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex gap-4"
          >
             <button onClick={() => document.getElementById('waitlist')?.scrollIntoView({behavior: 'smooth'})} className="bg-primary text-primary-foreground h-14 px-8 rounded-full text-lg font-medium hover:scale-105 transition-transform active:scale-95">
               Start your journey
             </button>
          </motion.div>
        </motion.div>

        <div className="flex flex-col gap-4 lg:pt-32">
          <FeatureTile 
            icon={Activity} 
            title="Real-time Analysis" 
            text="Continuous monitoring of 50+ biomarkers with clinical-grade accuracy." 
            delay={0.5}
          />
          <FeatureTile 
            icon={Heart} 
            title="Holistic Context" 
            text="We correlate sleep, movement, and nutrition to give you the full picture." 
            delay={0.6}
          />
          <FeatureTile 
            icon={Zap} 
            title="Actionable Insights" 
            text="Don't just see the data. Know exactly what to do with it, every single day." 
            delay={0.7}
          />
           <FeatureTile 
            icon={Zap} 
            title="Cognitive Load" 
            text="Measure mental fatigue and optimize your workday for peak performance." 
            delay={0.8}
          />
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
