// Rendered solid-colour text/control checks; not a substitute for a full audit.
function renderedContrastAudit() {
  const parse = value => {
    const values = value.match(/[\d.]+/g)?.map(Number);
    return values?.length >= 3 ? [...values.slice(0,3), values[3] ?? 1] : [0,0,0,0];
  };
  const over = (front, back) => front.slice(0,3).map((c,i)=>c*front[3]+back[i]*(1-front[3]));
  const background = element => {
    const layers = [];
    for (let current=element; current; current=current.parentElement) layers.unshift(parse(getComputedStyle(current).backgroundColor));
    return layers.reduce((back,front)=>over(front,back),[255,255,255]);
  };
  const luminance = rgb => rgb.slice(0,3).map(c=>c/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4).reduce((a,c,i)=>a+c*[0.2126,0.7152,0.0722][i],0);
  const ratio = (a,b) => { const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); };
  const visible = el => {
    const modal=[...document.querySelectorAll('dialog:modal')].at(-1);
    if (modal && !modal.contains(el)) return false;
    const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
    return rect.width>0 && rect.height>0 && style.visibility==='visible' && style.display!=='none' && !el.closest('[inert]') && !el.matches(':disabled') && !el.closest('.sr-only,.success-announcer,.skip-link');
  };
  const text=[],controls=[];
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || el.closest('svg,script,style')) continue;
    const style=getComputedStyle(el),bg=background(el);
    const label=[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent.trim()).join(' ').trim();
    if (label) {
      const size=parseFloat(style.fontSize),bold=Number(style.fontWeight)>=700;
      const required=size>=24||(bold&&size>=18.66)?3:4.5;
      const contrast=ratio(over(parse(style.color),bg),bg);
      text.push({label:label.slice(0,80),selector:el.className||el.tagName,ratio:Number(contrast.toFixed(2)),required,pass:contrast>=required});
    }
    if (el.matches('input:not([type=checkbox]):not([type=hidden]),textarea')) {
      const value=el.value||el.getAttribute('placeholder');
      if (value) {
        const colour=el.value?style.color:getComputedStyle(el,'::placeholder').color;
        const contrast=ratio(over(parse(colour),bg),bg);
        text.push({label:value.slice(0,80),selector:el.value?'input value':'input placeholder',ratio:Number(contrast.toFixed(2)),required:4.5,pass:contrast>=4.5});
      }
    }
    if (el.matches('input:not([type=checkbox]):not([type=hidden]),select,textarea') && parseFloat(style.borderWidth)>0) {
      const contrast=ratio(parse(style.borderTopColor),bg);
      controls.push({label:el.labels?.[0]?.textContent.trim().slice(0,80)||el.getAttribute('aria-label'),ratio:Number(contrast.toFixed(2)),required:3,pass:contrast>=3});
    }
    if (el.matches(':focus-visible') && parseFloat(style.outlineWidth)>0 && style.outlineStyle!=='none') {
      const contrast=ratio(parse(style.outlineColor),background(el.parentElement));
      controls.push({label:`Focus: ${el.getAttribute('aria-label')||el.textContent.trim().slice(0,50)||el.tagName}`,ratio:Number(contrast.toFixed(2)),required:3,pass:contrast>=3});
    }
  }
  return {text,controls};
}
module.exports={renderedContrastAudit};
