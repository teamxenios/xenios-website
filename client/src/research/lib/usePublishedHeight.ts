import { useLayoutEffect, type RefObject } from "react";

/**
 * Publish an element's rendered height as a CSS custom property on another
 * element, and keep it current while the element resizes.
 *
 * Sticky layers use it to stack instead of overlapping: the member header
 * publishes --research-sticky-chrome-height on the member chrome, and a page
 * toolbar sticks at that offset. The header's height varies (safe-area inset,
 * a wrapped sign-out label, the mobile navigation row, text zoom), so a fixed
 * pixel offset would either overlap it or leave a gap.
 */
export function usePublishedHeight(
  source: RefObject<HTMLElement | null>,
  target: RefObject<HTMLElement | null>,
  property: string,
): void {
  useLayoutEffect(() => {
    const element = source.current;
    const host = target.current;
    if (!element || !host) return undefined;

    const publish = () => {
      host.style.setProperty(property, `${Math.ceil(element.getBoundingClientRect().height)}px`);
    };
    publish();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", publish);
      return () => {
        window.removeEventListener("resize", publish);
        host.style.removeProperty(property);
      };
    }

    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => {
      observer.disconnect();
      host.style.removeProperty(property);
    };
  }, [source, target, property]);
}
