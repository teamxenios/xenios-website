// @vitest-environment jsdom
import {act,type ReactNode} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {useLocation} from "wouter";
import type {MemberInfo,ResearchContextValue} from "../core";

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
type Session={access_token:string;user:{id:string;user_metadata?:Record<string,string>}};
const sdk=vi.hoisted(()=>{
 const state={session:null as Session|null,readError:false};
 const listeners=new Set<(event:string,session:Session|null)=>void>();
 const unsubscribe=vi.fn();
 const emit=(event:string,session:Session|null)=>{state.session=session;for(const fn of listeners)fn(event,session);};
 const auth={
  signInWithPassword:vi.fn(async()=>({data:{session:state.session},error:null})),
  getSession:vi.fn(async()=>({data:{session:state.session},error:state.readError?{message:"synthetic unavailable"}:null})),
  onAuthStateChange:vi.fn((fn:(event:string,session:Session|null)=>void)=>{
   listeners.add(fn);return {data:{subscription:{unsubscribe:()=>{unsubscribe();listeners.delete(fn);}}}};
  }),
  signOut:vi.fn(),
 };
 return {state,listeners,auth,emit,unsubscribe};
});
vi.mock("@/lib/supabaseBrowser",()=>({getSupabaseBrowser:async()=>({auth:sdk.auth}),
 isRecoveryAccessToken:(token:string)=>token.includes("recovery")}));
vi.mock("@/components/SeoHead",()=>({default:()=>null}));
vi.mock("@/components/PageShell",()=>({default:({children}:{children:ReactNode})=><main>{children}</main>}));

import {ResearchContext} from "../core";
import SignIn from "./SignIn";
import {AePortalRoute} from "../account-executive/AePortalRoute";

const actor="10000000-0000-4000-8000-000000000001",scope="20000000-0000-4000-8000-000000000001";
function session(label="password",subject=actor):Session {
 const claims=btoa(JSON.stringify({sub:subject,session_id:"30000000-0000-4000-8000-000000000001",amr:[{method:"password"}]}))
  .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
 return {access_token:`synthetic.${claims}.${label}`,user:{id:subject}};
}
const contextReply={ok:true,value:{scopeId:scope}};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
let root:Root|null,host:HTMLDivElement,fetcher:ReturnType<typeof vi.fn<typeof fetch>>;
let establish:ReturnType<typeof vi.fn<(token:string)=>Promise<MemberInfo|null>>>;
let denial:{code:string}|null,recovery:ResearchContextValue["recovery"];
function provider():ResearchContextValue{return {gate:"locked",member:null,memberToken:null,memberChecking:false,
 memberSessionStatus:"signed_out",recovery,establishMemberSession:establish,peekMemberDenial:()=>denial,
 clearRecovery:()=>{},memberDenial:denial,refreshMember:async()=>{},signOutMember:async()=>{},
 signOutRecoverySession:async()=>{},products:[],bySlug:new Map(),commerce:{research:false,consumer:false},email:"",
 submitPassword:async()=>null,logout:async()=>{},items:[],addItem:()=>{},removeItem:()=>{},setQuantity:()=>{},
 clearLane:()=>{},count:0,laneItems:()=>[]};}
function Harness({guarded=false}:{guarded?:boolean}){
 const [path]=useLocation();
 return guarded&&path==="/research/account-executive"?<AePortalRoute/>:
  <ResearchContext.Provider value={provider()}><SignIn/></ResearchContext.Provider>;
}
async function flush(rounds=5){for(let i=0;i<rounds;i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});}
async function mount(search="",guarded=false){
 window.history.replaceState(null,"","/research/sign-in"+search);
 await act(async()=>root!.render(<Harness guarded={guarded}/>));
 await act(async()=>{
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!;
  for(const [id,value]of [["ms-email","staff@example.invalid"],["ms-password","synthetic-password"]]){
   const input=host.querySelector("#"+id)!;setter.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}));
  }
 });
}
function submit(){act(()=>{host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});}
beforeEach(()=>{
 vi.clearAllMocks();sdk.listeners.clear();sdk.state.session=session();sdk.state.readError=false;
 denial={code:"account_access_required"};recovery="none";
 establish=vi.fn(async()=>null);fetcher=vi.fn(async()=>json(contextReply));vi.stubGlobal("fetch",fetcher);
 sessionStorage.clear();window.history.replaceState(null,"","/research/sign-in");
 host=document.createElement("div");document.body.appendChild(host);root=createRoot(host);
});
afterEach(()=>{if(root)act(()=>root!.unmount());root=null;host.remove();vi.unstubAllGlobals();});

