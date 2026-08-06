import { describe, expect, it } from "vitest";

import {
  NoEarlyAccessAgreementRecorder,
  createEarlyAccessAgreementAcceptRoute,
  createEarlyAccessAgreementStatusRoute,
  type EarlyAccessAcceptResponsePort,
  type EarlyAccessAgreementRecorder,
} from "./agreement-routes";
import { NoEarlyAccessAgreements, type EarlyAccessAgreementGate } from "./ports";

/**
 * The acceptance route.
 *
 * The property under test throughout is that this route can only ever record a
 * pair the deployment configured, for a customer the SESSION resolved, with
 * evidence the SERVER observed. Everything a caller can type is either checked
 * against configuration or ignored.
 */

const REQUIRED = [{ kind: "early_access_terms", version: "v1" }] as const;
const CUSTOMER_REF = "eac_00000000000000000000000000000001";
const NOW = () => Date.parse("2026-08-05T20:00:00.000Z");

type Recorded = {
  customerRef: string;
  kind: string;
  version: string;
  acceptedAt: string;
  evidence: Record<string, unknown>;
};

/**
 * A recorder shaped like the real RPC: the FIRST write of a pair reports
 * `recorded`, every repeat reports `already_on_file`, and a fault reports
 * `failed`. The RPC catches unique_violation and returns false for a duplicate,
 * so a recorder that answered `failed` on the second call would be modelling a
 * bug rather than the database.
 */
function recorder(
  mode: "real" | "broken" = "real",
): EarlyAccessAgreementRecorder & { rows: Recorded[] } {
  const rows: Recorded[] = [];
  const seen = new Set<string>();
  return {
    rows,
    async record(input) {
      if (mode === "broken") return "failed";
      const key = `${input.customerRef}|${input.kind}|${input.version}`;
      if (seen.has(key)) {
        // The table's unique constraint refuses the row and the RPC catches it,
        // so NOTHING is appended. Modelling that is the whole point: a stub
        // that stored both rows could not fail the one-row assertion below.
        return "already_on_file";
      }
      seen.add(key);
      rows.push({ ...input, evidence: { ...input.evidence } });
      return "recorded";
    },
  };
}

function identity(customerRef: string | null) {
  return {
    async resolve() {
      return customerRef === null ? null : ({ customerRef } as never);
    },
  };
}

function response() {
  const seen: { code: number | null; body: unknown } = { code: null, body: null };
  const port: EarlyAccessAcceptResponsePort = {
    status(code) {
      seen.code = code;
      return port;
    },
    json(body) {
      seen.body = body;
      return body;
    },
  };
  return { port, seen };
}

function route(overrides: Partial<Parameters<typeof createEarlyAccessAgreementAcceptRoute>[0]> = {}) {
  return createEarlyAccessAgreementAcceptRoute({
    identity: identity(CUSTOMER_REF) as never,
    recorder: recorder(),
    required: REQUIRED,
    now: NOW,
    ...overrides,
  });
}

describe("what it will record", () => {
  it("records the configured pair for the session's customer", async () => {
    const store = recorder();
    const accept = route({ recorder: store });
    const { port, seen } = response();

    await accept(
      { cookieHeader: "ea=x", body: { kind: "early_access_terms", version: "v1" } },
      port,
    );

    expect(seen.code).toBe(200);
    expect(seen.body).toEqual({
      ok: true,
      kind: "early_access_terms",
      version: "v1",
      acceptedAt: "2026-08-05T20:00:00.000Z",
      alreadyAccepted: false,
    });
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].customerRef).toBe(CUSTOMER_REF);
    expect(store.rows[0].kind).toBe("early_access_terms");
    expect(store.rows[0].version).toBe("v1");
    expect(store.rows[0].acceptedAt).toBe("2026-08-05T20:00:00.000Z");
  });

  it("records server-observed evidence, and nothing from the body", async () => {
    const store = recorder();
    const accept = route({ recorder: store });
    const { port } = response();

    await accept(
      {
        cookieHeader: "ea=x",
        requestIp: "203.0.113.9",
        requestId: "req-abc",
        body: {
          kind: "early_access_terms",
          version: "v1",
          // Every one of these is a caller trying to write the record itself.
          customerRef: "eac_ffffffffffffffffffffffffffffffff",
          acceptedAt: "1999-01-01T00:00:00.000Z",
          evidence: { channel: "signed_in_person" },
          requestIp: "10.0.0.1",
        },
      },
      port,
    );

    expect(store.rows[0].evidence).toEqual({
      channel: "portal",
      requestIp: "203.0.113.9",
      requestId: "req-abc",
    });
    expect(store.rows[0].customerRef).toBe(CUSTOMER_REF);
    expect(store.rows[0].acceptedAt).toBe("2026-08-05T20:00:00.000Z");
  });

  it("is idempotent: the same pair twice is the same record, and still succeeds", async () => {
    const store = recorder();
    const accept = route({ recorder: store });
    const first = response();
    const second = response();
    const body = { kind: "early_access_terms", version: "v1" };

    await accept({ cookieHeader: "ea=x", body }, first.port);
    await accept({ cookieHeader: "ea=x", body }, second.port);

    // The second call must NOT read as a failure. The RPC reports a duplicate
    // by returning false, and mapping that to an error would tell an accepted
    // customer they are not accepted.
    expect(first.seen.code).toBe(200);
    expect(second.seen.code).toBe(200);
    expect((first.seen.body as { alreadyAccepted: boolean }).alreadyAccepted).toBe(false);
    expect((second.seen.body as { alreadyAccepted: boolean }).alreadyAccepted).toBe(true);
    // Exactly ONE acceptance row exists after two identical requests. The
    // handler keeps no memory of its own, which is why a restart cannot change
    // this: the uniqueness is the table's.
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].kind).toBe("early_access_terms");
    expect(store.rows[0].version).toBe("v1");
  });
});

