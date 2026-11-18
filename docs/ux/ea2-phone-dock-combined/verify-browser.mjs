// CLAUDE-1, EA2 brief 06 browser requirement: every guest catalog card, with and without reviewed artwork, at
// 320 / 390 / 1280 px and 100 / 200 % browser text, plus one slow-image pass. Real catalog, admission and
// request-intent service code from <repo>; the built client from <dist>; synthetic viewer; in-memory stores; no
// submit, no mail, loopback only. Adapted from the 11-12 guest catalog harness (ea-media-check.mjs).
// Usage: node nophoto-sweep.mjs <repo> <dist/public> <out-dir>
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

if (process.env.NODE_ENV === "production") throw Error("synthetic only");
const [repoArg, distArg, outArg] = process.argv.slice(2);
const repo = resolve(repoArg), dist = resolve(distArg), out = resolve(outArg);
mkdirSync(out, { recursive: false });
process.env.TSX_TSCONFIG_PATH = join(repo, "tsconfig.json");
const requireRepo = createRequire(join(repo, "package.json"));
const ts = requireRepo("tsx/cjs/api");
const load = (p) => ts.require("./" + p, join(repo, "package.json"));
const express = requireRepo("express");
const { chromium } = createRequire("C:/Users/sboad/Downloads/hercules/package.json")("playwright-core");

const { RequestIntentService } = load("server/research/assisted-order/request-intent/service.ts");
const { GeneratedMasterOfferingCatalogReader } = load("server/research/master-offerings/dataset-reader.ts");
const { MasterOfferingCatalogService } = load("server/research/master-offerings/service.ts");
const { makeCatalogAdmission } = load("server/research/assisted-order/request-intent/catalog-admission.ts");
const { createRequestIntentCatalog } = load("server/research/assisted-order/request-intent/catalog.ts");
const { sha256AssistedOrderHasher: hasher } = load("server/research/assisted-order/defaults.ts");
const { ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS, assistedOrderFormPair } = load("shared/research/assisted-order/form.ts");
const { EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT: policy, policies } = load("server/research/policies-data.ts");

const reader = new GeneratedMasterOfferingCatalogReader(join(repo, "server/research/master-offerings/data/member-safe-master-offerings.generated.json"));
const offerings = new MasterOfferingCatalogService(reader, async () => ({ binding: null, selection: null }));
const agreements = ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map((e) => ({ id: e.id, scope: e.scope, copy: e.copy, ...assistedOrderFormPair(e) }));
const catalog = createRequestIntentCatalog({ catalogVersion: "synthetic-nophoto-sweep", bindingFor: () => null, offeringVariantFor: () => null,
  allListedInquirable: true, serviceFor: () => offerings });
const contacts = new Map();
let standing = false;
const viewer = { actorType: "early_access_session", earlyAccessCustomerRef: "synthetic-nophoto-sweep", earlyAccessSessionHash: "synthetic-cookie",
  capabilities: new Set(["assisted_orders:submit", "assisted_orders:read_own"]) };
const legal = { requiredAgreements: async () => [policy] };
const contactAdmission = makeCatalogAdmission(legal, hasher, {
  present: async (k) => contacts.has(k.ownerBinding + "|" + k.policyRevision),
  saveFirst: async (k, c) => { const key = k.ownerBinding + "|" + k.policyRevision, facts = JSON.stringify(c);
    if (contacts.has(key)) return contacts.get(key) === facts ? "already_same" : "different_contact"; contacts.set(key, facts); return "committed"; },
});
const service = new RequestIntentService({ catalog, hasher, optionalIntakeEnabled: true, standing: { accepted: async () => standing }, legal, contactAdmission,
  ids: { uuid: randomUUID, publicReference: () => { throw Error("unused"); }, opaqueToken: () => { throw Error("unused"); } }, clock: { now: () => new Date() },
  repository: { findAttempt: async () => null, createOrReplay: async () => { throw Error("submit is not part of this check"); } } });
