import type { ReactNode } from "react";
import TopRibbon from "./TopRibbon";
import Navbar from "./Navbar";
import Footer from "./Footer";

export default function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      <TopRibbon />
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
