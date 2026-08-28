const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export interface MotionAwareScroller {
  matchMedia?: (query: string) => Pick<MediaQueryList, "matches">;
  scrollTo(options: ScrollToOptions): void;
}

export function preferredScrollBehavior(
  matchMedia?: MotionAwareScroller["matchMedia"],
): ScrollBehavior {
  if (!matchMedia) return "auto";
  try {
    return matchMedia(REDUCED_MOTION_QUERY).matches ? "auto" : "smooth";
  } catch {
    // A missing or broken preference reader must never force animation.
    return "auto";
  }
}

export function scrollToTopRespectingMotion(
  scroller: MotionAwareScroller = window,
): void {
  scroller.scrollTo({
    top: 0,
    behavior: preferredScrollBehavior(
      scroller.matchMedia ? scroller.matchMedia.bind(scroller) : undefined,
    ),
  });
}
