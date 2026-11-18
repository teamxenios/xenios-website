import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { mountEarlyAccessReceiptEndpoint, receiptEnvironment } from "./early-access-receipt-endpoint";
import { CustomerNoticeReceiptConflict, type CustomerNoticeReceiptRecorder } from "../assisted-order/request-intent/customer-notice-receipts";

const PATH = "/api/webhooks/early-access/quote-delivery";
const key = randomBytes(32), secret = "whsec_" + key.toString("base64");
const MESSAGE = "4f1c2d3e-0000-4000-8000-00000000abcd";
const env = (stage = false): NodeJS.ProcessEnv => ({
  RENDER: "true", RENDER_SERVICE_ID: stage ? "srv-d9h4f4m7r5hc73ctjng0" : "srv-d8s9vej7uimc7384dfcg",
  RENDER_EXTERNAL_URL: stage ? "https://xenios-research-staging.onrender.com" : "https://xenios-website.onrender.com",
  SUPABASE_URL: stage ? "https://srcphrgnxreqyirkitxd.supabase.co" : "https://yvzeduaxbwgcwllhywff.supabase.co",
  EA_REQUEST_DELIVERY_RECEIPTS_ENABLED: "true", EA_REQUEST_DELIVERY_RECEIPT_SECRETS: JSON.stringify([secret]),
});
const event = (type = "email.delivered", to: unknown = ["qa@example.invalid"]) => ({type, data:{email_id:MESSAGE,to}});
function signed(value: unknown, id = "evt_endpoint_fixture") {
  const bytes = Buffer.from(JSON.stringify(value));
  const ts = String(Math.floor(Date.now() / 1000));
  const mac = createHmac("sha256", key).update(id + "." + ts + ".", "ascii").update(bytes).digest("base64");
  return { bytes, headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": "v1," + mac } };
}
function setup(config = env(), record = vi.fn<CustomerNoticeReceiptRecorder>(async () => "recorded")) {
  const app = express();
  const registrations = vi.spyOn(app, "post");
  const mounted = mountEarlyAccessReceiptEndpoint(app, config, record);
  app.use(express.json());
  return { app, mounted, record, registrations };
}
const send = (app: express.Express, s: ReturnType<typeof signed>) =>
  request(app).post(PATH).set("Content-Type", "application/json").set(s.headers).send(s.bytes.toString("utf8"));

describe("one pre-parser receipt endpoint, independent of the private quote desk", () => {
  it.each([false, true])("records only signed facts with quote flags absent, staging=%s", async stage => {
    const {app, mounted, record} = setup(env(stage)), s = signed(event());
    expect(mounted?.status).toBe("enabled");
    expect((await send(app, s)).status).toBe(204);
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith({eventId:s.headers["svix-id"],messageId:MESSAGE,kind:"delivered",digest:createHash("sha256").update(s.bytes).digest("hex")});
    expect(Object.keys(record.mock.calls[0][0]).sort()).toEqual(["digest", "eventId", "kind", "messageId"]);
  });
  it("does not mount when default off or on an unrelated/preview/cross-project deployment", async () => {
    for (const config of [{...env(),EA_REQUEST_DELIVERY_RECEIPTS_ENABLED:undefined},{...env(),IS_PULL_REQUEST:"true"},{...env(),RENDER_SERVICE_ID:"other"},{...env(),SUPABASE_URL:env(true).SUPABASE_URL}]) {
      const {app,mounted,record} = setup(config);
      expect(mounted).toBeNull(); expect((await send(app,signed(event()))).status).toBe(404);expect(record).not.toHaveBeenCalled();
    }
  });
  it.each([undefined, "not-json", "[]", JSON.stringify(["not-a-secret"]), JSON.stringify([secret,secret,secret])])("configuration failure stays retryable and never writes: %s", async value => {
    const {app,mounted,record} = setup({...env(),EA_REQUEST_DELIVERY_RECEIPT_SECRETS:value});
    expect(mounted?.status).toBe("unavailable"); expect(mounted?.forQuote("ea-production")).toBeNull();
    expect((await send(app,signed(event()))).status).toBe(503);expect(record).not.toHaveBeenCalled();
  });
  it("rejects changed bytes, malformed/duplicate signature headers, stale signature and compressed input", async () => {
    const {app,record} = setup(),s=signed(event());
    expect((await request(app).post(PATH).set("Content-Type","application/json").set(s.headers).send(JSON.stringify(event("email.bounced")))).status).toBe(400);
    expect((await send(app,{...s,headers:{...s.headers,"svix-signature":"v1,bad"}})).status).toBe(400);
    expect((await send(app,{...s,headers:{...s.headers,"svix-timestamp":"1"}})).status).toBe(400);
    expect((await request(app).post(PATH).set("Content-Type","application/json").set({...s.headers,"svix-id":["one","two"]} as never).send(s.bytes.toString())).status).toBe(400);
    expect((await request(app).post(PATH).set("Content-Type","application/json").set("Content-Encoding","gzip").set(s.headers).send(s.bytes)).status).toBe(400);
    expect(record).not.toHaveBeenCalled();
  });
  it("ignores unsupported and multi-recipient events and does not confuse single-recipient validation with matching", async () => {
    const {app,record}=setup();
    expect((await send(app,signed(event("email.opened")))).status).toBe(204);
    expect((await send(app,signed(event("email.delivered",["a@example.invalid","b@example.invalid"])))).status).toBe(204);
    expect((await send(app,signed(event("email.delivered",["not-a-mailbox"])))).status).toBe(400);
    expect(record).not.toHaveBeenCalled();
  });
  it("keeps persistence failures retryable and conflicting event identity distinct", async () => {
    for (const [error,status] of [[new Error("fixture storage unavailable"),503],[new CustomerNoticeReceiptConflict(),409]] as const) {
      const {app}=setup(env(),vi.fn(async()=>{throw error;}));
      expect((await send(app,signed(event()))).status).toBe(status);
    }
  });
  it("attaches one late quote channel to the same endpoint, quote first and notices only when unclaimed", async () => {
    const {app,mounted,record,registrations}=setup(),receive=vi.fn(async()=>({status:204,unclaimed:false})),reconcile=vi.fn();
    expect(mounted?.forQuote("ea-staging")).toBeNull();
    const options=mounted?.forQuote("ea-production");expect(options).toBeTruthy();
    options!.attachChannel({receive},reconcile);
    expect(()=>options!.attachChannel({receive},reconcile)).toThrow();
    expect((await send(app,signed(event()))).status).toBe(204);expect(receive).toHaveBeenCalledOnce();expect(record).not.toHaveBeenCalled();
    receive.mockResolvedValue({status:204,unclaimed:true});
    expect((await send(app,signed(event()))).status).toBe(204);expect(record).toHaveBeenCalledOnce();
    const s=signed(event());await send(app,{...s,headers:{...s.headers,"svix-signature":"bad"}});
    expect(receive).toHaveBeenCalledTimes(2);
    expect(registrations.mock.calls.filter(args=>args[0]===PATH)).toHaveLength(1);
  });
  it("keeps the production mount before global parsing and supplies both gated quote compositions", () => {
    const source=readFileSync("server/index.ts","utf8");
    expect(source.indexOf("mountEarlyAccessReceiptEndpoint(app, process.env)")).toBeLessThan(source.indexOf("express.json({"));
    expect(source).toContain('sharedEarlyAccessReceiptEndpoint?.forQuote("ea-production")');
    expect(source).toContain('sharedEarlyAccessReceiptEndpoint?.forQuote("ea-staging")');
    expect(receiptEnvironment({...env(true),RENDER_EXTERNAL_URL:"https://other.invalid"})).toBeNull();
  });
});