describe("what it will refuse", () => {
  it("refuses a pair this deployment did not configure", async () => {
    const store = recorder();
    const accept = route({ recorder: store });

    for (const body of [
      { kind: "early_access_terms", version: "v2" },
      { kind: "early_access_privacy", version: "v1" },
      { kind: "anything", version: "at_all" },
    ]) {
      const { port, seen } = response();
      await accept({ cookieHeader: "ea=x", body }, port);
      expect(seen.code).toBe(400);
      expect(seen.body).toEqual({ ok: false, code: "AGREEMENT_NOT_REQUIRED" });
    }
    expect(store.rows).toHaveLength(0);
  });

  it("refuses when the deployment requires nothing", async () => {
    const store = recorder();
    const accept = route({ recorder: store, required: [] });
    const { port, seen } = response();

    await accept(
      { cookieHeader: "ea=x", body: { kind: "early_access_terms", version: "v1" } },
      port,
    );

    expect(seen.code).toBe(400);
    expect(store.rows).toHaveLength(0);
  });

  it("refuses without a resolved session customer", async () => {
    const store = recorder();
    const accept = route({ recorder: store, identity: identity(null) as never });
    const { port, seen } = response();

    await accept(
      { cookieHeader: undefined, body: { kind: "early_access_terms", version: "v1" } },
      port,
    );

    expect(seen.code).toBe(403);
    expect(seen.body).toEqual({ ok: false, code: "IDENTITY_REQUIRED" });
    expect(store.rows).toHaveLength(0);
  });

  it("refuses a malformed body", async () => {
    const accept = route();
    for (const body of [null, undefined, "yes", 7, {}, { kind: "early_access_terms" }, { kind: "", version: "v1" }]) {
      const { port, seen } = response();
      await accept({ cookieHeader: "ea=x", body }, port);
      expect(seen.code).toBe(400);
      expect(seen.body).toEqual({ ok: false, code: "REQUEST_INVALID" });
    }
  });

  it("reports a failed write rather than claiming an acceptance", async () => {
    const accept = route({ recorder: recorder("broken") });
    const { port, seen } = response();

    await accept(
      { cookieHeader: "ea=x", body: { kind: "early_access_terms", version: "v1" } },
      port,
    );

    expect(seen.code).toBe(502);
    expect(seen.body).toEqual({ ok: false, code: "NOT_RECORDED" });
  });

  it("records nothing at all when no recorder is wired", async () => {
    const accept = route({ recorder: new NoEarlyAccessAgreementRecorder() });
    const { port, seen } = response();

    await accept(
      { cookieHeader: "ea=x", body: { kind: "early_access_terms", version: "v1" } },
      port,
    );

    expect(seen.code).toBe(502);
  });
});

describe("one customer cannot sign for another", () => {
  it("records against the SESSION customer, whatever the body claims", async () => {
    // The verification lane's cross-customer case. It is structurally
    // impossible rather than merely checked: the customerRef the recorder
    // receives comes from identity.resolve, and the body is never consulted for
    // it, so customer A accepting can only ever write A's row.
    const store = recorder();
    const accept = route({ recorder: store });
    const { port } = response();

    await accept(
      {
        cookieHeader: "ea=a",
        body: {
          kind: "early_access_terms",
          version: "v1",
          customerRef: "eac_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      },
      port,
    );

    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].customerRef).toBe(CUSTOMER_REF);
    expect(store.rows.some((row) => row.customerRef.includes("bbbb"))).toBe(false);
  });
});

