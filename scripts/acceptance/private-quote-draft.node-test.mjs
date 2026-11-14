import test from "node:test";
import assert from "node:assert/strict";
import { worksheet, centralDate, displayUsd, makeQuoteCover, usableQuoteContact } from "../../client/src/research/assisted-order/private-quote-draft.ts";

const saved = { publicReference:"XRI-1234567890ABCDEF1234567890ABCDEF", email:"staff.test+customer@example.invalid" };
const copy = { requestReference:saved.publicReference, recipient:saved.email, quoteNumber:"EA-2026-009", validThrough:"2028-02-29", finalUsd:"0.30", checked:true };
const draft=(patch={}, who=saved)=>makeQuoteCover(who,{...copy,...patch},"2026-12-31");

test("partial subtotal never counts unpriced items; integer arithmetic in cents",()=>{
  assert.deepEqual(worksheet([{quantity:3,unitUsd:"0.10"},{quantity:2,unitUsd:""},{quantity:2,unitUsd:"10.35"}]),
    {amounts:[30,null,2070], totalCents:2100, priced:2,unpriced:1});
  assert.equal(displayUsd(30),"$0.30");
});
test("invalid amounts, malformed quantity and unsafe totals block instead of rounding",()=>{
  for(const v of ["16.999","1e2","-100","NaN","Infinity","1,000","0.00","1\n2","10000000"]){
    assert.equal(worksheet([{unitUsd:v,quantity:2}]),null,v);
    assert.equal(draft({finalUsd:v}).ok,false,v);
  }
  for(const q of [0,-1,1.1,Infinity,Number.MAX_SAFE_INTEGER]) assert.equal(worksheet([{quantity:q,unitUsd:"12.99"}]),null);
});
test("requires a matching real single recipient and correct saved reference, including malformed readbacks",()=>{
  for(const recipient of ["staff2@example.invalid",saved.email+",other@example.invalid",saved.email+"\r\nBCC:x@y.invalid","Name <"+saved.email+">"])
    assert.equal(draft({recipient}).ok,false);
  assert.equal(draft({requestReference:saved.publicReference.replace("1","B")}).ok,false);
  assert.equal(draft({recipient:saved.email.replace("example","EXAMPLE")}).ok,true);
  for(const email of [null,undefined,"","a..b@example.invalid","a@x.invalid,y@example.invalid","a@-x.invalid"])
    assert.equal(usableQuoteContact({...saved,email}),false);
  assert.equal(draft({}, {...saved, publicReference:saved.publicReference+"Z"}).ok,false);
});
test("the copied cover only conveys the approved quote fields, never raw request data",()=>{
  const result=draft({}, {...saved,fullLegalName:"PRIVATE_METRIC",address:"PRIVATE_ADDRESS",lines:[{product:"PRIVATE_COMPOUND"}],goal:"PRIVATE_GOAL"});
  assert.equal(result.ok,true); assert.equal(result.from,"team@xeniostechnology.com");
  assert.equal(result.replyTo,result.from); assert.equal(result.to,saved.email);
  assert.match(result.body,/\$0\.30 USD/);
  assert.doesNotMatch(result.subject,/XRI-/);
  assert.doesNotMatch(result.body,/PRIVATE_|approved treatment|payment link/i);
});
test("invalid quote IDs, expiry and missing operator check do not yield an email",()=>{
  for(const patch of [{quoteNumber:"A\r\nBCC:other@example.invalid"},{quoteNumber:"<html>"},{checked:false},
    {validThrough:"2027-02-29"},{validThrough:"2020-11-12"},{validThrough:"2026/12/31"}])assert.equal(draft(patch).ok,false);
  assert.equal(draft({validThrough:"2026-12-31"}).ok,true);
});
test("Central date does not expire a quote at UTC midnight",()=>{
  assert.equal(centralDate(new Date("2026-11-12T01:10:00Z")),"2026-11-11");
  assert.equal(centralDate(new Date("2026-11-12T06:01:00Z")),"2026-11-12");
});
