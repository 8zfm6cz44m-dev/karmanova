/* Släktträd – Evgenia Karmanova. Ren JS, ingen byggprocess.
   Data: /data/*.json  Arkiv: /arkiv/  Verktyg: /tools/ */
(() => {
"use strict";

const STATUS = {
  verified:  { label: "Verifierad",           desc: "Uttrycklig primärkälla: metrisk bok, revizskaja skazka eller folkräkning med familjeställning, ZAGS-akt eller arkivintyg." },
  family:    { label: "Familjebekräftad",     desc: "Uppgift från familjen (muntlig eller ur familjens papper). Inte dokumentärt belagd." },
  strong:    { label: "Mycket stark kandidat",desc: "Flera oberoende indicier, men avgörande dokument saknas. Visas aldrig som säker relation." },
  candidate: { label: "Kandidat",             desc: "Rimlig hypotes utan avgörande bevis. Ska aktivt prövas och försöka motbevisas." },
  lead:      { label: "Lead",                 desc: "Uppgift ur användarträd (Geneanet, MyHeritage, Ancestry), forum eller minne. Endast sökingång." },
  excluded:  { label: "Utesluten",            desc: "Prövad och avfärdad. Får inte återanvändas." }
};
const ORDER  = ["verified","family","strong","candidate","lead","excluded"];
const LINE   = {
  verified:  { c:"var(--verified)", w:3,   d:"" },
  family:    { c:"var(--family)",   w:3,   d:"" },
  strong:    { c:"var(--strong)",   w:3,   d:"9 5" },
  candidate: { c:"var(--candidate)",w:2.5, d:"4 6" },
  lead:      { c:"var(--lead)",     w:2,   d:"1 5" },
  excluded:  { c:"var(--excluded)", w:2,   d:"2 4" }
};
const DOCNAME = { master:'Släktforskningsmaster', logg:'Forskningslogg', bild:'Bildregister' };
const COLW=208, ROWH=190, CW=184, CH=140, GUT=170, PAD=56;
let OX=0, OY=0;

const S = { persons:[], P:{}, rels:[], views:[], V:{}, images:[], notes:[], flags:{},
            view:null, showLeads:true, sel:null, panelTab:"info", tf:{x:0,y:0,k:1} };

const $  = (s,r=document) => r.querySelector(s);
const $$ = (s,r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s??"").replace(/[&<>"']/g,c=>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const chip = (st, text) =>
  `<span class="chip st-${st}">${esc(text||STATUS[st]?.label||st)}</span>`;
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const DOCLAB = { master:'Släktforskningsmaster', logg:"Forskningslogg", bild:"Bildregister" };

async function load() {
  const get = f => fetch(`data/${f}.json`,{cache:"no-cache"})
    .then(r=>{ if(!r.ok) throw new Error(`${f}.json: ${r.status}`); return r.json(); });
  try {
    const [persons,rels,views,images,notes,flags] = await Promise.all(
      ["persons","relations","views","images","notes","flags"].map(get));
    Object.assign(S,{persons,rels,views,images,notes:notes.sections,flags});
  } catch(e) {
    const el=$("#loaderr"); el.hidden=false;
    el.textContent=`Datafilerna kunde inte laestas (${e.message}). Oeppna via GitHub Pages eller lokal webbserver: python3 -m http.server`;
    return;
  }
  S.persons.forEach(p => S.P[p.id]=p);
  S.views.forEach(v => S.V[v.id]=v);
  S.persons.forEach(p => p.imgs = S.images.filter(i=>i.persons.includes(p.id)));
  S.notes.forEach(sec => sec.items.forEach(it=>{
    it.plain = it.table ? it.table.map(r=>r.join(" ")).join(" ") : it.t.replace(/\{\{\w+\}\}/g,"");
    it.low = (sec.title+" "+it.plain).toLowerCase();
  }));
  initUI();
  route();
}

function years(p, compact=false) {
  const b=(p.born?.date||"")+(compact&&p.born?.note?"*":"");
  const d=(p.died?.date||"")+(compact&&p.died?.note?"*":"");
  if(b&&d) return compact ? `${b}\u2013${d}` : `${b} \u2013 ${d}`;
  if(b) return `f. ${b}`;
  if(d) return `d. ${d}`;
  return "";
}
function relsOf(id) {
  return S.rels.filter(r=>r.child===id||r.a===id||r.b===id||(r.parents||[]).includes(id));
}
function nameBtn(id) {
  const p=S.P[id];
  return p?`<button type="button" class="linkbtn" data-person="${id}">${esc(p.name)}</button>`:esc(id);
}
function relText(r) {
  if(r.type==="child") return `${r.parents.map(nameBtn).join(" + ")} \u2192 ${nameBtn(r.child)}`;
  if(r.type==="partner") return `${nameBtn(r.a)} och ${nameBtn(r.b)}, par`;
  return `${nameBtn(r.a)} och ${nameBtn(r.b)}, moejliga syskon`;
}
function viewOf(id) {
  return S.views.map(v=>v.id).find(v=>S.V[v].pos[id])||S.views[0].id;
}
function personTerms(p) {
  return (p.search?.length ? p.search : [p.name]).map(t=>t.toLowerCase());
}
function notesFor(p) {
  const terms=personTerms(p), out=[];
  S.notes.forEach(sec=>sec.items.forEach((it,i)=>{
    if(terms.some(t=>it.low.includes(t))) out.push({sec,it,i});
  }));
  return out;
}
function richText(t, q="") {
  const hl = s => {
    let h=esc(s);
    if(q) h=h.replace(new RegExp(`(${reEsc(esc(q))})`,"gi"),"<mark>$1</mark>");
    return h;
  };
  return t.split(/(\{\{\w+\}\})/).map(part=>{
    const m=part.match(/^\{\{(\w+)\}\}$/);
    if(m) return chip(m[1]);
    return part.split(/(https?:\/\/[^\s\xb7]+)/).map((seg,i)=>{
      if(i%2){
        const url=seg.replace(/[.,;)]+$/,""), tail=seg.slice(url.length);
        return `<a href="${esc(url)}" target="_blank" rel="noopener">${hl(url)}</a>${hl(tail)}`;
      }
      return hl(seg);
    }).join("");
  }).join("");
}

function initUI() {
  const sl=$("#show-leads");
  sl.checked=S.showLeads;
  sl.addEventListener("change",e=>{ S.showLeads=e.target.checked; renderTree(); });
  $("#zoom-in").onclick=()=>zoomBy(1.2);
  $("#zoom-out").onclick=()=>zoomBy(1/1.2);
  $("#zoom-fit").onclick=fit;
  $("#zoom-focus").onclick=()=>focusOn(S.sel||S.V[S.view]?.focus);
  document.addEventListener("click", e=>{
    const b=e.target.closest("[data-person]");
    if(b){ e.preventDefault(); gotoPerson(b.dataset.person); }
    const n=e.target.closest("[data-note]");
    if(n){ e.preventDefault(); openNote(n.dataset.note, n.dataset.q||""); }
    const pt=e.target.closest("[data-ptab]");
    if(pt){ switchPanelTab(pt.dataset.ptab); }
  });
  initPanZoom();
  initSearch();
  initNotes();
  renderLegend();
  window.addEventListener("hashchange", route);
}

function route() {
  const h=decodeURIComponent(location.hash.slice(1))||"pappa";
  const [tab,kind,arg]=h.split("/");
  $$(".tabs a").forEach(a=>{
    a.removeAttribute("aria-current");
    if(a.dataset.tab===tab) a.setAttribute("aria-current","page");
  });
  $$(".view").forEach(v=>v.classList.remove("active"));
  if(S.V[tab]){
    $("#view-tree").classList.add("active");
    if(S.view!==tab){ S.view=tab; S.sel=null; renderTree(); fitOrFocus(); }
    if(kind==="person"&&S.P[arg]){ S.sel=arg; applySelect(arg); openPanel(arg); }
  } else if(tab==="noteringar"){
    $("#view-noteringar").classList.add("active"); filterNotes();
  } else {
    const el=$(`#view-${tab}`); if(!el){ location.hash="pappa"; return; }
    el.classList.add("active");
    if(tab==="bevis") renderBevis();
    else if(tab==="bilder") renderBilder();
    else if(tab==="om") renderOm();
    else if(tab==="export") renderExport();
  }
}

function gotoPerson(id) {
  const v=S.view&&S.V[S.view]?.pos[id]?S.view:viewOf(id);
  if(!$("#view-tree").classList.contains("active")){
    location.hash=`${v}/person/${id}`; return;
  }
  const target=`${v}/person/${id}`;
  if(decodeURIComponent(location.hash.slice(1))===target) route();
  else location.hash=target;
}

function lineSample(st) {
  const l=LINE[st];
  return `<svg width="36" height="10" aria-hidden="true"><line x1="2" y1="5" x2="34" y2="5" stroke="${l.c}" stroke-width="${l.w}" stroke-dasharray="${l.d}" stroke-linecap="round"/></svg>`;
}
function renderLegend() {
  $("#legend").innerHTML=["verified","family","strong","candidate","lead"].map(st=>
    `<span class="item" title="${esc(STATUS[st].desc)}">${lineSample(st)}${esc(STATUS[st].label)}</span>`
  ).join("")+`<span class="item">Linje = relation &middot; V\xe4nsterkant = personens identitet &middot; * = datum med f\xf6rbeh\xe5ll</span>`;
}

function visible(v) {
  const vis=new Set();
  Object.keys(v.pos).forEach(id=>{
    const p=S.P[id]; if(!p) return;
    if(!S.showLeads&&p.status==="lead") return;
    vis.add(id);
  });
  return vis;
}
const X=c=>GUT+(c-OX)*COLW;
const Y=r=>PAD+(r-OY)*ROWH;

/* Korta relationsrader på korten: Gift med / Far till / Son till / Bror till */
function buildKin(vis) {
  const K={partners:{},kids:{},pars:{},sibs:{},maybe:{}};
  const add=(o,k,v)=>{ (o[k]=o[k]||[]); if(!o[k].includes(v)) o[k].push(v); };
  const ok=r=>S.showLeads||r.status!=="lead";
  S.rels.forEach(r=>{
    if(!ok(r)) return;
    if(r.type==="partner"){ const m=!(r.status==="lead"||r.status==="candidate"||/ex-?partner|sambo|s\u00e4rbo|fr\u00e5nskild|tidigare|hypotes/i.test(r.basis||""));
      add(K.partners,r.a,{id:r.b,m}); add(K.partners,r.b,{id:r.a,m}); }
    else if(r.type==="child"){ r.parents.forEach(p=>{ add(K.kids,p,r.child); add(K.pars,r.child,p); }); }
    else if(r.type==="sibling"){ add(K.maybe,r.a,r.b); add(K.maybe,r.b,r.a); }
  });
  Object.keys(K.pars).forEach(c=>{
    K.pars[c].forEach(p=>(K.kids[p]||[]).forEach(s=>{ if(s!==c) add(K.sibs,c,s); }));
  });
  K.vis=vis; return K;
}
const given=id=>{ const n=(S.P[id]?.name||"").replace(/\([^)]*\)|\[[^\]]*\]/g," ").replace(/,.*$/,"").trim(); return n.split(/\s+/)[0]||"?"; };
function kinParts(id,K,max) {
  const p=S.P[id], sex=p.sex, vis=K.vis, parts=[], full=[];
  const nm=(arr,n)=>{ const l=arr.filter(x=>vis.has(x)); if(!l.length) return null;
    const s=l.slice(0,n).map(given).join(", ")+(l.length>n?` +${l.length-n}`:""); return {s,all:l.map(x=>S.P[x].name).join(", ")}; };
  const pt=(K.partners[id]||[]).filter(x=>vis.has(x.id));
  [[true,"Gift med "],[false,"Par med "]].forEach(([m,w])=>{
    const l=pt.filter(x=>x.m===m).map(x=>x.id); if(!l.length) return;
    const n=nm(l,2); parts.push(w+n.s); full.push(w+n.all); });
  const ch=nm(K.kids[id]||[],2);
  if(ch){ const w=sex==="m"?"Far till ":sex==="f"?"Mor till ":"F\u00f6r\u00e4lder till ";
    parts.push(w+ch.s); full.push(w+ch.all); }
  const pr=(K.pars[id]||[]).filter(x=>vis.has(x));
  if(pr.length){ const w=sex==="m"?"Son till ":sex==="f"?"Dotter till ":"Barn till ";
    const s=pr.slice(0,2).map(given).join(" & "); parts.push(w+s); full.push(w+pr.map(x=>S.P[x].name).join(" & ")); }
  const sb=nm(K.sibs[id]||[],2);
  if(sb){ const w=sex==="m"?"Bror till ":sex==="f"?"Syster till ":"Syskon till ";
    parts.push(w+sb.s); full.push(w+sb.all); }
  const mb=nm(K.maybe[id]||[],2);
  if(mb){ const w=sex==="m"?"M\u00f6jlig bror till ":sex==="f"?"M\u00f6jlig syster till ":"M\u00f6jligt syskon till ";
    parts.push(w+mb.s); full.push(w+mb.all); }
  return {parts:parts.slice(0,max),full};
}

function fitKin(stage) {
  $$(".card .rl",stage).forEach(rl=>{
    while(rl.children.length && rl.scrollHeight>rl.clientHeight+1) rl.removeChild(rl.lastElementChild);
  });
}
function renderTree() {
  const v=S.V[S.view]; if(!v) return;
  $("#tree-intro").textContent=v.intro;
  const vis=visible(v);
  const cs=[...vis].map(id=>v.pos[id][0]).concat((v.groups||[]).map(g=>g.x));
  const rs=[...vis].map(id=>v.pos[id][1]).concat((v.groups||[]).map(g=>g.y));
  OX=Math.min(0,...cs); OY=Math.min(...rs);
  if((v.groups||[]).length) OY-=0.15;
  let maxX=0, maxY=0;
  vis.forEach(id=>{ const[c,r]=v.pos[id]; maxX=Math.max(maxX,X(c)+CW); maxY=Math.max(maxY,Y(r)+CH); });
  (v.groups||[]).forEach(g=>{ maxX=Math.max(maxX,X(g.x+g.w)); });
  const W=maxX+60, H=maxY+60;
  const stage=$("#stage");
  stage.style.width=W+"px"; stage.style.height=H+"px";
  let html="";
  const rowsUsed=new Set([...vis].map(id=>v.pos[id][1]));
  Object.entries(v.rows||{}).forEach(([r,label])=>{
    r=+r; if(!rowsUsed.has(r)) return;
    html+=`<div class="band" style="top:${Y(r)-24}px;height:${CH+48}px;width:${W}px"></div>`;
    html+=`<div class="rowlabel" style="top:${Y(r)+6}px">${esc(label)}</div>`;
  });
  (v.groups||[]).forEach(g=>{
    html+=`<div class="group" style="left:${X(g.x)-12}px;top:${Y(g.y)-16}px;width:${g.w*COLW+8}px;height:${(g.h-1)*ROWH+CH+32}px"><span>${esc(g.label)}</span></div>`;
  });
  const drawn=S.rels.filter(r=>{
    if(!S.showLeads&&r.status==="lead") return false;
    if(r.type==="child") return vis.has(r.child)&&r.parents.some(p=>vis.has(p));
    return vis.has(r.a)&&vis.has(r.b);
  }).sort((a,b)=>ORDER.indexOf(b.status)-ORDER.indexOf(a.status));
  const sibLabel=new Set();
  const far={};
  drawn.filter(r=>r.type==="sibling").forEach(r=>{
    const d=Math.abs((v.pos[r.a]?.[0]||0)-(v.pos[r.b]?.[0]||0));
    if(!far[r.a]||d>far[r.a].d) far[r.a]={d,id:r.id};
  });
  Object.values(far).forEach(f=>sibLabel.add(f.id));
  const centre=id=>{ const[c,r]=v.pos[id];
    return{x:X(c)+CW/2,y:Y(r),l:X(c),rr:X(c)+CW,m:Y(r)+CH/2,b:Y(r)+CH}; };
  let svg="";
  drawn.forEach(r=>{
    const L=LINE[r.status];
    const attrs=`class="ln" data-rel="${r.id}" stroke="${L.c}" stroke-width="${L.w}" stroke-dasharray="${L.d}"`;
    let d="", lx=null, ly=null, label=null;
    if(r.type==="partner"){
      const A=centre(r.a),B=centre(r.b);
      const[p,q]=A.x<B.x?[A,B]:[B,A];
      d=`M${p.rr},${p.m} L${q.l},${q.m}`;
    } else if(r.type==="child"){
      const ps=r.parents.filter(id=>vis.has(id)).map(centre);
      const C=centre(r.child);
      let ox,oy;
      if(ps.length>=2){ox=(ps[0].x+ps[1].x)/2; oy=ps[0].m;}
      else{ox=ps[0].x; oy=ps[0].b;}
      const hash=[...r.parents.join("")].reduce((a,ch)=>a+ch.charCodeAt(0),0);
      const busY=C.y-(ROWH-CH)/2+((hash%5)-2)*4;
      d=`M${ox},${oy} V${busY} H${C.x} V${C.y}`;
      if(r.label){lx=C.x+6;ly=C.y-6;label=r.label;}
    } else {
      const A=centre(r.a),B=centre(r.b);
      const dist=Math.abs(A.x-B.x)/COLW;
      const h=14+dist*11;
      const ax=A.x-40+(A.x>B.x?0:80),bx=B.x;
      d=`M${ax},${A.y} C${ax},${A.y-h} ${bx},${B.y-h} ${bx},${B.y}`;
      if(sibLabel.has(r.id)){lx=(ax+bx)/2-20;ly=A.y-h*0.75-2;label="m\xf6jliga syskon (hypotes)";}
    }
    svg+=`<path d="${d}" ${attrs}><title>${esc(STATUS[r.status].label)}: ${esc(r.basis)}</title></path>`;
    if(label&&lx!=null) svg+=`<text class="lnlabel" x="${lx}" y="${ly}" fill="${L.c}">${esc(label)}</text>`;
  });
  html+=`<svg class="lines" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${svg}</svg>`;
  const KIN=buildKin(vis);
  vis.forEach(id=>{
    const p=S.P[id], [c,r]=v.pos[id];
    const kin=kinParts(id,KIN,3);
    const place=(p.places&&p.places[0])||"";
    const flag=(p.flags&&p.flags[0])||"";
    const fc=flag?"var(--unresolved)":"var(--muted)";
    const ft=flag?esc(flag):`<span style="font-weight:400">${esc(STATUS[p.status].label)}</span>`;
    html+=`<button type="button" class="card c-${p.status}${id==="evgenia"?" root":""}" data-card="${id}"
      style="left:${X(c)}px;top:${Y(r)}px"
      aria-label="${esc(p.name)}, ${esc(STATUS[p.status].label)}${years(p)?", "+esc(years(p)):""}">
      <span class="nm">${esc(p.name)}</span>
      <span class="dt">${esc(years(p,true))||"&nbsp;"}</span>
      <span class="pl">${esc(place)}</span>
      <span class="rl" title="${esc(kin.full.join(" \u00b7 "))}">${kin.parts.map(t=>`<i>${esc(t)}</i>`).join("")}</span>
      <span class="fl" style="color:${fc}">${ft}</span>
    </button>`;
  });
  stage.innerHTML=html;
  fitKin(stage);
  $$(".card",stage).forEach(b=>b.addEventListener("click",e=>{ e.stopPropagation(); gotoPerson(b.dataset.card); }));
  applyTf();
  if(S.sel) applySelect(S.sel);
}

function applySelect(id) {
  const stage=$("#stage");
  stage.classList.toggle("has-sel",!!id);
  $$(".card",stage).forEach(c=>c.classList.remove("sel","rel"));
  $$("path.ln",stage).forEach(l=>l.classList.remove("hl"));
  if(!id) return;
  $(`[data-card="${id}"]`,stage)?.classList.add("sel");
  relsOf(id).forEach(r=>{
    $$(`[data-rel="${r.id}"]`,stage).forEach(l=>l.classList.add("hl"));
    [...(r.parents||[]),r.child,r.a,r.b].filter(Boolean).forEach(o=>
      $(`[data-card="${o}"]`,stage)?.classList.add("rel"));
  });
}

function applyTf() { const{x,y,k}=S.tf; $("#stage").style.transform=`translate(${x}px,${y}px) scale(${k})`; }
function zoomBy(f,cx,cy) {
  const vp=$("#viewport").getBoundingClientRect();
  cx=cx??vp.width/2; cy=cy??vp.height/2;
  const k=Math.min(1.8,Math.max(0.08,S.tf.k*f));
  S.tf.x=cx-(cx-S.tf.x)*(k/S.tf.k); S.tf.y=cy-(cy-S.tf.y)*(k/S.tf.k);
  S.tf.k=k; applyTf();
}
function fit() {
  const vp=$("#viewport").getBoundingClientRect(), st=$("#stage");
  const w=parseFloat(st.style.width), h=parseFloat(st.style.height);
  const k=Math.max(0.08,Math.min(1,vp.width/w,vp.height/h));
  S.tf={k,x:(vp.width-w*k)/2,y:10}; applyTf();
}
function focusOn(id) {
  const v=S.V[S.view]; if(!v||!v.pos[id]) return;
  const vp=$("#viewport").getBoundingClientRect();
  const[c,r]=v.pos[id], k=Math.max(S.tf.k,0.85);
  const panelW=window.innerWidth>920?490:0;
  S.tf={k,x:(vp.width-panelW)/2-(X(c)+CW/2)*k,y:vp.height/2-(Y(r)+CH/2)*k}; applyTf();
}
function fitOrFocus() { requestAnimationFrame(()=>fit()); }
function initPanZoom() {
  const vp=$("#viewport");
  const pts=new Map(); let start=null,pinch=null;
  vp.addEventListener("pointerdown",e=>{
    if(e.target.closest(".card")) return;
    vp.setPointerCapture(e.pointerId); pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pts.size===1) start={x:e.clientX-S.tf.x,y:e.clientY-S.tf.y};
    if(pts.size===2){const[a,b]=[...pts.values()];pinch=Math.hypot(a.x-b.x,a.y-b.y);}
    vp.classList.add("dragging");
  });
  vp.addEventListener("pointermove",e=>{
    if(!pts.has(e.pointerId)) return;
    pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pts.size===2&&pinch){
      const[a,b]=[...pts.values()],d=Math.hypot(a.x-b.x,a.y-b.y),rect=vp.getBoundingClientRect();
      zoomBy(d/pinch,(a.x+b.x)/2-rect.left,(a.y+b.y)/2-rect.top); pinch=d;
    } else if(start){S.tf.x=e.clientX-start.x;S.tf.y=e.clientY-start.y;applyTf();}
  });
  const end=e=>{pts.delete(e.pointerId);if(pts.size<2)pinch=null;if(!pts.size){start=null;vp.classList.remove("dragging");}else{const p=[...pts.values()][0];start={x:p.x-S.tf.x,y:p.y-S.tf.y};}};
  vp.addEventListener("pointerup",end); vp.addEventListener("pointercancel",end);
  vp.addEventListener("wheel",e=>{
    e.preventDefault();const rect=vp.getBoundingClientRect();
    if(e.ctrlKey||Math.abs(e.deltaY)>=Math.abs(e.deltaX))zoomBy(e.deltaY<0?1.1:1/1.1,e.clientX-rect.left,e.clientY-rect.top);
    else{S.tf.x-=e.deltaX;applyTf();}
  },{passive:false});
  vp.addEventListener("keydown",e=>{
    const step=60,m={ArrowLeft:[step,0],ArrowRight:[-step,0],ArrowUp:[0,step],ArrowDown:[0,-step]}[e.key];
    if(m&&e.target===vp){e.preventDefault();S.tf.x+=m[0];S.tf.y+=m[1];applyTf();}
    if(e.key==="+"||e.key==="=")zoomBy(1.2);if(e.key==="-")zoomBy(1/1.2);
  });
}

