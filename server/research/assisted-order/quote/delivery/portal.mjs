// Mount explicitly BEFORE any SPA catch-all, after the existing auth & rate-limit middleware.
// Links in notices contain no identifier, bearer token, recipient or request details.
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const dollars=n=>{
  if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid amount.');
  const cents=BigInt(n);return '$'+(cents/100n).toLocaleString('en-US')+'.'+String(cents%100n).padStart(2,'0');
};
const headers={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer',
 'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
 'X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive','Vary':'Cookie, Authorization'};
function frame(title,body){return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+title+'</title><main><h1>'+title+'</h1>'+body+'</main></html>';}
function render(records){
  let total=0;
  const sections=records.map(({sellerLabel,quote:q,partial})=>{
    total++;
    if(q.state!=='issued'||q.currency!=='USD'||!Number.isSafeInteger(q.totalCents)||!Array.isArray(q.lines))throw Error('Quote unavailable.');
    const items=q.lines.map(l=>'<li>'+escape(l.productName)+' — '+(l.specification?escape(l.specification)+'; ':'')+'quantity '+escape(l.quantity)+' × '+escape(dollars(l.unitPriceCents))+' = '+escape(dollars(l.lineTotalCents))+'</li>').join('');
    return '<section><h2>Quote '+escape(q.requestPublicReference)+' · version '+escape(q.version)+'</h2><p>Seller: '+escape(sellerLabel)+'</p><p>'+
      (partial?'This is a partial quote. Only the items listed here are covered.':'Only the items listed below are covered.')+
      '</p><ul>'+items+'</ul><p><strong>Total: '+escape(dollars(q.totalCents))+'</strong></p><p>Expires (UTC): '+escape(q.validUntil)+'</p></section>';
  }).join('');
  return frame('Your private quotes',total?sections+'<p>A quote is not a payment, prescription, or order. Reply to Team Xenios with questions.</p>':'<p>No current quote is available in this session. If you requested one, use the same verified access or reply to the Team Xenios message for help.</p>');
}
export function attachPrivateQuotePortal(router,{desk,customerPrincipal,ownedRequests,staffPrincipal,csrfChecked}) {
  router.get('/earlyaccess/quotes',async(req,res)=>{
    res.set(headers).type('html');
    try{
      const viewer=await customerPrincipal(req);
      if(!viewer || !viewer.capabilities?.has('assisted_orders:read_own'))return res.status(401).send(frame('Verified access required','<p>Reopen the portal in the browser where you made the request, or reply to the Team Xenios message for help.</p>'));
      const scope=await ownedRequests(viewer);
      if(!Array.isArray(scope)||scope.length>100)throw Error('Unavailable');
      const found=[];
      for(const s of scope){
        if(typeof s.sellerLabel!=='string' || !s.sellerLabel.trim() || s.sellerLabel.length>200)throw Error('Unavailable');
        for(const quote of await desk.privateForCustomer(viewer,s.xriId,s.seller))found.push({sellerLabel:s.sellerLabel,quote,partial:s.requestLineCount>quote.lines.length});
      }
      return res.status(200).send(render(found));
    }catch{return res.status(503).send(frame('Private quotes unavailable','<p>Your quote could not be loaded. Please try again later or reply to Team Xenios.</p>'));}
  });
  router.post('/api/staff/early-access/private-quotes/issue',async(req,res)=>{
    res.set(headers);
    try{
      const viewer=await staffPrincipal(req);
      if(!viewer?.capabilities?.has('assisted_orders:manage') || (await csrfChecked(req,viewer))!==true)return res.status(403).json({error:'not_authorized'});
      const r=await desk.issue(viewer,req.body);return res.status(r.replay?200:201).json(r);
    }catch(e){return res.status(['Quote version changed.','Attempt conflict.'].includes(e?.message)?409:400).json({error:'quote_not_issued'});}
  });
}
