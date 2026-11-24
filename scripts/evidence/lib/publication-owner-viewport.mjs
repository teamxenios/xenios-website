import assert from 'node:assert/strict';
import { assertStudioViewportFit } from './product-studio-viewport.mjs';

// Serialized read-only observation. The exact-variant selector is a sibling of
// the publication panel, so record its actual global rect, not a guessed width.
export function measureOwnerViewport(panel, baseMeasure) {
  if (!panel) return null;
  const base = baseMeasure(panel);
  const rect = element => {
    if (!element) return null;
    const r = element.getBoundingClientRect();
    return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height };
  };
  return { ...base, selector:rect(document.querySelector('#preview-exact-variant')),
    controls:[...panel.querySelectorAll('input,select,textarea,button')].map(element => ({
      tag:element.tagName, disabled:element.disabled, rect:rect(element),
    })) };
}

export function assertOwnerViewport(sample, { viewportWidth, articleExpected }) {
  assertStudioViewportFit(sample, { viewportWidth, articleExpected, retryExpected:false });
  assert(Array.isArray(sample.controls) && sample.controls.length > 0 && sample.controls.length <= 64,
    'OWNER_CONTROL_CENSUS');
  for (const control of sample.controls) {
    const r = control.rect;
    assert(r && ['left','right','top','bottom','width','height'].every(k => Number.isFinite(r[k]))
      && r.width > 0 && r.height > 0 && Math.abs(r.right-r.left-r.width) < 0.01, 'OWNER_CONTROL_RECT');
    assert(r.left >= sample.viewport.left-2 && r.right <= sample.viewport.right+2,
      'OWNER_CONTROL_OUTSIDE_VISUAL_VIEWPORT');
  }
  return true;
}

// Read-only named-label observation, serialized into the current page AFTER
// positioning the same existing screenshot at that control. No style mutation.
export function measureNamedOwnerLabel(panel, expected) {
  const button=[...panel.querySelectorAll('button')].find(b=>b.textContent.trim()===expected);
  if(!button)return null;
  const rect=r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height});
  const box=button.getBoundingClientRect(),css=getComputedStyle(button),n=k=>parseFloat(css[k])||0;
  const textRects=[],hits=[];let nodes=0,truncated=false;
  const walker=document.createTreeWalker(button,NodeFilter.SHOW_TEXT);let node;
  while((node=walker.nextNode())){
    if(++nodes>32){truncated=true;break;}if(!node.textContent.trim())continue;
    const range=document.createRange();range.selectNodeContents(node);
    for(const r of range.getClientRects()){
      if(r.width<=0||r.height<=0)continue;if(textRects.length===16){truncated=true;break;}
      textRects.push(rect(r));
      const mx=(r.left+r.right)/2,my=(r.top+r.bottom)/2,dx=Math.min(1,r.width/4),dy=Math.min(1,r.height/4);
      for(const [x,y]of [[mx,my],[r.left+dx,my],[r.right-dx,my],[mx,r.top+dy],[mx,r.bottom-dy]]){
        const top=document.elementFromPoint(x,y);hits.push({x,y,owned:top===button||button.contains(top)});
      }
    }range.detach();if(truncated)break;
  }
  const v=window.visualViewport,left=v?.offsetLeft??0,top=v?.offsetTop??0;
  return{expected,actual:button.textContent.trim(),button:rect(box),disabled:button.disabled,
    content:{left:box.left+n('borderLeftWidth')+n('paddingLeft'),right:box.right-n('borderRightWidth')-n('paddingRight'),
      top:box.top+n('borderTopWidth')+n('paddingTop'),bottom:box.bottom-n('borderBottomWidth')-n('paddingBottom')},
    viewport:{left,top,right:left+(v?.width??innerWidth),bottom:top+(v?.height??innerHeight)},
    whiteSpace:css.whiteSpace,textOverflow:css.textOverflow,overflowX:css.overflowX,overflowY:css.overflowY,
    textRects,hits,nodes,truncated};
}

export function assertNamedOwnerLabel(sample,expected){
  assert(['Record approval for this exact preview','Read approval access and history'].includes(expected),'CLOSED_NAMED_LABEL');
  assert(sample&&sample.expected===expected&&sample.actual===expected,'NAMED_LABEL_MISSING_OR_CHANGED');
  assert.equal(sample.truncated,false,'NAMED_LABEL_MEASUREMENT_TRUNCATED');
  assert(Array.isArray(sample.textRects)&&sample.textRects.length>0&&sample.textRects.length<=16,'NAMED_LABEL_TEXT_MISSING');
  for(const box of [sample.button,sample.content,sample.viewport])assert(box&&['left','right','top','bottom'].every(k=>Number.isFinite(box[k]))
    &&box.right>box.left&&box.bottom>box.top,'NAMED_LABEL_BOUNDS_INVALID');
  const within=(r,b)=>r.left>=b.left-2&&r.right<=b.right+2&&r.top>=b.top-2&&r.bottom<=b.bottom+2;
  assert(within(sample.button,sample.viewport),'NAMED_BUTTON_OUTSIDE_CAPTURE_VIEWPORT');
  for(const r of sample.textRects){
    assert(['left','right','top','bottom','width','height'].every(k=>Number.isFinite(r[k]))&&r.width>0&&r.height>0
      &&Math.abs(r.right-r.left-r.width)<0.01&&Math.abs(r.bottom-r.top-r.height)<0.01,'NAMED_TEXT_RECT_INVALID');
    assert(within(r,sample.content),'NAMED_TEXT_CLIPPED_INSIDE_BUTTON');
    assert(within(r,sample.viewport),'NAMED_TEXT_OUTSIDE_CAPTURE_VIEWPORT');
  }
  assert(Array.isArray(sample.hits)&&sample.hits.length===sample.textRects.length*5
    &&sample.hits.every(h=>Number.isFinite(h.x)&&Number.isFinite(h.y)&&h.owned===true),'NAMED_LABEL_OCCLUDED_OR_UNOBSERVED');
  return true; // Layout + five topmost samples per rect, NOT glyph raster/AT proof.
}
