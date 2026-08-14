#!/usr/bin/env node
/**
 * POST-DEPLOY SMOKE FOR THE KRIS LAUNCH A RELEASE.
 *
 * This is not a generic "is it up" checklist. Every check below exists because
 * this programme has actually produced that failure at least once, and a
 * checklist that only asks whether the process is listening would have passed
 * on every one of them.
 *
 * The failure modes it is built around:
 *
 *   1. A green exit code that proves nothing. Twice a vitest run reported
 *      success while files were never executed. So this script declares how
 *      many checks it expects to run, counts how many it actually ran, and
 *      treats a mismatch as a FAILURE rather than as a tidy summary.
 *
 *   2. A check that could not run being read as a check that passed. Anything
 *      this script cannot establish is reported UNVERIFIED and exits 2. There
 *      is no state in which "I could not tell" prints in the same colour as
 *      "I confirmed it".
 *
 *   3. An empty result rendered as success. For a 420 item catalog the
 *      dangerous answer is not a 500, it is a silent empty list that looks
 *      like a real one. Counts are asserted exactly.
 *
 *   4. An unmounted /api route answered 200 with the SPA's HTML by the
 *      catch-all. Any check of the form "this door is closed" that trusts a
 *      status code alone is unreliable while that is true, so the script
 *      probes for it first and downgrades those checks itself if it finds it.
 *
 *   5. Deploying something other than the frozen commit. Render's deploy hook
 *      takes no SHA and writing an environment variable auto-deploys the
 *      tracked branch's HEAD, so "it is live" and "the frozen commit is live"
 *      are different claims. /api/health does not report a commit, so this
 *      cannot be answered from the application at all. It is answered from the
 *      Render API when credentials are present, and reported UNVERIFIED when
 *      they are not. It is never assumed.
 *
 * It is READ ONLY. Every request is a GET. It places no order, accepts no
 * agreement, enables nothing and writes nothing, so it is safe to run against
 * production repeatedly.
 *
 * Usage:
 *   node scripts/acceptance/smoke-kris-launch-a.mjs --origin https://... \
 *        --expect-sha <40 hex>
 *
 * Optional environment:
 *   SMOKE_SESSION_COOKIE   a signed-in Kristopher session, enabling the
 *                          authenticated tier (catalog counts, purchase mode
 *                          matrix, private field scan, agreement config)
 *   RENDER_API_KEY         enables the deployed commit check
 *   RENDER_SERVICE_ID      the service whose live deploy is compared
 */

const PASS = "PASS";
const FAIL = "FAIL";
const UNVERIFIED = "UNVERIFIED";

/**
 * Every check this script knows how to run, named up front.
 *
 * The list is the contract: the runner asserts at the end that each of these
 * names was recorded exactly once. A check that throws before recording, or a
 * branch that quietly returns early, is caught by that reconciliation rather
 * than vanishing into a green summary.
 */
const ANONYMOUS_CHECKS = [
  "health.reachable",
  "health.commerce_disabled",
  "spa.catchall_behaviour",
  "catalog.anonymous_refused",
  "catalog.anonymous_no_price_leak",
  "detail.anonymous_refused",
  "cart.disabled",
  "deploy.commit_matches_frozen",
];

const SESSION_CHECKS = [
  "catalog.total_is_420",
  "catalog.profile_is_kris_volume_partner",
  "catalog.price_split_is_418_and_2",
  "catalog.purchase_mode_matrix",
  "catalog.buy_now_agrees_with_mode_and_price",
  "catalog.no_private_fields",
  "agreements.required_is_configured",
];

/** The exact agreement configuration this release requires. */
const EXPECTED_REQUIRED_AGREEMENTS = [{ kind: "early_access_terms", version: "v1" }];

/** The exact purchase mode matrix the frozen artifact declares. */
const EXPECTED_MODES = Object.freeze({
  direct_eligible: 143,
  provider_workflow: 243,
  classification_pending: 32,
  price_pending: 2,
});
const EXPECTED_TOTAL = 420;

