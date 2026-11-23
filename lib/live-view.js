/* Keep live farm/vault UI nodes intact while updating their rendered values. */
(function(root){
  'use strict';
  const key = node => node.nodeType === 1 ? node.id || node.getAttribute('data-live-key') : null;
  const compatible = (a,b) => a.nodeType === b.nodeType && (a.nodeType !== 1 || (a.tagName === b.tagName && key(a) === key(b)));
  function patch(from,to,options){
    if(from.nodeType !== 1){if(from.nodeValue !== to.nodeValue)from.nodeValue=to.nodeValue;return;}
    const form=/^(INPUT|TEXTAREA|SELECT)$/.test(from.tagName);
    const value=form?from.value:null,checked=from.tagName==='INPUT'?from.checked:null;
    const expanded=from.hasAttribute('data-live-expanded');
    const open=from.tagName==='DETAILS'?from.open:null;
    for(const attr of Array.from(from.attributes)){
      if((expanded&&(attr.name==='hidden'||attr.name==='data-live-expanded'))||(open!==null&&attr.name==='open'))continue;
      if(!to.hasAttribute(attr.name))from.removeAttribute(attr.name);
    }
    for(const attr of Array.from(to.attributes)){
      if((expanded&&attr.name==='hidden')||(open!==null&&attr.name==='open'))continue;
      if(from.getAttribute(attr.name)!==attr.value)from.setAttribute(attr.name,attr.value);
    }
    children(from,to,options);
    // A live refresh must not overwrite an entered amount, selection, or open details.
    if(form&&from.value!==value)from.value=value;
    if(checked!==null&&from.checked!==checked)from.checked=checked;
    if(open!==null)from.open=open;
  }
  function children(from,to,options){
    const old=Array.from(from.childNodes),keyed=new Map(old.filter(key).map(node=>[key(node),node]));
    let desired=Array.from(to.childNodes);
    if(options.stableOrder){
      const existing=old.filter(node=>node.nodeType===1),incoming=desired.filter(node=>node.nodeType===1);
      if(existing.length>1&&existing.length===incoming.length&&existing.every(key)&&incoming.every(key)){
        const entries=new Map(incoming.map(node=>[key(node),node]));
        if(existing.every(node=>entries.has(key(node)))){
          let index=0;desired=desired.map(node=>node.nodeType===1?entries.get(key(existing[index++])):node);
        }
      }
    }
    const used=new Set();let cursor=from.firstChild;
    for(const next of desired){
      const id=key(next);
      let current=id?keyed.get(id):cursor;
      if(!current||used.has(current)||!compatible(current,next)){
        current=!id?old.find(node=>!used.has(node)&&!key(node)&&compatible(node,next)):null;
      }
      if(current&&compatible(current,next)){
        used.add(current);
        if(current!==cursor)from.insertBefore(current,cursor);
        patch(current,next,options);
      }else{
        current=next.cloneNode(true);from.insertBefore(current,cursor);used.add(current);
      }
      cursor=current.nextSibling;
    }
    for(const node of old)if(!used.has(node)&&node.parentNode===from)node.remove();
  }
  function update(element,html,options={}){
    if(!element)return;
    const doc=element.ownerDocument,win=doc.defaultView;
    const focused=doc.activeElement,ownsFocus=focused&&element.contains(focused);
    let selection;
    if(ownsFocus){try{selection=[focused.selectionStart,focused.selectionEnd,focused.selectionDirection];}catch(_){}}
    let anchor,top;
    if(options.preserveScroll!==false&&win&&element.getClientRects().length){
      const header=parseFloat(win.getComputedStyle(doc.documentElement).getPropertyValue('--site-nav-height'))||0;
      anchor=Array.from(element.querySelectorAll('[id^="farm-card-"],[id^="farm-table-row-"],[id^="vault-card-"],#nexion-nft-farm-card,#cashx-eco-nft-farm-card'))
        .find(node=>{const rect=node.getBoundingClientRect();return rect.height>0&&rect.bottom>header&&rect.top<win.innerHeight;});
      if(anchor)top=anchor.getBoundingClientRect().top;
    }
    // Parse in the same context as the destination (including tbody/tr fragments).
    const range=doc.createRange();range.selectNodeContents(element);
    const staged=range.createContextualFragment(html);
    children(element,staged,options);
    if(ownsFocus&&focused.isConnected){
      if(doc.activeElement!==focused)focused.focus({preventScroll:true});
      if(selection&&selection[0]!==null){try{focused.setSelectionRange(...selection);}catch(_){}}
    }
    if(anchor?.isConnected){
      const delta=anchor.getBoundingClientRect().top-top;
      if(Math.abs(delta)>.5)win.scrollBy({top:delta,left:0,behavior:'instant'});
    }
  }
  const api={update};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.LiveView=api;
})(typeof window==='undefined'?globalThis:window);
