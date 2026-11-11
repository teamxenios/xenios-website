// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi } from "vitest";
import type { RequestIntentCatalogItem } from "../../../../shared/research/assisted-order/request-intent";
import { ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS, assistedOrderFormPair } from "../../../../shared/research/assisted-order/form";
import { RequestIntentForm } from "./RequestIntentForm";
import type { RequestIntentApi } from "./request-intent-api";
vi.mock("./assisted-order.css", () => ({default:{}}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row: RequestIntentCatalogItem = {
  productId:"synthetic",variantId:"syn-v",productName:"Synthetic education",family:"clinical_formulations_503a",
  channel:"synthetic",specification:"Synthetic specification",format:null,packBasis:null,minimumQuantity:1,maximumQuantity:100,quantityIncrement:1,
  unitPriceCents:null,currency:"USD",workflowMode:"provider_request",actionLabel:"Details under review",accessNotice:null,
  researchUseOnly:false,catalogVersion:"synthetic",priceVersion:null,
  sourceSelection:{family:"clinical_formulations_503a",slug:"synthetic",variantId:"mov_0b"},
  selectableForReview:true,intentExclusion:"specification_review",clinicalReviewRequired:true,sourceDisplayState:"care_pathway",
  sourceVariantDisplayState:"care_pathway",sourceRefusal:null,
  reviewedContent:{summary:"Explicitly cleared synthetic summary.",overview:"Complete synthetic educational description."},
  reviewMessage:"Synthetic listing remains on hold.",
};
describe("an exact education-only exception preserves hold notice in both contexts",()=>{
 for(const owner of ["early-access-session","a".repeat(64)]) it("shows copy with the hold in the card and its dialog: "+owner.slice(0,7),async()=>{
  const api:RequestIntentApi={
   config:vi.fn(async()=>({legal:[],form:ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map(a=>({id:a.id,scope:a.scope,copy:a.copy,...assistedOrderFormPair(a)}))})),
   catalog:vi.fn(async()=>({items:[row],total:1,page:1,pageSize:24,families:[],channels:[],workflowModes:[]})),
   submit:vi.fn(),recover:vi.fn(),staff:vi.fn(),staffQueue:vi.fn(),
  };
  const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
  try{
   await act(async()=>root.render(<RequestIntentForm api={api} storage={sessionStorage} embedded ownerKey={owner}/>));
   const card=host.querySelector(".xenios-order-card");
   expect(card?.textContent).toContain(row.reviewMessage);
   expect(card?.textContent).toContain(row.reviewedContent!.summary);
   expect(card?.textContent).toContain("Not a prescription.");
   const button=card?.querySelector<HTMLButtonElement>('button[aria-label^="View details for "]');
   expect(button).toBeTruthy();await act(async()=>button!.click());
   const dialog=document.querySelector('[role="dialog"]');
   expect(dialog?.textContent).toContain(row.reviewMessage);
   expect(dialog?.textContent).toContain(row.reviewedContent!.overview);
   expect(api.submit).not.toHaveBeenCalled();
  }finally{await act(async()=>root.unmount());host.remove();sessionStorage.clear();}
 });
});