function switchPanelTab(tab) {
  S.panelTab=tab;
  $$(".ptabs button").forEach(b=>b.classList.toggle("active",b.dataset.ptab===tab));
  $$("[data-pane]").forEach(p=>p.classList.toggle("hidden",p.dataset.pane!==tab));
}

function openPanel(id) {
  const p=S.P[id]; if(!p) return;
  const panel=$("#person-panel");
  panel.classList.remove("empty");
  const rels=relsOf(id);
  const roleOf=r=>{
    if(r.type==="child"&&r.child===id) return{k:0,t:r.parents.length>1?"F\xf6r\xe4ldrar":(S.P[r.parents[0]]?.sex==="f"?"Mor":"Far"),who:r.parents};
    if(r.type==="child") return{k:2,t:"Barn",who:[r.child]};
    if(r.type==="partner") return{k:1,t:"Partner",who:[r.a===id?r.b:r.a]};
    return{k:3,t:"M\xf6jligt syskon",who:[r.a===id?r.b:r.a]};
  };
  const sortedRels=[...rels].map(r=>({r,...roleOf(r)})).sort((a,b)=>a.k-b.k);
  const noteHits=notesFor(p);
  const srcTerm=personTerms(p)[0];
  const facts=[];
  if(p.born) facts.push(["F\xf6dd",[p.born.date,p.born.place].filter(Boolean).join(", "),p.born.note]);
  if(p.died) facts.push(["D\xf6d",[p.died.date,p.died.place].filter(Boolean).join(", "),p.died.note]);
  if(p.living) facts.push(["","Levande person"]);
  if(p.places?.length) facts.push(["Platser",p.places.join("; ")]);
  const numSrcs=(p.sources||[]).length, numHits=noteHits.length, numImgs=p.imgs.length;
  const imgTab=numImgs?`<button data-ptab="imgs" role="tab">Bilder&nbsp;<span style="color:var(--muted)">(${numImgs})</span></button>`:"";
  panel.innerHTML=`
<div class="panel-head">
  <h2 id="ppname">${esc(p.name)}</h2>
  ${p.altNames?.length?`<p class="alt">Ocks\xe5: ${esc(p.altNames.join("; "))}</p>`:""}
  <div class="chips">${chip(p.status)}${(p.flags||[]).map(f=>chip("unresolved",f)).join("")}</div>
  <p class="sdesc">${esc(STATUS[p.status].desc)}</p>
</div>
<div class="ptabs" role="tablist">
  <button data-ptab="info"  role="tab" class="active">Info</button>
  <button data-ptab="rels"  role="tab">Relationer&nbsp;<span style="color:var(--muted)">(${rels.length})</span></button>
  <button data-ptab="notes" role="tab">Noteringar&nbsp;<span style="color:var(--muted)">(${numHits})</span></button>
  <button data-ptab="src"   role="tab">K\xe4llor&nbsp;<span style="color:var(--muted)">(${numSrcs})</span></button>
  ${imgTab}
</div>
<div class="panel-body">
  <div data-pane="info">
    ${p.summary?`<p class="psum">${esc(p.summary)}</p>`:""}
    ${facts.length?`<dl class="facts">${facts.map(([k,v2,n])=>`<dt>${esc(k)}</dt><dd>${esc(v2||"")}${n?`<br><small>\u26a0 ${esc(n)}</small>`:""}</dd>`).join("")}</dl>`:""}
    ${(()=>{const ev=[...(p.timeline||[])];const has=y=>ev.some(e=>String(e[0]).includes(y));
      if(p.born?.date&&!has(String(p.born.date).slice(0,4)))ev.unshift([String(p.born.date).slice(0,4)||p.born.date,"F\xf6dd "+[p.born.date,p.born.place].filter(Boolean).join(", ")]);
      if(p.died?.date&&!has(String(p.died.date).slice(0,4)))ev.push([String(p.died.date).slice(0,4),"D\xf6d "+[p.died.date,p.died.place].filter(Boolean).join(", ")]);
      if(ev.length<2&&!p.timeline)return "";
      return `<div class="sec-title">Livshistoria</div><ol class="tl">${ev.map(([y,t])=>`<li><span class="tly">${esc(y)}</span><span class="tlt">${richText(t)}</span></li>`).join("")}</ol>`;})()}
    ${p.notes?.length?`<div class="sec-title">Anteckningar</div><ul class="bullets">${p.notes.map(n=>`<li>${richText(n)}</li>`).join("")}</ul>`:""}
    ${sortedRels.length?`<div class="sec-title">Relationer</div><ul class="rl" style="margin-bottom:10px">${sortedRels.map(x=>`<li>
      <div class="rtype">${esc(x.t)}</div>
      <div><span class="rwho">${x.who.map(nameBtn).join(" + ")}</span><span class="rchip">${chip(x.r.status)}</span>
      <div class="rbasis">${esc(x.r.basis.slice(0,200))}${x.r.basis.length>200?"\u2026":""}</div></div></li>`).join("")}</ul>`:""}
    ${numImgs?`<div class="sec-title">Bilder (${numImgs})</div>${p.imgs.map(im=>`<div class="img-card">
      <h5>${esc(im.title)}</h5><div class="meta">${esc(im.date)} &middot; ${esc(im.kind)}${im.flag?" &middot; "+chip("unresolved",im.flag):""}</div>
      <p>${esc(im.names)}</p><p style="color:var(--muted);font-size:13px">${esc(im.comment)}</p>
      <div class="plinks">${(im.links||(im.url?[im.url]:[])).map((u,n2)=>
        `<a href="${esc(u)}" target="_blank" rel="noopener">${im.links?`K\xe4llbild ${n2+1}`:"Bildposten \u2192"}</a>`
      ).join(" ")||'<span class="muted">Ej publicerad</span>'}</div></div>`).join("")}`:""}
    ${numHits>0?`<div class="sec-title">Noteringar ur underlaget (${numHits} rader)</div>
      <p style="font-size:13px;color:var(--muted);margin:0 0 8px">S\xf6kt p\xe5: ${esc(personTerms(p).join(", "))}</p>
      ${noteHits.slice(0,6).map(h=>`<div class="note-entry">
        <span class="note-where">${esc(DOCLAB[h.sec.doc])} / ${esc(h.sec.title)}</span>
        <div class="note-text">${h.it.table?`<em>${esc(h.it.plain.slice(0,220))}</em>`:richText(h.it.t)}</div>
      </div>`).join("")}
      ${numHits>6?`<button type="button" class="more-btn" data-ptab="notes">Visa alla ${numHits} noteringar \u2192</button>`:""}`:""}
  </div>
  <div data-pane="rels" class="hidden">
    ${sortedRels.length?`<ul class="rl">${sortedRels.map(x=>`<li>
      <div class="rtype">${esc(x.t)}</div>
      <div><span class="rwho">${x.who.map(nameBtn).join(" + ")}</span><span class="rchip">${chip(x.r.status)}</span>
      ${x.r.label?`<small class="muted"> (${esc(x.r.label)})</small>`:""}
      <div class="rbasis">${esc(x.r.basis)}</div></div></li>`).join("")}</ul>`
    :`<p class="muted" style="margin-top:12px">Inga registrerade relationer.</p>`}
  </div>
  <div data-pane="notes" class="hidden">
    <p style="font-size:13px;color:var(--muted);margin:0 0 10px">
      S\xf6ktermer: <em>${esc(personTerms(p).join(", "))}</em> &middot; ${numHits} rader i ${new Set(noteHits.map(h=>h.sec.id)).size} avsnitt
    </p>
    ${noteHits.map(h=>`<div class="note-entry">
      <span class="note-where">${esc(DOCLAB[h.sec.doc])} / ${esc(h.sec.title)}
        <button type="button" class="linkbtn" style="font-size:11px;text-transform:none;letter-spacing:0"
          data-note="${h.sec.id}" data-q="${esc(srcTerm)}">\u2197 Noteringar</button>
      </span>
      <div class="note-text">${h.it.table?`<em style="font-size:13px">${esc(h.it.plain)}</em>`:richText(h.it.t)}</div>
    </div>`).join("")||`<p class="muted" style="margin-top:12px">Inga rader med dessa s\xf6ktermer.</p>`}
  </div>
  <div data-pane="src" class="hidden">
    ${numSrcs?`<ul class="src-list">${(p.sources||[]).map(s=>
      `<li><span class="si">\ud83d\udcce</span>${s.url
        ?`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>`
        :`<span>${esc(s.label)}</span>`}</li>`
    ).join("")}</ul>`:`<p class="muted" style="margin-top:12px">Inga k\xe4llh\xe4nvisningar registrerade.</p>`}
  </div>
  ${numImgs?`<div data-pane="imgs" class="hidden">${p.imgs.map(im=>`<div class="img-card">
    <h5>${esc(im.title)}</h5><div class="meta">${esc(im.date)} &middot; ${esc(im.kind)} &middot; Bildpost: ${esc(im.bildpost)}</div>
    <p><strong>Identifierade:</strong> ${esc(im.names)}</p>
    <p style="color:var(--muted)">${esc(im.comment)}</p>
    <div class="plinks">
      ${(im.links||(im.url?[im.url]:[])).map((u,n2)=>
        `<a href="${esc(u)}" target="_blank" rel="noopener">${im.links?`K\xe4llbild ${n2+1}`:"Bildposten \u2192"}</a>`
      ).join(" ")||'<span class="muted">Ej publicerad</span>'}
    </div>
    <div class="plinks" style="margin-top:4px">
      ${im.persons.filter(pid=>pid!==id).map(nameBtn).join(" ")}
    </div></div>`).join("")}</div>`:""}
</div>`;
  switchPanelTab("info");
  panel.querySelector(".panel-body")?.scrollTo(0,0);
}

