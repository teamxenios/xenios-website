import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import WaitlistForm from "@/components/WaitlistForm";
import { content } from "@/lib/content";

export default function Waitlist() {
  const w = content.waitlistPage;
  return (
    <div className="min-h-screen bg-paper text-ink font-sans">
      <Navbar />
      <article className="container mx-auto px-6 lg:px-16 py-20 lg:py-28 max-w-xl" data-testid="page-waitlist">
        <h1 className="font-display text-5xl lg:text-6xl text-ink leading-tight mb-6" data-testid="text-waitlist-title">{w.h1}</h1>
        <p className="text-mono-500 text-lg leading-relaxed mb-10">{w.subhead}</p>
        <WaitlistForm variant="page" />
      </article>
      <Footer />
    </div>
  );
}
