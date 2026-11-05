import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { requestBarAction, requestBarKeyboardOffset, type RequestBarState } from "./persistent-request-bar-model";
import "./persistent-request-bar.css";

export interface RequestBarLine {
  readonly key: string;
  readonly name: string;
  readonly specification: string;
  readonly quantity: number;
}
export interface PersistentRequestBarProps {
  readonly state: RequestBarState;
  readonly lines: readonly RequestBarLine[];
  readonly contactFormId: string;
  readonly onContinue: () => void;
  readonly onSubmit: () => void;
}

/** One passive read-only summary + a duplicate entry to EXISTING guarded actions.
 * Never persists a draft, computes a quote, accepts consent, or submits on mount.
 * It is mounted only for an active request wizard, not receipt/recovery screens.
 */
export function PersistentRequestBar({ state, lines, contactFormId, onContinue, onSubmit }: PersistentRequestBarProps) {
  const hintId = useId();
  const dock = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(144);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const action = requestBarAction(state);
  const units = lines.reduce((sum, line) => sum + line.quantity, 0);
  useEffect(() => { setBody(document.body); }, []);

  useEffect(() => {
    if (!body || !dock.current) return;
    const element = dock.current;
    const measure = () => {
      const next = Math.ceil(element.getBoundingClientRect().height);
      if (Number.isFinite(next) && next > 0) setHeight(next);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [body]);

  useEffect(() => {
    if (!body) return;
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const viewport = window.visualViewport;
        const active = document.activeElement;
        // Only text-editing controls cause a keyboard offset. Native select menus
        // and checkbox focus must not move the fixed bar.
        const input = active instanceof HTMLInputElement && !["button", "submit", "reset", "checkbox", "radio", "file", "range", "color", "hidden"].includes(active.type);
        const editable = input || active instanceof HTMLTextAreaElement
          || (active instanceof HTMLElement && active.isContentEditable);
        setKeyboardOffset(viewport ? requestBarKeyboardOffset(window.innerHeight,
          viewport.height, viewport.offsetTop, viewport.scale, editable) : 0);
      });
    };
    const viewport = window.visualViewport;
    update();
    window.addEventListener("resize", update);
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, [body]);

  function activate() {
    if (action.disabled) return;
    if (state.step === "products") onContinue();
    else if (state.step === "review") onSubmit();
    // Contact uses native form= association + HTML constraint validation.
  }
  return <>
    <div aria-hidden="true" data-testid="request-action-bar-spacer"
      className="xenios-request-dock-spacer" style={{ height: height + 16 }} />
    {body && <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
      {createPortal(
        <div ref={dock} className="xenios-request-dock" data-testid="request-action-bar"
          style={{ bottom: keyboardOffset }} role="region" aria-label="Request actions">
          <div className="xenios-request-dock__inner">
            <div className="xenios-request-dock__status" aria-live="polite" aria-atomic="true">
              <strong>Your request</strong>
              <span>{lines.length} {lines.length === 1 ? "variant" : "variants"} · {units} requested {units === 1 ? "unit" : "units"}</span>
            </div>
            <div className="xenios-request-dock__buttons">
              <DialogTrigger asChild>
                <button type="button" className="xenios-request-dock__summary"
                  data-testid="request-action-bar-summary">View request ({lines.length})</button>
              </DialogTrigger>
              <button type={action.type} form={action.type === "submit" ? contactFormId : undefined}
                className="xenios-request-dock__primary" data-testid="request-action-bar-primary"
                disabled={action.disabled} aria-describedby={hintId}
                onClick={action.type === "button" ? activate : undefined}>{action.label}</button>
            </div>
            <p id={hintId} className="xenios-request-dock__hint">{action.hint}</p>
          </div>
        </div>, body)}
      <DialogContent className="xenios-request-dock-dialog max-h-[calc(100dvh_-_2rem)] w-[calc(100vw_-_2rem)] min-w-0 overflow-y-auto rounded-xl bg-paper text-ink">
        <DialogTitle className="break-words pr-8">Your selected request items</DialogTitle>
        <DialogDescription>
          Review your selections without leaving the form. This is not an approved order or a final quote.
        </DialogDescription>
        {lines.length ? <ul className="xenios-request-dock-dialog__items">
          {lines.map((line) => <li key={line.key}>
            <strong>{line.name}</strong>
            {line.specification && <span>{line.specification}</span>}
            <span>Requested quantity: {line.quantity}</span>
          </li>)}
        </ul> : <p>No items selected yet. Return to the catalog and add an eligible item.</p>}
        <p>Final quantities, prices, availability and any required clinical review are confirmed separately.</p>
        <DialogClose asChild><button type="button" className="xenios-request-dock__summary">Return to request</button></DialogClose>
      </DialogContent>
    </Dialog>}
  </>;
}
