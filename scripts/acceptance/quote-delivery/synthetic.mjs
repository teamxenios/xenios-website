const key=Buffer.alloc(32,23),xri='1520449e-7cfd-4ebb-b193-bd85b507aeef',s='seller-A',tenant='a',now='2027-01-10T12:00:00Z';
const viewer=(o={})=>({subject:'staff-A',tenant,memberId:null,earlyAccessSessionHash:null,actorLabel:'staff-A',capabilities:new Set(['assisted_orders:manage']),...o});
const customer=(o={})=>viewer({subject:'customer',earlyAccessSessionHash:'owned-session',capabilities:new Set(['assisted_orders:read_own']),...o});
const src={productId:'p',variantId:'v',sourceVariantId:'vsrc',quantity:2,catalogVersion:'r2',workflowMode:'provider_request',researchUseOnly:false,clinicalReviewRequired:true};
const target={requestId:'issue-source',sellerId:s,lines:[{lineId:'real-line',productId:'p',variantId:'v',quantity:2,productName:'Private synthetic item <script>',specification:'pkg',currency:'USD',unitPriceCents:null}]};
const intent={requestId:xri,publicReference:'XRI-'+xri.replaceAll('-','').toUpperCase(),kind:'unapproved_selection_request',status:'pending_review',lines:[src]};
const ctx=()=>structuredClone({tenant,issueAuthorized:true,notifyAuthorized:true,dispatchAuthorized:true,customerAuthorized:true,currentStanding:true,target,intent,
 binding:{requestId:target.requestId,publicReference:'XAO-synthetic',actorMemberId:null,earlyAccessSessionHash:'owned-session'},
 bindings:[{xriRequestId:xri,xriReference:intent.publicReference,issueRequestId:target.requestId,issueLineId:'real-line',sellerId:s,approvalEvidenceId:'approved-synthetic',clearedForQuotation:true,source:src}],
 contact:{email:'test@example.invalid',revision:'v1',requestId:xri,verified:true,deliveryAllowed:true}});
const request=(o={})=>({seller:s,xriId:xri,attempt:'cmd1',expectedVersion:0,lines:[{requestLineId:'real-line',unitPriceCents:1275,pricingBasis:'private-base'}],validUntil:'2027-01-11T00:00:00Z',...o});

export {key,xri,s,tenant,now,viewer,customer,ctx,request};
