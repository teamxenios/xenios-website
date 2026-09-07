// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { principalKeyOf, usePrincipalBoundOperations, type BoundOperation } from "./principal-bound";

// A JWT-shaped token: header.payload.signature where payload carries a subject.
function jwt(sub: string, signature = "sig"): string {
  const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
  return `${b64('{"alg":"none"}')}.${b64(JSON.stringify({ sub }))}.${signature}`;
}

describe("principalKeyOf", () => {
  it("keys a JWT by its subject, so a same-account refresh keeps the same principal", () => {
    expect(principalKeyOf(jwt("user-a", "one"))).toBe("sub:user-a");
    expect(principalKeyOf(jwt("user-a", "two"))).toBe("sub:user-a");
    expect(principalKeyOf(jwt("user-b"))).toBe("sub:user-b");
  });

  it("keys an opaque token by itself, and null by null", () => {
    expect(principalKeyOf("preview-token-rep")).toBe("token:preview-token-rep");
    expect(principalKeyOf("a.b")).toBe("token:a.b");
    expect(principalKeyOf("x.!!!.y")).toBe("token:x.!!!.y");
    expect(principalKeyOf(null)).toBeNull();
    expect(principalKeyOf("")).toBeNull();
  });

  it("does not trust a malformed subject", () => {
    const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
    expect(principalKeyOf(`${b64("{}")}.${b64('{"sub":""}')}.s`)).toMatch(/^token:/u);
    expect(principalKeyOf(`${b64("{}")}.${b64('{"sub":42}')}.s`)).toMatch(/^token:/u);
  });
});

// ---------------------------------------------------------------------------
// The hook, driven through a tiny component so effects run for real.
// ---------------------------------------------------------------------------

let host: HTMLDivElement;
let root: Root;
let latestBegin: (() => BoundOperation | null) | null = null;

function Probe({ token }: { token: string | null }) {
  latestBegin = usePrincipalBoundOperations(token);
  return null;
}

async function render(token: string | null) {
  await act(async () => {
    root.render(<Probe token={token} />);
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  latestBegin = null;
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("usePrincipalBoundOperations", () => {
  it("refuses to start without a principal", async () => {
    await render(null);
    expect(latestBegin!()).toBeNull();
  });

  it("stays current for the same principal, including across a same-account token refresh", async () => {
    await render(jwt("a", "one"));
    const op = latestBegin!()!;
    expect(op.token).toBe(jwt("a", "one"));
    expect(op.isCurrent()).toBe(true);
    await render(jwt("a", "two"));
    expect(op.isCurrent()).toBe(true);
    expect(op.signal.aborted).toBe(false);
  });

  it("goes stale and aborts when the principal signs out", async () => {
    await render("preview-token-a");
    const op = latestBegin!()!;
    await render(null);
    expect(op.isCurrent()).toBe(false);
    expect(op.signal.aborted).toBe(true);
  });

  it("goes stale and aborts when another account signs in", async () => {
    await render(jwt("a"));
    const op = latestBegin!()!;
    await render(jwt("b"));
    expect(op.isCurrent()).toBe(false);
    expect(op.signal.aborted).toBe(true);
    // The new principal's operations are current.
    expect(latestBegin!()!.isCurrent()).toBe(true);
  });

  it("goes stale when the surface unmounts", async () => {
    await render("preview-token-a");
    const op = latestBegin!()!;
    await act(async () => root.unmount());
    root = createRoot(host);
    expect(op.isCurrent()).toBe(false);
    expect(op.signal.aborted).toBe(true);
  });

  it("an older operation is stale once a newer one starts on the same surface", async () => {
    await render("preview-token-a");
    const older = latestBegin!()!;
    const newer = latestBegin!()!;
    expect(older.isCurrent()).toBe(false);
    expect(newer.isCurrent()).toBe(true);
    // finish() only releases bookkeeping; it never revives a stale operation.
    older.finish();
    newer.finish();
    expect(older.isCurrent()).toBe(false);
    expect(newer.isCurrent()).toBe(true);
  });
});
