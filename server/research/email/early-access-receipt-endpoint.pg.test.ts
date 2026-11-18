import { readFileSync } from "node:fs";
import { createHmac, randomBytes } from "node:crypto";
import express from "express";
import request from "supertest";
import { expect } from "vitest";
import { mountEarlyAccessReceiptEndpoint } from "./early-access-receipt-endpoint";
import { CustomerNoticeReceiptConflict } from "../assisted-order/request-intent/customer-notice-receipts";
import { createDurableJourneyFixture, pg16It, submission } from "../assisted-order/request-intent/durable-journey.pg.fixture";

pg16It("persists exact signed HTTP receipt facts and isolates matching notice evidence with the quote desk disabled", async () => {
  const db = createDurableJourneyFixture();
  try {
    await db.start({managedCareSchema:true});
    for (const file of ["supabase/research-notification-outbox.sql", "supabase/migrations/20261114133500_early_access_pending_request_reader.sql",
      "supabase/migrations/20261118024134_request_intent_workflow.sql", "supabase/migrations/20261118033449_early_access_request_customer_notices.sql",
      "supabase/migrations/20261118172136_request_customer_notice_delivery_receipts.sql"]) await db.sql(readFileSync(file,"utf8"));
    const canonical = db.application(db.adapter().client).app;
    expect((await db.post(canonical,"",submission(),"a")).status).toBe(200);
    const [saved] = await db.snapshot();
    const eventId = "50000000-0000-4000-8000-000000000032", messageId = "6b1d2c3e-0000-4000-8000-000000000032";
    await db.sql(`insert into request_intent_private.workflow(request_id,environment,state,revision,initial_queue_cycle_id,processor_user_id,changed_at)
      select id,'ea-fixture','queued',1,gen_random_uuid(),null,created_at from request_intent_private.requests where id=$1`,[saved.id]);
    await db.sql(`insert into request_intent_private.workflow_events(id,request_id,revision,kind,occurred_at,actor_user_id,command_id)
      select $2::uuid,id,1,'queued',created_at,null,null from request_intent_private.requests where id=$1`,[saved.id,eventId]);
    await db.sql("select request_intent_private.enqueue_workflow_notice($1::uuid,$2::uuid,'request_received_queued',1,'ea-fixture')",[saved.id,eventId]);
    await db.sql("update public.research_notification_outbox set status='sent',provider_message_id=$2 where event_key=$1",["ea-request-customer-"+eventId,messageId]);
    const key=randomBytes(32),secret="whsec_"+key.toString("base64"),app=express();
    const handle=mountEarlyAccessReceiptEndpoint(app,{
      RENDER:"true",RENDER_SERVICE_ID:"srv-d8s9vej7uimc7384dfcg",SUPABASE_URL:"https://yvzeduaxbwgcwllhywff.supabase.co",
      EA_REQUEST_DELIVERY_RECEIPTS_ENABLED:"true",EA_REQUEST_DELIVERY_RECEIPT_SECRETS:JSON.stringify([secret]),
      EA_PRIVATE_QUOTES_ENABLED:"false",EA_PRIVATE_QUOTE_DESK_ENABLED:"false",
    },async receipt=>{
      try {
        const result=await db.asRole("service_role","select public.request_intent_customer_notice_receipt_record($1,$2::uuid,$3,$4) as d",
          [receipt.eventId,receipt.messageId,receipt.kind,receipt.digest]);
        return result.rows[0].d as "recorded"|"replayed";
      } catch(error) {
        if ((error as {code?:string}).code==="23505") throw new CustomerNoticeReceiptConflict();
        throw error;
      }
    });
    expect(handle?.status).toBe("enabled");app.use(express.json());
    const post=async(kind:string,eid="evt_http_owned_pg",pid=messageId,valid=true)=>{
      const bytes=Buffer.from(JSON.stringify({type:kind,data:{email_id:pid,to:["fixture@example.invalid"]}}));
      const ts=String(Math.floor(Date.now()/1000));
      const mac=createHmac("sha256",key).update(eid+"."+ts+".","ascii").update(bytes).digest("base64");
      return request(app).post("/api/webhooks/early-access/quote-delivery").set("Content-Type","application/json")
        .set({"svix-id":eid,"svix-timestamp":ts,"svix-signature":valid?"v1,"+mac:"v1,bad"}).send(bytes.toString());
    };
    expect((await post("email.delivered")).status).toBe(204);
    expect((await post("email.delivered")).status).toBe(204);
    expect((await post("email.bounced")).status).toBe(409);
    expect((await post("email.bounced","evt_invalid",messageId,false)).status).toBe(400);
    expect((await post("email.bounced","evt_other","6b1d2c3e-0000-4000-8000-000000000033")).status).toBe(204);
    const read=async(rid=saved.id,eid=eventId)=>(await db.sql("select request_intent_private.customer_notice_receipt_evidence($1::uuid,$2::uuid) as e",[rid,eid])).rows[0].e;
    expect(await read()).toBe("delivered");
    expect(await read("60000000-0000-4000-8000-000000000032")).toBe("unavailable");
    expect(await read(saved.id,"50000000-0000-4000-8000-000000000033")).toBe("unavailable");
    expect((await db.sql("select count(*)::int as n from request_intent_private.workflow_notice_receipts")).rows[0].n).toBe(2);
    expect((await db.sql("select status from public.research_notification_outbox where event_key=$1",["ea-request-customer-"+eventId])).rows[0].status).toBe("sent");
    expect(JSON.stringify((await db.sql("select * from request_intent_private.workflow_notice_receipts")).rows)).not.toMatch(/@|fixture storage|subject|svix-signature/);
  } finally { await db.close(); }
}, 30_000);