function initSearch() {
  const q=$("#q"), box=$("#suggest");
  let items=[], idx=-1;
  const norm=s=>s.toLowerCase();
  const show=()=>{
    const v=norm(q.value.trim());
    if(!v){box.hidden=true;q.setAttribute("aria-expanded","false");return;}
    const ps=S.persons.filter(p=>[p.name,...(p.altNames||[]),...(p.places||[]),p.born?.date||""]
      .some(s=>norm(s).includes(v))).slice(0,10);
    const nh=S.notes.reduce((n,sec)=>n+sec.items.filter(it=>it.low.includes(v)).length,0);
    items=[...ps.map(p=>({kind:"p",id:p.id})),{kind:"n"}];
    box.innerHTML=ps.map((p2,i)=>
      `<button type="button" role="option" data-i="${i}">
        <span class="s-name">${esc(p2.name)}</span>
        <span class="s-meta">${esc(years(p2))} ${esc(STATUS[p2.status].label)}</span>
      </button>`
    ).join("")+
    `<button type="button" role="option" data-i="${ps.length}">
      <span>\ud83d\udd0d S\xf6k i noteringar</span>
      <span class="s-meta">${nh} rader</span>
    </button>`;
    box.hidden=false; q.setAttribute("aria-expanded","true"); idx=-1;
  };
  const pick=i=>{
    const it=items[i]; if(!it) return;
    box.hidden=true;
    if(it.kind==="p"){gotoPerson(it.id);q.value="";}
    else{$("#nq").value=q.value.trim();if(location.hash==="#noteringar")filterNotes();else location.hash="noteringar";}
  };
  q.addEventListener("input",show); q.addEventListener("focus",show);
  q.addEventListener("keydown",e=>{
    const btns=$$("button",box);
    if(e.key==="ArrowDown"){idx=Math.min(btns.length-1,idx+1);e.preventDefault();}
    else if(e.key==="ArrowUp"){idx=Math.max(0,idx-1);e.preventDefault();}
    else if(e.key==="Enter"){e.preventDefault();pick(idx>=0?idx:items.length-1);return;}
    else if(e.key==="Escape"){box.hidden=true;return;}
    btns.forEach((b,i)=>b.setAttribute("aria-selected",i===idx));
  });
  box.addEventListener("click",e=>{const b=e.target.closest("button");if(b)pick(+b.dataset.i);});
  document.addEventListener("click",e=>{if(!e.target.closest(".search"))box.hidden=true;});
}

