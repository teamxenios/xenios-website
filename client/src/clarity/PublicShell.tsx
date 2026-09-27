import type { ReactNode } from "react";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";

export default function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      <a href="#site-main" className="skip-link">Skip to content</a>
      <Navbar />
      <main id="site-main" tabIndex={-1} className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
