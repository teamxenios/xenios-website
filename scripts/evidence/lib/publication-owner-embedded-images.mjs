// Fixture-only, exact source-selected embedded images. No general data/opaque URL allowance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const CSS=Object.freeze({"path":"assets/index-C84PvaFT.css","bytes":142032,"sha256":"40ab61d8db341658ffb40560271852d0675a918510616ae58658d32e38cb60d2"});
const HTML=Object.freeze({"path":"index.html","bytes":6104,"sha256":"24a4e6a3f5b32981a31af9279c8d37be0485656903edad240e512988263b07ea"});
const DEFINITIONS=[
  {
    "id": "global-grain",
    "selector": ".grad:before",
    "property": "background-image",
    "uri": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>",
    "uriBytes": 338,
    "uriSha256": "bda242aedbbdc1935126749e5716c377cc61d2d1ae2d971feed806691c08aaa1",
    "decoded": "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
    "decodedBytes": 308,
    "decodedSha256": "4fc0f8193953210b108699b63d08a93a9bb2b262f94973c15d6e0d15911fd894",
    "internalFilter": "#n"
  },
  {
    "id": "gradient-pill-grain",
    "selector": ".gradient-pill:after",
    "property": "background-image",
    "uri": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n2'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.12 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n2)'/></svg>",
    "uriBytes": 320,
    "uriSha256": "be271cacb773b867d7967c279244ee09724158dafbd398cfe6e192465f143ee3",
    "decoded": "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n2'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.12 0'/></filter><rect width='100%' height='100%' filter='url(#n2)'/></svg>",
    "decodedBytes": 290,
    "decodedSha256": "30db5083c0cc08bd07f5f7c17ed689f51ed1abdcf15ca1d20c9f8495ce19964d",
    "internalFilter": "#n2"
  }
];
for(const d of DEFINITIONS)Object.freeze(d);Object.freeze(DEFINITIONS);
const verifiedSources=new WeakSet();
export function selectedOwnerEmbeddedImageDescriptors(){return DEFINITIONS.map(({uri,decoded,...d})=>({...d}));}
export function selectedOwnerEmbeddedImageUri(id){const d=DEFINITIONS.find(d=>d.id===id);assert(d,'UNKNOWN_EMBEDDED_ID');return d.uri;}
function verifyPrimitive(d){
  assert(d.uri.startsWith('data:image/svg+xml;utf8,'),'EMBEDDED_MIME');
  assert.equal(Buffer.byteLength(d.uri),d.uriBytes);assert.equal(hash(d.uri),d.uriSha256);
  assert.equal(decodeURIComponent(d.uri.slice(d.uri.indexOf(',')+1)),d.decoded,'EMBEDDED_DECODED_BYTES');
  assert.equal(Buffer.byteLength(d.decoded),d.decodedBytes);assert.equal(hash(d.decoded),d.decodedSha256);
  const noNamespace=d.decoded.replace("xmlns='http://www.w3.org/2000/svg'",'');
  assert(!/<!|<\?|&|https?:|\/\/|data:|blob:|javascript:|\b(?:href|src|on[a-z]+)\s*=/i.test(noNamespace),'EMBEDDED_EXTERNAL_OR_ACTIVE_REFERENCE');
  const tags=[...d.decoded.matchAll(/<\/?([A-Za-z][A-Za-z0-9]*)\b/g)].map(m=>m[1]);
  assert.deepEqual(tags,['svg','filter','feTurbulence','feColorMatrix','filter','rect','svg'],'EMBEDDED_PRIMITIVES');
  assert.deepEqual([...d.decoded.matchAll(/url\(([^)]+)\)/g)].map(m=>m[1]),[d.internalFilter],'EMBEDDED_INTERNAL_FILTER_ONLY');
}
export function verifyOwnerEmbeddedImageSource(html,css){
  assert(Buffer.isBuffer(html)&&Buffer.isBuffer(css),'EMBEDDED_SOURCE_BUFFERS');
  assert.equal(html.length,HTML.bytes,'EMBEDDED_HTML_SIZE');assert.equal(hash(html),HTML.sha256,'EMBEDDED_HTML_SHA');
  assert.equal(css.length,CSS.bytes,'EMBEDDED_CSS_SIZE');assert.equal(hash(css),CSS.sha256,'EMBEDDED_CSS_SHA');
  assert(html.toString('utf8').includes('/'+CSS.path),'EMBEDDED_DECLARING_STYLESHEET_REFERENCE');
  const text=css.toString('utf8');
  for(const d of DEFINITIONS){
    verifyPrimitive(d);
    const at=text.indexOf(d.selector+'{');assert(at>=0,'EMBEDDED_SELECTOR');
    const rule=text.slice(at,text.indexOf('}',at)+1);
    assert(rule.includes(d.property+':url("'+d.uri+'")'),'EMBEDDED_DECLARATION');
  }
  const source=Object.freeze({kind:'PINNED_COMPILED_CSS_EMBEDDED_IMAGE_SOURCE',source:'ea78e6bcb24b247074f3b76f5e73addc73bb755a',
    html:HTML,css:CSS,assets:Object.freeze(selectedOwnerEmbeddedImageDescriptors().map(Object.freeze))});
  verifiedSources.add(source);return source;
}
export function ownerEmbeddedSourceVerified(value){return value!==null&&typeof value==='object'&&verifiedSources.has(value);}
export function matchSelectedOwnerEmbeddedImage(row){
  if(!row||row.method!=='GET'||row.type!=='Image'||row.status!==200
    ||row.targetType!==undefined&&row.targetType!=='page'||typeof row.url!=='string'||row.url.length>16384)return null;
  const d=DEFINITIONS.find(d=>row.url===d.uri&&Buffer.byteLength(row.url)===d.uriBytes&&hash(row.url)===d.uriSha256);
  if(!d)return null;
  return {kind:'EXACT_SOURCE_EMBEDDED_IMAGE',id:d.id,method:'GET',type:'Image',status:200,
    uriSha256:d.uriSha256,uriBytes:d.uriBytes,decodedSha256:d.decodedSha256,decodedBytes:d.decodedBytes,
    declaringCss:CSS.path,declaringCssSha256:CSS.sha256,networkEndpoint:false};
}
export function summarizeOwnerNetworkOrigins(rows,origin,source){
  assert(Array.isArray(rows)&&rows.length<=4096,'BOUNDED_WHOLE_NETWORK_REQUIRED');
  const report={kind:'BOUNDED_WHOLE_NETWORK_ORIGIN_CLASSIFICATION',httpRows:0,embeddedImages:0,refusedRows:0,
    sourceVerified:ownerEmbeddedSourceVerified(source),source:ownerEmbeddedSourceVerified(source)?source:null,
    diagnostics:[],diagnosticLimit:32,droppedDiagnostics:0};
  for(const row of rows){
    const raw=typeof row?.url==='string'?row.url:null;let url=null;try{url=new URL(raw);}catch{}
    if(url?.protocol==='http:'&&url.origin===origin){report.httpRows++;continue;}
    const match=report.sourceVerified?matchSelectedOwnerEmbeddedImage(row):null;
    if(match)report.embeddedImages++;else report.refusedRows++;
    const diagnostic={scheme:url?.protocol??null,originClass:url?.origin==='null'?'opaque':url?'non-loopback':'invalid',
      type:typeof row?.type==='string'?row.type.slice(0,40):null,method:typeof row?.method==='string'?row.method.slice(0,16):null,
      status:Number.isFinite(row?.status)?row.status:null,uriBytes:raw===null?null:Buffer.byteLength(raw),
      uriSha256:raw!==null&&raw.length<=16384?hash(raw):null,uriBoundExceeded:raw!==null&&raw.length>16384,match};
    if(report.diagnostics.length<32)report.diagnostics.push(diagnostic);else report.droppedDiagnostics++;
  }
  return report;
}
