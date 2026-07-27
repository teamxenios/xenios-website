// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const supa = vi.hoisted(() => {
  const events: string[] = [];
  const auth = {
    getSession: vi.fn(async () => ({
      data: { session: { access_token: "admin-access-token" } },
    })),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
    signInWithPassword: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => {
      events.push("supabase:sign-out");
      return { error: null };
    }),
  };
  return { auth, events };
});

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: async () => ({ auth: supa.auth }),
}));

import {
  registerAdminPreSignOutTask,
  useAdminSession,
  type AdminSession,
} from "./auth";

let currentSession: AdminSession | null = null;
let root: Root | null = null;
const disposers: Array<() => void> = [];

function SessionProbe() {
  currentSession = useAdminSession();
  return <output data-state={currentSession.state} />;
}

function session(): AdminSession {
  if (!currentSession) throw new Error("admin session probe not ready");
  return currentSession;
}

async function flush(rounds = 4) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(async () => {
  document.body.innerHTML = "";
  currentSession = null;
  supa.events.length = 0;
  vi.clearAllMocks();
  globalThis.fetch = vi.fn(async () => ({
    json: async () => ({ success: true, email: "admin@example.com" }),
  })) as any;
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<SessionProbe />));
  await flush();
  expect(session().state).toBe("ready");
});

afterEach(() => {
  while (disposers.length) disposers.pop()?.();
  if (root) act(() => root!.unmount());
  root = null;
});

describe("canonical admin pre-sign-out coordination", () => {
  it("awaits authenticated cleanup before Supabase sign-out", async () => {
    const cleanup = deferred();
    disposers.push(
      registerAdminPreSignOutTask(async () => {
        supa.events.push("cleanup:start");
        await cleanup.promise;
        supa.events.push("cleanup:done");
      }),
    );

    const signOutPromise = session().signOut();
    await Promise.resolve();
    expect(supa.events).toEqual(["cleanup:start"]);
    expect(supa.auth.signOut).not.toHaveBeenCalled();

    cleanup.resolve();
    await signOutPromise;

    expect(supa.events).toEqual([
      "cleanup:start",
      "cleanup:done",
      "supabase:sign-out",
    ]);
    expect(supa.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("fails closed when cleanup fails and permits a clean retry", async () => {
    const failure = new Error("admin_pre_sign_out_cleanup_failed");
    const disposeFailure = registerAdminPreSignOutTask(async () => {
      throw failure;
    });

    await expect(session().signOut()).rejects.toBe(failure);
    expect(supa.auth.signOut).not.toHaveBeenCalled();

    disposeFailure();
    await session().signOut();
    expect(supa.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent sign-out requests into one cleanup and one sign-out", async () => {
    const cleanup = deferred();
    const task = vi.fn(async () => cleanup.promise);
    disposers.push(registerAdminPreSignOutTask(task));

    const first = session().signOut();
    const second = session().signOut();
    expect(second).toBe(first);
    expect(task).toHaveBeenCalledTimes(1);

    cleanup.resolve();
    await Promise.all([first, second]);
    expect(supa.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("does not run a disposed page-local cleanup task", async () => {
    const task = vi.fn(async () => {});
    const dispose = registerAdminPreSignOutTask(task);
    dispose();

    await session().signOut();
    expect(task).not.toHaveBeenCalled();
    expect(supa.auth.signOut).toHaveBeenCalledTimes(1);
  });
});
