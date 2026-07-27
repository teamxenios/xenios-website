import { useMemo, useState, type FormEvent } from "react";
import type {
  InventoryLotAdmin,
  InventoryMovementType,
  InventorySourceBucket,
} from "@shared/research/inventory-admin";
import {
  ResearchEmptyState,
  ResearchErrorState,
  ResearchLoadingState,
  ResearchStatusBadge,
} from "../../ui/kit";
import {
  applyInventoryMovement,
  createInventoryLot,
  listInventoryLots,
  setInventoryLotDisposition,
} from "../../adapters/inventory-admin";
import { useAdminResource } from "./auth";
import { AdminScreen } from "./AdminResearchHome";

const inputClass = "input-field w-full";
const labelClass = "form-label";

function messageFor(kind: string, code?: string): string {
  if (kind === "denied") return `The server refused this update${code ? ` (${code})` : ""}.`;
  if (kind === "unavailable") return "Inventory administration is not registered yet.";
  return "The update could not be saved. No quantity was changed.";
}

export default function InventoryLotsAdmin() {
  return (
    <AdminScreen
      title="Inventory & lots"
      lead="Exact receiving, lot status, and append-only quantity movements. Counts change only through recorded commands."
    >
      {(token) => <InventoryLotsBody token={token} />}
    </AdminScreen>
  );
}

