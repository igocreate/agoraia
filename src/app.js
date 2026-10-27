(function(){
"use strict";
const D = window.AGORA_DATA;
const $ = (s, r=document) => r.querySelector(s);
const el = (tag, attrs={}, ...kids) => { const e=document.createElement(tag); for (const [k,v] of Object.entries(attrs)) { if (v==null) continue; if (k==='class') e.className=v; else if (k==='text') e.textContent=v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); } for (const k of kids) if (k!=null) e.append(k); return e; };
const store = { get(k,d){ try{ const v=localStorage.getItem('agoraia:'+k); return v==null?d:JSON.parse(v);}catch(e){return d;} }, set(k,v){ try{ localStorage.setItem('agoraia:'+k, JSON.stringify(v)); }catch(e){} } };
const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- index ----------
const P = Object.fromEntries(D.planets.map(p=>[p.id,p]));
const S = Object.fromEntries(D.sources.map(s=>[s.id,s]));
const PE = Object.fromEntries(D.people.map(p=>[p.id,p]));
const CU = Object.fromEntries(D.currents.map(c=>[c.id,c]));
const FAM = Object.fromEntries(D.families.map(f=>[f.id,f]));
const REGIONS = ['Europe','Amérique du Nord','Asie','International','Océanie'];
const REL_LABEL = { critique:'critique', prolonge:'prolonge', s_oppose:"s'oppose à", repond_a:'répond à', s_inspire_de:"s'inspire de" };
const REL_LABEL_IN = { critique:'critiqué par', prolonge:'prolongé par', s_oppose:'contesté par', repond_a:'réponse de', s_inspire_de:'inspire' };
const KIND = k => k;
const fmtDate = d => { if(!d) return ''; const m=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.']; const [y,mo,da]=d.split('-'); if(da) return `${+da} ${m[+mo-1]} ${y}`; if(mo) return `${m[+mo-1]} ${y}`; return y; };
const personName = id => (PE[id] && PE[id].n) || id;
const authorsOf = s => s.a.map(personName).join(', ');
const srcByPerson = {};
D.sources.forEach(s => { s.a.forEach(a => (srcByPerson[a] ||= []).push(s.id)); s.q.forEach(q => { const l=(srcByPerson[q.speaker] ||= []); if(!l.includes(s.id)) l.push(s.id); }); });
const relsOf = id => D.rels.filter(r => r.f===id || r.t===id);
const planetSources = pid => D.sources.filter(s => s.pl.includes(pid));
const nQuotes = D.sources.reduce((a,s)=>a+s.q.length,0), nVer = D.sources.reduce((a,s)=>a+s.q.filter(q=>q.status==='verifiee').length,0);
$('#stats').textContent = `${D.sources.length} sources · ${nQuotes} citations (${nVer} vérifiées) · publiées depuis sept. 2023 · mise à jour le ${D.meta.built.split('-').reverse().join('/')}`;

// ---------- état ----------
const state = { currents:new Set(), regions:new Set(), q:'', horizon: store.get('horizon',50), selected:null, focusPlanet:null, view: 'v3d' };
function matches(s){
  if (state.currents.size && !s.cu.some(c=>state.currents.has(c))) return false;
  if (state.regions.size && !state.regions.has(s.rg)) return false;
  if (state.q){ const q=state.q; const blob=(s.t+' '+s.pub+' '+authorsOf(s)+' '+s.th+' '+s.q.map(x=>x.text+' '+(x.fr||'')+' '+personName(x.speaker)).join(' ')).toLowerCase(); if(!q.split(/\s+/).every(w=>blob.includes(w))) return false; }
  return true;
}
const anyFilter = () => state.currents.size || state.regions.size || state.q;

// ---------- couleurs depuis les tokens ----------
let T = {};
function readTokens(){ const cs=getComputedStyle(document.documentElement); const g=n=>cs.getPropertyValue(n).trim(); T={ bg:g('--bg'), ink:g('--ink'), ink2:g('--ink-2'), muted:g('--muted'), line:g('--line'), star:g('--star'), glow:g('--star-glow'), dust:g('--space-dust'), futurs:g('--f-futurs'), pouvoirs:g('--f-pouvoirs'), societes:g('--f-societes'), centre:g('--f-centre') }; }
readTokens();
const famColor = f => T[f] || T.ink;

// ---------- contrôles ----------
function buildControls(){
  const cc=$('#curChips'); cc.textContent='';
  const count={}; D.sources.forEach(s=>s.cu.forEach(c=>count[c]=(count[c]||0)+1));
  D.currents.forEach(c=>{ const b=el('button',{class:'chip','aria-pressed':String(state.currents.has(c.id)),title:c.desc,onclick:()=>{ state.currents.has(c.id)?state.currents.delete(c.id):state.currents.add(c.id); b.setAttribute('aria-pressed',String(state.currents.has(c.id))); applyFilters(); if(state.currents.size===1) showCurrent(c.id); }}, c.label, el('small',{text:count[c.id]||0})); cc.append(b); });
  const rc=$('#regChips'); rc.textContent=''; const rcount={}; D.sources.forEach(s=>rcount[s.rg]=(rcount[s.rg]||0)+1);
  REGIONS.filter(r=>rcount[r]).forEach(r=>{ const b=el('button',{class:'chip','aria-pressed':'false',onclick:()=>{ state.regions.has(r)?state.regions.delete(r):state.regions.add(r); b.setAttribute('aria-pressed',String(state.regions.has(r))); applyFilters(); }}, r, el('small',{text:rcount[r]})); rc.append(b); });
  const lg=$('#legend'); lg.textContent='';
  lg.append(el('div',{},el('span',{class:'sw',style:`background:${T.centre}`}),'Question centrale'));
  D.families.forEach(f=>lg.append(el('div',{},el('span',{class:'sw',style:`background:${famColor(f.id)}`}),f.label)));
  lg.append(el('div',{},el('span',{class:'ln'}),'prolonge, s\'inspire de, répond à'));
  lg.append(el('div',{},el('span',{class:'ln dash'}),'critique, s\'oppose à'));
  lg.append(el('div',{},el('span',{class:'ln dash',style:`border-top-color:${T.star}`}),'Fil transversal : productivité'));
  lg.append(el('div',{},el('span',{class:'sw',style:`background:transparent;border:2px solid ${T.star};border-radius:2px;transform:rotate(45deg);width:9px;height:9px`}),'Losange : outil pour agir (étiquette dorée)'));
  lg.append(el('div',{},'Petits points : sources, en orbite autour de leur thématique principale'));
}
let qTimer; $('#q').addEventListener('input', e=>{ clearTimeout(qTimer); qTimer=setTimeout(()=>{ state.q=e.target.value.trim().toLowerCase(); applyFilters(); },160); });
$('#horizon').value = state.horizon;
$('#horizon').addEventListener('input', e=>{ state.horizon=+e.target.value; store.set('horizon',state.horizon); updateHorizonHint(); });
function horizonWeight(p){ const t=state.horizon/100; return p.w[0]*(1-t)+p.w[1]*t; }
function updateHorizonHint(){
  const ranked=[...D.planets].filter(p=>p.id!=='centre').sort((a,b)=>horizonWeight(b)-horizonWeight(a)).slice(0,3).map(p=>p.label);
  const t=state.horizon; const txt = t<35 ? 'Si l\'AGI arrive vite, l\'attention se porte sur ' : t>65 ? 'Si l\'AGI tarde, les enjeux présents dominent : ' : 'À horizon incertain, les priorités s\'équilibrent. En tête : ';
  $('#horizonHint').textContent = txt + ranked.join(', ') + '. Lecture interprétative, à discuter.';
}
$('#ctlHide').onclick=()=>{ $('#controls').hidden=true; $('#ctlShow').hidden=false; store.set('ctl',false); };
$('#ctlShow').onclick=()=>{ $('#controls').hidden=false; $('#ctlShow').hidden=true; store.set('ctl',true); };
if (store.get('ctl', window.innerWidth>820) === false){ $('#controls').hidden=true; $('#ctlShow').hidden=false; }

// ---------- panneau ----------
const panel=$('#panel');
function panelHead(){ const f=document.createDocumentFragment(); f.append(el('button',{class:'close','aria-label':'Revenir à l\'accueil',title:'Accueil',onclick:()=>{ select(null); }},'×')); return f; }
function miniBtn(){ return el('button',{class:'btn mini',onclick:()=>{ panel.classList.toggle('min'); }},'Réduire / ouvrir'); }
function srcItem(s){ return el('li',{},el('button',{onclick:()=>select({type:'source',id:s.id})}, el('span',{class:'t',text:(s.k==='outil'?'Outil · ':'')+s.t}), el('span',{class:'m',text:`${authorsOf(s)} · ${fmtDate(s.d)} · ${s.rg}`}))); }
function quoteBlock(q,src){
  const sp=PE[q.speaker]; const bq=el('blockquote',{});
  bq.append(el('p',{class:'qt',lang:(src&&src.l)||null,text:`« ${q.text} »`}));
  if(q.fr) bq.append(el('p',{class:'tr',text:q.fr}));
  const ft=el('footer',{}, el('span',{text:'— '+(sp?sp.n:q.speaker)}), sp&&sp.r?el('span',{style:'color:var(--muted)',text:sp.r}):null, el('span',{class:'badge '+(q.status==='verifiee'?'ok':q.status==='transcription'?'info':'warn'),text:q.status==='verifiee'?'✓ vérifiée':q.status==='transcription'?'transcription vidéo':'à vérifier'}));
  if(src && src.k==='fiction' && !q.real) ft.append(el('span',{class:'badge info',text:'fiction'}));
  bq.append(ft); if(q.context) bq.append(el('div',{class:'ctx',text:q.context}));
  return bq;
}
function showHome(){
  panel.textContent=''; panel.append(miniBtn());
  panel.append(el('div',{class:'eyebrow',text:'Séance « Éthique et risques de l\'IA » · novembre 2026'}));
  panel.append(el('h2',{text:'Une carte des débats, pas une réponse'}));
  panel.append(el('p',{class:'lead',text:'Au centre, la question qui relie tout : qui garde la main sur l\'IA ? Autour, '+(D.planets.length-1)+' thématiques en orbite, et autour de chacune, les sources qui les nourrissent : chercheurs, textes officiels, entreprises, critiques, d\'Europe, d\'Amérique et d\'Asie.'}));
  const ns=D.sources.length, asia=D.sources.filter(s=>s.rg==='Asie').length;
  panel.append(el('div',{class:'intro-grid'}, el('div',{class:'stat'},el('b',{text:ns}),el('span',{text:'sources'})), el('div',{class:'stat'},el('b',{text:nVer}),el('span',{text:'citations vérifiées'})), el('div',{class:'stat'},el('b',{text:asia}),el('span',{text:'voix asiatiques'}))));
  panel.append(el('h4',{text:'Comment lire'}));
  panel.append(el('ul',{class:'facts'}, el('li',{text:'Pour tourner : clique (appui franc sur le trackpad) et glisse, ou utilise les boutons en bas à droite et les flèches du clavier. Deux doigts ou la molette zooment ; un clic droit glissé déplace la vue.'}), el('li',{text:'Clique une planète pour ses questions de débat et ses sources, un point pour lire une source et ses citations.'}), el('li',{text:'Filtre par courant de pensée : les sources concernées s\'allument et se relient en constellation.'}), el('li',{text:'Le curseur « Horizon de l\'AGI » grossit les thématiques qui deviennent prioritaires selon qu\'on croit l\'AGI proche ou lointaine.'})));
  panel.append(el('h4',{text:'Parcours guidés'}));
  panel.append(el('ul',{class:'list'}, ...D.tours.map(t=>el('li',{},el('button',{onclick:()=>startTour(t.id,0)}, el('span',{class:'t',text:'▸ '+t.title}), el('span',{class:'m',text:`Parcours guidé · ${t.steps.length} étapes`}))))));
  panel.append(el('div',{class:'tags',style:'margin-top:8px'}, el('button',{class:'btn primary',onclick:()=>startTour('intro',0)},'Lancer l\'introduction'), el('button',{class:'btn',onclick:openPos},'Où te situes-tu ?')));
  panel.append(el('h4',{text:'Fil transversal'}));
  panel.append(el('ul',{class:'list'}, el('li',{},el('button',{onclick:()=>select({type:'thread',id:D.thread.id})}, el('span',{class:'t',text:D.thread.label}), el('span',{class:'m',text:'Relie Nos métiers, Travail et Écologie · trilemme produire plus / employer moins / travailler moins'})))));
  panel.append(el('h4',{text:'Thématiques'}));
  const ul=el('ul',{class:'list'}); D.planets.forEach(p=>ul.append(el('li',{},el('button',{onclick:()=>select({type:'planet',id:p.id})}, el('span',{class:'t',text:p.label}), el('span',{class:'m',text:`${planetSources(p.id).length} sources · ${p.id==='centre'?'question centrale':FAM[p.fam].label}`}))))); panel.append(ul);
  panel.append(el('details',{},el('summary',{text:'Méthode et limites'}), el('p',{text:'Corpus constitué le 25 septembre 2026 : uniquement des sources publiées depuis septembre 2023. Chaque citation marquée « vérifiée » a été confirmée mot pour mot par deux lectures indépendantes de la page source, puis un échantillon a été contre-vérifié. Les citations « à vérifier » viennent de pages que nos outils ne pouvaient pas lire directement ; les citations « transcription vidéo » sont tirées de transcriptions automatiques, nettoyées de leurs coquilles. Le classement des sources en courants et le positionnement des courants sont des choix éditoriaux, discutables par nature. Corpus produit avec Claude (Anthropic), acteur cité dans la carte.'})));
  panel.append(el('details',{},el('summary',{text:'Mentions légales'}),
    el('p',{text:'Éditeur : Igocreate, SAS, 112 avenue de la République, 75011 Paris, RCS Paris 802 891 143. Contact : contact@igocreate.com. Directeur de la publication : Clément Le Tétour.'}),
    el('p',{text:'Hébergeur : GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis.'}),
    el('p',{text:'Données personnelles : ni cookie, ni mesure d\'audience, ni service tiers. Tes préférences d\'affichage restent dans ton navigateur. L\'hébergeur peut journaliser les adresses IP pour la sécurité du service.'}),
    el('p',{text:'Licences : code sous licence MIT, corpus sous licence CC BY 4.0. Les citations restent la propriété de leurs auteurs et sont reproduites au titre du droit de courte citation, avec leur source.'})));
  panel.append(el('p',{class:'foot'}, el('a',{href:'https://github.com/igocreate/agoraia',target:'_blank',rel:'noopener'},'Code et données sur GitHub'), ' · ', el('a',{href:'https://github.com/igocreate/agoraia/issues/new',target:'_blank',rel:'noopener'},'Signaler une erreur ou une source')));
}
function showPlanet(id){
  const p=P[id]; panel.textContent=''; panel.append(panelHead()); panel.append(miniBtn());
  panel.append(el('div',{class:'eyebrow'}, el('span',{class:'sw',style:`background:${famColor(p.fam)}`}), id==='centre'?'Question centrale':FAM[p.fam].label));
  panel.append(el('h2',{text:p.label})); panel.append(el('p',{class:'lead',text:p.desc}));
  const tools=planetSources(id).filter(x=>x.k==='outil');
  if(tools.length){ panel.append(el('h4',{text:'Outils pour agir'})); tools.forEach(t=>{ panel.append(el('button',{class:'card tool-card',onclick:()=>select({type:'source',id:t.id})}, el('span',{class:'tags'}, el('span',{class:'badge info',text:'outil'}), el('span',{class:'m',text:t.pub})), el('span',{class:'t',text:t.t}), el('span',{class:'q',text:t.th}), el('span',{class:'m',text:'Une grille de lecture parmi d\'autres, pas un verdict · voir la fiche →'}))); }); }
  if(id==='devs' && D.occupations.length){ panel.append(el('h4',{text:'Métiers les plus exposés à l\'IA'})); panel.append(occBlock()); }
  if(['devs','travail','ecologie'].includes(id)) panel.append(el('button',{class:'btn',style:'margin-top:12px',onclick:()=>select({type:'thread',id:D.thread.id})},'Fil transversal : '+D.thread.label));
  const qs=D.questions.filter(q=>q.planet===id); if(qs.length){ panel.append(el('h4',{text:'Questions pour le débat'})); const ol=el('ol',{class:'qs'}); qs.forEach(q=>ol.append(el('li',{text:q.question}))); panel.append(ol); }
  const ss=planetSources(id).filter(matches).filter(x=>x.k!=='outil'); panel.append(el('h4',{text:`Sources (${ss.length}${anyFilter()?' filtrées':''})`}));
  const byCur={}; ss.forEach(s=>{ const c=s.cu[0]; (byCur[c] ||= []).push(s); });
  Object.entries(byCur).sort((a,b)=>b[1].length-a[1].length).forEach(([c,list])=>{ panel.append(el('div',{class:'eyebrow',style:'margin:12px 0 2px',text:CU[c]?CU[c].label:c})); const ul=el('ul',{class:'list'}); list.sort((a,b)=>b.d.localeCompare(a.d)).forEach(s=>ul.append(srcItem(s))); panel.append(ul); });
}
const THS=new Set(D.thread.branches.flatMap(b=>b.sources));
function trilemmeSVG(){
  const NS='http://www.w3.org/2000/svg'; const sv=document.createElementNS(NS,'svg'); sv.setAttribute('viewBox','0 0 400 262'); sv.setAttribute('class','trilemme'); sv.setAttribute('role','img'); sv.setAttribute('aria-label','Trilemme de la productivité : un gain de productivité peut servir à produire plus, employer moins ou travailler moins ; en amont la promesse et la mesure, autour la question de la répartition.');
  const mk=(t,a)=>{ const e=document.createElementNS(NS,t); for(const[k,v] of Object.entries(a)) e.setAttribute(k,v); sv.append(e); return e; };
  const txt=(x,y,t,cls,anchor='middle')=>{ const e=mk('text',{x,y,'text-anchor':anchor,class:cls||''}); e.textContent=t; return e; };
  const goto=id=>{ const tg=panel.querySelector('#br-'+id); if(tg) tg.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'}); };
  const box=(x,y,w,h,id,t1,t2)=>{ const r=mk('rect',{x,y,width:w,height:h,rx:8,class:'box hit'}); r.addEventListener('click',()=>goto(id)); txt(x+w/2,y+(t2?17:h/2+4),t1); if(t2) txt(x+w/2,y+31,t2,'sub'); };
  mk('defs',{}).innerHTML='<marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill="currentColor"/></marker>';
  sv.style.color=getComputedStyle(document.documentElement).getPropertyValue('--ink-2');
  box(40,8,140,40,'promesse','La promesse','abondance, semaine de 3 jours'); box(220,8,140,40,'mesure','La mesure','gains modestes, incertains');
  mk('path',{d:'M110 48 C110 64 176 64 184 78',class:'arrow','marker-end':'url(#ah)'}); mk('path',{d:'M290 48 C290 64 224 64 216 78',class:'arrow','marker-end':'url(#ah)'});
  mk('circle',{cx:200,cy:112,r:36,class:'hub'}); txt(200,109,'Gain de','hubt'); txt(200,121,'productivité','hubt');
  mk('path',{d:'M176 132 C140 150 80 150 72 166',class:'arrow','marker-end':'url(#ah)'}); mk('path',{d:'M200 148 L200 164',class:'arrow','marker-end':'url(#ah)'}); mk('path',{d:'M224 132 C260 150 320 150 328 166',class:'arrow','marker-end':'url(#ah)'});
  box(8,168,128,44,'produire_plus','Produire plus','→ limites planétaires'); box(136+0,168,128,44,'employer_moins','Employer moins','→ emplois, métiers'); box(264,168,128,44,'travailler_moins','Travailler moins','→ temps libéré');
  const b=mk('rect',{x:8,y:222,width:384,height:32,rx:8,class:'band'}); const bt=mk('rect',{x:8,y:222,width:384,height:32,rx:8,fill:'transparent',class:'box hit',style:'stroke:none'}); bt.addEventListener('click',()=>goto('repartition'));
  txt(200,242,'La répartition : qui capte le gain, et qui décide ?');
  return sv;
}
function showThread(){
  const T0=D.thread; panel.textContent=''; panel.append(panelHead()); panel.append(miniBtn());
  panel.append(el('div',{class:'eyebrow',text:'Fil transversal · Nos métiers · Travail · Écologie'}));
  panel.append(el('h2',{text:T0.label})); panel.append(el('p',{class:'lead',text:T0.desc}));
  panel.append(trilemmeSVG());
  panel.append(el('div',{class:'tags'}, el('button',{class:'btn primary',onclick:()=>startTour('productivite',0)},`Lancer le parcours (${TOURS.productivite.steps.length} étapes)`), el('button',{class:'btn',onclick:()=>select({type:'planet',id:'devs'})},'Voir les métiers exposés')));
  T0.branches.forEach(b=>{ const h=el('h4',{id:'br-'+b.id,text:b.label}); panel.append(h); panel.append(el('p',{style:'margin:0 0 4px;font-size:14px;color:var(--ink-2)',text:b.desc})); const ul=el('ul',{class:'list'}); b.sources.map(i=>S[i]).filter(Boolean).forEach(x=>ul.append(srcItem(x))); panel.append(ul); });
}
let occSel=null;
function fmtVal(v,unit){ if(/%/.test(unit)) return (Math.round(v*10)/10).toString().replace('.',',')+' %'; return v.toFixed(2).replace('.',','); }
function occBlock(){
  const wrap=el('div',{}); const sets=D.occupations; if(!sets.length) return wrap;
  if(!occSel) occSel=sets[0].id;
  const short=o=>({'occ-oit-2025-isco4':'OIT 2025','occ-msr-applicability-v1':'Microsoft · métiers','occ-msr-applicability-v6-groupes':'Microsoft · groupes','occ-anthropic-observed-exposure':'Anthropic 2026','occ-oem-coface-exposition':'OEM / Coface 2026'}[o.id]||o.title);
  const tabs=el('div',{class:'occ-tabs',role:'group','aria-label':'Choisir la source'}); sets.forEach(o=>tabs.append(el('button',{class:'chip','aria-pressed':String(o.id===occSel),onclick:()=>{ occSel=o.id; const n=occBlock(); wrap.replaceWith(n); }},short(o))));
  wrap.append(tabs);
  const o=sets.find(x=>x.id===occSel); const src=S[o.source_id];
  wrap.append(el('div',{class:'meta',style:'margin-bottom:8px',text:`${o.title} · ${o.metric} (${o.unit})`}));
  const max=Math.max(...o.rows.map(r=>r.value))||1; const box=el('div',{class:'occ'});
  let lastGroup=null;
  o.rows.forEach(r=>{ const low=/moins/.test(r.group); if(low && lastGroup!=='low'){ box.append(el('div',{class:'occ-sep',text:'Parmi les moins exposés'})); lastGroup='low'; } else if(!low) lastGroup='high';
    const row=el('div',{class:'occ-row'+(low?' low':''),title:r.occupation_orig}); const trk=el('div',{class:'trk'}); trk.append(el('div',{class:'bar',style:`width:${Math.max(1,r.value/max*100)}%`})); row.append(el('span',{class:'lab',text:r.occupation_fr}),trk,el('span',{class:'val',text:fmtVal(r.value,o.unit)})); box.append(row); });
  wrap.append(box);
  wrap.append(el('p',{class:'occ-cap'}, el('span',{class:'badge '+(o.verified?'ok':'warn'),text:o.verified?'✓ valeurs vérifiées':'valeurs non vérifiées'})));
  if(o.note) wrap.append(el('details',{},el('summary',{text:'Précautions de lecture'}),el('p',{text:o.note})));
  wrap.append(el('p',{class:'occ-cap',text:'Chaque source a sa propre méthode : ne compare pas les chiffres d\'un onglet à l\'autre, compare les classements.'}));
  if(src) wrap.append(el('button',{class:'link-out',style:'border:0;background:none;padding:0;cursor:pointer',onclick:()=>select({type:'source',id:src.id})},'Voir la source : '+src.t.slice(0,70)+(src.t.length>70?'…':'')));
  return wrap;
}
function relTarget(id){ if(S[id]) return {type:'source',id,label:S[id].t}; if(PE[id]) return {type:'person',id,label:PE[id].n}; if(CU[id]) return {type:'current',id,label:'courant : '+CU[id].label}; return null; }
function relList(ids){
  const rows=[]; const seen=new Set();
  ids.forEach(id=>relsOf(id).forEach(r=>{ const out=ids.includes(r.f); const other=out?r.t:r.f; const key=r.f+r.t+r.ty; if(seen.has(key)) return; seen.add(key); const tg=relTarget(other); if(!tg) return; rows.push({lab: out?REL_LABEL[r.ty]:REL_LABEL_IN[r.ty], tg, why:r.w}); }));
  if(!rows.length) return null; const ul=el('ul',{class:'list'});
  rows.forEach(x=>ul.append(el('li',{},el('button',{title:x.why,onclick:()=>select({type:x.tg.type,id:x.tg.id})}, el('span',{class:'rel'},el('span',{class:'ty',text:x.lab}),el('span',{class:'t',text:x.tg.label})), x.why?el('span',{class:'m',style:'font-family:var(--serif);font-size:12.5px',text:x.why}):null)))); return ul;
}
function showSource(id){
  const s=S[id]; panel.textContent=''; panel.append(panelHead()); panel.append(miniBtn());
  const eb=el('div',{class:'eyebrow'}); s.pl.forEach(pid=>eb.append(el('button',{class:'tag',onclick:()=>select({type:'planet',id:pid})},P[pid].label))); panel.append(eb);
  panel.append(el('h2',{text:s.t}));
  if(s.k==='outil') panel.append(el('p',{class:'occ-cap',style:'margin:0 0 8px'}, el('span',{class:'badge info',text:'outil'}), ' Un outil pour agir, pas une source d\'analyse : une grille de lecture parmi d\'autres, pas un verdict.'));
  if(s.k==='fiction') panel.append(el('p',{class:'occ-cap',style:'margin:0 0 8px'}, el('span',{class:'badge info',text:'fiction'}), ' Œuvre de fiction : un miroir pour le débat, pas une preuve.'));
  panel.append(el('div',{class:'meta',text:`${s.pub} · ${fmtDate(s.d)} · ${s.k} · ${s.l.toUpperCase()} · ${s.rg}`}));
  const pp=el('div',{class:'people',style:'margin-top:10px'}); s.a.forEach(a=>{ const p=PE[a]; if(!p) return; pp.append(el('button',{class:'person',style:'text-align:left;border:0;background:none;padding:0',onclick:()=>select({type:'person',id:a})}, el('b',{text:p.n}), p.r?el('span',{text:' · '+p.r}):null)); }); panel.append(pp);
  const ct=el('div',{class:'tags',style:'margin-top:10px'}); s.cu.forEach(c=>ct.append(el('button',{class:'tag',onclick:()=>select({type:'current',id:c})},CU[c].label))); panel.append(ct);
  panel.append(el('h4',{text:s.k==='outil'?'Ce que fait l\'outil':'Thèse'})); panel.append(el('p',{class:'lead',text:s.th}));
  if(s.q.length){ panel.append(el('h4',{text:s.q.length>1?'Citations':'Citation'})); s.q.forEach(q=>panel.append(quoteBlock(q,s))); }
  if(s.kf.length){ panel.append(el('h4',{text:s.k==='outil'?'Ce qu\'il mesure, et ce qu\'il ne mesure pas':'Faits clés'})); const ul=el('ul',{class:'facts'}); s.kf.forEach(f=>ul.append(el('li',{text:f}))); panel.append(ul); }
  const rl=relList([s.id, ...s.a]); if(rl){ panel.append(el('h4',{text:'Dialogue avec d\'autres voix'})); panel.append(rl); }
  if(s.u) panel.append(el('a',{class:'link-out',href:s.u,target:'_blank',rel:'noopener'},s.k==='outil'?'Ouvrir l\'outil ↗':'Lire la source ↗'));
  if(s.n) panel.append(el('details',{},el('summary',{text:'Notes et limites'}),el('p',{text:s.n})));
}
function showCurrent(id){
  const c=CU[id]; panel.textContent=''; panel.append(panelHead()); panel.append(miniBtn());
  panel.append(el('div',{class:'eyebrow',text:'Courant de pensée'})); panel.append(el('h2',{text:c.label})); panel.append(el('p',{class:'lead',text:c.desc}));
  const ppl=D.people.filter(p=>p.cu.includes(id)); if(ppl.length){ panel.append(el('h4',{text:'Voix'})); const d=el('div',{class:'people'}); ppl.slice(0,40).forEach(p=>d.append(el('button',{class:'person',style:'text-align:left;border:0;background:none;padding:0',onclick:()=>select({type:'person',id:p.id})},el('b',{text:p.n}),p.r?el('span',{text:' · '+p.r}):null))); panel.append(d); }
  const rl=relList([id]); if(rl){ panel.append(el('h4',{text:'Liens'})); panel.append(rl); }
  const ss=D.sources.filter(s=>s.cu.includes(id)); panel.append(el('h4',{text:`Sources (${ss.length})`})); const ul=el('ul',{class:'list'}); ss.sort((a,b)=>b.d.localeCompare(a.d)).forEach(s=>ul.append(srcItem(s))); panel.append(ul);
}
function showPerson(id){
  const p=PE[id]; panel.textContent=''; panel.append(panelHead()); panel.append(miniBtn());
  panel.append(el('div',{class:'eyebrow',text:'Voix'})); panel.append(el('h2',{text:p.n})); if(p.r) panel.append(el('p',{class:'lead',text:p.r}));
  const ct=el('div',{class:'tags'}); p.cu.forEach(c=>CU[c]&&ct.append(el('button',{class:'tag',onclick:()=>select({type:'current',id:c})},CU[c].label))); panel.append(ct);
  const qs=[]; D.sources.forEach(s=>s.q.forEach(q=>{ if(q.speaker===id) qs.push([s,q]); }));
  if(qs.length){ panel.append(el('h4',{text:'Citations'})); qs.forEach(([s,q])=>{ panel.append(quoteBlock(q,s)); }); }
  const rl=relList([id]); if(rl){ panel.append(el('h4',{text:'Dialogue avec d\'autres voix'})); panel.append(rl); }
  const ss=(srcByPerson[id]||[]).map(i=>S[i]); if(ss.length){ panel.append(el('h4',{text:'Sources'})); const ul=el('ul',{class:'list'}); ss.forEach(s=>ul.append(srcItem(s))); panel.append(ul); }
}
function select(sel){
  state.selected=sel; panel.scrollTop=0; panel.classList.remove('min');
  if(!sel){ showHome(); state.focusPlanet=null; U.highlight(null); return; }
  if(sel.type==='planet'){ showPlanet(sel.id); state.focusPlanet=sel.id; U.focusPlanet(sel.id); }
  else if(sel.type==='source'){ showSource(sel.id); U.focusSource(sel.id); }
  else if(sel.type==='current'){ showCurrent(sel.id); U.highlight(null); }
  else if(sel.type==='thread'){ showThread(); state.focusPlanet=null; U.focusThread(); }
  else if(sel.type==='person'){ showPerson(sel.id); const ss=srcByPerson[sel.id]||[]; if(ss[0]) U.focusSource(ss[0], true); }
  if(state.view==='vlist' && sel.type!=='source') {}
}

// ---------- vue liste ----------
function buildList(){
  const root=$('#lvInner'); root.textContent='';
  D.planets.forEach(p=>{
    const ss=planetSources(p.id).filter(matches); if(!ss.length && anyFilter()) return;
    const sec=el('section',{class:'lv-planet'});
    sec.append(el('div',{class:'eyebrow'}, el('span',{class:'sw',style:`background:${famColor(p.fam)}`}), p.id==='centre'?'Question centrale':FAM[p.fam].label, el('span',{text:`· ${ss.length} source${ss.length>1?'s':''}`})));
    sec.append(el('h2',{},el('button',{style:'all:unset;cursor:pointer',onclick:()=>select({type:'planet',id:p.id})},p.label)));
    sec.append(el('p',{text:p.desc}));
    const cards=el('div',{class:'cards'});
    ss.sort((a,b)=>b.d.localeCompare(a.d)).forEach(s=>{ const q=s.q[0]; cards.append(el('button',{class:'card',onclick:()=>select({type:'source',id:s.id})}, el('span',{class:'m',text:`${s.k==='outil'?'Outil · ':s.k==='fiction'?'Fiction · ':''}${fmtDate(s.d)} · ${s.rg} · ${s.cu.map(c=>CU[c].label).join(', ')}`}), el('span',{class:'t',text:s.t}), el('span',{class:'m',text:authorsOf(s)}), q?el('span',{class:'q',text:'« '+(q.fr||q.text)+' »'}):null)); });
    sec.append(cards); root.append(sec);
  });
  if(!root.children.length) root.append(el('p',{text:'Aucune source ne correspond à ces filtres.'}));
}
function setView(v){
  state.view=v; $('#v3d').setAttribute('aria-pressed',String(v==='v3d')); $('#vlist').setAttribute('aria-pressed',String(v==='vlist'));
  $('#listview').hidden = v!=='vlist'; $('#scene').style.visibility = v==='v3d'?'visible':'hidden';
  if(v==='vlist'){ buildList(); } U.setActive(v==='v3d'); store.set('view',v);
}
$('#v3d').onclick=()=>setView('v3d'); $('#vlist').onclick=()=>setView('vlist');

function applyFilters(){ U.applyFilters(); if(state.view==='vlist') buildList(); if(state.selected&&state.selected.type==='planet') showPlanet(state.selected.id); }

// ---------- univers 3D ----------
const U = (function(){
  const api={ focusThread(){}, highlight(){}, focusPlanet(){}, focusSource(){}, applyFilters(){}, setActive(){}, flyTo(){}, retheme(){}, ok:false };
  if(!window.THREE || !THREE.OrbitControls || !THREE.CSS2DRenderer){ $('#scene').append(el('div',{class:'fallback'},el('p',{text:'L\'univers 3D n\'a pas pu se charger ici. La vue liste contient tout le corpus.'}))); return api; }
  let renderer; try{ renderer=new THREE.WebGLRenderer({antialias:true,alpha:true}); }catch(e){ $('#scene').append(el('div',{class:'fallback'},el('p',{text:'WebGL indisponible sur cet appareil : bascule en vue liste.'}))); setTimeout(()=>setView('vlist'),0); return api; }
  const host=$('#scene'); renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1)); host.append(renderer.domElement);
  const lr=new THREE.CSS2DRenderer(); lr.domElement.className='labels'; host.append(lr.domElement);
  const scene=new THREE.Scene(); const cam=new THREE.PerspectiveCamera(50,1,1,5000); cam.position.set(0,120,720);
  function dragMovedRef(){ return typeof dragMoved!=='undefined' && dragMoved; }
  const ctl=new THREE.OrbitControls(cam, host); ctl.rotateSpeed=.9; ctl.zoomSpeed=.8; ctl.enableDamping=true; ctl.dampingFactor=.08; ctl.minDistance=60; ctl.maxDistance=1400; ctl.autoRotate=!reduced; ctl.autoRotateSpeed=.35;
  ['pointerdown','wheel','touchstart'].forEach(ev=>host.addEventListener(ev,()=>{ ctl.autoRotate=false; },{passive:true}));
  // étoiles
  const starGeo=new THREE.BufferGeometry(); const N=1400, arr=new Float32Array(N*3); let seed=7; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
  for(let i=0;i<N;i++){ const u=rnd()*2-1, th=rnd()*Math.PI*2, r=1100+rnd()*900, s=Math.sqrt(1-u*u); arr[i*3]=r*s*Math.cos(th); arr[i*3+1]=r*u; arr[i*3+2]=r*s*Math.sin(th); }
  starGeo.setAttribute('position',new THREE.BufferAttribute(arr,3)); const starMat=new THREE.PointsMaterial({size:2.2,sizeAttenuation:false,transparent:true,opacity:.7}); scene.add(new THREE.Points(starGeo,starMat));
  // halo
  function glowTex(){ const c=document.createElement('canvas'); c.width=c.height=128; const g=c.getContext('2d'); const gr=g.createRadialGradient(64,64,0,64,64,64); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.25,'rgba(255,255,255,.55)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,128,128); return new THREE.CanvasTexture(c); }
  const GT=glowTex();
  const planets={}, sources={}, pickables=[];
  const spokeMat=new THREE.LineBasicMaterial({transparent:true,opacity:.25});
  D.planets.forEach(p=>{
    const g=new THREE.Group(); g.position.set(...p.pos); scene.add(g);
    const isC=p.id==='centre'; const r=isC?16:8.5;
    const mat=new THREE.MeshBasicMaterial({}); const m=new THREE.Mesh(new THREE.SphereGeometry(r,32,24),mat); m.userData={kind:'planet',id:p.id}; g.add(m); pickables.push(m);
    const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:GT,transparent:true,depthWrite:false,opacity:isC?.85:.45})); spr.scale.setScalar(isC?95:42); g.add(spr);
    const ring=new THREE.Mesh(new THREE.RingGeometry(r*1.9,r*1.95,64),new THREE.MeshBasicMaterial({transparent:true,opacity:.35,side:THREE.DoubleSide})); ring.rotation.x=Math.PI/2.4; g.add(ring);
    const lab=el('div',{class:'plabel'+(isC?' centre':''),text:p.label}); lab.addEventListener('click',()=>{ if(!dragMovedRef()) select({type:'planet',id:p.id}); }); const lo=new THREE.CSS2DObject(lab); lo.position.set(0,r+2,0); g.add(lo);
    if(!isC){ const sg=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(...p.pos)]); scene.add(new THREE.Line(sg,spokeMat)); }
    planets[p.id]={p,g,m,mat,spr,ring,lab,r};
  });
  const thPts=D.thread.planets.map(id=>planets[id].g.position.clone());
  const thCurve=new THREE.CatmullRomCurve3(thPts,true,'catmullrom',0.5);
  const thGeo=new THREE.BufferGeometry().setFromPoints(thCurve.getPoints(160));
  const thMat=new THREE.LineDashedMaterial({dashSize:7,gapSize:5,transparent:true,opacity:.9});
  const thLine=new THREE.LineLoop(thGeo,thMat); thLine.computeLineDistances(); scene.add(thLine);
  const thCenter=thPts.reduce((a,v)=>a.add(v),new THREE.Vector3()).multiplyScalar(1/thPts.length);
  const thLab=el('div',{class:'plabel thread',text:D.thread.label}); thLab.addEventListener('click',()=>{ if(!dragMovedRef()) select({type:'thread',id:D.thread.id}); });
  const thLo=new THREE.CSS2DObject(thLab); thLo.position.copy(thCenter); scene.add(thLo);
  // sources en orbite
  const srcGeo=new THREE.SphereGeometry(2.6,14,10); const toolGeo=new THREE.OctahedronGeometry(5.2,0);
  D.sources.forEach((s,i)=>{
    const home=s.pl[0]; const P0=planets[home]; const sd=s.seed;
    const radius=24+(sd%1000)/1000*30, incl=((sd>>3)%1000)/1000*Math.PI-Math.PI/2, phase=((sd>>6)%1000)/1000*Math.PI*2, speed=(0.035+((sd>>9)%100)/100*0.05)*(sd%2?1:-1);
    const mat=new THREE.MeshBasicMaterial({transparent:true}); const m=new THREE.Mesh(s.k==='outil'?toolGeo:srcGeo,mat); m.userData={kind:'source',id:s.id}; scene.add(m); pickables.push(m);
    const lab=el('div',{class:'slabel'+(s.k==='outil'?' tool':''),text:(s.k==='outil'?'Outil · ':'')+(s.t.length>60?s.t.slice(0,58)+'…':s.t)}); const lo=new THREE.CSS2DObject(lab); m.add(lo); lo.visible=false;
    sources[s.id]={s,m,mat,lab,lo,home,radius,incl,phase,speed,on:true};
  });
  function orbitPos(o,t,out){ const P0=planets[o.home].g.position; const a=o.phase+t*o.speed; const x=Math.cos(a)*o.radius, z=Math.sin(a)*o.radius; out.set(P0.x+x, P0.y+z*Math.sin(o.incl), P0.z+z*Math.cos(o.incl)); return out; }
  // lignes (constellation, relations, liens secondaires)
  const linesGroup=new THREE.Group(); scene.add(linesGroup);
  let dynLines=[]; // {a:fn->Vector3,b:fn->Vector3, line}
  function clearLines(){ dynLines.forEach(d=>{ linesGroup.remove(d.line); d.line.geometry.dispose(); }); dynLines=[]; }
  const posOfNode = id => { if(sources[id]) return ()=>sources[id].m.position; if(planets[id]) return ()=>planets[id].g.position; return null; };
  function addLine(fa,fb,dashed,opacity,color){ const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]); const mat=dashed?new THREE.LineDashedMaterial({color,dashSize:5,gapSize:4,transparent:true,opacity}):new THREE.LineBasicMaterial({color,transparent:true,opacity}); const line=new THREE.Line(geo,mat); linesGroup.add(line); dynLines.push({a:fa,b:fb,line,dashed}); }
  const nodeForRelEnd = id => { if(S[id]) return id; if(PE[id]) return (srcByPerson[id]||[])[0]||null; return null; };
  function drawRelations(sid){
    const s=S[sid]; const ids=[sid,...s.a];
    D.rels.forEach(r=>{ if(!ids.includes(r.f)&&!ids.includes(r.t)) return; const other=ids.includes(r.f)?r.t:r.f; const oid=nodeForRelEnd(other); if(!oid||oid===sid) return; const dashed=r.ty==='critique'||r.ty==='s_oppose'; addLine(posOfNode(sid),posOfNode(oid),dashed,.9,new THREE.Color(T.ink)); sources[oid]&&(sources[oid].lo.visible=true); });
    s.pl.slice(1).forEach(pid=>addLine(posOfNode(sid),posOfNode(pid),false,.35,new THREE.Color(T.muted)));
  }
  function drawConstellations(){
    if(!state.currents.size) return;
    state.currents.forEach(cid=>{ const list=D.sources.filter(s=>s.cu.includes(cid)&&matches(s)).sort((a,b)=>a.pl[0].localeCompare(b.pl[0])||a.d.localeCompare(b.d)); for(let i=1;i<list.length;i++) addLine(posOfNode(list[i-1].id),posOfNode(list[i].id),false,.5,new THREE.Color(T.star)); });
  }
  function refreshStyles(){
    readTokens(); starMat.color=new THREE.Color(T.dust); spokeMat.color=new THREE.Color(T.line); thMat.color=new THREE.Color(T.star);
    Object.values(planets).forEach(o=>{ const c=new THREE.Color(o.p.id==='centre'?T.centre:famColor(o.p.fam)); o.mat.color=c; o.spr.material.color=o.p.id==='centre'?new THREE.Color(T.glow):c; o.ring.material.color=c; });
    applyFilters();
  }
  let hot=new Set(); let threadFocus=false;
  api.applyFilters=function(){
    const f=anyFilter(); const cp=state.focusPlanet;
    const homeCount = cp ? Object.values(sources).filter(x=>x.home===cp && matches(x.s)).length : 0;
    Object.values(sources).forEach(o=>{ const on=matches(o.s); o.on=on; const base=new THREE.Color(famColor(P[o.home].fam)); o.mat.color=base; const inFocus= cp ? o.s.pl.includes(cp) : (threadFocus ? THS.has(o.s.id) : true); o.mat.opacity = on ? (inFocus?1:.35) : .08; o.m.scale.setScalar(on&&f?1.35:1); o.lo.visible = !!(o.s.k==='outil' || hot.has(o.s.id) || (cp && cp!=='centre' && tourI<0 && o.s.pl[0]===cp && on && homeCount<=12) || (f && on && state.q)); o.lab.classList.toggle('hot',hot.has(o.s.id)); });
    Object.values(planets).forEach(o=>{ const n=planetSources(o.p.id).filter(matches).length; o.lab.classList.toggle('dim', !!f && !n && o.p.id!=='centre'); });
    clearLines(); drawConstellations(); if(state.selected&&state.selected.type==='source') drawRelations(state.selected.id);
  };
  // caméra
  let fly=null;
  api.flyTo=function(target,dist){ const dir=cam.position.clone().sub(ctl.target).normalize(); const t=target.clone(); if(tourI>=0){ const right=cam.up.clone().cross(dir).normalize(); t.sub(right.multiplyScalar(dist*0.22)).sub(cam.up.clone().multiplyScalar(dist*0.12)); } const end=t.clone().add(dir.multiplyScalar(dist)); if(reduced){ ctl.target.copy(t); cam.position.copy(end); return; } fly={t0:performance.now(),dur:1200,fromT:ctl.target.clone(),toT:t,fromP:cam.position.clone(),toP:end}; };
  api.focusThread=function(){ hot=new Set(); threadFocus=true; ctl.autoRotate=false; api.applyFilters(); api.flyTo(thCenter, 430); };
  api.focusPlanet=function(pid){ hot=new Set(); threadFocus=false; ctl.autoRotate=false; const o=planets[pid]; api.flyTo(o.g.position, pid==='centre'?560:250); api.applyFilters(); };
  api.focusSource=function(sid,soft){ hot=new Set([sid]); threadFocus=false; ctl.autoRotate=false; const o=sources[sid]; state.focusPlanet=null; api.applyFilters(); api.flyTo(planets[o.home].g.position, 150); };
  api.highlight=function(){ hot=new Set(); threadFocus=false; api.applyFilters(); if(!state.selected) api.flyTo(new THREE.Vector3(0,0,0), 720); };
  function orbit(dAz,dPol){ const off=cam.position.clone().sub(ctl.target); const sp=new THREE.Spherical().setFromVector3(off); sp.theta+=dAz; sp.phi=Math.min(Math.PI-0.1,Math.max(0.1,sp.phi+dPol)); off.setFromSpherical(sp); const end=ctl.target.clone().add(off); if(reduced){ cam.position.copy(end); return; } fly={t0:performance.now(),dur:350,fromT:ctl.target.clone(),toT:ctl.target.clone(),fromP:cam.position.clone(),toP:end}; }
  function zoom(f){ const off=cam.position.clone().sub(ctl.target).multiplyScalar(f); const len=Math.min(ctl.maxDistance,Math.max(ctl.minDistance,off.length())); off.setLength(len); const end=ctl.target.clone().add(off); if(reduced){ cam.position.copy(end); return; } fly={t0:performance.now(),dur:350,fromT:ctl.target.clone(),toT:ctl.target.clone(),fromP:cam.position.clone(),toP:end}; }
  const tools=el('div',{class:'cam-tools',role:'group','aria-label':'Navigation dans l\'univers'},
    el('button',{title:'Tourner à gauche (←)','aria-label':'Tourner à gauche',onclick:()=>{ ctl.autoRotate=false; orbit(-0.45,0); }},'⟲'),
    el('button',{title:'Tourner à droite (→)','aria-label':'Tourner à droite',onclick:()=>{ ctl.autoRotate=false; orbit(0.45,0); }},'⟳'),
    el('button',{title:'Basculer vers le haut (↑)','aria-label':'Basculer vers le haut',onclick:()=>{ ctl.autoRotate=false; orbit(0,-0.3); }},'↑'),
    el('button',{title:'Basculer vers le bas (↓)','aria-label':'Basculer vers le bas',onclick:()=>{ ctl.autoRotate=false; orbit(0,0.3); }},'↓'),
    el('button',{title:'Zoomer (+)','aria-label':'Zoomer',onclick:()=>{ ctl.autoRotate=false; zoom(0.75); }},'+'),
    el('button',{title:'Dézoomer (−)','aria-label':'Dézoomer',onclick:()=>{ ctl.autoRotate=false; zoom(1.33); }},'−'),
    el('button',{title:'Rotation automatique','aria-label':'Rotation automatique',onclick:()=>{ ctl.autoRotate=!ctl.autoRotate; }},'◎'),
    el('button',{title:'Vue d\'ensemble','aria-label':'Vue d\'ensemble',onclick:()=>{ select(null); }},'⌂'));
  host.append(tools);
  document.addEventListener('keydown',e=>{ if(e.target.matches('input,textarea,select')||tourI>=0||!$('#posModal').hidden||state.view!=='v3d') return; const k=e.key; let used=true;
    if(k==='ArrowLeft') orbit(-0.3,0); else if(k==='ArrowRight') orbit(0.3,0); else if(k==='ArrowUp') orbit(0,-0.2); else if(k==='ArrowDown') orbit(0,0.2); else if(k==='+'||k==='=') zoom(0.8); else if(k==='-'||k==='_') zoom(1.25); else used=false;
    if(used){ ctl.autoRotate=false; e.preventDefault(); } });
  let active=true; api.setActive=v=>{ active=v; if(v) resize(); };
  api.retheme=refreshStyles; api.ok=true;
  // interaction
  const ray=new THREE.Raycaster(); const ptr=new THREE.Vector2(); let down=null;
  function pick(ev){ const r=renderer.domElement.getBoundingClientRect(); ptr.x=((ev.clientX-r.left)/r.width)*2-1; ptr.y=-((ev.clientY-r.top)/r.height)*2+1; ray.setFromCamera(ptr,cam); const hits=ray.intersectObjects(pickables.filter(m=>m.userData.kind==='planet'||sources[m.userData.id].on)); return hits[0]&&hits[0].object.userData; }
  let dragMoved=false;
  host.addEventListener('pointerdown',e=>{ down=[e.clientX,e.clientY]; dragMoved=false; host.classList.add('dragging'); });
  window.addEventListener('pointerup',()=>host.classList.remove('dragging'));
  host.addEventListener('pointerup',e=>{ if(!down) return; const moved=Math.hypot(e.clientX-down[0],e.clientY-down[1]); down=null; dragMoved=moved>5; if(dragMoved || e.target.closest('.plabel,.cam-tools')) return; const u=pick(e); if(u) select({type:u.kind,id:u.id}); });
  let hoverId=null;
  host.addEventListener('pointermove',e=>{ if(down) return; const u=pick(e); const id=u&&u.kind==='source'?u.id:null; if(id!==hoverId){ if(hoverId&&sources[hoverId]&&!hot.has(hoverId)&&!(state.focusPlanet&&sources[hoverId].home===state.focusPlanet)) sources[hoverId].lo.visible=false; hoverId=id; if(id){ sources[id].lo.visible=true; } } host.style.cursor=u?'pointer':''; });
  function resize(){ const w=host.clientWidth, h=host.clientHeight; if(!w||!h) return; renderer.setSize(w,h); lr.setSize(w,h); cam.aspect=w/h; cam.updateProjectionMatrix(); }
  window.addEventListener('resize',resize); resize();
  const tmp=new THREE.Vector3(); const t0=performance.now();
  function loop(now){
    requestAnimationFrame(loop); if(!active) return;
    const t=reduced?0:(now-t0)/1000;
    Object.values(sources).forEach(o=>orbitPos(o,t,o.m.position));
    Object.values(planets).forEach(o=>{ const w=horizonWeight(o.p); const k=o.m.scale.x+(w-o.m.scale.x)*.08; o.m.scale.setScalar(k); o.ring.scale.setScalar(k); o.spr.scale.setScalar((o.p.id==='centre'?95:42)*k); o.ring.rotation.z+=reduced?0:.002; });
    dynLines.forEach(d=>{ const a=d.a(), b=d.b(); const pa=d.line.geometry.attributes.position; pa.setXYZ(0,a.x,a.y,a.z); pa.setXYZ(1,b.x,b.y,b.z); pa.needsUpdate=true; d.line.geometry.computeBoundingSphere(); if(d.dashed) d.line.computeLineDistances(); });
    if(fly){ const k=Math.min(1,(now-fly.t0)/fly.dur); const e=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2; ctl.target.lerpVectors(fly.fromT,fly.toT,e); cam.position.lerpVectors(fly.fromP,fly.toP,e); if(k>=1) fly=null; }
    ctl.update(); renderer.render(scene,cam); lr.render(scene,cam);
  }
  requestAnimationFrame(loop);
  setTimeout(refreshStyles,0);
  return api;
})();

