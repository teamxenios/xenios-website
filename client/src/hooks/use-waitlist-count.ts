import { useEffect, useState } from "react";

// Matches the server display base (WAITLIST_BASE_COUNT) so the pre-fetch
// placeholder does not flash a different number before the first poll lands.
const FALLBACK = 556;

// Shared singleton: one poller and one value for the whole page, so every
// counter stays in sync and ticks up the instant a signup reports a new total.
let current = FALLBACK;
const listeners = new Set<(n: number) => void>();
let started = false;

function emit(n: number) {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return;
  current = n;
  listeners.forEach((notify) => notify(n));
}

// Push a known-good total (the value returned right after a signup) so the
// number updates immediately, before the next 7 second poll.
export function setWaitlistCount(n: number) {
  emit(n);
}

async function fetchCount() {
  try {
    const res = await fetch("/api/waitlist/count", { cache: "no-store" });
    if (!res.ok) return;
    const { count } = await res.json();
    emit(count);
  } catch {
    // keep the last good value
  }
}

function startPolling() {
  if (started || typeof window === "undefined") return;
  started = true;
  const tick = async () => {
    await fetchCount();
    window.setTimeout(tick, 7000);
  };
  tick();
}

export function useWaitlistCount(): number {
  const [count, setCount] = useState<number>(current);
  useEffect(() => {
    listeners.add(setCount);
    setCount(current); // sync to the latest shared value on mount
    startPolling();
    return () => {
      listeners.delete(setCount);
    };
  }, []);
  return count;
}
