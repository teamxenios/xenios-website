import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";

interface RevealProps {
  /** Element/tag to render. Defaults to a div. */
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  /** Stagger delay in ms, applied once the element reveals. */
  delay?: number;
  children: ReactNode;
}

/**
 * Fades + rises its children in when they scroll into view, once.
 *
 * Robustness first: content is never left hidden. Anything already in view on
 * mount reveals immediately (and still animates in), the observer handles the
 * below-the-fold scroll reveal, and a safety timeout reveals everything if the
 * observer never fires (some embedded/headless renderers don't run it). Uses a
 * CSS class (.reveal / .reveal-in) so the motion runs off the main thread, and
 * prefers-reduced-motion shows content with no movement.
 */
export default function Reveal({ as, className = "", style, delay = 0, children }: RevealProps) {
  const Tag: any = as || "div";
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reveal = () => setShown(true);

    // Already in view on mount (above the fold): reveal right away so content is
    // never withheld. It still animates in because .reveal-in transitions from
    // the .reveal initial state.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      reveal();
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      reveal();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            reveal();
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    io.observe(el);

    // Safety net: never leave content hidden if the observer never fires.
    const fallback = window.setTimeout(reveal, 1500);

    return () => {
      io.disconnect();
      window.clearTimeout(fallback);
    };
  }, []);

  const cls = `reveal${shown ? " reveal-in" : ""}${className ? " " + className : ""}`;
  const mergedStyle = delay && shown ? { ...style, transitionDelay: `${delay}ms` } : style;

  return (
    <Tag ref={ref} className={cls} style={mergedStyle}>
      {children}
    </Tag>
  );
}
