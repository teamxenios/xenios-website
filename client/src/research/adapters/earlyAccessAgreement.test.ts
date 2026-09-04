import { describe, expect, it } from "vitest";

import {
  acceptEarlyAccessAgreement,
  EARLY_ACCESS_AGREEMENT_ACCEPT_PATH,
  EARLY_ACCESS_AGREEMENT_STATUS_PATH,
  loadEarlyAccessAgreementState,
  loadResearchUsePolicy,
  RESEARCH_POLICIES_PATH,
} from "./earlyAccessAgreement";
import type { ApiResult } from "../lib/api";

/**
 * The agreement adapter.
 *
 * The property under test throughout is that the browser contributes NOTHING
 * to the record: not who agreed, not when, not the evidence. It names the
 * exact pair returned by the server and carries the server's answers back.
 */

const AGREEMENT = Object.freeze({ kind: "early_access_terms", version: "v1" });
const FUTURE_AGREEMENT = Object.freeze({
  kind: "research_pilot_terms",
  version: "2026.09",
});

const POLICIES = {
  "research-use": {
    title: "Research Use Policy",
    updated: "July 2026",
    agreement: AGREEMENT,
    sections: [
      {
        heading: "Purpose",
        paragraphs: [
          "Research materials listed through xenios are offered solely for legitimate nonclinical research, analytical, laboratory, or product-development purposes. They are not offered for human or veterinary use.",
        ],
      },
      {
        heading: "Prohibited use",
        paragraphs: ["A purchaser may not ingest, inject, administer, prescribe, dispense, recommend, or distribute research materials for human or veterinary use."],
        bullets: ["No personal use", "No client or patient use"],
      },
    ],
  },
  terms: { title: "Terms of Service", updated: "July 2026", sections: [{ heading: "Draft status", paragraphs: ["This starter language is an operational draft."] }] },
  privacy: { title: "Privacy Policy", updated: "July 2026", sections: [{ heading: "Draft status", paragraphs: ["This starter privacy language must be aligned."] }] },
};

function ok<T>(data: T): ApiResult<T> {
  return { kind: "ok", data };
}

describe("reading the policy", () => {
  it("asks the public policies endpoint and returns the research-use document", async () => {
    const paths: string[] = [];
    const result = await loadResearchUsePolicy(async (path) => {
      paths.push(path);
      return ok({ policies: POLICIES }) as never;
    });

    expect(paths).toEqual([RESEARCH_POLICIES_PATH]);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.policy.title).toBe("Research Use Policy");
    expect(result.policy.updated).toBe("July 2026");
    expect(result.policy.agreement).toEqual(AGREEMENT);
    expect(result.policy.sections).toHaveLength(2);
    expect(result.policy.sections[0].paragraphs[0]).toContain(
      "They are not offered for human or veterinary use.",
    );
    expect(result.policy.sections[1].bullets).toEqual([
      "No personal use",
      "No client or patient use",
    ]);
  });

  it("carries the served words across unchanged, and adds none of its own", async () => {
    // The adapter must never author policy text. Everything rendered has to be
    // traceable to the response, or a customer could agree to wording this
    // repository invented.
    const result = await loadResearchUsePolicy(async () => ok({ policies: POLICIES }) as never);
    if (result.kind !== "ok") throw new Error("expected ok");

    const served = POLICIES["research-use"];
    expect(result.policy.sections.map((section) => section.heading)).toEqual(
      served.sections.map((section) => section.heading),
    );
    for (const [index, section] of result.policy.sections.entries()) {
      expect([...section.paragraphs]).toEqual(served.sections[index].paragraphs);
    }
  });

  it("is unreadable rather than blank when the document has no content", async () => {
    for (const policies of [
      { "research-use": { title: "Research Use Policy", agreement: AGREEMENT, sections: [] } },
      { "research-use": { title: "", agreement: AGREEMENT, sections: [{ heading: "x", paragraphs: ["y"] }] } },
    ]) {
      const result = await loadResearchUsePolicy(async () => ok({ policies }) as never);
      expect(result.kind).toBe("unreadable");
    }
  });

  it("reports a missing research-use policy as missing, not as an empty one", async () => {
    const result = await loadResearchUsePolicy(async () => ok({ policies: { terms: POLICIES.terms } }) as never);
    expect(result.kind).toBe("missing");
  });

  it("fails closed when the served policy has no exact agreement identity", async () => {
    const validDocument = {
      title: "Research Use Policy",
      updated: "July 2026",
      sections: [{ heading: "Purpose", paragraphs: ["Research use only."] }],
    };
    for (const agreement of [
      undefined,
      null,
      {},
      { kind: "early_access_terms" },
      { kind: " early_access_terms", version: "v1" },
      { ...AGREEMENT, extra: true },
    ]) {
      const policy = agreement === undefined
        ? validDocument
        : { ...validDocument, agreement };
      const result = await loadResearchUsePolicy(async () =>
        ok({ policies: { "research-use": policy } }) as never,
      );
      expect(result.kind).toBe("unreadable");
    }
  });
});