function initNotes() {
  const wrap=$("#notes"); let html="",doc=null;
  S.notes.forEach(sec=>{
    if(sec.doc!==doc){doc=sec.doc;html+=`<h3 class="doc-h" data-doch="${doc}">${esc(DOCLAB[doc])}</h3>`;}
    html+=`<details class="sec" id="n-${sec.id}" data-doc="${sec.doc}"><summary>${esc(sec.title)}<span class="cnt"></span></summary><div class="sec-body"></div></details>`;
  });
  wrap.innerHTML=html;
  let t;
  $("#nq").addEventListener("input",()=>{clearTimeout(t);t=setTimeout(filterNotes,160);});
  $$('input[name="doc"]').forEach(c=>c.addEventListener("change",filterNotes));
  $("#nstatus").addEventListener("change",filterNotes);
  $("#nonly").addEventListener("change",filterNotes);
  $("#nopen").onclick=()=>$$("details.sec:not(.hidden)").forEach(d=>d.open=true);
  $("#nclose").onclick=()=>$$("details.sec").forEach(d=>d.open=false);
  filterNotes();
}
function filterNotes() {
  const q=$("#nq").value.trim(),ql=q.toLowerCase();
  const docs=new Set($$('input[name="doc"]:checked').map(c=>c.value));
  const st=$("#nstatus").value,only=$("#nonly").checked;
  const filtering=!!(ql||st);
  let secs=0,rows=0;
  S.notes.forEach(sec=>{
    const el=$(`#n-${sec.id}`); if(!el) return;
    const itemMatch=it=>(!ql||it.low.includes(ql))&&
      (!st||(st==="any"?/\{\{\w+\}\}/.test(it.t||""):(it.t||"").includes(`{{${st}}}`)));
    const titleHit=ql&&sec.title.toLowerCase().includes(ql)&&!st;
    const matches=sec.items.filter(itemMatch);
    const show=docs.has(sec.doc)&&(!filtering||matches.length||titleHit);
    el.classList.toggle("hidden",!show); if(!show) return;
    secs++; rows+=filtering?matches.length:sec.items.length;
    const list=filtering&&only&&!titleHit?matches:sec.items;
    el.querySelector(".sec-body").innerHTML=list.map(it=>it.table
      ?`<table>${it.table.map(r=>`<tr>${r.map(c=>`<td>${richText(c,q)}</td>`).join("")}</tr>`).join("")}</table>`
      :`<p class="${filtering&&matches.includes(it)&&!only?"hit":""}">${richText(it.t,q)}</p>`
    ).join("");
    el.querySelector(".cnt").textContent=filtering
      ?`${matches.length} ${matches.length===1?"tr\xe4ff":"tr\xe4ffar"}`
      :`${sec.items.length} ${sec.items.length===1?"rad":"rader"}`;
    el.open=filtering;
  });
  $$("[data-doch]").forEach(h=>h.classList.toggle("hidden",
    !docs.has(h.dataset.doch)||!$$(`details.sec[data-doc="${h.dataset.doch}"]:not(.hidden)`).length));
  $("#ncount").textContent=filtering
    ?`${rows} rader i ${secs} avsnitt matchar.`
    :`${secs} avsnitt, ${rows} rader. Allt material \xe4r s\xf6kbart.`;
}
function openNote(secId,q) {
  $("#nq").value=q||""; $("#nonly").checked=false;
  const go=()=>{filterNotes();const d=$(`#n-${secId}`);if(d){d.classList.remove("hidden");d.open=true;d.scrollIntoView({block:"start"});}};
  if(location.hash!=="#noteringar"){location.hash="noteringar";setTimeout(go,30);}else go();
}