describe("ordinary no-customer staff entry discovery",()=>{
 it.each(["staff","customer-without-staff"])("uses context only to navigate %s, never as role or customer proof",async label=>{
  sdk.state.session!.user.user_metadata={role:label,title:label};
  await mount();submit();await flush();
  expect(window.location.pathname).toBe("/research/account-executive");
  expect(establish).toHaveBeenCalledExactlyOnceWith(sdk.state.session!.access_token);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith("/api/research/account-executive/context",expect.objectContaining({
   method:"GET",credentials:"same-origin",cache:"no-store",redirect:"error",
   headers:{Authorization:`Bearer ${sdk.state.session!.access_token}`,Accept:"application/json"},signal:expect.any(AbortSignal)}));
  expect(provider().member).toBeNull();expect(provider().memberToken).toBeNull();
  expect(sdk.auth.signOut).not.toHaveBeenCalled();expect(sdk.unsubscribe).toHaveBeenCalledTimes(1);
  expect(host.textContent).not.toMatch(/access verified|eligible AE|authorized staff/i);
 });
 it("the actual guarded AE route still refuses private workspace after context 200",async()=>{
  fetcher.mockImplementation(async path=>String(path).endsWith("/context")?json(contextReply):json({ok:false,code:"access_denied"},403));
  await mount("",true);submit();await flush(10);
  expect(window.location.pathname).toBe("/research/account-executive");
  expect(fetcher.mock.calls.some(([path])=>String(path)==="/api/research/account-executive/workspace")).toBe(true);
  expect(host.textContent).toContain("Workspace access denied");
  expect(host.textContent).toContain("No earlier customer details are displayed");
  expect([...host.querySelectorAll("a")].find(link=>link.textContent==="Customer account access")?.getAttribute("href"))
   .toBe("/research/access-state?code=account_access_required");
  expect(provider().member).toBeNull();expect(sdk.auth.signOut).not.toHaveBeenCalled();
 });
 it.each([
  [401,{ok:false,code:"access_denied"}],[403,{ok:false,code:"access_denied"}],
  [404,{ok:false,code:"not_found"}],[429,{ok:false,code:"unavailable"}],
  [503,{ok:false,code:"unavailable"}],[200,{ok:true,value:{scopeId:"not-a-scope"}}],
  [200,{...contextReply,role:"staff"}],[200,null],
 ] as const)("preserves the canonical customer next step after context status %s",async(status,body)=>{
  fetcher.mockResolvedValue(json(body,status));await mount();submit();await flush();
  expect(window.location.pathname).toBe("/research/access-state");
  expect(new URLSearchParams(window.location.search).get("code")).toBe("account_access_required");
  expect(host.textContent).not.toMatch(/not staff|no staff role|staff workspace could not be checked|access verified/i);
  expect(host.querySelector('[aria-label="Staff workspaces"]')).not.toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);expect(sdk.auth.signOut).not.toHaveBeenCalled();
 });
 it.each(["network","html"])("keeps failed %s context private and restores customer denial",async failure=>{
  if(failure==="network")fetcher.mockRejectedValue(new Error("private endpoint diagnostic"));
  else fetcher.mockResolvedValue(new Response("<html>private endpoint diagnostic</html>"));
  await mount();submit();await flush();
  expect(window.location.pathname).toBe("/research/access-state");
  expect(new URLSearchParams(window.location.search).get("code")).toBe("account_access_required");
  expect(host.textContent).not.toContain("staff workspace could not be checked");
  expect(host.textContent).not.toContain("private endpoint diagnostic");
 });
 it("uses the existing customer denial after the scheduled 30-second probe abort",async()=>{
  const timer=vi.spyOn(globalThis,"setTimeout");
  try {
   fetcher.mockImplementation(async(_path,init)=>new Promise<Response>((_resolve,reject)=>{
    init?.signal?.addEventListener("abort",()=>reject(new Error("synthetic abort")),{once:true});
   }));
   await mount();submit();await flush(2);
   const scheduled=timer.mock.calls.find(([,delay])=>delay===30_000)?.[0];
   expect(scheduled).toBeTypeOf("function");
   act(()=>{(scheduled as ()=>void)();});await flush();
   expect(window.location.pathname).toBe("/research/access-state");
   expect(new URLSearchParams(window.location.search).get("code")).toBe("account_access_required");
   expect(host.textContent).not.toContain("staff workspace could not be checked");
   expect(fetcher).toHaveBeenCalledTimes(1);
  }finally{timer.mockRestore();}
 });
 it("puts the existing keyboard-accessible staff choices above the phone sign-in form",async()=>{
  await mount();const nav=host.querySelector('[aria-label="Staff workspaces"]')!,form=host.querySelector("form")!;
  expect(nav.compareDocumentPosition(form)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect([...nav.querySelectorAll("a")].map(link=>link.getAttribute("href"))).toEqual(["/care/request-intents","/research/account-executive"]);
  expect([...nav.querySelectorAll("a")].every(link=>link.classList.contains("min-h-11"))).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
 });
});

