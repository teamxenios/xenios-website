// Deliberately not imported from server/index.ts. The existing composition owner must
// supply these private authorities; no environment flag manufactures capabilities.
import {makePrivateQuoteDesk} from './workflow.mjs';
import {attachPrivateQuotePortal} from './portal.mjs';
import {pgTransactions} from './pg.mjs';
import {dispatchSharedQuoteJob} from './shared-worker.mjs';
import {attachResendReceiptDoor,createResendReceipts,signedQuoteReceiptVerifier} from './signed-receipts.mjs';
export function attachApprovedPrivateQuotes({enabled=false,router,pool,authority,Engine,bind,transport,tagKey,
  customerPrincipal,ownedRequests,staffPrincipal,csrfChecked,registerPrivateQuoteDispatch,receiptEndpoint=null,
  assumeStagingRuntimeRole=false}) {
  if(enabled!==true)return null;
  for(const p of [Engine,bind,customerPrincipal,ownedRequests,staffPrincipal,csrfChecked,registerPrivateQuoteDispatch,
    authority?.forIssue,authority?.forDispatch,authority?.forCustomer,receiptEndpoint?.enabled===true?()=>{}:authority?.verifiedDispatchEvidence]){
    if(typeof p!=='function')throw Error('Missing private quote authority.');
  }
  if(!transport?.ready?.()||typeof pool?.connect!=='function')throw Error('Private quote transport or database unavailable.');
  const transact=pgTransactions(pool,{assumeStagingRuntimeRole});
  let receipts=null;
  const deskAuthority={
    forIssue:authority.forIssue.bind(authority),forCustomer:authority.forCustomer.bind(authority),
    forDispatch:authority.forDispatch.bind(authority),verifiedDispatchEvidence:authority.verifiedDispatchEvidence?.bind(authority)??(async()=>null),
    verifiedReplyEvidence:authority.verifiedReplyEvidence?.bind(authority)??(async()=>null)
  };
  if(receiptEndpoint?.enabled===true){
    if(typeof receiptEndpoint.expressRaw!=='function')throw Error('Raw receipt parser required.');
    receipts=createResendReceipts({tenant:receiptEndpoint.tenant,tagKey,transact,verifier:signedQuoteReceiptVerifier({secrets:receiptEndpoint.secrets,tagKey})});
    deskAuthority.verifiedDispatchEvidence=receipts.verifiedDispatchEvidence;
  }
  const desk=makePrivateQuoteDesk({transact,authority:deskAuthority,Engine,bind,transport,tagKey});
  registerPrivateQuoteDispatch(async job=>{
    const result=await dispatchSharedQuoteJob(job,desk);
    if(result.providerId && receipts && job.payload.tenant===receiptEndpoint.tenant){
      // A signed webhook may arrive before the provider's send() response was committed.
      // If reconciliation temporarily fails, the shared worker retries; the private claim prevents a resend.
      await receipts.drainAfterAck(result.providerId,desk.reconcile);
    }
    return result;
  });
  if(receipts)attachResendReceiptDoor(router,{raw:receiptEndpoint.expressRaw,receipts,reconcile:desk.reconcile});
  attachPrivateQuotePortal(router,{desk,customerPrincipal,ownedRequests,staffPrincipal,csrfChecked});
  return {recordVerifiedDelivery:desk.reconcile,recordVerifiedReply:desk.recordReply};
}
