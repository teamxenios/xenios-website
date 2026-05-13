import { useEffect, useState } from "react";

const FALLBACK = 550;

export function useWaitlistCount(initial: number = FALLBACK) {
  const [count, setCount] = useState<number>(initial);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const res = await fetch("/api/waitlist/count", { cache: "no-store" });
        if (!res.ok) throw new Error("bad status");
        const { count: c } = await res.json();
        if (alive && typeof c === "number") setCount(c);
      } catch {
        // swallow — keep last good value
      }
      if (alive) timer = setTimeout(tick, 7000);
    };

    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return count;
}
