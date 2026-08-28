import type { ReactNode } from "react";
import TopRibbon from "./TopRibbon";
import Navbar from "./Navbar";
import Footer from "./Footer";

export default function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      {/* Skip link: the first focusable element on every page. Hidden until
          it receives keyboard focus, then jumps straight to the main content
          landmark below, past the ribbon and nav. The id is "site-main", not
          "main-content": several care/ pages already put their own
          id="main-content" on a div inside this <main>, and duplicating that
          id here would make #main-content ambiguous. */}
      <a href="#site-main" className="skip-link">
        Skip to content
      </a>
      <TopRibbon />
      <Navbar />
      <main id="site-main" tabIndex={-1} className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