const endpoint = "/api/research/early-access/request-intents";
const unknown = [];
async function api(path, method, body) {
  const url = new URL(path, "http://127.0.0.1"), route = url.pathname;
  try {
    if (method === "GET") {
      if (route === "/api/config") return [200, { metaPixelId: null, turnstileSiteKey: null, calendlyUrl: "", supabaseUrl: null, supabaseAnonKey: null }];
      if (route === "/api/research/me") return [200, { configured: true, authed: true }];
      if (route === "/api/research/policies") return [200, { policies }];
      if (route === "/api/research/early-access/session") return [200, { authenticated: true, expiresAt: null }];
      if (route === "/api/research/early-access/agreements") return [200, { ok: true, required: [policy], accepted: standing }];
      if (route === "/api/research/early-access/assisted-orders/config") return [200, { enabled: false }];
      if (route === endpoint + "/config") return [200, { enabled: true, requiredAgreements: [policy], formAcknowledgments: agreements, optionalIntakeEnabled: true, contactAdmissionRequired: true }];
      if (route === endpoint + "/admission") return [200, await service.admissionStatus(viewer)];
      if (route === endpoint + "/catalog") { const q = Object.fromEntries(url.searchParams); for (const n of ["page", "pageSize"]) if (n in q) q[n] = Number(q[n]); return [200, await service.list(viewer, q)]; }
    }
    if (method === "POST") {
      if (route === "/api/research/early-access/agreements/accept" && body?.kind === policy.kind && body?.version === policy.version) { const prev = standing; standing = true; return [200, { ok: true, ...policy, alreadyAccepted: prev }]; }
      if (route === endpoint + "/admission") return [200, await service.recordAdmission(viewer, body)];
    }
    unknown.push(method + " " + route); return [404, { error: "unexpected_check_route" }];
  } catch (err) { return [err.status || 500, { error: err.code || "synthetic_failure" }]; }
}
let imageDelayMs = 0;
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));
app.use("/api", async (req, res) => { const [status, body] = await api(req.originalUrl, req.method, req.body); res.set("Cache-Control", "no-store").status(status).json(body); });
app.use("/research/product-media", (_req, _res, next) => imageDelayMs ? setTimeout(next, imageDelayMs) : next());
app.use(express.static(dist, { index: false }));
app.get("/earlyaccess", (_req, res) => res.sendFile(join(dist, "index.html")));
const server = await new Promise((ok, bad) => { const s = app.listen(0, "127.0.0.1", () => ok(s)); s.once("error", bad); });
const origin = "http://127.0.0.1:" + server.address().port;