describe("reading whether this customer has agreed", () => {
  it("asks the server, and passes no customer of its own", async () => {
    const paths: string[] = [];
    const state = await loadEarlyAccessAgreementState(async (path) => {
      paths.push(path);
      return ok({ ok: true, required: [AGREEMENT], accepted: true }) as never;
    });

    // No query string, no identifier, nothing but the bare path. There is no
    // shape of call here that asks about another person.
    expect(paths).toEqual([EARLY_ACCESS_AGREEMENT_STATUS_PATH]);
    expect(paths[0]).not.toContain("?");
    expect(state).toEqual({ kind: "accepted", agreement: AGREEMENT });
  });

  it("carries the exact required pair when acceptance is explicitly false", async () => {
    const state = await loadEarlyAccessAgreementState(async () =>
      ok({ required: [FUTURE_AGREEMENT], accepted: false }) as never,
    );
    expect(state).toEqual({ kind: "required", agreement: FUTURE_AGREEMENT });
  });

  it("fails closed on an ambiguous, malformed, or incomplete status response", async () => {
    const malformed = [
      { accepted: true },
      { required: [], accepted: true },
      { required: [AGREEMENT, FUTURE_AGREEMENT], accepted: false },
      { required: [{ kind: "early_access_terms" }], accepted: false },
      { required: [{ kind: " early_access_terms", version: "v1" }], accepted: false },
      { required: [{ ...AGREEMENT, clientDefault: true }], accepted: false },
      { required: [AGREEMENT], accepted: "true" },
    ];
    for (const response of malformed) {
      const state = await loadEarlyAccessAgreementState(async () => ok(response) as never);
      expect(state.kind).toBe("error");
    }
  });

  it("reports a lapsed session as locked rather than as not-agreed", async () => {
    // IDENTITY_REQUIRED used to be in this list, and that was the defect: it is
    // a signed-in customer with no approved account, not a lapsed session. It
    // is asserted separately below.
    for (const result of [
      { kind: "unauthorized" } as ApiResult<never>,
      { kind: "forbidden" } as ApiResult<never>,
    ]) {
      const state = await loadEarlyAccessAgreementState(async () => result as never);
      expect(state).toEqual({ kind: "locked" });
    }
  });

  it("reports a fault as a fault, never as accepted", async () => {
    // The safe direction. An unreachable server leaves the agreement in front
    // of the customer instead of waving them through to a checkout that will
    // refuse them.
    const state = await loadEarlyAccessAgreementState(async () => ({
      kind: "error",
      message: "network down",
    }) as never);
    expect(state).toEqual({ kind: "error", message: "network down" });
  });
});

