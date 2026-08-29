import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import ws from "ws";

import {
  createPreviewSupabaseRequestHandler,
  PREVIEW_NONCE_TTL_MS,
  PREVIEW_PRIVATE_ACCESS_ROLE,
  PREVIEW_SESSION_TTL_MS,
} from "./preview-supabase-fixture.mjs";

const OWNER = "00000000-0000-4000-8000-000000000001";
const SERVICE_ROLE = "sb_secret_preview_placeholder";
const NONCE = "a".repeat(64);
const SESSION = "b".repeat(64);
const servers = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }));
});

async function serve(options = {}) {
  const server = createServer(createPreviewSupabaseRequestHandler({
    ownerId: OWNER,
    serviceRoleKey: SERVICE_ROLE,
    ...options,
  }));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  servers.push(server);
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function rpc(origin, name, body, headers = {}) {
  return fetch(`${origin}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE,
      authorization: `Bearer ${SERVICE_ROLE}`,
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const common = { p_owner_id: OWNER, p_access_role: PREVIEW_PRIVATE_ACCESS_ROLE };

describe("preview Supabase session fixture", () => {
  it("performs the one-time nonce exchange and session lifecycle with database-shaped scalars", async () => {
    let clockMs = Date.parse("2026-08-29T12:00:00.000Z");
    const origin = await serve({ now: () => clockMs });

    const issued = await rpc(origin, "research_private_early_access_issue_nonce", {
      ...common,
      p_nonce_hash: NONCE,
    });
    expect(issued.status).toBe(200);
    expect(await issued.json()).toBe(new Date(clockMs + PREVIEW_NONCE_TTL_MS).toISOString());

    const exchanged = await rpc(origin, "research_private_early_access_exchange_nonce", {
      ...common,
      p_nonce_hash: NONCE,
      p_session_hash: SESSION,
    });
    expect(exchanged.status).toBe(200);
    expect(await exchanged.json()).toBe(new Date(clockMs + PREVIEW_SESSION_TTL_MS).toISOString());

    const replay = await rpc(origin, "research_private_early_access_exchange_nonce", {
      ...common,
      p_nonce_hash: NONCE,
      p_session_hash: "c".repeat(64),
    });
    expect(await replay.json()).toBeNull();

    const active = await rpc(origin, "research_private_early_access_session_active", {
      ...common,
      p_session_hash: SESSION,
    });
    expect(await active.json()).toBe(true);

    const revoked = await rpc(origin, "research_private_early_access_revoke_session", {
      ...common,
      p_session_hash: SESSION,
    });
    expect(await revoked.json()).toBe(true);
    const inactive = await rpc(origin, "research_private_early_access_session_active", {
      ...common,
      p_session_hash: SESSION,
    });
    expect(await inactive.json()).toBe(false);

    clockMs += PREVIEW_SESSION_TTL_MS + 1;
    const expired = await rpc(origin, "research_private_early_access_session_active", {
      ...common,
      p_session_hash: SESSION,
    });
    expect(await expired.json()).toBe(false);
  });

  it("retains expired hash tombstones and refuses reuse like the durable SQL", async () => {
    let clockMs = Date.parse("2026-08-29T12:00:00.000Z");
    const origin = await serve({ now: () => clockMs });
    expect(await (await rpc(origin, "research_private_early_access_issue_nonce", {
      ...common,
      p_nonce_hash: NONCE,
    })).json()).toEqual(expect.any(String));
    expect(await (await rpc(origin, "research_private_early_access_exchange_nonce", {
      ...common,
      p_nonce_hash: NONCE,
      p_session_hash: SESSION,
    })).json()).toEqual(expect.any(String));

    clockMs += PREVIEW_SESSION_TTL_MS + 1;
    expect(await (await rpc(origin, "research_private_early_access_issue_nonce", {
      ...common,
      p_nonce_hash: NONCE,
    })).json()).toBeNull();

    const secondNonce = "e".repeat(64);
    expect(await (await rpc(origin, "research_private_early_access_issue_nonce", {
      ...common,
      p_nonce_hash: secondNonce,
    })).json()).toEqual(expect.any(String));
    expect(await (await rpc(origin, "research_private_early_access_exchange_nonce", {
      ...common,
      p_nonce_hash: secondNonce,
      p_session_hash: SESSION,
    })).json()).toBeNull();
  });

  it("refuses future-issued nonce and session rows after a clock rollback", async () => {
    const issuedAtMs = Date.parse("2026-08-29T12:00:00.000Z");
    let clockMs = issuedAtMs;
    const origin = await serve({ now: () => clockMs });
    await (await rpc(origin, "research_private_early_access_issue_nonce", {
      ...common,
      p_nonce_hash: NONCE,
    })).json();

    clockMs = issuedAtMs - 1;
    expect(await (await rpc(origin, "research_private_early_access_exchange_nonce", {
      ...common,
      p_nonce_hash: NONCE,
      p_session_hash: SESSION,
    })).json()).toBeNull();

    clockMs = issuedAtMs;
    expect(await (await rpc(origin, "research_private_early_access_exchange_nonce", {
      ...common,
      p_nonce_hash: NONCE,
      p_session_hash: SESSION,
    })).json()).toEqual(expect.any(String));
    clockMs = issuedAtMs - 1;
    expect(await (await rpc(origin, "research_private_early_access_session_active", {
      ...common,
      p_session_hash: SESSION,
    })).json()).toBe(false);
  });

  it("matches the actual server-side Supabase RPC client's wire shape", async () => {
    const origin = await serve();
    const client = createClient(origin, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: ws },
    });
    const issued = await client.rpc("research_private_early_access_issue_nonce", {
      ...common,
      p_nonce_hash: NONCE,
    });
    expect(issued.error).toBeNull();
    expect(issued.data).toEqual(expect.any(String));

    const exchanged = await client.rpc("research_private_early_access_exchange_nonce", {
      ...common,
      p_nonce_hash: NONCE,
      p_session_hash: SESSION,
    });
    expect(exchanged.error).toBeNull();
    expect(exchanged.data).toEqual(expect.any(String));

    const active = await client.rpc("research_private_early_access_session_active", {
      ...common,
      p_session_hash: SESSION,
    });
    expect(active).toMatchObject({ data: true, error: null });
  });

  it("refuses every non-session mutation and requires the local service-role headers", async () => {
    const origin = await serve();
    const commerce = await rpc(origin, "research_early_access_create_order", {});
    expect(commerce.status).toBe(503);
    expect(await commerce.json()).toMatchObject({ code: "preview_write_refused" });

    const missingRole = await rpc(origin, "research_private_early_access_issue_nonce", {
      ...common,
      p_nonce_hash: NONCE,
    }, { authorization: "Bearer wrong" });
    expect(missingRole.status).toBe(403);
    expect(await missingRole.json()).toMatchObject({ code: "preview_service_role_refused" });
  });

  it("returns fail-closed scalars for malformed hashes, owner drift, and extra arguments", async () => {
    const origin = await serve();
    const badHash = await rpc(origin, "research_private_early_access_issue_nonce", {
      ...common,
      p_nonce_hash: "not-a-hash",
    });
    expect(await badHash.json()).toBeNull();

    const wrongOwner = await rpc(origin, "research_private_early_access_session_active", {
      ...common,
      p_owner_id: "00000000-0000-4000-8000-000000000002",
      p_session_hash: SESSION,
    });
    expect(await wrongOwner.json()).toBe(false);

    const extra = await rpc(origin, "research_private_early_access_session_active", {
      ...common,
      p_session_hash: SESSION,
      raw_token: "must-never-be-accepted",
    });
    expect(await extra.json()).toBe(false);
  });

  it("bounds request bodies and retained state", async () => {
    const origin = await serve({ bodyLimitBytes: 256, stateLimit: 1 });
    const oversized = await fetch(`${origin}/rest/v1/rpc/research_private_early_access_issue_nonce`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE,
        authorization: `Bearer ${SERVICE_ROLE}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ padding: "x".repeat(512) }),
    });
    expect(oversized.status).toBe(413);

    const first = await rpc(origin, "research_private_early_access_issue_nonce", {
      ...common,
      p_nonce_hash: NONCE,
    });
    expect(await first.json()).toEqual(expect.any(String));
    const capped = await rpc(origin, "research_private_early_access_issue_nonce", {
      ...common,
      p_nonce_hash: "d".repeat(64),
    });
    expect(await capped.json()).toBeNull();
  });
});