describe("existing sign-in destinations and fences",()=>{
 it("retains normal verified customer routing without probing staff context",async()=>{
  establish.mockResolvedValue({firstName:"Synthetic",status:"active",applicationStatus:"active"});
  await mount();submit();await flush();expect(window.location.pathname).toBe("/research/account");expect(fetcher).not.toHaveBeenCalled();
 });
 it.each(["/care/request-intents","/research/account-executive"])("preserves explicit staff returnTo %s without customer hydration",async path=>{
  await mount("?returnTo="+encodeURIComponent(path));submit();await flush();
  expect(window.location.pathname).toBe(path);expect(establish).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
 });
 it("preserves verified customer partner returnTo",async()=>{
  establish.mockResolvedValue({firstName:"Synthetic",status:"active",applicationStatus:"active"});
  await mount("?returnTo=%2Fresearch%2Fpartners%2Fdashboard");submit();await flush();
  expect(window.location.pathname).toBe("/research/partners/dashboard");expect(fetcher).not.toHaveBeenCalled();
 });
 it("retains explicit account denial and approval-link claim rather than overriding them",async()=>{
  await mount("?returnTo=%2Fresearch%2Faccount");submit();await flush();
  expect(window.location.pathname).toBe("/research/access-state");expect(fetcher).not.toHaveBeenCalled();
 });
 it("preserves actual ephemeral claim return",async()=>{
  sessionStorage.setItem("xr-application-token","synthetic-claim");
  await mount("?returnTo=%2Fresearch%2Fapply%2Fstatus");submit();await flush();
  expect(window.location.pathname).toBe("/research/apply/status");expect(fetcher).not.toHaveBeenCalled();
 });
 it("keeps recovery-purpose denial ahead of context discovery",async()=>{
  sdk.state.session=session("recovery");await mount();submit();await flush();
  expect(new URLSearchParams(window.location.search).get("code")).toBe("recovery_session");
  expect(establish).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
 });
 it.each(["SIGNED_OUT","TOKEN_REFRESHED","SIGNED_IN","PASSWORD_RECOVERY"])("drops a late context result after %s even if the old token reappears",async event=>{
  const pending=deferred<Response>();fetcher.mockReturnValue(pending.promise);await mount();submit();await flush(2);
  expect(fetcher).toHaveBeenCalledTimes(1);const original=sdk.state.session;
  act(()=>sdk.emit(event,event==="SIGNED_OUT"?null:session(event,event==="SIGNED_IN"?scope:actor)));
  // A delayed old result cannot regain currency merely by matching a later read.
  sdk.state.session=original;
  await act(async()=>pending.resolve(json(contextReply)));await flush();
  expect(window.location.pathname).toBe("/research/sign-in");expect(host.textContent).toContain("Your session changed");
  expect((fetcher.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
  expect(sdk.auth.signOut).not.toHaveBeenCalled();
 });
 it("re-reads canonical identity when a switch has no observed Auth callback",async()=>{
  const pending=deferred<Response>();fetcher.mockReturnValue(pending.promise);await mount();submit();await flush(2);
  sdk.state.session=session("different",scope);await act(async()=>pending.resolve(json(contextReply)));await flush();
  expect(window.location.pathname).toBe("/research/sign-in");expect(host.textContent).toContain("Your session changed");
 });
 it("keeps a genuine callback-free session switch stopped even when the context transport throws",async()=>{
  fetcher.mockImplementation(async()=>{sdk.state.session=session("different",scope);throw new Error("synthetic network failure");});
  await mount();submit();await flush();
  expect(window.location.pathname).toBe("/research/sign-in");expect(host.textContent).toContain("Your session changed");
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it("falls through to customer denial when a canonical read is unavailable without a known session change",async()=>{
  const pending=deferred<Response>();fetcher.mockReturnValue(pending.promise);await mount();submit();await flush(2);
  sdk.state.readError=true;await act(async()=>pending.resolve(json(contextReply)));await flush();
  expect(window.location.pathname).toBe("/research/access-state");
  expect(new URLSearchParams(window.location.search).get("code")).toBe("account_access_required");
  expect(host.textContent).not.toMatch(/Your session changed|staff workspace could not be checked/);
 });
 it("aborts and unsubscribes on unmount and never navigates from a held context read",async()=>{
  const pending=deferred<Response>();fetcher.mockReturnValue(pending.promise);await mount();submit();await flush(2);
  await act(async()=>root!.unmount());root=null;
  expect(sdk.listeners.size).toBe(0);expect(sdk.unsubscribe).toHaveBeenCalledTimes(1);
  expect((fetcher.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
  await act(async()=>pending.resolve(json(contextReply)));await flush();
  expect(window.location.pathname).toBe("/research/sign-in");
 });
});