function renderBevis() {
  const el=$("#bevis-body"); if(el.dataset.done) return; el.dataset.done="1";
  const box=x=>`<div class="box"><h4>${esc(x.title)}</h4><p>${esc(x.text)}</p>
    ${(x.persons||[]).map(nameBtn).join(" ")}
    ${(x.images||[]).map(id=>{const im=S.images.find(y=>y.id===id);
      return im?.url?`<a href="${esc(im.url)}" target="_blank" rel="noopener" style="font-size:13.5px">${esc(im.title)}</a>`:"";}).join(" ")}</div>`;
  const groups=ORDER.filter(s=>s!=="excluded").map(st=>{
    const rs=S.rels.filter(r=>r.status===st); if(!rs.length) return "";
    return `<h3>${chip(st)} ${rs.length} relationer</h3><p>${esc(STATUS[st].desc)}</p>
      <div class="tablewrap"><table class="reltable"><thead><tr><th>Relation</th><th>Grund</th></tr></thead><tbody>
      ${rs.map(r=>`<tr><td>${relText(r)}${r.label?` <small class="muted">(${esc(r.label)})</small>`:""}</td><td>${esc(r.basis)}</td></tr>`).join("")}
      </tbody></table></div>`;
  }).join("");
  el.innerHTML=`<h2>Bevisl\xe4ge</h2>
    <p>Alla ${S.rels.length} relationer i tr\xe4den, grupperade efter bevisl\xe4ge.</p>
    <h3>Ol\xf6sta huvudfr\xe5gor (${S.flags.open.length})</h3><div class="statgrid">${S.flags.open.map(box).join("")}</div>
    <h3>Mots\xe4gelser i underlaget</h3><div class="statgrid">${S.flags.conflicts.map(box).join("")}</div>
    ${groups}
    <h3>${chip("excluded")} Uteslutet</h3>
    <ul class="bullets">${S.flags.excluded.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>
    <h3>Bevisregler</h3>
    <ul class="bullets">${S.flags.rules.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>
    <h3>Alla ${S.persons.length} personer per status</h3>
    ${ORDER.map(st=>{const ps=S.persons.filter(p=>p.status===st);
      return ps.length?`<p>${chip(st)} ${ps.map(p=>nameBtn(p.id)).join(", ")}</p>`:"";}).join("")}`;
}