// Measures one card in the page; runs in the browser.
function measureCard(el) {
  const c = el.getBoundingClientRect(), pad = parseFloat(getComputedStyle(el).paddingLeft);
  const h = el.querySelector("h2"), hr = h.getBoundingClientRect();
  const meta = el.querySelector(".xenios-order-card-meta"), actions = el.querySelector(".xenios-order-card-actions");
  const controls = [...actions.querySelectorAll("button, a, input")].filter((x) => x.getClientRects().length);
  const outside = controls.filter((x) => { const r = x.getBoundingClientRect(); return r.left < c.left - 0.5 || r.right > c.right + 0.5; }).length;
  const words = (h.textContent || "").split(/\s+/).filter(Boolean);
  // Words broken across lines: overflow-wrap:anywhere hides this from any overflow check. For every text node in the
  // heading, identity and meta blocks, a word whose range has more than one line box was split mid-word.
  const split = [];
  for (const root of [h, el.querySelector(".xenios-order-card-identity"), meta].filter(Boolean)) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const re = /\S+/g; let mm;
      while ((mm = re.exec(t.data))) {
        const rg = document.createRange(); rg.setStart(t, mm.index); rg.setEnd(t, mm.index + mm[0].length);
        const tops = new Set([...rg.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top)));
        if (tops.size > 1 && !/[-/·‐-―]/.test(mm[0])) split.push(mm[0]);
      }
    }
  }
  return {
    splitWords: [...new Set(split)].slice(0, 6), splitCount: split.length,
    fontH2: getComputedStyle(h).fontSize, fontP: getComputedStyle(el.querySelector(".xenios-order-card-identity p") || h).fontSize,
    img: el.querySelector("img")?.getAttribute("src") ?? null,
    noMediaClass: el.querySelector(".xenios-order-card-intro")?.classList.contains("xenios-order-card-intro--no-media") ?? null,
    mediaBox: !!el.querySelector(".xenios-order-card-media"),
    headingInset: Math.round(hr.left - c.left - pad), headingWidth: Math.round(hr.width), cardWidth: Math.round(c.width), cardHeight: Math.round(c.height),
    headingOverflow: h.scrollWidth > h.clientWidth + 1,
    cardOverflowX: el.scrollWidth > el.clientWidth + 1,
    stateLine: (meta?.innerText || "").trim().split("\n")[0] || "",
    controls: controls.length, controlsOutside: outside,
    controlNames: controls.map((x) => (x.getAttribute("aria-label") || x.textContent || "").trim().slice(0, 60)),
    longestWord: Math.max(0, ...words.map((w) => w.length)),
  };
}

const CONFIGS = [];
for (const width of [320, 390, 1280]) for (const font of [16, 32]) CONFIGS.push({ width, height: width === 1280 ? 900 : (width === 320 ? 568 : 844), font });
const report = { repo, dist, origin, startedAt: new Date().toISOString(), configs: [], slow: null };
const browser = await chromium.launch({ executablePath: "C:/Users/sboad/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe", headless: true });

async function openCatalog(cfg) {
  const context = await browser.newContext({ viewport: { width: cfg.width, height: cfg.height }, serviceWorkers: "block" });
  await context.route("**/*", (r) => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Page.enable");
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: cfg.font, fixed: Math.round(cfg.font * 13 / 16) } });
  const errs = { pageErrors: [], failed: [], console: [] };
  page.on("pageerror", (e) => errs.pageErrors.push(String(e.message).split("\n")[0]));
  page.on("requestfailed", (r) => errs.failed.push(r.url()));
  page.on("console", (m) => { if (m.type() === "error") errs.console.push(m.text().slice(0, 200)); });
  const state = { lastCatalog: null };
  page.on("response", async (r) => { if (r.url().includes(endpoint + "/catalog") && r.ok()) { try { state.lastCatalog = await r.json(); } catch {} } });
  standing = false; contacts.clear();
  await page.goto(origin + "/earlyaccess", { waitUntil: "domcontentloaded" });
  await page.getByTestId("early-access-agreement-checkbox").check();
  await page.getByTestId("early-access-agreement-submit").click();
  const admission = page.getByRole("form", { name: "Contact information for catalog access" });
  await admission.getByLabel("Full name").fill("Synthetic Sweep");
  await admission.getByLabel("Email address").fill("sweep@example.invalid");
  // Synthetic, deliberately non-deliverable address (example.invalid, fictional street).
  await admission.locator('select[name="countryCode"]').selectOption("US");
  await admission.locator('input[name="line1"]').fill("1 Synthetic Test Way");
  await admission.locator('input[name="city"]').fill("Testville");
  await admission.locator('input[name="region"]').fill("TX");
  await admission.locator('input[name="postalCode"]').fill("00000");
  await admission.getByRole("button", { name: "View catalog" }).click();
  try { await page.locator("article.xenios-order-card").first().waitFor(); }
  catch (e) { await page.screenshot({ path: join(out, "stuck.png"), fullPage: true });
    writeFileSync(join(out, "stuck.txt"), (await page.locator("body").innerText()).slice(0, 4000) + "\n\nUNKNOWN " + unknown.join(", ") + "\nERR " + JSON.stringify(errs)); throw e; }
  assert.equal(await page.getByRole("textbox", {name:"Search catalog"}).getAttribute("maxlength"), "120");
  const rootFont = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  // A Playwright screenshot can reset CDP font sizes; reapply after every capture.
  const refont = () => cdp.send("Page.setFontSizes", { fontSizes: { standard: cfg.font, fixed: Math.round(cfg.font * 13 / 16) } });
  return { context, page, errs, state, rootFont, refont, cdp };
}



