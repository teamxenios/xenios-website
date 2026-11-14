/** Presentation-only viewport clearance for the existing persistent request bar.
 * No network, storage, form values, consent, focus transfer, or submission calls.
 * The browser's scroll-into-view region excludes the ACTUAL fixed dock rather
 * than assuming that a document-end spacer also prevents viewport obstruction.
 */
const PADDING = "scroll-padding-bottom";
const GAP = 12;

type Lease = {
  root: HTMLElement;
  originalValue: string;
  originalPriority: string;
  baseline: string;
  lastValue: string | null;
  lastPriority: string;
  clearances: Map<symbol, number>;
  yielded: boolean;
};
const leases = new WeakMap<HTMLElement, Lease>();

/** Only count a dock intersecting the layout viewport. Never reserve NaN space. */
export function dockViewportClearance(height: number, top: number, bottom: number): number {
  if (![height, top, bottom].every(Number.isFinite) || height <= 0 ||
      bottom <= top || bottom <= 0 || top >= height) return 0;
  return Math.min(height, Math.max(0, Math.ceil(height - Math.max(0, top) + GAP)));
}

function stillOwns(lease: Lease): boolean {
  return lease.lastValue === null ||
    (lease.root.style.getPropertyValue(PADDING) === lease.lastValue &&
     lease.root.style.getPropertyPriority(PADDING) === lease.lastPriority);
}

function renderLease(lease: Lease): void {
  if (lease.yielded) return;
  if (!stillOwns(lease)) { lease.yielded = true; return; }
  const clearance = Math.max(0, ...lease.clearances.values());
  // Preserve larger existing scroll padding, including percentage/calc values.
  lease.root.style.setProperty(PADDING, `max(${lease.baseline}, ${clearance}px)`, lease.originalPriority);
  lease.lastValue = lease.root.style.getPropertyValue(PADDING);
  lease.lastPriority = lease.root.style.getPropertyPriority(PADDING);
}

/** Several mounted docks (including StrictMode transitions) cannot undo one
 * another's clearance. An external style writer wins and is never overwritten.
 */
export function acquireDockScrollPadding(root: HTMLElement, computedBaseline: string) {
  let lease = leases.get(root);
  if (!lease) {
    lease = {
      root, originalValue: root.style.getPropertyValue(PADDING),
      originalPriority: root.style.getPropertyPriority(PADDING),
      baseline: !computedBaseline || computedBaseline === "auto" ? "0px" : computedBaseline,
      lastValue: null, lastPriority: "", clearances: new Map(), yielded: false,
    };
    leases.set(root, lease);
  }
  const record = lease;
  const token = Symbol("request-dock");
  let released = false;
  record.clearances.set(token, 0);
  return {
    update(clearance: number) {
      if (released) return;
      record.clearances.set(token, Number.isFinite(clearance) ? Math.max(0, Math.ceil(clearance)) : 0);
      renderLease(record);
    },
    release() {
      if (released) return;
      released = true;
      record.clearances.delete(token);
      if (record.clearances.size) { renderLease(record); return; }
      if (!record.yielded && stillOwns(record) && record.lastValue !== null) {
        if (record.originalValue) root.style.setProperty(PADDING, record.originalValue, record.originalPriority);
        else root.style.removeProperty(PADDING);
      }
      leases.delete(root);
    },
  };
}

/** Observes actual DOM geometry, including text reflow and keyboard positioning.
 * Return value is the complete Effect cleanup. No timer/polling loop is used.
 * The existing height callback continues to size the document-end spacer.
 */
export function observeRequestDockViewport(
  dock: HTMLElement,
  onHeight: (height: number) => void,
): () => void {
  const doc = dock.ownerDocument;
  const view = doc.defaultView;
  if (!view) return () => {};
  const root = doc.documentElement;
  const lease = acquireDockScrollPadding(root, view.getComputedStyle(root).getPropertyValue(PADDING));
  let disposed = false;
  let frame: number | null = null;
  let lastHeight = 0;

  const measure = () => {
    if (disposed) return;
    const rect = dock.getBoundingClientRect();
    const visible = dock.isConnected && view.getComputedStyle(dock).display !== "none";
    const height = visible && Number.isFinite(rect.height) ? Math.ceil(rect.height) : 0;
    if (height > 0 && height !== lastHeight) { lastHeight = height; onHeight(height); }
    lease.update(visible ? dockViewportClearance(view.innerHeight, rect.top, rect.bottom) : 0);
  };
  const schedule = () => {
    if (disposed || frame !== null) return;
    frame = view.requestAnimationFrame(() => { frame = null; measure(); });
  };
  const observer = typeof view.ResizeObserver === "function" ? new view.ResizeObserver(schedule) : null;
  const movement = typeof view.MutationObserver === "function" ? new view.MutationObserver(schedule) : null;
  observer?.observe(dock);
  // React changes the inline bottom offset when the visual keyboard changes.
  movement?.observe(dock, { attributes: true, attributeFilter: ["style", "class", "hidden"] });
  view.addEventListener("resize", schedule);
  view.visualViewport?.addEventListener("resize", schedule);
  view.visualViewport?.addEventListener("scroll", schedule);
  doc.fonts?.addEventListener("loadingdone", schedule);
  measure();

  return () => {
    if (disposed) return;
    disposed = true;
    if (frame !== null) view.cancelAnimationFrame(frame);
    observer?.disconnect();
    movement?.disconnect();
    view.removeEventListener("resize", schedule);
    view.visualViewport?.removeEventListener("resize", schedule);
    view.visualViewport?.removeEventListener("scroll", schedule);
    doc.fonts?.removeEventListener("loadingdone", schedule);
    lease.release();
  };
}