function renderBilder() {
  const el=$("#bilder-body"); if(el.dataset.done) return; el.dataset.done="1";
  el.innerHTML=`<h2>Bilder och k\xe4llbilder</h2>
    <p>Alla ${S.images.length} poster ur bildregistret.</p>
    <div class="imggrid">${S.images.map(im=>`<article class="imgcard">
      <h4>${esc(im.title)}</h4>
      <div class="meta">${esc(im.date)} &middot; ${esc(im.kind)}${im.flag?" &middot; "+chip("unresolved",im.flag):""}</div>
      <p><strong>Identifierade:</strong> ${esc(im.names)}</p>
      <p>${esc(im.comment)}</p>
      <p class="muted" style="font-size:13px">Bildpost: ${esc(im.bildpost)}</p>
      <div class="pchips" style="margin-bottom:5px">${im.persons.map(nameBtn).join("")}</div>
      ${(im.links||(im.url?[im.url]:[])).map((u,n)=>
        `<a href="${esc(u)}" target="_blank" rel="noopener">${im.links?`K\xe4llbild ${n+1}`:"Bildposten \u2192"}</a>`
      ).join(" ")||'<span class="muted">Ej publicerad</span>'}
    </article>`).join("")}
    <p class="muted" style="margin-top:16px">Hela bildregistret med tabeller: <a href="#noteringar">Noteringar</a>.</p>`;
}