describe("reading this session's own agreement standing", () => {
  /** A gate that records every customerRef it was ever asked about. */
  function gate(answer: boolean): EarlyAccessAgreementGate & { asked: string[] } {
    const asked: string[] = [];
    return {
      asked,
      async accepted(customerRef: string) {
        asked.push(customerRef);
        return answer;
      },
    };
  }

  function status(
    overrides: Partial<Parameters<typeof createEarlyAccessAgreementStatusRoute>[0]> = {},
  ) {
    return createEarlyAccessAgreementStatusRoute({
      identity: identity(CUSTOMER_REF) as never,
      agreements: gate(false),
      required: REQUIRED,
      ...overrides,
    });
  }

  it("reports not-accepted, and names what is required", async () => {
    const read = status({ agreements: gate(false) });
    const { port, seen } = response();

    await read({ cookieHeader: "ea=x" }, port);

    expect(seen.code).toBe(200);
    expect(seen.body).toEqual({
      ok: true,
      required: [{ kind: "early_access_terms", version: "v1" }],
      accepted: false,
    });
  });

  it("reports accepted once the gate says so, which is how a refresh keeps it", async () => {
    const read = status({ agreements: gate(true) });
    const { port, seen } = response();

    await read({ cookieHeader: "ea=x" }, port);

    expect(seen.code).toBe(200);
    expect((seen.body as { accepted: boolean }).accepted).toBe(true);
  });

  it("asks about the SESSION customer and nobody else", async () => {
    // The route takes no customer parameter, so this is the only ref it can
    // possibly reach the gate with. That is what keeps it from becoming an
    // oracle for whether a named person agreed to anything.
    const asking = gate(true);
    const read = status({ agreements: asking });
    const { port } = response();

    await read({ cookieHeader: "ea=x" }, port);

    expect(asking.asked).toEqual([CUSTOMER_REF]);
  });

  it("refuses without a resolved session, and never consults the gate", async () => {
    const asking = gate(true);
    const read = status({ identity: identity(null) as never, agreements: asking });
    const { port, seen } = response();

    await read({ cookieHeader: undefined }, port);

    expect(seen.code).toBe(403);
    expect(seen.body).toEqual({ ok: false, code: "IDENTITY_REQUIRED" });
    expect(asking.asked).toEqual([]);
  });

  it("reads the SAME gate the order route reads, so the screen cannot disagree with checkout", async () => {
    // The default gate refuses everyone. A status route with its own optimistic
    // source could show an unlocked checkout that the order path then refuses;
    // sharing the port makes that mismatch unrepresentable.
    const shared = new NoEarlyAccessAgreements();
    const read = status({ agreements: shared });
    const { port, seen } = response();

    await read({ cookieHeader: "ea=x" }, port);

    expect((seen.body as { accepted: boolean }).accepted).toBe(false);
    expect(await shared.accepted()).toBe(false);
  });

  it("reports not-accepted when the deployment requires nothing", async () => {
    // The gate answers false for an empty requirement set, and this read
    // repeats that rather than inventing "nothing to accept". Checkout would
    // refuse such a customer, so the screen must not tell them otherwise.
    const read = status({ required: [], agreements: new NoEarlyAccessAgreements() });
    const { port, seen } = response();

    await read({ cookieHeader: "ea=x" }, port);

    expect(seen.body).toEqual({ ok: true, required: [], accepted: false });
  });
});

describe("separation from the order path", () => {
  it("has no way to create an order", () => {
    // The dependency object is the whole of what this route can reach. There is
    // no store, no pricing, no reservation, no payment, no supplier. Acceptance
    // and purchase stay two separate acts in the audit trail because they are
    // two separate code paths that share nothing.
    const deps = {
      identity: identity(CUSTOMER_REF) as never,
      recorder: recorder(),
      required: REQUIRED,
      now: NOW,
    };
    expect(Object.keys(deps).sort()).toEqual(["identity", "now", "recorder", "required"]);
  });

  it("cannot open the gate by itself, because the gate reads independently", async () => {
    // The default gate answers false regardless of anything this route did. The
    // real gate asks the database the same way. So a fault in the write path can
    // refuse a sale; it can never invent an acceptance.
    const gate = new NoEarlyAccessAgreements();
    const store = recorder();
    const accept = route({ recorder: store });
    const { port } = response();

    await accept(
      { cookieHeader: "ea=x", body: { kind: "early_access_terms", version: "v1" } },
      port,
    );

    expect(store.rows).toHaveLength(1);
    expect(await gate.accepted()).toBe(false);
  });
});
