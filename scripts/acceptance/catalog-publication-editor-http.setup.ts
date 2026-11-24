import { afterAll } from "vitest";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://127.0.0.1/", pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
let outcome: { domClosed: boolean; globalsRestored: boolean } | null = null;
let retainedFailure: AggregateError | null = null;
const sameDescriptor = (a: PropertyDescriptor | undefined, b: PropertyDescriptor | undefined) => a === b || !!a && !!b && ["value", "writable", "get", "set", "enumerable", "configurable"].every(key => (a as any)[key] === (b as any)[key]);
function install(name: string, value: unknown) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
function cleanupDom() {
  if (outcome) { if (retainedFailure) throw retainedFailure; return outcome; }
  const errors: unknown[] = [];
  try { dom.window.close(); } catch (error) { errors.push(error); }
  for (const [name, descriptor] of [...previous].reverse()) {
    try { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else if (!Reflect.deleteProperty(globalThis, name)) throw Error("Global restore refused: " + name); }
    catch (error) { errors.push(error); }
  }
  outcome = { domClosed: dom.window.document === undefined, globalsRestored: [...previous].every(([name, descriptor]) => sameDescriptor(Object.getOwnPropertyDescriptor(globalThis, name), descriptor)) };
  if (!outcome.domClosed || !outcome.globalsRestored) errors.push(Error("Owned DOM/global release unconfirmed"));
  if (errors.length) { retainedFailure = new AggregateError(errors, "Owned DOM cleanup failed; every finalizer attempted"); throw retainedFailure; }
  return outcome;
}
// Armed before installing any globals; also runs if the test module fails to load.
// Repeated hook entry returns the same outcome; it never retries an uncertain close.
afterAll(() => { cleanupDom(); });
try {
  for (const name of ["window", "document", "navigator", "HTMLElement", "HTMLSelectElement", "HTMLTextAreaElement", "Event", "CustomEvent", "MutationObserver", "Node", "Text"] as const) install(name, name === "window" ? dom.window : dom.window[name]);
  install("IS_REACT_ACT_ENVIRONMENT", true);
  install("__qaCleanupDom", cleanupDom);
} catch (primary) {
  const errors: unknown[] = [primary];
  try { cleanupDom(); } catch (error) { errors.push(error); }
  throw new AggregateError(errors, "DOM setup failed; cleanup retained");
}