export function InventoryLotsBody({ token }: { token: string }) {
  const resource = useAdminResource<{ ok: true; lots: InventoryLotAdmin[] }>(
    token,
    listInventoryLots,
  );
  const [selectedId, setSelectedId] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const selected = useMemo(
    () => resource.data?.lots.find((lot) => lot.id === selectedId) ?? null,
    [resource.data, selectedId],
  );

  if (resource.state === "loading") return <ResearchLoadingState label="Loading inventory lots" />;
  if (resource.state === "error") {
    return <ResearchErrorState message={resource.message} onRetry={resource.reload} />;
  }
  if (resource.state !== "ok") {
    return (
      <ResearchEmptyState
        title="Inventory administration is not connected."
        body="Website 2 must register the focused server module and route. No browser fallback can change inventory."
      />
    );
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const result = await createInventoryLot(token, {
      lotCode: form.get("lotCode"),
      sku: form.get("sku"),
      productId: form.get("productId") || null,
      variantId: form.get("variantId") || null,
      owner: form.get("owner"),
      storageLocation: form.get("storageLocation"),
      supplierReference: form.get("supplierReference"),
      manufacturedDate: form.get("manufacturedDate") || null,
      expiryDate: form.get("expiryDate"),
      retestDate: form.get("retestDate") || null,
      shelfLifeSource: form.get("shelfLifeSource"),
      idempotencyKey: crypto.randomUUID(),
    });
    if (result.kind !== "ok") {
      setFeedback({ tone: "error", text: messageFor(result.kind, "code" in result ? result.code : undefined) });
      return;
    }
    formElement.reset();
    setSelectedId(result.data.lot.id);
    setFeedback({ tone: "success", text: "Lot created in quarantine. Receive and approve it before release." });
    resource.reload();
  }

  async function handleMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setFeedback(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const movementType = String(form.get("movementType")) as InventoryMovementType;
    const sourceValue = String(form.get("sourceBucket") ?? "");
    const result = await applyInventoryMovement(token, selected.id, {
      movementType,
      quantity: Number(form.get("quantity")),
      sourceBucket: sourceValue ? sourceValue as InventorySourceBucket : null,
      expectedVersion: selected.version,
      idempotencyKey: crypto.randomUUID(),
      reason: String(form.get("reason")),
    });
    if (result.kind !== "ok") {
      setFeedback({ tone: "error", text: messageFor(result.kind, "code" in result ? result.code : undefined) });
      return;
    }
    formElement.reset();
    setFeedback({ tone: "success", text: "Movement recorded. The lot version and exact counts advanced together." });
    resource.reload();
  }

  async function handleDisposition(disposition: string) {
    if (!selected) return;
    setFeedback(null);
    const result = await setInventoryLotDisposition(token, selected.id, {
      disposition,
      expectedVersion: selected.version,
      idempotencyKey: crypto.randomUUID(),
      reason: disposition === "available"
        ? "Exact-lot quality review approved for release"
        : "Operator applied a controlled lot status",
    });
    if (result.kind !== "ok") {
      setFeedback({ tone: "error", text: messageFor(result.kind, "code" in result ? result.code : undefined) });
      return;
    }
    setFeedback({ tone: "success", text: `Lot status changed to ${disposition.replaceAll("_", " ")}.` });
    resource.reload();
  }

  const lots = resource.data?.lots ?? [];
  return (
    <div className="grid gap-6">
      {feedback && (
        <div
          role={feedback.tone === "error" ? "alert" : "status"}
          aria-live="polite"
          className="card"
        >
          <p className="body-s">{feedback.text}</p>
        </div>
      )}

      <section className="card" aria-labelledby="inventory-lot-list-title">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="mono-label text-ink-mute">Current records</p>
            <h2 id="inventory-lot-list-title" className="heading-s mt-2">Lots</h2>
          </div>
          <ResearchStatusBadge
            label={`${lots.length} ${lots.length === 1 ? "lot" : "lots"}`}
            tone="neutral"
          />
        </div>
        {lots.length === 0 ? (
          <div className="mt-5">
            <ResearchEmptyState
              title="LOT IDENTIFIER REQUIRED"
              body="Create the verified lot record before receiving inventory or attaching an exact-lot COA."
            />
          </div>
        ) : (
          <div className="grid gap-3 mt-5" role="list">
            {lots.map((lot) => (
              <button
                key={lot.id}
                type="button"
                className="card text-left w-full focus-ring"
                aria-pressed={selectedId === lot.id}
                onClick={() => setSelectedId(lot.id)}
                role="listitem"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="mono-label text-ink-mute">{lot.sku}</p>
                    <p className="body-m font-700 mt-1">{lot.lotCode}</p>
                    <p className="body-s text-ink-2 mt-1">
                      {lot.storageLocation ?? "INVENTORY LOCATION REQUIRED"}
                    </p>
                  </div>
                  <ResearchStatusBadge
                    label={lot.allocatable ? "Allocatable" : lot.disposition.replaceAll("_", " ")}
                    tone={lot.allocatable ? "success" : "warning"}
                  />
                </div>
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 body-s tabular">
                  <div><dt className="text-ink-mute">Available</dt><dd>{lot.quantityAvailable}</dd></div>
                  <div><dt className="text-ink-mute">Reserved</dt><dd>{lot.quantityReserved}</dd></div>
                  <div><dt className="text-ink-mute">Quarantined</dt><dd>{lot.quantityQuarantined}</dd></div>
                  <div><dt className="text-ink-mute">Damaged</dt><dd>{lot.quantityDamaged}</dd></div>
                </dl>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <form className="card grid gap-4" onSubmit={handleCreate}>
          <div>
            <p className="mono-label text-ink-mute">New quarantined record</p>
            <h2 className="heading-s mt-2">Create lot</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Lot identifier" name="lotCode" required />
            <Field label="SKU" name="sku" required />
            <Field label="Product ID (UUID)" name="productId" required />
            <Field label="Variant ID (UUID)" name="variantId" required />
            <Field label="Inventory location" name="storageLocation" required />
            <Field label="Supplier reference" name="supplierReference" required />
            <Field label="Manufactured date" name="manufacturedDate" type="date" />
            <Field label="Expiration date" name="expiryDate" type="date" required />
            <Field label="Retest date" name="retestDate" type="date" />
            <label className="grid gap-2">
              <span className={labelClass}>Owner</span>
              <select className={inputClass} name="owner" defaultValue="xenios">
                <option value="xenios">Xenios</option>
                <option value="mitch">Mitch</option>
              </select>
            </label>
            <label className="grid gap-2 sm:col-span-2">
              <span className={labelClass}>Shelf-life source</span>
              <select className={inputClass} name="shelfLifeSource" defaultValue="supplier_document">
                <option value="supplier_document">Supplier document</option>
                <option value="coa">Exact-lot COA</option>
              </select>
            </label>
          </div>
          <button type="submit" className="btn btn-primary justify-self-start">
            Create quarantined lot
          </button>
        </form>

        <form className="card grid gap-4" onSubmit={handleMovement}>
          <div>
            <p className="mono-label text-ink-mute">Append-only command</p>
            <h2 className="heading-s mt-2">Record movement</h2>
            <p className="body-s text-ink-2 mt-2">
              {selected ? `Selected: ${selected.lotCode}, version ${selected.version}.` : "Select a lot first."}
            </p>
          </div>
          <label className="grid gap-2">
            <span className={labelClass}>Movement</span>
            <select className={inputClass} name="movementType" disabled={!selected}>
              <option value="receipt">Receipt</option>
              <option value="reserve">Reserve</option>
              <option value="release">Release reservation</option>
              <option value="adjust">Adjust available quantity by signed delta</option>
              <option value="quarantine">Move to quarantine</option>
              <option value="quarantine_release">Release from quarantine</option>
              <option value="damage">Record damage</option>
              <option value="reconcile">Reconcile available quantity by delta</option>
            </select>
          </label>
          <Field label="Quantity or signed reconciliation delta" name="quantity" type="number" required disabled={!selected} />
          <label className="grid gap-2">
            <span className={labelClass}>Exact source bucket when required</span>
            <select className={inputClass} name="sourceBucket" disabled={!selected}>
              <option value="">Not applicable</option>
              <option value="available">Available</option>
              <option value="reserved">Reserved</option>
              <option value="quarantined">Quarantined</option>
            </select>
          </label>
          <label className="grid gap-2">
            <span className={labelClass}>Reason</span>
            <textarea className={inputClass} name="reason" minLength={3} maxLength={500} required disabled={!selected} />
          </label>
          <button type="submit" className="btn btn-primary justify-self-start" disabled={!selected}>
            Record movement
          </button>
          {selected && (
            <div className="border-t border-line pt-4">
              <p className="mono-label text-ink-mute">Controlled status</p>
              <div className="flex gap-3 flex-wrap mt-3">
                <button type="button" className="btn btn-secondary min-h-11" onClick={() => handleDisposition("available")}>
                  Release lot
                </button>
                <button type="button" className="btn btn-ghost min-h-11" onClick={() => handleDisposition("quarantined")}>
                  Quarantine lot
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  disabled = false,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className={labelClass}>{label}{required ? " *" : ""}</span>
      <input
        className={inputClass}
        name={name}
        type={type}
        required={required}
        disabled={disabled}
      />
    </label>
  );
}
