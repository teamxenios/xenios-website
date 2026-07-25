import { useMemo, useState } from "react";

export type MitchUiQueue =
  | "new"
  | "awaiting_acknowledgement"
  | "due_today"
  | "picking"
  | "packed"
  | "label_required"
  | "shipped_today"
  | "exceptions"
  | "inventory_issues"
  | "samuel_decisions";

export interface MitchUiRow {
  id: string;
  orderReference: string;
  recipientInitials: string;
  destinationZone: string;
  dueAt: string;
  fulfillmentState: string;
  allocationState: string;
  itemCount: number;
  openExceptionCount: number;
  version: number;
}

const QUEUES: Array<{ key: MitchUiQueue; label: string }> = [
  { key: "new", label: "New" },
  { key: "awaiting_acknowledgement", label: "Awaiting ack" },
  { key: "due_today", label: "Due today" },
  { key: "picking", label: "Picking" },
  { key: "packed", label: "Packed" },
  { key: "label_required", label: "Label required" },
  { key: "shipped_today", label: "Shipped today" },
  { key: "exceptions", label: "Exceptions" },
  { key: "inventory_issues", label: "Inventory issues" },
  { key: "samuel_decisions", label: "Samuel decisions" },
];

function primaryAction(state: string): string {
  if (state === "awaiting_acknowledgement") return "Acknowledge";
  if (state === "acknowledged") return "Start picking";
  if (state === "picking") return "Mark packed";
  if (state === "label_required") return "Add shipping label";
  if (state === "ready_to_ship") return "Ship order";
  if (state === "exception") return "Open exception";
  return "Open order";
}

export function MitchPortal({
  rows,
  initialQueue = "awaiting_acknowledgement",
  onPrimaryAction,
  loading = false,
  error,
}: {
  rows: MitchUiRow[];
  initialQueue?: MitchUiQueue;
  onPrimaryAction?: (row: MitchUiRow) => void;
  loading?: boolean;
  error?: string | null;
}) {
  const [queue, setQueue] = useState<MitchUiQueue>(initialQueue);
  const [search, setSearch] = useState("");
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (row) =>
        !q ||
        row.orderReference.toLowerCase().includes(q) ||
        row.recipientInitials.toLowerCase().includes(q) ||
        row.destinationZone.toLowerCase().includes(q),
    );
  }, [rows, search]);

  return (
    <main className="ops-page mitch-page" data-testid="mitch-portal">
      <div className="ops-shell">
        <header className="ops-header">
          <div>
            <p className="ops-kicker">Mitch / fulfillment</p>
            <h1 className="ops-title">Today’s ship floor.</h1>
            <p className="ops-lead">One queue, one next action. Exact lots stay attached from pick through return.</p>
          </div>
          <span className="ops-status">{visible.length} waiting</span>
        </header>

        <nav className="ops-queue-tabs" aria-label="Fulfillment queues">
          {QUEUES.map((item) => (
            <button
              key={item.key}
              type="button"
              className="ops-queue-tab"
              aria-pressed={queue === item.key}
              onClick={() => setQueue(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <label>
          <span className="ops-kicker">Find an order</span>
          <input
            className="ops-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Order, initials, or destination"
          />
        </label>

        {loading ? (
          <div className="ops-state" role="status">Loading the fulfillment queue…</div>
        ) : error ? (
          <div className="ops-state" role="alert">{error}</div>
        ) : visible.length ? (
          <section className="mitch-list" aria-label={`${queue.replaceAll("_", " ")} orders`}>
            {visible.map((row) => (
              <article className="mitch-card" key={row.id}>
                <div className="mitch-card-top">
                  <div>
                    <p className="ops-kicker">Order</p>
                    <h2 className="mitch-card-ref">{row.orderReference}</h2>
                  </div>
                  <span className="ops-status" data-tone={row.openExceptionCount ? "danger" : undefined}>
                    {row.fulfillmentState.replaceAll("_", " ")}
                  </span>
                </div>
                <dl className="mitch-meta">
                  <div><dt>Recipient</dt><dd>{row.recipientInitials}</dd></div>
                  <div><dt>Destination</dt><dd>{row.destinationZone}</dd></div>
                  <div><dt>Due</dt><dd>{new Date(row.dueAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</dd></div>
                  <div><dt>Items</dt><dd>{row.itemCount}</dd></div>
                  <div><dt>Lot state</dt><dd>{row.allocationState}</dd></div>
                  <div><dt>Exceptions</dt><dd>{row.openExceptionCount}</dd></div>
                </dl>
                <div className="mitch-card-bottom">
                  <button type="button" className="ops-card-link">Note · Assistance · Escalate</button>
                  <button type="button" className="ops-primary" onClick={() => onPrimaryAction?.(row)}>
                    {primaryAction(row.fulfillmentState)}
                  </button>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <div className="ops-state" role="status">This queue is clear.</div>
        )}
      </div>
    </main>
  );
}