/**
 * Keys that must never reach a browser. Kept in sync by hand with
 * KRIS_DATASET_BANNED_KEYS in server/research/kris-launch-a/dataset-reader.ts.
 * Duplicated deliberately: this script must be able to run against a deployed
 * origin from a checkout that is not the deployed commit, so it cannot import
 * from the tree it is testing.
 */
const PRIVATE_KEYS = [
  "selectedSupplier", "supplier", "supplierName", "supplierSku", "supplierNotes",
  "supplierVariant", "alternativeSupplier", "alternativeCost", "buyCost",
  "buyCostPerUnit", "originalQuote", "suggestedSellPrice", "sellPrice",
  "grossProfit", "grossMargin", "margin", "markup", "savings",
  "savingsVsAlternative", "offersCompared", "suppliersCompared", "overlapType",
  "selectionRationale", "recommendedAction", "sourceFile", "sourceLocation",
  "sheetRow", "qualityRegulatoryNotes", "internalNote", "internalNotes",
  "purchasable", "addToCart", "add_to_cart", "checkoutUrl",
];

const results = [];

function record(name, status, detail) {
  results.push({ name, status, detail });
  const mark = status === PASS ? "  ok  " : status === FAIL ? " FAIL " : " ???? ";
  console.log(`[${mark}] ${name}\n         ${detail}`);
}

function parseArgs(argv) {
  const args = { origin: null, expectSha: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--origin") args.origin = argv[i + 1] ?? null;
    if (argv[i] === "--expect-sha") args.expectSha = argv[i + 1] ?? null;
  }
  return args;
}

/** A GET that never throws, so one dead endpoint cannot end the run. */
async function get(origin, path, cookie) {
  const url = `${origin}${path}`;
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: cookie ? { Cookie: cookie } : {},
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return {
      ok: true,
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      text,
      json,
    };
  } catch (error) {
    return { ok: false, status: 0, contentType: "", text: "", json: null, error: String(error) };
  }
}

/** True when a response is the SPA's HTML shell rather than an API answer. */
function looksLikeHtml(response) {
  return (
    response.contentType.includes("text/html") ||
    /^\s*<!doctype html/i.test(response.text) ||
    /^\s*<html/i.test(response.text)
  );
}