async function checkSidebar(page) {
 const sidebar=page.getByRole('complementary',{name:'Selected request items'});
 const toggle=sidebar.locator('.xenios-order-summary-toggle');
 if(await toggle.isVisible()&&(await toggle.getAttribute('aria-expanded'))==='false')await toggle.click();
 const item=sidebar.locator('li').first();await item.waitFor({state:'visible'});
 await item.getByRole('button',{name:/^Edit selected quantity for /}).press('Enter');
 const input=item.getByRole('spinbutton');await input.waitFor({state:'visible'});
 const before=Number(await input.inputValue()),minimum=Number(await input.getAttribute('min'));
 const maximumText=await input.getAttribute('max'),maximum=maximumText?Number(maximumText):Infinity;
 const step=Number(await input.getAttribute('step'))||1;
 const next=Math.min(before+step,maximum);
 await input.fill(String(next));await input.press('Tab');
 assert.equal(Number(await input.inputValue()),next);
 assert(await input.evaluate(el=>el.checkValidity()),'selected quantity input validity');
 const geometry=await item.evaluate(el=>{const box=el.getBoundingClientRect();const controls=[...el.querySelectorAll('button,input')].filter(c=>c.getClientRects().length);return {
   count:controls.length,contained:controls.every(c=>{const r=c.getBoundingClientRect();return r.left>=box.left-.5&&r.right<=box.right+.5;}),
   targets44:controls.every(c=>c.getBoundingClientRect().height>=44),overflow:el.scrollWidth>el.clientWidth+1};});
 assert(geometry.contained&&geometry.targets44&&!geometry.overflow,'selected sidebar controls fit');
 await item.getByRole('button',{name:'Done editing quantity',exact:true}).press('Enter');
 assert.equal(await item.getByRole('spinbutton').count(),0);
 assert((await item.innerText()).includes('Requested quantity: '+next));
 const editAfterDone=item.getByRole('button',{name:/^Edit selected quantity for /});
 await page.waitForFunction(()=>document.activeElement?.getAttribute("aria-label")?.startsWith("Edit selected quantity for "));
  const focusAfterDone=await editAfterDone.evaluate(el=>el===document.activeElement);
  assert(focusAfterDone,"Done restores focus to the same selected variant");
 await item.getByRole('button',{name:/^Remove selected /}).press('Enter');
 assert.equal(await sidebar.locator('li').count(),0);
 assert(await page.getByTestId('request-action-bar-primary').isDisabled(),'removing the last item disables continue');
 await page.locator('article.xenios-order-card').getByRole('button',{name:/^Add /}).first().click();
 assert(!(await page.getByTestId('request-action-bar-primary').isDisabled()));
 return {edited:true,before,after:next,minimum,maximum:maximumText,step,valid:true,geometry,done:true,focusAfterDone,removed:true,reAdded:true};
}