// thème : suivre les changements
const mo=new MutationObserver(()=>{ U.retheme(); buildControls(); }); mo.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class']});
if(window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{ U.retheme(); buildControls(); });

// ---------- visite guidée ----------
const tourEl=$('#tour'); let tourI=-1; let tourId='intro';
const TOURS=Object.fromEntries(D.tours.map(t=>[t.id,t])); const curSteps=()=>TOURS[tourId].steps;
function startTour(id,i){ tourId=id||'intro'; tourI=i||0; closeTourMenu(); tourEl.hidden=false; $('#controls').hidden=true; $('#ctlShow').hidden=false; if(state.view!=='v3d') setView('v3d'); renderTour(); }
function endTour(){ tourI=-1; tourEl.hidden=true; if(store.get('ctl', window.innerWidth>820)!==false){ $('#controls').hidden=false; $('#ctlShow').hidden=true; } }
function renderTour(){
  const st=curSteps()[tourI]; tourEl.textContent='';
  tourEl.append(el('div',{class:'step',text:`${TOURS[tourId].title.toUpperCase()} · ÉTAPE ${tourI+1} / ${curSteps().length}`}));
  tourEl.append(el('h2',{text:st.title})); tourEl.append(el('p',{text:st.text}));
  const qb=el('div',{class:'tour-quotes'}); st.quotes.forEach(([sid,i])=>{ const q=S[sid].q[i]; const b=quoteBlock(q,S[sid]); b.style.cursor='pointer'; b.title='Ouvrir la source'; b.addEventListener('click',()=>select({type:'source',id:sid})); qb.append(b); }); tourEl.append(qb);
  tourEl.append(el('div',{class:'ask',text:st.question}));
  const dots=el('div',{class:'dots'}); curSteps().forEach((_,k)=>dots.append(el('button',{'aria-label':`Étape ${k+1}`,'aria-current':k===tourI?'step':null,onclick:()=>{ tourI=k; renderTour(); }})));
  const nav=el('nav',{}, dots, el('button',{class:'btn',onclick:endTour},'Quitter'), tourI>0?el('button',{class:'btn',onclick:()=>{ tourI--; renderTour(); }},'← Précédent'):null, tourI<curSteps().length-1?el('button',{class:'btn primary',onclick:()=>{ tourI++; renderTour(); }},'Suivant →'):el('button',{class:'btn primary',onclick:()=>{ endTour(); openPos(); }},'À toi : où te situes-tu ?'));
  if(tourId==='productivite'){ const tb=el('button',{class:'btn',onclick:()=>select({type:'thread',id:D.thread.id})},'Voir le trilemme'); nav.insertBefore(tb, nav.children[1]); }
  tourEl.append(nav);
  state.selected={type:'planet',id:st.planet}; showPlanet(st.planet); state.focusPlanet=st.planet; U.focusPlanet(st.planet);
}
let tourMenu=null;
function closeTourMenu(){ if(tourMenu){ tourMenu.remove(); tourMenu=null; } }
function tourButtons(){ return D.tours.map(t=>el('button',{onclick:()=>startTour(t.id,0)}, el('b',{text:t.title}), el('span',{text:`${t.steps.length} étapes`}))); }
$('#tourBtn').onclick=e=>{ e.stopPropagation(); if(tourMenu){ closeTourMenu(); return; } tourMenu=el('div',{class:'tour-menu',role:'menu'}, ...tourButtons()); $('#app').append(tourMenu); };
document.addEventListener('click',e=>{ if(tourMenu && !tourMenu.contains(e.target)) closeTourMenu(); });
document.addEventListener('keydown',e=>{
  if(e.target.matches('input,textarea')) return;
  if(!$('#posModal').hidden && e.key==='Escape'){ closePos(); return; }
  if(tourI<0) return;
  if(e.key==='ArrowRight' && tourI<curSteps().length-1){ tourI++; renderTour(); }
  else if(e.key==='ArrowLeft' && tourI>0){ tourI--; renderTour(); }
  else if(e.key==='Escape') endTour();
});

