// Run separately from Vitest: node --import tsx --test scripts/evidence/native-closeout.node-test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { buildNativeCloseoutPreview, FIXTURE } from "../preview-native-closeout.ts";

test("real native workflows through local auth, with ownership and failure boundaries", async () => {
  const port = 52942;
  const origin = `http://127.0.0.1:${port}`;
  const { app, restoreFetch } = await buildNativeCloseoutPreview(port);
  const server = await new Promise((resolve) => { const s = app.listen(port, "127.0.0.1", () => resolve(s)); });
  const call = async (route, token, method = "GET", body) => {
    const r = await fetch(origin + route, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
  };
  const login = async (email) => (await call("/preview-backend/auth/v1/token?grant_type=password", null, "POST", { email, password: FIXTURE.password })).body.access_token;
  try {
    const admin = await login(FIXTURE.adminEmail);
    const member = await login(FIXTURE.memberEmail);
    const other = await login(FIXTURE.otherEmail);
    assert.equal((await call("/api/admin/research/questions")).status, 401);
    assert.equal((await call("/api/admin/research/orders", member)).status, 403);
    const list = await call("/api/admin/research/questions?status=open", admin);
    assert.equal(list.status, 200);
    assert.equal(list.body.questions.length, 1);
    assert.ok(!JSON.stringify(list.body).includes("Synthetic QA question"));
    assert.match((await call(`/api/admin/research/questions/${FIXTURE.questionId}`, admin)).body.question.body, /Synthetic QA question/);
    assert.equal((await call(`/api/admin/research/questions/${FIXTURE.questionId}/answer`, admin, "POST", { answerText: "Synthetic answer: tracking appears in your order.", status: "answer_ready" })).status, 200);
    assert.match((await call("/api/research/questions", member)).body.questions[0].answerText, /Synthetic answer/);
    assert.deepEqual((await call("/api/research/questions", other)).body.questions, []);
    assert.equal((await call(`/api/research/orders/${FIXTURE.orderId}`, other)).status, 404);
    assert.equal((await call(`/api/research/orders/${FIXTURE.orderId}`, member)).body.order.state, "payment_captured");
    assert.equal((await call("/api/admin/research/orders", admin)).body.orders[0].orderId, FIXTURE.orderId);
    assert.equal((await call(`/api/admin/research/orders/${FIXTURE.orderId}/processing`, admin, "POST", {})).status, 200);
    assert.equal((await call(`/api/admin/research/orders/${FIXTURE.orderId}/shipments`, admin, "POST", { owner: "xenios", carrier: "UPS", trackingNumber: "SYNTHETIC123456" })).status, 200);
    assert.equal((await call(`/api/research/orders/${FIXTURE.orderId}`, member)).body.order.state, "processing");
    assert.equal((await call(`/api/admin/research/orders/${FIXTURE.orderId}/fulfilled`, admin, "POST", {})).status, 200);
    assert.equal((await call(`/api/research/orders/${FIXTURE.orderId}`, member)).body.order.shipments[0].trackingNumber, "SYNTHETIC123456");
    assert.equal((await call(`/api/admin/research/orders/${FIXTURE.orderId}/capture`, admin, "POST", {})).status, 404);
    await call("/__native_preview/questions-source", admin, "POST", { available: false });
    assert.equal((await call("/api/admin/research/questions", admin)).status, 503);
    assert.equal((await call(`/api/admin/research/questions/${FIXTURE.questionId}`, admin)).status, 503);
    await call("/__native_preview/orders-source", admin, "POST", { available: false });
    assert.equal((await call("/api/admin/research/orders", admin)).status, 503);
    await call("/preview-backend/auth/v1/logout", admin, "POST", {});
    assert.equal((await call("/api/admin/research/orders", admin)).status, 401);
    const safety = (await call("/__native_preview")).body;
    assert.equal(safety.blockedExternalRequests, 0);
    assert.equal(safety.externalMutations, 0);
    assert.equal(safety.notificationIntents, 1);
    await assert.rejects(fetch("https://example.invalid/"), /off-origin server fetch/);
    assert.throws(() => net.connect({ host: "192.0.2.1", port: 443 }), /off-origin socket/);
    assert.equal((await call("/__native_preview")).body.blockedExternalRequests, 2);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    restoreFetch();
  }
});