async function readDockFocus(locator) {
  await locator.press("Tab");
  await locator.focus();
  return locator.evaluate(el=>{ const s=getComputedStyle(el), r=el.getBoundingClientRect(); return {
    visible:el.matches(':focus-visible'),color:s.outlineColor,width:parseFloat(s.outlineWidth),offset:parseFloat(s.outlineOffset),
    height:r.height,controlWidth:r.width,opacity:parseFloat(s.opacity),disabled:el.disabled,background:s.backgroundColor
  }; });
}
async function checkDock(page,cfg) {
 const primary=page.getByTestId('request-action-bar-primary');
 const summary=page.getByTestId('request-action-bar-summary');
 await primary.waitFor();
 assert(await primary.isDisabled(),'empty request remains disabled');
 const empty=await primary.evaluate(el=>({background:getComputedStyle(el).backgroundColor,disabled:el.disabled}));
 assert.equal(empty.background,'rgb(228, 232, 229)');
 await page.keyboard.press('Tab');
 const ring=await readDockFocus(summary);
 assert(ring.visible&&ring.width===3&&ring.offset===3);
 assert.equal(ring.color,'rgb(77, 115, 88)');
 await summary.click();
 let dialog=page.getByRole('dialog',{name:'Your selected request items'});
 await dialog.waitFor();
 assert(await dialog.getByText('No items selected yet.',{exact:false}).isVisible());
 assert(await dialog.getByRole('button',{name:'Continue to details'}).isDisabled());
 const emptyDialogRing=await readDockFocus(dialog.getByRole('button',{name:'Return to request'}));
 assert.equal(emptyDialogRing.color,'rgb(77, 115, 88)');
 for(let n=0;n<5;n++) { await page.keyboard.press('Tab'); assert(await dialog.evaluate(el=>el.contains(document.activeElement)),'dialog focus trap'); }
 await page.keyboard.press('Escape');
 await dialog.waitFor({state:'hidden'});
 await page.waitForFunction(()=>document.activeElement===document.querySelector('[data-testid="request-action-bar-summary"]'));
 const add=page.locator('article.xenios-order-card').getByRole('button',{name:/^Add /}).first();
 await add.click();
 assert(!(await primary.isDisabled()),'one selected variant enables continue');
 const sidebarProof=await checkSidebar(page);
 await page.mouse.move(2,2);
 await page.waitForFunction(()=>{const el=document.querySelector('[data-testid="request-action-bar-primary"]');return el&&!el.disabled&&getComputedStyle(el).backgroundColor==='rgb(33, 74, 53)';});
 const selectedRing=await readDockFocus(primary);
 assert.equal(selectedRing.background,'rgb(33, 74, 53)');
 assert.equal(selectedRing.color,'rgb(77, 115, 88)');
 assert(selectedRing.height>=44&&selectedRing.width===3&&selectedRing.offset===3&&selectedRing.visible);
 const count=await page.locator('.xenios-request-dock__status span').textContent();
 assert(count.trim().startsWith('1 variant'),'dock count matches one selected variant');
 await summary.click();
 dialog=page.getByRole('dialog',{name:'Your selected request items'});
 await dialog.waitFor();
 assert.equal(await dialog.locator('.xenios-request-dock-dialog__items li').count(),1);
 
 const titleClear=await dialog.evaluate(el=>{
   const title=el.querySelector('h2'),close=[...el.children].find(e=>e.tagName==='BUTTON');
   const cr=close.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(title);
   return [...range.getClientRects()].every(r=>Math.min(r.right,cr.right)-Math.max(r.left,cr.left)<=1||Math.min(r.bottom,cr.bottom)-Math.max(r.top,cr.top)<=1);
 });
 assert(titleClear,'close target overlaps visible title text');

 const buttons=dialog.getByRole('button');
 const dialogRings=[];
 for(let i=0;i<await buttons.count();i++) {
  const b=buttons.nth(i);
  if(await b.isDisabled())continue;
  const f=await readDockFocus(b);
  assert(f.visible&&f.width===3&&f.offset===3&&f.height>=44&&f.controlWidth>=44&&f.opacity===1,JSON.stringify(f));
  assert.equal(f.color,'rgb(77, 115, 88)');
  dialogRings.push(f);
 }
 await page.keyboard.press('Escape');
 await dialog.waitFor({state:'hidden'});
 let forced=null;
 if((cfg.width===320&&cfg.font===32)||(cfg.width===1440&&cfg.font===16)) {
  await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});
  await primary.focus();
  forced=await primary.evaluate(el=>{
    const style=getComputedStyle(el),dockStyle=getComputedStyle(el.closest('.xenios-request-dock'));
    return {forced:matchMedia('(forced-colors: active)').matches,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,
      ring:style.outlineColor,width:parseFloat(style.outlineWidth),visible:el.matches(':focus-visible'),
      backdrop:dockStyle.backdropFilter,shadow:dockStyle.boxShadow,transition:style.transitionDuration};
  });
  assert(forced.forced&&forced.reduced&&forced.visible&&forced.width===3&&forced.backdrop==='none'&&forced.shadow==='none'&&forced.transition.split(',').every(d=>parseFloat(d)*(d.trim().endsWith('ms')?.001:1)<=.000010001));
  await summary.click();
  await dialog.waitFor();
  const forcedRing=await readDockFocus(dialog.getByRole('button',{name:'Return to request'}));
  assert.equal(forcedRing.color,forced.ring);
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'hidden'});
  await page.emulateMedia({forcedColors:'none',reducedMotion:'no-preference'});
 }
 await summary.click();
 await dialog.waitFor();
 await dialog.getByRole('button',{name:'Continue to details'}).click();
 await dialog.waitFor({state:'hidden'});
 await page.waitForFunction(()=>document.activeElement?.tagName==='H2');
 const contactFocus=await page.evaluate(()=>({tag:document.activeElement.tagName,text:document.activeElement.textContent.trim()}));
 await page.goto(origin+'/earlyaccess',{waitUntil:'domcontentloaded'});
 await page.locator('article.xenios-order-card').first().waitFor();
 return {empty,ring,emptyDialogRing,selectedRing,dialogRings,titleClear,forced,contactFocus,sidebarProof};
}

