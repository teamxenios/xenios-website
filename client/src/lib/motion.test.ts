import { describe, expect, it, vi } from "vitest";
import {
  preferredScrollBehavior,
  scrollToTopRespectingMotion,
  type MotionAwareScroller,
} from "./motion";

describe("motion-aware scrolling", () => {
  it("uses an immediate scroll when reduced motion is requested", () => {
    const matchMedia = vi.fn(() => ({ matches: true }));
    expect(preferredScrollBehavior(matchMedia)).toBe("auto");
    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });

  it("keeps smooth scrolling when the user has not requested reduced motion", () => {
    expect(preferredScrollBehavior(() => ({ matches: false }))).toBe("smooth");
  });

  it("fails safely to immediate motion when preference detection is absent or broken", () => {
    expect(preferredScrollBehavior()).toBe("auto");
    expect(preferredScrollBehavior(() => {
      throw new Error("media query unavailable");
    })).toBe("auto");
  });

  it("scrolls to the top with the resolved behavior", () => {
    const scrollTo = vi.fn();
    const scroller: MotionAwareScroller = {
      matchMedia: () => ({ matches: true }),
      scrollTo,
    };
    scrollToTopRespectingMotion(scroller);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });
});