async function runAnonymous(origin, expectSha) {
  // ---- health -------------------------------------------------------------
  const health = await get(origin, "/api/health");
  if (!health.ok) {
    record("health.reachable", FAIL, `no response from ${origin}: ${health.error}`);
    record("health.commerce_disabled", UNVERIFIED, "health did not answer");
  } else if (health.status !== 200 || health.json === null) {
    record("health.reachable", FAIL, `expected 200 JSON, got ${health.status} ${health.contentType}`);
    record("health.commerce_disabled", UNVERIFIED, "health did not answer as JSON");
  } else {
    record("health.reachable", PASS, `200, uptime ${health.json.uptimeSeconds}s`);
    const commerce = health.json.config?.commerceEnabled;
    if (commerce === false) {
      record("health.commerce_disabled", PASS, "config.commerceEnabled is false");
    } else if (commerce === undefined) {
      record("health.commerce_disabled", UNVERIFIED, "health payload carries no config.commerceEnabled");
    } else {
      record("health.commerce_disabled", FAIL, `config.commerceEnabled is ${commerce}, expected false`);
    }
  }

  // ---- the SPA catch-all --------------------------------------------------
  // Probed BEFORE any "this door is closed" check, because if an unmounted
  // /api path answers 200 with HTML then a 404 based closure proof is worth
  // less than it looks and the checks below must say so themselves.
  const ghost = await get(origin, "/api/research/__smoke_nonexistent_probe__");
  let catchAllSwallowsApi = false;
  if (!ghost.ok) {
    record("spa.catchall_behaviour", UNVERIFIED, `probe did not answer: ${ghost.error}`);
  } else if (ghost.status === 200 && looksLikeHtml(ghost)) {
    catchAllSwallowsApi = true;
    record(
      "spa.catchall_behaviour",
      FAIL,
      "an unmounted /api path answered 200 with the SPA HTML. Closure checks that " +
        "rely on a 404 are unreliable on this deployment, and a client fetch of a " +
        "missing API route will parse HTML as if it were an answer.",
    );
  } else {
    record("spa.catchall_behaviour", PASS, `unmounted /api answered ${ghost.status}, not SPA HTML`);
  }

  // ---- the catalog must refuse an anonymous caller ------------------------
  // This is the price isolation guarantee stated negatively, and it is the
  // single most valuable credential free check available: KRIS_VOLUME_PARTNER
  // is Roman Health's wholesale pricing and no signed-out caller may see it.
  const anon = await get(origin, "/api/research/kris-launch-a/v1/catalog");
  if (!anon.ok) {
    record("catalog.anonymous_refused", UNVERIFIED, `no response: ${anon.error}`);
    record("catalog.anonymous_no_price_leak", UNVERIFIED, "catalog did not answer");
  } else {
    const refusedCodes = ["kris_catalog_auth_required", "kris_catalog_forbidden", "kris_catalog_disabled"];
    const code = anon.json?.code;
    if (anon.json?.ok === false && refusedCodes.includes(code)) {
      record("catalog.anonymous_refused", PASS, `${anon.status} ${code}`);
    } else if (anon.json?.ok === true) {
      record(
        "catalog.anonymous_refused",
        FAIL,
        `anonymous caller received a catalog page: total ${anon.json.total}, profile ${anon.json.profile}`,
      );
    } else if (looksLikeHtml(anon)) {
      record(
        "catalog.anonymous_refused",
        FAIL,
        `the catalog route answered SPA HTML (${anon.status}), so it is not mounted on this deployment`,
      );
    } else {
      record("catalog.anonymous_refused", FAIL, `unrecognized answer ${anon.status}: ${anon.text.slice(0, 160)}`);
    }

    // Asserted on the raw bytes rather than on the parsed shape, so a leak
    // through an unexpected field is caught as well as one through a known
    // field.
    const leaks = [];
    if (anon.text.includes("KRIS_VOLUME_PARTNER")) leaks.push("KRIS_VOLUME_PARTNER");
    if (/"(amountCents|priceCents|unitPriceCents)"\s*:/.test(anon.text)) leaks.push("a price field");
    if (leaks.length === 0) {
      record("catalog.anonymous_no_price_leak", PASS, "no pricing profile or price field in the anonymous body");
    } else {
      record("catalog.anonymous_no_price_leak", FAIL, `anonymous body carries ${leaks.join(" and ")}`);
    }
  }

  // ---- the detail route must refuse too ----------------------------------
  // The list and the detail route are separate doors and have to be proven
  // separately. A real slug is used so that a refusal cannot be a 404 for the
  // wrong reason.
  const slug = "clinical-formulations-503a-anastrozole-tablet-anastrozole-tablet-1mg";
  const detail = await get(origin, `/api/research/kris-launch-a/v1/products/${slug}`);
  if (!detail.ok) {
    record("detail.anonymous_refused", UNVERIFIED, `no response: ${detail.error}`);
  } else if (detail.json?.ok === true) {
    record("detail.anonymous_refused", FAIL, `anonymous caller received product detail for ${slug}`);
  } else if (detail.json?.ok === false) {
    record("detail.anonymous_refused", PASS, `${detail.status} ${detail.json.code}`);
  } else {
    record("detail.anonymous_refused", FAIL, `unrecognized answer ${detail.status}: ${detail.text.slice(0, 160)}`);
  }

  // ---- the cart must be off ----------------------------------------------
  // When the flag is off this route answers 404 with a JSON body, which is
  // exactly what distinguishes a deliberately closed door from a route that
  // was never mounted and got swallowed by the catch-all.
  const cart = await get(origin, "/api/research/early-access/cart/capability");
  if (!cart.ok) {
    record("cart.disabled", UNVERIFIED, `no response: ${cart.error}`);
  } else if (cart.json?.ok === false && cart.json.code === "CART_DISABLED") {
    record("cart.disabled", PASS, "404 CART_DISABLED, the flag is off and the door says so");
  } else if (cart.json?.ok === true) {
    record("cart.disabled", FAIL, "the cart capability route answered as ENABLED");
  } else if (catchAllSwallowsApi && looksLikeHtml(cart)) {
    record(
      "cart.disabled",
      UNVERIFIED,
      "the route answered SPA HTML and this deployment swallows unmounted /api paths, " +
        "so a closed cart and an unmounted route are indistinguishable from outside",
    );
  } else {
    record("cart.disabled", FAIL, `unrecognized answer ${cart.status}: ${cart.text.slice(0, 160)}`);
  }

  // ---- the deployed commit ------------------------------------------------
  await checkDeployedCommit(expectSha);
}

