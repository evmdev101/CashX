// Suppress native hover labels, including controls rendered after page load.
(() => {
  const clear = root => {
    if (root.nodeType !== 1) return;
    const strip = el => {
      const label = el.getAttribute('title');
      if (label && !el.hasAttribute('aria-label')) el.setAttribute('aria-label', label);
      el.removeAttribute('title');
    };
    if (root.hasAttribute('title')) strip(root);
    root.querySelectorAll('[title]').forEach(strip);
  };
  clear(document.documentElement);
  new MutationObserver(records => records.forEach(record => {
    if (record.type === 'attributes') clear(record.target);
    else record.addedNodes.forEach(clear);
  })).observe(document.documentElement, {subtree:true, childList:true, attributes:true, attributeFilter:['title']});
})();
