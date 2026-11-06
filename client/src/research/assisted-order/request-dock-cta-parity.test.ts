import { describe, expect, it } from "vitest";
import { requestBarAction, type RequestBarState } from "./persistent-request-bar-model";
const ready: RequestBarState = {
  step: "review", selectedCount: 1, continuationEnabled: true, storageReady: true,
  configReady: true, contactReady: true, requirementsNeedRefresh: false,
  requirementsCount: 1, allAcknowledged: true, busy: false, frozen: false,
};
describe("consistent persistent-dock labels", () => {
  it("navigates at the product step", () => {
    expect(requestBarAction({...ready,step:"products"})).toMatchObject({label:"Continue to details",type:"button",disabled:false});
  });
  it("uses the native contact form before final submission", () => {
    expect(requestBarAction({...ready,step:"contact"})).toMatchObject({label:"Continue to submit request",type:"submit",disabled:false});
  });
  it("labels the existing final send action Submit request", () => {
    expect(requestBarAction(ready)).toMatchObject({label:"Submit request",type:"button",disabled:false});
  });
  it("does not unlock submission when standing is absent", () => {
    expect(requestBarAction({...ready,continuationEnabled:false}).disabled).toBe(true);
  });
  it("does not unlock submission when acknowledgments are missing", () => {
    expect(requestBarAction({...ready,allAcknowledged:false}).disabled).toBe(true);
  });
  it("keeps the original retry identity explicit", () => {
    expect(requestBarAction({...ready,frozen:true})).toMatchObject({label:"Retry same request",disabled:false});
  });
  it("blocks repeat activation while a frozen request is submitting", () => {
    expect(requestBarAction({...ready,busy:true,frozen:true})).toMatchObject({label:"Submitting request…",disabled:true});
  });
  it("keeps the send action disabled during a requirements read", () => {
    expect(requestBarAction({...ready,busy:true,configReady:false,requirementsNeedRefresh:true}))
      .toMatchObject({label:"Submit request",disabled:true});
  });
});