/**
 * Compare the live Render deploy's commit to the frozen SHA.
 *
 * The application cannot answer this: /api/health reports uptime and config
 * presence but no build identity. Rather than infer the deployed commit from
 * behaviour, which is how the wrong commit gets blessed, this asks Render
 * directly and refuses to guess when it cannot.
 */
async function checkDeployedCommit(expectSha) {
  const name = "deploy.commit_matches_frozen";
  const key = process.env.RENDER_API_KEY;
  const service = process.env.RENDER_SERVICE_ID;

  if (!expectSha) {
    record(name, UNVERIFIED, "no --expect-sha given, so there is nothing to compare against");
    return;
  }
  if (!/^[0-9a-f]{40}$/.test(expectSha)) {
    record(name, FAIL, `--expect-sha must be a full 40 character SHA, got "${expectSha}"`);
    return;
  }
  if (!key || !service) {
    record(
      name,
      UNVERIFIED,
      "RENDER_API_KEY and RENDER_SERVICE_ID are not both set. The deployed commit " +
        "cannot be established from the application, so this is unknown rather than ok.",
    );
    return;
  }

  try {
    const response = await fetch(
      `https://api.render.com/v1/services/${encodeURIComponent(service)}/deploys?limit=20`,
      { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } },
    );
    if (!response.ok) {
      record(name, UNVERIFIED, `Render API answered ${response.status}`);
      return;
    }
    const body = await response.json();
    const entries = Array.isArray(body) ? body : [];
    const live = entries.map((entry) => entry.deploy ?? entry).find((d) => d && d.status === "live");
    if (!live) {
      record(name, UNVERIFIED, "no deploy with status 'live' in the most recent 20");
      return;
    }
    const deployed = live.commit?.id ?? null;
    if (!deployed) {
      record(name, UNVERIFIED, `live deploy ${live.id} carries no commit id`);
    } else if (deployed === expectSha) {
      record(name, PASS, `live deploy ${live.id} is ${deployed}`);
    } else {
      record(
        name,
        FAIL,
        `live deploy ${live.id} is ${deployed}, expected ${expectSha}. ` +
          "Something other than the frozen commit is serving traffic.",
      );
    }
  } catch (error) {
    record(name, UNVERIFIED, `Render API call failed: ${String(error)}`);
  }
}