function renderOm() {
  const el=$("#om-body"); if(el.dataset.done) return; el.dataset.done="1";
  const tbl=`<table style="border-collapse:collapse;font-size:15px;margin-top:6px"><tbody>
    ${ORDER.map(st=>`<tr><td style="padding:5px 12px 5px 0">${st!=="excluded"?`<svg width="36" height="10" aria-hidden="true"><line x1="2" y1="5" x2="34" y2="5" stroke="${LINE[st].c}" stroke-width="${LINE[st].w}" stroke-dasharray="${LINE[st].d}" stroke-linecap="round"/></svg>`:""}</td>
      <td style="padding:5px 12px 5px 0">${chip(st)}</td>
      <td style="color:var(--muted);padding:5px 0">${esc(STATUS[st].desc)}</td></tr>`).join("")}
    <tr><td></td><td>${chip("unresolved","Ol\xf6st")}</td><td style="color:var(--muted);padding:5px 0">Flagga p\xe5 personkort f\xf6r \xf6ppna fr\xe5gor.</td></tr>
  </tbody></table>`;
  el.innerHTML=`<h2>Om sidan</h2>
    <p>Interaktivt k\xe4llkritiskt sl\xe4ktr\xe4d f\xf6r Evgenia Karmanova, med ryska led. Forskningsunderlaget (statusregler, forskningslogg, bildregister) finns under <a href="#noteringar">Noteringar</a>.</p>
    <h3>Navigera i tr\xe4det</h3>
    <p>Klicka p\xe5 ett kort. Panelen till h\xf6ger visar fyra flikar: <strong>Info</strong> (datum, platser, anteckningar, relationer, bilder och ett urval noteringar), <strong>Relationer</strong> (alla relationer med full k\xe4llgrund), <strong>Noteringar</strong> (alla rader i underlaget som n\xe4mner personen), <strong>K\xe4llor</strong> (klickbara l\xe4nkar).</p>
    <p>Dra f\xf6r att flytta tr\xe4det, scrollhjulet eller \u2212/+ f\xf6r att zooma, tv\xe5 fingrar p\xe5 mobil. <em>Visa hela</em> passar alla kort p\xe5 sk\xe4rmen. <em>Centrera</em> zoomar in p\xe5 det markerade kortet.</p>
    <h3>Statusniv\xe5er</h3>${tbl}
    <p style="margin-top:10px">* vid ett \xe5rtal = f\xf6rbeh\xe5ll anges i personkortet (t.ex. bara fr\xe5n anv\xe4ndartr\xe4det).</p>
    <h3>Arkiv och verktyg</h3>
    <p>Validering av datafilerna: <a href="tools/">tools/</a>.</p>
    <h3>Integritet</h3>
    <p>Sidan har <code>noindex</code> och <code>robots.txt</code> men \xe4r \xe4nd\xe5 publik f\xf6r den som har l\xe4nken. Den inneh\xe5ller uppgifter om levande personer.</p>`;
}