describe("recording the acceptance", () => {
  it("posts the validated server pair and NOTHING else", async () => {
    const calls: Array<{ path: string; body: unknown }> = [];
    await acceptEarlyAccessAgreement(FUTURE_AGREEMENT, async (path, body) => {
      calls.push({ path, body });
      return ok({ ok: true, ...FUTURE_AGREEMENT, alreadyAccepted: false }) as never;
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe(EARLY_ACCESS_AGREEMENT_ACCEPT_PATH);
    // Exactly two keys. A customerRef, an acceptedAt or an evidence object sent
    // from here would be a browser-authored claim about who agreed and when.
    expect(calls[0].body).toEqual(FUTURE_AGREEMENT);
    expect(Object.keys(calls[0].body as object).sort()).toEqual(["kind", "version"]);
    for (const forbidden of [
      "customerRef",
      "acceptedAt",
      "evidence",
      "requestIp",
      "requestId",
      "sessionId",
      "token",
      "password",
      "cookie",
    ]) {
      expect(JSON.stringify(calls[0].body)).not.toContain(forbidden);
    }
  });

  it("treats a first acceptance and a repeat acceptance as the same success", async () => {
    const first = await acceptEarlyAccessAgreement(AGREEMENT, async () =>
      ok({ ok: true, ...AGREEMENT, alreadyAccepted: false }) as never,
    );
    const second = await acceptEarlyAccessAgreement(AGREEMENT, async () =>
      ok({ ok: true, ...AGREEMENT, alreadyAccepted: true }) as never,
    );

    expect(first).toEqual({
      kind: "accepted",
      alreadyAccepted: false,
      agreement: AGREEMENT,
    });
    // The duplicate is NOT an error. The row is on file either way, which is
    // the only thing checkout asks about.
    expect(second).toEqual({
      kind: "accepted",
      alreadyAccepted: true,
      agreement: AGREEMENT,
    });
  });

  it("fails closed when a success response does not confirm the posted pair", async () => {
    for (const response of [
      { ok: true, alreadyAccepted: false },
      { ok: true, kind: AGREEMENT.kind, version: "v2", alreadyAccepted: false },
    ]) {
      const result = await acceptEarlyAccessAgreement(AGREEMENT, async () =>
        ok(response) as never,
      );
      expect(result.kind).toBe("error");
    }
  });

  it("does not post when the supplied pair is not a validated agreement identity", async () => {
    let calls = 0;
    const result = await acceptEarlyAccessAgreement(
      { kind: "early_access_terms", version: " v1" },
      async () => {
        calls += 1;
        return ok({ ok: true, ...AGREEMENT }) as never;
      },
    );

    expect(result.kind).toBe("error");
    expect(calls).toBe(0);
  });

  it("reports a genuine persistence failure as refused, not as accepted", async () => {
    const result = await acceptEarlyAccessAgreement(AGREEMENT, async () => ({
      kind: "denied",
      code: "NOT_RECORDED",
    }) as never);
    expect(result).toEqual({ kind: "refused", code: "NOT_RECORDED" });
  });

  it("reports a refused pair rather than claiming an acceptance", async () => {
    const result = await acceptEarlyAccessAgreement(AGREEMENT, async () => ({
      kind: "denied",
      code: "AGREEMENT_NOT_REQUIRED",
    }) as never);
    expect(result).toEqual({ kind: "refused", code: "AGREEMENT_NOT_REQUIRED" });
  });

  it("reports a lapsed session as locked", async () => {
    // Same correction as the read path: IDENTITY_REQUIRED is unverified, and a
    // genuinely absent session is what 401/403-without-a-code means.
    for (const denial of [{ kind: "unauthorized" }, { kind: "forbidden" }] as const) {
      const result = await acceptEarlyAccessAgreement(
        AGREEMENT,
        async () => denial as never,
      );
      expect(result).toEqual({ kind: "locked" });
    }
  });
});

describe("a signed-in customer with no approved account is NOT a lapsed session", () => {
  it("reports IDENTITY_REQUIRED as unverified, not locked", async () => {
    // The production failure. Samuel unlocked successfully (200, a real scrypt
    // verification, cookie accepted, GET /session 200), and the agreement read
    // still answered 403 IDENTITY_REQUIRED because the session was not bound to
    // an approved Early Access customer. Mapping that to "locked" put "your
    // private session has ended" in front of a customer who was signed in, and
    // the only action it offered was to unlock again, which succeeds and
    // changes nothing.
    const state = await loadEarlyAccessAgreementState(async () => ({
      kind: "denied",
      code: "IDENTITY_REQUIRED",
    }) as never);
    expect(state).toEqual({ kind: "unverified" });
  });

  it("still reports a genuinely lapsed session as locked", async () => {
    // The distinction has to cut both ways, or the fix just moves the lie.
    for (const result of [{ kind: "unauthorized" }, { kind: "forbidden" }] as const) {
      const state = await loadEarlyAccessAgreementState(async () => result as never);
      expect(state).toEqual({ kind: "locked" });
    }
  });

  it("reports an unverified acceptance attempt as unverified, and records nothing", async () => {
    const result = await acceptEarlyAccessAgreement(AGREEMENT, async () => ({
      kind: "denied",
      code: "IDENTITY_REQUIRED",
    }) as never);
    expect(result).toEqual({ kind: "unverified" });
  });
});
