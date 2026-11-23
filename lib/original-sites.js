/* Load each original app only when its tab is first visited. Keep it mounted
   so tab switches retain quantity, collection view and scroll position. */
(() => {
  const views=new Map();
  function frame(slug,title){const node=document.createElement('iframe');node.className='original-app-frame';node.title=title;node.src='./tools/'+slug+'/index.html';node.setAttribute('allow','clipboard-write');return node;}
  function init(page){
    if(views.has(page))return;
    const main=document.getElementById(page+'-content');main.classList.add('original-app-main');main.replaceChildren();
    if(page==='exchange')main.append(frame('exchange','Limited Exchange — original app'));
    else{
      const tabs=document.createElement('div');tabs.className='original-collection-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','NFT collection');
      const panels=document.createElement('div');panels.className='original-collection-panels';
      const entries=[['cashx-nft','CashX Ecosystem NFT'],['cashmoney','CashX NFT']];
      entries.forEach(([slug,title],index)=>{
        const button=document.createElement('button');button.type='button';button.textContent=title;button.id='original-tab-'+slug;button.setAttribute('role','tab');button.setAttribute('aria-selected',String(index===0));button.setAttribute('aria-controls','original-panel-'+slug);
        const panel=document.createElement('section');panel.id='original-panel-'+slug;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);panel.hidden=index!==0;
        if(index===0)panel.append(frame(slug,title+' — original app'));
        button.onclick=()=>{for(const other of tabs.children)other.setAttribute('aria-selected',String(other===button));for(const other of panels.children)other.hidden=other!==panel;if(!panel.firstChild)panel.append(frame(slug,title+' — original app'));};
        button.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?1:1-index;tabs.children[next].click();tabs.children[next].focus();}};
        tabs.append(button);panels.append(panel);
      });main.append(tabs,panels);
    }
    views.set(page,main);
  }
  window.OriginalSites={init};
})();