function renderExport() {
  const el=$("#export-body"); if(el.dataset.done) return; el.dataset.done="1";
  el.innerHTML=`<h2>Exportera släktträdet (GEDCOM)</h2>
    <p>Laddar ner hela trädet som en <strong>GEDCOM 5.5.1</strong>-fil (.ged, UTF-8) som går att importera i MyHeritage, Ancestry, Geneanet, Gramps m.fl. Alla personer, relationer, datum, platser, anteckningar och källor (med länkar) följer med.</p>
    <div class="exp-box">
      <label for="exp-scope"><strong>Omfattning</strong></label>
      <select id="exp-scope">
        <option value="all">Allt (inkl. leads ur användarträd)</option>
        <option value="nolead">Utan leads (verifierade, familjebekräftade, starka och kandidater)</option>
        <option value="solid">Bara verifierade och familjebekräftade</option>
      </select>
      <label class="toggle"><input type="checkbox" id="exp-mask" checked> Dölj detaljer om levande personer (namn och släktskap visas, men inga datum, platser, anteckningar eller källor)</label>
      <p id="exp-info" class="muted"></p>
      <button type="button" id="exp-go" class="exp-btn">⬇ Ladda ner GEDCOM</button>
    </div>
    <h3>Så importerar du i MyHeritage</h3>
    <ol>
      <li>Ladda ner filen här.</li>
      <li>I MyHeritage: <em>Släktträd → Importera släktträd</em> (eller <em>Hantera träd → Importera GEDCOM</em>) och välj .ged-filen.</li>
      <li>Importera helst som <strong>ett nytt träd</strong> för att inte blanda in hypoteser i ditt ordinarie träd.</li>
    </ol>
    <p class="muted">Bevisläget (Verifierad, Familjebekräftad, Mycket stark kandidat, Kandidat, Lead) står i varje persons anteckning och i släktskapsanteckningarna. Behandla allt utom ”Verifierad” som hypoteser. Gratiskonton har ofta en gräns för antal personer, så använd gärna ”Utan leads” eller ”Bara verifierade”. Filen skapas i webbläsaren; ingenting skickas någonstans.</p>`;
  const upd=()=>{
    if(!window.GedcomExport){ $("#exp-info").textContent="Exportmodulen kunde inte laddas."; return; }
    const r=GedcomExport.buildGedcom(S.persons,S.rels,{scope:$("#exp-scope").value,maskLiving:$("#exp-mask").checked});
    $("#exp-info").textContent=`${r.stats.persons} personer, ${r.stats.families} familjer, ${r.stats.sources} källor`+
      (r.stats.livingMasked?` · ${r.stats.livingMasked} levande personer med dolda detaljer`:"")+".";
    return r;
  };
  $("#exp-scope").onchange=upd; $("#exp-mask").onchange=upd; upd();
  $("#exp-go").onclick=()=>{
    const r=upd(); if(!r) return;
    const d=new Date(), pad=n=>String(n).padStart(2,"0");
    const name=`Karmanova_slakttrad_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.ged`;
    const url=URL.createObjectURL(new Blob([r.text],{type:"text/plain;charset=utf-8"}));
    const a=document.createElement("a"); a.href=url; a.download=name; document.body.appendChild(a); a.click();
    setTimeout(()=>{ a.remove(); URL.revokeObjectURL(url); },1000);
  };
}

load();
})();