const sizes=[
 [320,568,16],[320,568,32],[375,667,16],[375,667,32],[390,844,16],[390,844,32],
 [768,1024,16],[768,1024,32],[1024,768,16],[1024,768,32],[1440,900,16],[1440,900,32],
 [412,915,20],[430,932,20],[650,768,32],[700,768,32]
];
const results=[];
try {
  for (const [width,height,font] of sizes) {
    const {page,context,state,rootFont,errs} = await openCatalog({width,height,font});
    assert.equal(rootFont,font+"px");
    const dockProof=await checkDock(page,{width,height,font});
    const locator=page.locator("article.xenios-order-card");
    const withImage=locator.filter({has:page.locator("img")}).first();
    const detail=withImage.getByRole("button",{name:/^View details for /});
    await page.keyboard.press("Tab");
    await detail.focus();
    const focus=await detail.evaluate((el)=>{
      const style=getComputedStyle(el);
      return el.matches(":focus-visible") &&
        ((style.outlineStyle!=="none" && Number.parseFloat(style.outlineWidth)>0) || style.boxShadow!=="none");
    });
    await page.keyboard.press("Enter");
    const dialog=page.getByRole("dialog");
    await dialog.waitFor();
    const alt=await dialog.locator("img").evaluateAll((imgs)=>imgs.every(i=>!!i.alt.trim()));
    const dialogImages=await dialog.locator("img").count();
    await page.keyboard.press("Escape");
    await dialog.waitFor({state:"hidden"});
    const deadline=Date.now()+1500;
    let focusReturned=false;
    do {
      focusReturned=await detail.evaluate(el=>el===document.activeElement);
      if (!focusReturned) await page.waitForTimeout(25);
    } while (!focusReturned && Date.now()<deadline);
    const keyboardLayout=await page.evaluate(()=>{
      const focused=document.activeElement;
      const r=focused.getBoundingClientRect();
      const center=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);
      return focused===center||focused.contains(center);
    });
    const special=width===320&&font===32;
    let media=null;
    if (special) {
      await page.emulateMedia({reducedMotion:"reduce",forcedColors:"active"});
      media=await detail.evaluate((el)=>({reduced:matchMedia("(prefers-reduced-motion: reduce)").matches,
        forced:matchMedia("(forced-colors: active)").matches, focusVisible:el.matches(":focus-visible"),
        outline:parseFloat(getComputedStyle(el).outlineWidth)>0||getComputedStyle(el).boxShadow!=="none"}));
      await page.emulateMedia({reducedMotion:"no-preference",forcedColors:"none"});
    }
    const row={width,height,font,pages:0,cards:0,art:0,noArt:0,badAssets:0,headingOverflow:0,cardOverflow:0,
      offCardControls:0,documentOverflowPages:0,wordBreakCards:0,retainedAlt:alt&&dialogImages>0,
      focus,focusReturned,keyboardLayout,media,dockProof};
    const pager=page.getByRole("navigation",{name:"Catalog pages"}).first();
    for (let n=1;n<=18;n++) {
      await page.waitForFunction(want=>document.querySelectorAll("article.xenios-order-card").length>0 &&
        [...document.querySelectorAll('nav[aria-label="Catalog pages"] span')].some(s=>s.textContent.startsWith("Page "+want+" ")),n);
      // Wait until the independent response listener has parsed the same completed page.
      for (let spin=0;state.lastCatalog?.page!==n&&spin<15;spin++) await page.waitForTimeout(20);
      assert.equal(state.lastCatalog?.page,n,"response page");
      assert.equal(state.lastCatalog.total,420);
      const measured=await locator.evaluateAll((cards,src)=>{
        const read=new Function("return "+src)();
        return cards.map(read);
      },measureCard.toString());
      const items=state.lastCatalog.items;
      assert.equal(measured.length,items.length);
      if(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1))row.documentOverflowPages++;
      measured.forEach((card,index)=>{
        const expected=items[index].reviewedMedia?.primary?.href??null;
        row.cards++;
        row.art+=Number(!!card.img);
        row.noArt+=Number(!card.img);
        row.badAssets+=Number(card.img!==expected||
          (!expected&&(card.mediaBox||!card.noMediaClass))|| card.controls<1);
        row.headingOverflow+=Number(card.headingOverflow);
        row.cardOverflow+=Number(card.cardOverflowX);
        row.offCardControls+=Number(card.controlsOutside>0);
        row.wordBreakCards+=Number(card.splitCount>0);
      });
      row.pages=n;
      const next=pager.getByRole("button",{name:"Next"});
      if(n===18){assert(await next.isDisabled());break;}
      assert(!(await next.isDisabled()));
      await next.click();
    }
    row.runtimeErrors=errs.pageErrors.length;
    results.push(row);
    console.log(JSON.stringify(row));
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
const receipt={source:"0f5f885b41553ef538375e5d0f1b4e5dfe69229b",browser:"Chromium",scope:"local synthetic admission",
  geometry:results,unexpectedRouteCount:unknown.length};
writeFileSync(join(out,"layout-verification.json"),JSON.stringify(receipt,null,2)+"\n");
assert.equal(results.length,16);
assert.equal(unknown.length,0);
assert(!results.some(r=>r.cards!==420||r.art!==258||r.noArt!==162||r.badAssets||r.runtimeErrors));
const failures=results.filter(r=>r.headingOverflow||r.cardOverflow||r.offCardControls||r.documentOverflowPages||
  !r.retainedAlt||!r.focus||!r.focusReturned||!r.keyboardLayout||
  (r.media&&(!r.media.forced||!r.media.reduced||!r.media.focusVisible||!r.media.outline)));
console.log(JSON.stringify({layouts:results.length,rows:results.reduce((t,r)=>t+r.cards,0),layoutIssues:failures.length}));
if(failures.length)process.exitCode=1;