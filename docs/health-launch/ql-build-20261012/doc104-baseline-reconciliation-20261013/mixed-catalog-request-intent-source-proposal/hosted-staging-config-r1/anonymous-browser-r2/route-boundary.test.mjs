import test from 'node:test';
import assert from 'node:assert/strict';
import {guardedRoute,trackedRoute,sanitizedOrigin} from './route-boundary.mjs';
const origin='https://xenios-research-staging.onrender.com';
function setup() {
  let first=null,allowed=0,denied=0;const tasks=new Set();
  const fail=(code,info={})=>{first??={code,...(info.url?{origin:sanitizedOrigin(info.url)}:{})};};
  const run=(route,overrides={})=>trackedRoute(guardedRoute(route,{
    targetOrigin:origin,isFailed:()=>first!==null,onFailure:fail,
    onDenied:()=>denied++,onAllowed:async r=>{allowed++;await r.continue();},...overrides
  }),tasks,fail);
  return {run,tasks,fail,first:()=>first,counts:()=>({allowed,denied})};
}
function route(url) {return {calls:[],request(){return {url:()=>url};},
  async abort(){this.calls.push('abort');},async continue(){this.calls.push('continue');}};}
test('off-origin blocked with only safe origin; later same-origin and data requests denied',async()=>{
  const h=setup(),r=route('https://user:password@outside.example/private?token=secret#secret');
  await h.run(r);await h.run(route(origin+'/'));await h.run(route('data:text/plain,secret'));
  assert.deepEqual(h.first(),{code:'OFF_ORIGIN_TRAFFIC',origin:'https://outside.example'});
  assert.deepEqual(h.counts(),{allowed:0,denied:3});assert.equal(h.tasks.size,0);
  assert.deepEqual(r.calls,['abort']);
});
test('same-origin and data continue only before failure',async()=>{
  const h=setup();await h.run(route(origin));await h.run(route('data:text/plain,ok'));
  assert.equal(h.first(),null);assert.equal(h.counts().allowed,1);
});
test('pre-body assertion is contained; original code retained',async()=>{
  const h=setup(),r=route(origin);
  await assert.doesNotReject(h.run(r,{onAllowed:()=>{throw Error('WINDOW_EXPIRED');}}));
  assert.equal(h.first().code,'WINDOW_EXPIRED');assert.deepEqual(r.calls,['abort']);
});
test('raw thrown message is sanitized',async()=>{
  const h=setup();await h.run(route(origin),{onAllowed:()=>{throw Error('private path?token=secret');}});
  assert.equal(h.first().code,'NETWORK_CHECK_FAILED');
});
test('abort failure is contained, not retried, original preserved',async()=>{
  const h=setup(),r=route('https://outside.example');let n=0;
  r.abort=async()=>{n++;throw Error('private');};
  await assert.doesNotReject(h.run(r));assert.equal(n,1);assert.equal(h.first().code,'OFF_ORIGIN_TRAFFIC');
});
test('malformed URL cannot escape',async()=>{
  const h=setup();await assert.doesNotReject(h.run(route('://secret')));
  assert.equal(h.first().code,'NETWORK_CHECK_FAILED');assert.equal(sanitizedOrigin('bad'),'invalid-origin');
});
test('unexpected rejection is handled and tasks drained',async()=>{
  const h=setup();await assert.doesNotReject(trackedRoute(Promise.reject(Error('private')),h.tasks,h.fail));
  assert.equal(h.first().code,'NETWORK_HANDLER_FAILED');assert.equal(h.tasks.size,0);
});
test('throwing failure callback does not leak rejection',async()=>{
  const h=setup();await assert.doesNotReject(h.run(route('https://outside.example'),{onFailure:()=>{throw Error('private');}}));
  await assert.doesNotReject(trackedRoute(Promise.reject(Error()),h.tasks,()=>{throw Error();}));
  assert.equal(h.tasks.size,0);
});
test('denial accounting callback failure cannot leak or permit request',async()=>{
  const h=setup(),r=route('https://outside.example');
  await assert.doesNotReject(h.run(r,{onDenied:()=>{throw Error('ACCOUNTING_FAILED');}}));
  assert.equal(h.first().code,'OFF_ORIGIN_TRAFFIC');assert.deepEqual(r.calls,['abort']);
});
test('data continuation rejection fails closed',async()=>{
  const h=setup(),r=route('data:text/plain,private');r.continue=async()=>{throw Error('private');};
  await assert.doesNotReject(h.run(r));assert.equal(h.first().code,'NETWORK_CHECK_FAILED');
  assert.deepEqual(r.calls,['abort']);
});