async function runSession(origin, cookie) {
  // ---- page the whole catalog --------------------------------------------
  const items = [];
  let total = null;
  let profile = null;
  let page = 1;
  let pageError = null;
  while (page <= 20) {
    const response = await get(
      origin,
      `/api/research/kris-launch-a/v1/catalog?page=${page}&pageSize=100`,
      cookie,
    );
    if (!response.ok || response.json?.ok !== true) {
      pageError = `page ${page}: ${response.status} ${response.text.slice(0, 160)}`;
      break;
    }
    total = response.json.total;
    profile = response.json.profile ?? null;
    items.push(...(response.json.items ?? []));
    if (items.length >= total || (response.json.items ?? []).length === 0) break;
    page += 1;
  }

  if (pageError !== null) {
    for (const name of SESSION_CHECKS.filter((n) => n.startsWith("catalog."))) {
      record(name, UNVERIFIED, `could not read the catalog with the supplied session: ${pageError}`);
    }
  } else {
    // An empty list is the dangerous answer here, not an error, so it is
    // called out by name rather than folded into a count mismatch.
    if (total === EXPECTED_TOTAL && items.length === EXPECTED_TOTAL) {
      record("catalog.total_is_420", PASS, `total ${total}, ${items.length} items read`);
    } else if (total === 0 || items.length === 0) {
      record(
        "catalog.total_is_420",
        FAIL,
        `the catalog answered ok with an EMPTY list (total ${total}). A missing or ` +
          "unreadable artifact must produce an honest failure, never an empty shelf.",
      );
    } else {
      record("catalog.total_is_420", FAIL, `total ${total}, read ${items.length}, expected ${EXPECTED_TOTAL}`);
    }

    // The pricing profile the server resolved for this session. It is the
    // observable end of the whole binding chain: operator, to buyer, to the
    // profile that buyer is entitled to. A signed-in session reading any other
    // profile means the binding resolved to the wrong buyer.
    if (profile === "KRIS_VOLUME_PARTNER") {
      record("catalog.profile_is_kris_volume_partner", PASS, "the session resolved to KRIS_VOLUME_PARTNER");
    } else {
      record(
        "catalog.profile_is_kris_volume_partner",
        FAIL,
        `the session resolved to profile ${JSON.stringify(profile)}, expected KRIS_VOLUME_PARTNER`,
      );
    }

    // 418 priced and 2 price pending. Asserted separately from the mode matrix
    // because a price that silently failed to resolve would leave the mode
    // counts intact while every price read as absent.
    const priced = items.filter((item) => item.price && item.price.state !== "pending").length;
    const pending = items.length - priced;
    if (priced === 418 && pending === 2) {
      record("catalog.price_split_is_418_and_2", PASS, `${priced} priced, ${pending} price pending`);
    } else {
      record(
        "catalog.price_split_is_418_and_2",
        FAIL,
        `${priced} priced and ${pending} pending, expected 418 and 2`,
      );
    }

    const counts = {};
    for (const item of items) {
      const mode = item.purchaseMode ?? "MISSING";
      counts[mode] = (counts[mode] ?? 0) + 1;
    }
    const unexpected = Object.keys(counts).filter((mode) => !(mode in EXPECTED_MODES));
    const mismatched = Object.entries(EXPECTED_MODES).filter(([mode, n]) => (counts[mode] ?? 0) !== n);
    if (unexpected.length === 0 && mismatched.length === 0) {
      record("catalog.purchase_mode_matrix", PASS, JSON.stringify(counts));
    } else {
      record(
        "catalog.purchase_mode_matrix",
        FAIL,
        `observed ${JSON.stringify(counts)}, expected ${JSON.stringify(EXPECTED_MODES)}` +
          (unexpected.length ? `, unrecognized modes: ${unexpected.join(", ")}` : ""),
      );
    }

    // The server writes canBuyNow out so that no caller re-derives it. Buy Now
    // is an implication, not an equality: a row may offer it only when it is
    // direct_eligible AND carries an exact legacy-order selection whose price
    // and currency agree with the price rendered beside it; a direct_eligible
    // row without a reviewed binding (or with a price the founder release does
    // not currently authorize) stays closed. SMOKE_EXPECT_BUY_NOW, when set,
    // pins the exact open count for a deployment whose founder pricing appends
    // are live; unset, the implication alone is asserted and the count is
    // reported.
    const offending = items.filter((item) => {
      if (item.canBuyNow !== true) return item.legacyOrder != null;
      return (
        item.purchaseMode !== "direct_eligible" ||
        item.legacyOrder == null ||
        item.price?.state !== "priced" ||
        item.legacyOrder.unitPriceCents !== item.price.amountCents ||
        item.legacyOrder.currency !== item.price.currency
      );
    });
    const openCount = items.filter((item) => item.canBuyNow === true).length;
    const expectedOpenRaw = process.env.SMOKE_EXPECT_BUY_NOW;
    const expectedOpen =
      typeof expectedOpenRaw === "string" && /^\d+$/.test(expectedOpenRaw.trim())
        ? Number(expectedOpenRaw.trim())
        : null;
    if (offending.length > 0) {
      record(
        "catalog.buy_now_agrees_with_mode_and_price",
        FAIL,
        `${offending.length} items break the Buy Now implication, first is ${offending[0].slug} ` +
          `(mode ${offending[0].purchaseMode}, canBuyNow ${offending[0].canBuyNow})`,
      );
    } else if (expectedOpen !== null && openCount !== expectedOpen) {
      record(
        "catalog.buy_now_agrees_with_mode_and_price",
        FAIL,
        `implication holds but ${openCount} rows offer Buy Now, SMOKE_EXPECT_BUY_NOW pins ${expectedOpen}`,
      );
    } else {
      record(
        "catalog.buy_now_agrees_with_mode_and_price",
        PASS,
        `${items.length} items, ${openCount} offer Buy Now, every one direct_eligible at the agreed price` +
          (expectedOpen === null ? " (no pinned count)" : `, matching the pinned ${expectedOpen}`),
      );
    }

    const found = new Set();
    const walk = (value) => {
      if (Array.isArray(value)) {
        value.forEach(walk);
      } else if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          if (PRIVATE_KEYS.includes(key)) found.add(key);
          walk(child);
        }
      }
    };
    walk(items);
    if (found.size === 0) {
      record(
        "catalog.no_private_fields",
        PASS,
        `${items.length} items carry none of the ${PRIVATE_KEYS.length} private keys`,
      );
    } else {
      record("catalog.no_private_fields", FAIL, `private keys reached the browser: ${[...found].join(", ")}`);
    }
  }

  // ---- the agreement configuration ---------------------------------------
  // The gate answers "not accepted" when the deployment requires nothing, so
  // an unset or malformed RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS does not
  // fail loudly. It simply means no order can ever be placed. This route
  // reports the parsed configuration, which makes the difference visible from
  // outside without touching the database.
  const agreements = await get(origin, "/api/research/early-access/agreements", cookie);
  const name = "agreements.required_is_configured";
  if (!agreements.ok || agreements.json === null) {
    record(name, UNVERIFIED, `no JSON answer: ${agreements.status} ${agreements.error ?? ""}`);
  } else if (agreements.json.ok !== true) {
    record(
      name,
      UNVERIFIED,
      `route refused with ${agreements.json.code}, the session may not be an Early Access identity`,
    );
  } else {
    const required = agreements.json.required ?? [];
    const normal = (list) =>
      JSON.stringify(
        [...list]
          .map((pair) => ({ kind: pair.kind, version: pair.version }))
          .sort((a, b) => String(a.kind).localeCompare(String(b.kind))),
      );
    if (required.length === 0) {
      record(
        name,
        FAIL,
        "required is EMPTY. The deployment requires no agreement, which means the " +
          "agreement gate answers false for everyone and no order can be placed.",
      );
    } else if (normal(required) === normal(EXPECTED_REQUIRED_AGREEMENTS)) {
      record(name, PASS, `required is ${JSON.stringify(required)}`);
    } else {
      record(
        name,
        FAIL,
        `required is ${JSON.stringify(required)}, expected ${JSON.stringify(EXPECTED_REQUIRED_AGREEMENTS)}`,
      );
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.origin) {
    console.error(
      "usage: node scripts/acceptance/smoke-kris-launch-a.mjs --origin <url> [--expect-sha <40 hex>]",
    );
    process.exit(1);
  }
  const origin = args.origin.replace(/\/+$/, "");
  const cookie = process.env.SMOKE_SESSION_COOKIE ?? null;

  console.log("KRIS LAUNCH A POST DEPLOY SMOKE");
  console.log(`origin      ${origin}`);
  console.log(`expect sha  ${args.expectSha ?? "(not supplied)"}`);
  console.log(
    `session     ${cookie ? "supplied, the signed-in tier will run" : "absent, the signed-in tier will be UNVERIFIED"}`,
  );
  console.log("");

  await runAnonymous(origin, args.expectSha);

  if (cookie) {
    await runSession(origin, cookie);
  } else {
    for (const check of SESSION_CHECKS) {
      record(check, UNVERIFIED, "SMOKE_SESSION_COOKIE is not set, so the signed-in tier did not run");
    }
  }

  // ---- reconciliation -----------------------------------------------------
  // The point of the whole script. A summary that counts only what it happened
  // to run is the exact shape of the green-but-hollow result this programme has
  // already produced twice.
  const expected = [...ANONYMOUS_CHECKS, ...SESSION_CHECKS];
  const seen = results.map((r) => r.name);
  const missing = expected.filter((n) => !seen.includes(n));
  const duplicated = seen.filter((n, i) => seen.indexOf(n) !== i);
  const undeclared = seen.filter((n) => !expected.includes(n));

  const failed = results.filter((r) => r.status === FAIL);
  const unverified = results.filter((r) => r.status === UNVERIFIED);

  console.log("");
  console.log("=".repeat(72));
  console.log(`checks declared ${expected.length}, recorded ${seen.length}`);
  console.log(
    `PASS ${results.length - failed.length - unverified.length}   FAIL ${failed.length}   UNVERIFIED ${unverified.length}`,
  );

  let accountingBroken = false;
  if (missing.length || duplicated.length || undeclared.length) {
    accountingBroken = true;
    console.log("");
    console.log("CHECK ACCOUNTING IS BROKEN, so this run cannot be trusted either way:");
    if (missing.length) console.log(`  never ran:   ${missing.join(", ")}`);
    if (duplicated.length) console.log(`  ran twice:   ${[...new Set(duplicated)].join(", ")}`);
    if (undeclared.length) console.log(`  undeclared:  ${[...new Set(undeclared)].join(", ")}`);
  }

  if (failed.length) {
    console.log("");
    console.log("FAILED:");
    for (const r of failed) console.log(`  ${r.name}: ${r.detail}`);
  }
  if (unverified.length) {
    console.log("");
    console.log("UNVERIFIED, meaning unknown and NOT ok:");
    for (const r of unverified) console.log(`  ${r.name}: ${r.detail}`);
  }

  console.log("");
  if (accountingBroken || failed.length) {
    console.log("RESULT: FAIL");
    return 1;
  }
  if (unverified.length) {
    console.log("RESULT: INCOMPLETE. Nothing failed, but the run did not establish everything.");
    return 2;
  }
  console.log("RESULT: PASS");
  return 0;
}

// The exit code IS the result, so it has to be the code we chose.
//
// process.exit() here aborted with 127 on Windows: node tore down while the
// fetch connection pool still held sockets and libuv asserted. A runner gating
// on this exit code would have read every run, good or bad, as the same
// failure. So the status is SET rather than forced and the process is left to
// end on its own once the sockets close.
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error("smoke runner threw, which is itself a failure:", error);
    process.exitCode = 1;
  });