// ---------- où te situes-tu ----------
const posModal=$('#posModal');
let mine=store.get('pos', Object.fromEntries(D.axes.map(a=>[a.id,50])));
function closestCurrents(){
  return D.currents.map(c=>{ const cp=D.cpos[c.id]; let d=0; D.axes.forEach(a=>{ d+=Math.pow((mine[a.id]-cp[a.id])/100,2); }); const dist=Math.sqrt(d/D.axes.length); return {c, pct:Math.max(0,Math.round((1-dist*1.7)*100))}; }).sort((a,b)=>b.pct-a.pct);
}
function openPos(){ posModal.hidden=false; renderPos(); setTimeout(()=>{ const f=posModal.querySelector('input'); f&&f.focus(); },30); }
function closePos(){ posModal.hidden=true; }
posModal.addEventListener('click',e=>{ if(e.target===posModal) closePos(); });
function renderPos(){
  posModal.textContent=''; const sh=el('div',{class:'sheet'});
  sh.append(el('header',{}, el('div',{}, el('h2',{id:'posTitle',text:'Où te situes-tu ?'}), el('p',{text:'Place-toi sur '+D.axes.length+' lignes de fracture. Les points gris figurent la position indicative de chaque courant de pensée ; les plus proches de toi s\'allument.'})), el('button',{class:'btn',onclick:closePos},'Fermer')));
  const grid=el('div',{class:'pos-grid'}); const left=el('div',{}); const right=el('div',{class:'result'});
  const near=closestCurrents(); const top3=new Set(near.slice(0,3).map(x=>x.c.id));
  D.axes.forEach(a=>{
    const box=el('div',{class:'axis'}); box.append(el('label',{for:'ax-'+a.id,text:a.q}));
    const inp=el('input',{class:'range',type:'range',min:'0',max:'100',id:'ax-'+a.id,value:String(mine[a.id])});
    inp.addEventListener('input',()=>{ mine[a.id]=+inp.value; store.set('pos',mine); updateResult(); updateStrip(); });
    const strip=el('div',{class:'strip','aria-hidden':'true'}, el('div',{class:'track'}));
    function updateStrip(){ strip.querySelectorAll('.cdot,.you').forEach(n=>n.remove()); const t3=new Set(closestCurrents().slice(0,3).map(x=>x.c.id)); D.currents.forEach(c=>{ strip.append(el('span',{class:'cdot'+(t3.has(c.id)?' near':''),style:`left:${D.cpos[c.id][a.id]}%`,title:c.label})); }); strip.append(el('span',{class:'you',style:`left:${mine[a.id]}%`})); }
    box._upd=updateStrip; updateStrip();
    box.append(inp, strip, el('div',{class:'poles'},el('span',{text:a.left}),el('span',{text:a.right})));
    left.append(box);
  });
  function updateResult(){ right.textContent=''; right.append(el('h3',{text:'Les courants les plus proches de toi'})); closestCurrents().slice(0,4).forEach(x=>{ right.append(el('div',{class:'near-item'}, el('span',{class:'pct',text:x.pct+' %'}), el('b',{},el('button',{style:'all:unset;cursor:pointer;text-decoration:underline;text-underline-offset:3px',onclick:()=>{ closePos(); select({type:'current',id:x.c.id}); }},x.c.label)), el('p',{text:x.c.desc}))); }); right.append(el('p',{class:'disclaimer',text:'Proximité calculée sur les '+D.axes.length+' axes. Le placement des courants est un choix éditorial simplificateur : il sert à lancer la discussion, pas à classer les gens. Ta position reste sur ton appareil.'})); left.querySelectorAll('.axis').forEach(b=>b._upd&&b._upd()); }
  updateResult();
  grid.append(left,right); sh.append(grid); posModal.append(sh);
}
$('#posBtn').onclick=openPos;

// ---------- démarrage ----------
buildControls(); updateHorizonHint(); showHome(); if(window.innerWidth<=820) panel.classList.add('min');
const v0=store.get('view', window.innerWidth<600?'vlist':'v3d'); setView(U.ok?v0:'vlist');
if(location.hash==='#visite') startTour('intro',0); else if(location.hash==='#productivite') startTour('productivite',0);
})();
