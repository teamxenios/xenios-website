import { describe, expect, it, vi } from "vitest";
import { reconcileRequestIntentNotifications } from "./notification-reconciler";
const env = { RESEARCH_REQUEST_INTENT_NOTIFICATIONS_ENQUEUE_ENABLED: "true", RESEARCH_REQUEST_INTENT_NOTIFICATION_RECIPIENTS: "staff@example.invalid" };
describe("bounded default-off notification SQL-batch seam", () => {
  it.each([undefined,"false","TRUE","1"])("does not even acquire a client when disabled %s", value => {
    const client = vi.fn(); return reconcileRequestIntentNotifications({...env,RESEARCH_REQUEST_INTENT_NOTIFICATIONS_ENQUEUE_ENABLED:value},client).then(result=>{
      expect(result.state).toBe("disabled"); expect(client).not.toHaveBeenCalled();
    });
  });
  it("does not call SQL without explicit recipients", async () => {
    const client=vi.fn(); expect((await reconcileRequestIntentNotifications({...env,RESEARCH_REQUEST_INTENT_NOTIFICATION_RECIPIENTS:""},client)).state).toBe("blocked");
    expect(client).not.toHaveBeenCalled();
  });
  it("uses exactly the batch RPC/normalized recipients/limit and returns aggregate counts", async () => {
    const rpc=vi.fn(async()=>({data:{selected:10,inserted:7},error:null}));
    expect(await reconcileRequestIntentNotifications(env,()=>({rpc}))).toEqual({state:"ok",selected:10,inserted:7});
    expect(rpc).toHaveBeenCalledExactlyOnceWith("request_intent_reconcile_notifications",{p_recipients:["staff@example.invalid"],p_limit:10});
  });
  it.each([null,[],{}, {selected:11,inserted:1},{selected:1,inserted:2},{selected:-1,inserted:0},{selected:1,inserted:1,contact:"bad"},{selected:1.5,inserted:1}])("blocks malformed aggregate output %j", async data => {
    expect((await reconcileRequestIntentNotifications(env,()=>({rpc:async()=>({data,error:null})}))).state).toBe("blocked");
  });
  it("sanitizes errors without exposing diagnostics", async () => {
    const result=await reconcileRequestIntentNotifications(env,()=>({rpc:async()=>{throw Error("private diagnostic")}}));
    expect(result).toEqual({state:"blocked",selected:0,inserted:0});
  });
});
