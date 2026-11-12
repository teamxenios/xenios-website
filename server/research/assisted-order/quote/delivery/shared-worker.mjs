// Same contract as enqueueNotificationOnce; reuse the existing worker, not a second mail queue.
export const TEMPLATE='ea_private_quote_notice_v1';
export async function enqueueSharedQuoteJob(q,{tenant,xriId,quoteId,recipient,eventKey}) {
 const inserted=await q("INSERT INTO public.research_notification_outbox(event_key,event_type,template_key,recipient,payload) VALUES($1,$2,$2,$3,$4) ON CONFLICT(event_key) DO NOTHING RETURNING event_key",
 [eventKey,TEMPLATE,recipient,JSON.stringify({tenant,xriId,quoteId})]);
 if(inserted.length!==1)throw Error('Quote notification key conflict.');
}
// Call only from the existing privileged worker dispatch(job) for this template.
// Explicit terminal uncertainty prevents the shared generic retry branch from blindly sending again.
export async function dispatchSharedQuoteJob(job,desk) {
 if(job?.template_key!==TEMPLATE || job.event_type!==TEMPLATE ||
   typeof job?.event_key!=='string' || !/^qd-[0-9a-f]{64}$/.test(job.event_key) ||
   typeof job?.recipient!=='string' || !job?.payload || Object.keys(job.payload).sort().join(',')!=='quoteId,tenant,xriId')
   return {ok:false,providerId:null,error:'Invalid private quote notification.',nonRetryable:true};
 const {tenant,xriId,quoteId}=job.payload;
 try{
   const result=await desk.handleQueuedJob(tenant,xriId,quoteId,job.event_key,job.recipient);
   if(['accepted','delivered'].includes(result.state)&&result.providerId)return {ok:true,providerId:result.providerId};
   return {ok:false,providerId:null,nonRetryable:!['disabled'].includes(result.state),error:result.state==='disabled'?'Quote channel unavailable.':'Quote notice suppressed or requires reconciliation.'};
 }catch{return {ok:false,providerId:null,nonRetryable:false,error:'Private quote dispatch unavailable.'};}
}
