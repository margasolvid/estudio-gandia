/* ==========================================================================
   Calendario de estudio por días, semanas y horas.
   Se guarda dentro del progreso (Store.data.plan), así que viaja con
   progreso.json, con el navegador y con Exportar / Importar.
   Necesita: Store, LAWS, QS, $, esc, openArt, buildQueue, showTab,
   showRanking, inBank, SUPUESTOS (definidos en index.html).
   ========================================================================== */
(function(){
"use strict";
const DOW = ["L","M","X","J","V","S","D"];                 // lunes = 0
const MIN_ART = {A:12, B:8, C:5};                           // minutos por artículo (estudio + sus preguntas)
const BLOCK = 50, MIN_BLOCK = 60;                           // simulacros: bloques de 50 preguntas ≈ 60 min
const pad = n => String(n).padStart(2,"0");
const iso = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const parse = s => { const [y,m,d]=String(s).split("-").map(Number); return new Date(y,(m||1)-1,d||1); };
const addDays = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
const dow = d => (d.getDay()+6)%7;
const fmtH = m => { const h=Math.floor(m/60), r=Math.round(m%60); return h? (r? `${h} h ${r} min` : `${h} h`) : `${r} min`; };
const fmtDay = d => d.toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"short"});
const todayIso = () => iso(new Date());

function plan(){
  if(!Store.data.plan){
    Store.data.plan = { start: todayIso(), exam: "", hours:[3,3,3,3,3,5,4], done:{}, t:Date.now() };
  }
  const p=Store.data.plan; p.done=p.done||{}; if(!Array.isArray(p.hours)||p.hours.length!==7) p.hours=[3,3,3,3,3,5,4];
  return p;
}

/* ---------- lista de tareas, por orden de prioridad ---------- */
function articleTasks(){
  const R=(window.RANKING||[]); const out=[]; const seen=new Set();
  for(const pr of ["A","B","C"]) for(const r of R.filter(x=>(x.pr||"C")===pr)){
    const k=r.law+"|"+r.art; if(seen.has(k)||!LAWS[r.law]) continue; seen.add(k);
    out.push({ id:"art:"+k, kind:"art", law:r.law, art:r.art, pr:r.pr||"C", min:MIN_ART[r.pr||"C"],
      label:`${LAWS[r.law].short} · ${r.t.replace(/^Artículo/,"Art.")}`, sub:r.mat||"" });
  }
  // apuntes de los temas prácticos intercalados: uno cada 8 artículos
  const ap=Object.keys(LAWS).filter(k=>LAWS[k].apuntes).map(k=>{ const n=LAWS[k].nodes.filter(x=>x.k==="a");
    const first=n[0]; return { id:"ap:"+k, kind:"art", law:k, art:first.id, pr:"A", min:Math.max(40,n.length*12), label:`Apuntes · ${LAWS[k].name}`, sub:`${n.length} apartados con sus preguntas` }; });
  const res=[]; let i=0;
  for(const t of out){ res.push(t); i++; if(i%8===0&&ap.length) res.push(ap.shift()); }
  return res.concat(ap);
}
function practiceTasks(){
  const lists=[];
  const banks=[["sim","Simulacro Gandia (Claude)"],["libro","Tests de repaso Subalternos GVA"]];
  for(const [bk,name] of banks){
    const n=QS.filter(q=>q.b===bk).length, l=[];
    for(let i=0;i<n;i+=BLOCK){ const to=Math.min(n,i+BLOCK);
      l.push({ id:`sim:${bk}:${i}`, kind:"sim", bank:bk, from:i, to, min:Math.round(MIN_BLOCK*(to-i)/BLOCK),
        label:`${name}: preguntas ${i+1}–${to}`, sub:"Responde las pendientes y repasa los fallos con su artículo" }); }
    lists.push(l);
  }
  // exámenes reales: primero los de subalterno (Generalitat y ayuntamientos), después los de la Comunitat
  const rank=b=>b==="gva"?0:b==="muni"?1:2;
  const exs=[...new Map(QS.filter(q=>q.real).map(q=>[q.ex,q.b])).entries()].sort((a,b)=>rank(a[1])-rank(b[1]));
  lists.push(exs.map(([ex])=>{ const n=QS.filter(q=>q.real&&q.ex===ex).length;
    return { id:"exam:"+ex, kind:"exam", ex, min:Math.max(20,Math.round(n*1.2)), label:`Examen real: ${ex}`, sub:`${n} preguntas, como en el examen` }; }));
  // supuestos prácticos y exámenes tipo Gandia
  lists.push((window.SUPUESTOS||[]).map((s,i)=>({ id:"sup:"+s.id, kind:"sup", min:75, label:`Supuesto práctico ${i+1}: ${s.t}`, sub:"Resuélvelo por escrito en 60-90 minutos y compáralo con la solución" })));
  lists.push(Array.from({length:8},(_,i)=>({ id:"tipo:"+i, kind:"tipo", min:70, label:`Examen tipo Gandia nº ${i+1} (40 preguntas, 57 min)`, sub:"Corrige con −1/4 y anota la nota" })));
  const out=[], order=[2,0,3,1,4];
  while(lists.some(l=>l.length)) for(const i of order){ if(lists[i]&&lists[i].length) out.push(lists[i].shift()); }
  return out;
}

/* ---------- curva del olvido: utilidades ---------- */
function arts0(){ return articleTasks(); }
function temaOfTask(t){
  if(t.kind!=="art"||!LAWS[t.law]) return null;
  if(LAWS[t.law].apuntes) return String(+t.law.slice(1));
  if(t.law==="lpac"){ const n=parseInt(t.art,10); return n===16?"11":(n>=34&&n<=52?"5":"4"); }
  return String((LAWS[t.law].temas||[])[0]||"");
}
function failRates(){
  const A=Store.data.answers||{}, r={}, n={};
  for(const q of QS){ const a=A[q.id]; if(!a) continue; const k=String(q.tema); n[k]=(n[k]||0)+1; if(!a.ok) r[k]=(r[k]||0)+1; }
  const out={}; for(const k in n) out[k]=(r[k]||0)/n[k]; return out;
}

/* ---------- reparto en días ---------- */
function build(){
  const p=plan();
  const start=parse(p.start), exam=p.exam?parse(p.exam):null;
  if(!exam || exam<=start) return {error: !exam ? "Pon la fecha del examen para generar el calendario." : "La fecha del examen tiene que ser posterior a la de inicio."};
  const startT=start.getTime();
  const doneBefore = id => p.done[id] && p.done[id] < startT;     // lo hecho antes de replanificar desaparece del plan
  const days=[];
  for(let d=new Date(start); d<exam; d=addDays(d,1)) days.push({date:iso(d), d:new Date(d), cap:Math.round((+p.hours[dow(d)]||0)*60), tasks:[], used:0});
  const study=days.filter(x=>x.cap>0);
  if(!study.length) return {error:"Pon horas de estudio en algún día de la semana."};
  // último día con horas: repaso ligero; fase 3 = 12 % final; fase 1 = 55 % del resto
  const last=study[study.length-1];
  const rest=study.slice(0,-1);
  const n3=rest.length>=4 ? Math.max(1,Math.round(rest.length*0.12)) : 0;
  const p3=rest.slice(rest.length-n3), base=rest.slice(0,rest.length-n3);
  const n1=Math.max(1,Math.round(base.length*0.55));
  const p1=base.slice(0,n1), p2=base.slice(n1);
  p1.forEach(x=>x.phase=1); p2.forEach(x=>x.phase=2); p3.forEach(x=>x.phase=3); last.phase=4;
  // curva del olvido: un tema cuenta como «estudiado» al tener 3 tareas programadas (o todas, si tiene menos);
  // desde que haya 3 temas estudiados en semanas anteriores, cada semana se repasan 2 de ellos por turno
  const tcount={}; arts0().forEach(t=>{ const k=temaOfTask(t); if(k) tcount[k]=(tcount[k]||0)+1; });
  const seenN={}, studied={}, lastRev={}, failR=failRates();
  const weekKey=d=>iso(addDays(d,-dow(d)));
  let revWeek=null;
  const review=day=>{
    if(day.phase===4) return; const wk=weekKey(day.d); if(revWeek===wk) return; revWeek=wk;
    const prev=Object.keys(studied).filter(k=>studied[k]<wk);
    if(prev.length<3) return;
    prev.sort((a,b)=>((lastRev[a]||"")<(lastRev[b]||"")?-1:(lastRev[a]||"")>(lastRev[b]||"")?1:(failR[b]||0)-(failR[a]||0)||studied[a].localeCompare(studied[b])));
    const two=prev.slice(0,2).map(Number).sort((a,b)=>a-b); two.forEach(k=>lastRev[k]=day.date);
    const m=Math.min(60,day.cap);
    day.tasks.push({id:`rev:${wk}`, kind:"rev", temas:two, min:m, label:`🧠 Curva del olvido: repaso del Tema ${two[0]} y del Tema ${two[1]}`,
      sub:`Llevas ${prev.length} temas estudiados. Relee sus notas 💡 y apuntes y haz unas 20 preguntas de cada uno, empezando por las falladas`});
    day.used+=m;
  };
  const mark=(day,t)=>{ const k=temaOfTask(t); if(!k) return; seenN[k]=(seenN[k]||0)+1; if(!studied[k]&&seenN[k]>=Math.min(3,tcount[k]||3)) studied[k]=weekKey(day.d); };
  // píldora diaria (15 min) desde el segundo día de estudio: lo que llevas peor según tus respuestas
  let nPil=0;
  const pill=day=>{ if(day.phase===4||nPil++<1) return; const m=Math.min(15,day.cap);
    day.tasks.push({id:`pil:${day.date}`, kind:"pill", min:m, label:"💊 Píldora de repaso: lo que llevas peor", sub:"Abre las Píldoras y repite los fallos de la primera que te salga"}); day.used+=m; };
  const fill=(daysArr,queue)=>{ for(const day of daysArr){ review(day); pill(day); while(queue.length){ const t=queue[0];
        if(day.used && day.used+t.min>day.cap+5) break; day.tasks.push(queue.shift()); day.used+=t.min; mark(day,t); } } };
  const arts=articleTasks().filter(t=>!doneBefore(t.id));
  const prac=practiceTasks().filter(t=>!doneBefore(t.id));
  const q1=[...arts];
  if(!p2.length && !p3.length) fill(p1.length?p1:[last],q1); else fill(p1,q1);
  // lo que no cupo en la fase 1: los A pasan a la fase 2 antes de los simulacros; B y C, a «si te sobra tiempo»
  const leftA=q1.filter(t=>t.pr==="A"), leftBC=q1.filter(t=>t.pr!=="A");
  const q2=[...leftA,...prac];
  fill(p2,q2);
  // fase 3: repaso de fallos y notas de prioridad A (tareas fechadas)
  for(const day of p3){ review(day); pill(day); let i=0; while(day.used<day.cap){ const m=Math.min(60,day.cap-day.used); const k=i%2;
      day.tasks.push(k===0
        ? {id:`rep:${day.date}:${i}`, kind:"fail", min:m, label:"Repaso de preguntas falladas", sub:"Banco «Todos», estado «Falladas»: hasta acertarlas"}
        : {id:`not:${day.date}:${i}`, kind:"notes", min:m, label:"Notas 💡 de los artículos de prioridad A y novedades legales", sub:"Ranking de Gandia y botón 🆕 Novedades"});
      day.used+=m; i++; } }
  last.tasks.push({id:`fin:${last.date}`, kind:"notes", min:Math.min(60,last.cap), label:"Repaso ligero: solo notas 💡 de prioridad A", sub:"Nada nuevo. Prepara DNI, bolígrafo y el trayecto, y descansa"}); last.used+=Math.min(60,last.cap);
  const extra=[...q2,...leftBC];
  const all=days.flatMap(x=>x.tasks);
  const total=all.reduce((s,t)=>s+t.min,0), done=all.filter(t=>p.done[t.id]).reduce((s,t)=>s+t.min,0);
  return {days, extra, total, done, exam, start, prevDone:Object.values(p.done).filter(v=>v<startT).length};
}

/* ---------- pintado ---------- */
const PH={1:"Fase 1 · estudio de artículos",2:"Fase 2 · simulacros y exámenes",3:"Fase 3 · repaso final",4:"Víspera del examen"};
let view="hoy", weekOff=0;
function taskHTML(t,p){
  const ok=!!p.done[t.id];
  const act = t.kind==="art" ? `<button class="btn" data-cal-art="${esc(t.law)}|${esc(t.art)}">Estudiar</button><button class="btn" data-cal-pr="${esc(t.law)}|${esc(t.art)}">Practicar</button>`
    : t.kind==="sim" ? `<button class="btn" data-cal-bank="${t.bank}">Abrir</button>`
    : t.kind==="exam" ? `<button class="btn" data-cal-exam="${esc(t.ex)}">Abrir</button>`
    : t.kind==="fail" ? `<button class="btn" data-cal-fail="1">Abrir</button>`
    : t.kind==="pill" ? `<button class="btn" data-cal-pill="1">Abrir</button>`
    : t.kind==="rev" ? t.temas.map(k=>`<button class="btn" data-cal-rev="${k}" title="Preguntas de este tema, en orden aleatorio">Tema ${k}</button><button class="btn" data-cal-revf="${k}" title="Sólo las falladas de este tema">Fallos T${k}</button>`).join("")
    : t.kind==="sup" ? `<button class="btn" data-cal-sup="1">Abrir</button>`
    : t.kind==="tipo" ? `<button class="btn" data-cal-tipo="1">Abrir</button>`
    : `<button class="btn" data-cal-notes="1">Ranking</button>`;
  return `<div class="ct${ok?" ok":""}"><label><input type="checkbox" data-cal-done="${esc(t.id)}" ${ok?"checked":""}><span><b>${esc(t.label)}</b>${t.pr?` <span class="b ${t.pr==="A"?"top":"ex"}">${t.pr}</span>`:""}<br><span class="cs">${esc(t.sub||"")} · ${fmtH(t.min)}</span></span></label><span class="ca cal-noprint">${act}</span></div>`;
}
function dayHTML(day,p,compact){
  const isT=day.date===todayIso(), dm=day.tasks.filter(t=>p.done[t.id]).reduce((s,t)=>s+t.min,0);
  const head=`<div class="cdh"><b>${fmtDay(day.d)}</b>${isT?' <span class="b top">HOY</span>':""} <span class="cs">${day.cap?fmtH(day.cap)+" disponibles":"descanso"}${day.phase?" · "+PH[day.phase]:""}${day.used?` · hecho ${Math.round(100*dm/day.used)}%`:""}</span></div>`;
  if(!day.tasks.length) return `<div class="cd rest">${head}<div class="cs">Día sin horas de estudio.</div></div>`;
  return `<div class="cd${isT?" today":""}">${head}${day.tasks.map(t=>taskHTML(t,p)).join("")}</div>`;
}
function weeks(days){ const w=[]; for(const d of days){ const k=iso(addDays(d.d,-dow(d.d))); let g=w[w.length-1]; if(!g||g.k!==k){ g={k,days:[]}; w.push(g);} g.days.push(d);} return w; }
function render(){
  const p=plan(), R=build(), box=$("#center");
  const form=`<details class="cform cal-noprint" ${R.error?"open":""}><summary>⚙️ Fechas y horas de estudio</summary>
    <div class="cfg"><label>Empiezo a estudiar <input type="date" id="calStart" value="${esc(p.start)}"></label>
    <label>Día del examen <input type="date" id="calExam" value="${esc(p.exam)}"></label></div>
    <div class="cfg">Horas por día: ${DOW.map((n,i)=>`<label class="hd">${n}<input type="number" min="0" max="16" step="0.5" data-cal-h="${i}" value="${p.hours[i]}"></label>`).join("")}</div>
    <div class="cfg"><button class="btn primary" id="calSave">Guardar y generar</button><button class="btn" id="calReplan" title="Empieza el plan hoy con lo que te queda; lo ya hecho no se repite">Replanificar desde hoy</button><button class="btn" id="calPrint">🖨 Imprimir o guardar en PDF</button></div>
    <div class="cs">El calendario reparte primero los artículos del ranking (A, luego B, luego C) con los apuntes de los temas prácticos intercalados; después el simulacro, los exámenes reales (primero los de subalterno), los supuestos prácticos y los exámenes tipo Gandia; y deja los últimos días para repasar fallos y notas. 💊 Cada día de estudio incluye una píldora de 15 minutos con lo que llevas peor. 🧠 Curva del olvido: en cuanto llevas 3 temas estudiados, cada semana empieza con el repaso de 2 temas anteriores, por turnos (primero los que hace más tiempo que no repasas y los que más fallas). Marca cada tarea al terminarla. Si te retrasas, pulsa «Replanificar desde hoy».</div></details>`;
  if(R.error){ box.innerHTML=`<div class="rank cal"><h3>📅 Calendario de estudio</h3>${form}<p class="empty">${esc(R.error)}</p></div>`; box.scrollTop=0; return; }
  const left=Math.round((R.exam-parse(todayIso()))/864e5), pct=R.total?Math.round(100*R.done/R.total):0;
  const tot=R.days.reduce((s,d)=>s+d.cap,0);
  let warn="";
  const exMin=R.extra.reduce((s,t)=>s+t.min,0);
  if(R.extra.length) warn=`<div class="note cal-noprint">No cabe todo: quedan ${R.extra.length} tareas (${fmtH(exMin)}) en «Si te sobra tiempo». Añade horas o adelanta el inicio, y lo más importante seguirá primero.</div>`;
  const summary=`<div class="csum"><div><b>${left>0?left:0}</b><span>días al examen</span></div><div><b>${fmtH(tot)}</b><span>de estudio previstas</span></div><div><b>${pct}%</b><span>del plan hecho</span></div><div><b>${R.days.filter(d=>d.cap).length}</b><span>días de estudio</span></div></div>
    <div class="bar"><span style="width:${pct}%;background:var(--green)"></span></div>`;
  const tabs=`<div class="ctabs cal-noprint">${[["hoy","Hoy"],["semana","Semana"],["todo","Todo el plan"]].map(([k,n])=>`<button class="btn${view===k?" primary":""}" data-cal-view="${k}">${n}</button>`).join("")}</div>`;
  let body="";
  const W=weeks(R.days);
  if(view==="hoy"){
    const t=todayIso(); let d=R.days.find(x=>x.date===t);
    if(!d){ d = t<R.days[0].date ? R.days[0] : null; }
    body = d ? (d.date!==t?`<p class="cs">Tu plan empieza el ${fmtDay(d.d)}:</p>`:"")+dayHTML(d,p) : `<p class="empty">El examen ya ha pasado o hoy no está en el plan.</p>`;
    const next=R.days.find(x=>x.date>(d?d.date:t)&&x.tasks.length); if(next) body+=`<p class="cs" style="margin-top:12px">Siguiente día de estudio:</p>`+dayHTML(next,p);
  } else if(view==="semana"){
    const t=todayIso(); let i=W.findIndex(w=>w.days.some(d=>d.date===t)); if(i<0) i=0; i=Math.max(0,Math.min(W.length-1,i+weekOff));
    const w=W[i], m=w.days.reduce((s,d)=>s+d.used,0), dm=w.days.flatMap(d=>d.tasks).filter(x=>p.done[x.id]).reduce((s,x)=>s+x.min,0);
    body=`<div class="cwk cal-noprint"><button class="btn" data-cal-wk="-1" ${i?"":"disabled"}>← Semana anterior</button><b>Semana ${i+1} de ${W.length} · ${fmtH(m)} · ${m?Math.round(100*dm/m):0}% hecho</b><button class="btn" data-cal-wk="1" ${i<W.length-1?"":"disabled"}>Semana siguiente →</button></div>`+w.days.map(d=>dayHTML(d,p)).join("");
  } else {
    body=W.map((w,i)=>{ const m=w.days.reduce((s,d)=>s+d.used,0), dm=w.days.flatMap(d=>d.tasks).filter(x=>p.done[x.id]).reduce((s,x)=>s+x.min,0);
      return `<h4 class="cwh">Semana ${i+1} · del ${fmtDay(w.days[0].d)} al ${fmtDay(w.days[w.days.length-1].d)} · ${fmtH(m)} · ${m?Math.round(100*dm/m):0}% hecho</h4>`+w.days.map(d=>dayHTML(d,p)).join(""); }).join("");
    body+=`<div class="cd today"><div class="cdh"><b>${fmtDay(R.exam)}</b> <span class="b top">EXAMEN</span></div><div class="cs">¡A por la plaza!</div></div>`;
    if(R.extra.length) body+=`<h4 class="cwh">Si te sobra tiempo (${fmtH(exMin)})</h4><div class="cd">${R.extra.map(t=>taskHTML(t,p)).join("")}</div>`;
  }
  box.innerHTML=`<div class="rank cal"><h3>📅 Calendario de estudio</h3>
    <p class="stats">Del ${fmtDay(R.start)} al examen del ${fmtDay(R.exam)}.${R.prevDone?` Llevas ${R.prevDone} tareas hechas antes de replanificar.`:""}</p>
    ${form}${summary}${warn}${tabs}${body}</div>`;
}
function readForm(){
  const p=plan(); p.start=$("#calStart").value||p.start; p.exam=$("#calExam").value||"";
  document.querySelectorAll("[data-cal-h]").forEach(i=>{ p.hours[+i.dataset.calH]=Math.max(0,Math.min(16,parseFloat(i.value)||0)); });
  p.t=Date.now();
}
function open(){ view="hoy"; weekOff=0; render(); $("#center").scrollTop=0; showTab("art"); }
window.showCalendar=open;

$("#center").addEventListener("click",e=>{
  if(!e.target.closest(".cal")) return;
  const g=(k)=>e.target.closest("[data-"+k+"]");
  let b;
  if(b=g("cal-view")){ view=b.dataset.calView; weekOff=0; return render(); }
  if(b=g("cal-wk")){ weekOff+=+b.dataset.calWk; return render(); }
  if(e.target.id==="calSave"){ readForm(); Store.save(); return render(); }
  if(e.target.id==="calReplan"){ readForm(); const p=plan(); p.start=todayIso(); p.t=Date.now(); Store.save(); return render(); }
  if(e.target.id==="calPrint"){ readForm(); view="todo"; render(); setTimeout(()=>window.print(),100); return; }
  if(b=g("cal-art")){ const [l,a]=b.dataset.calArt.split("|"); return openArt(l,a,{tab:true}); }
  if(b=g("cal-pr")){ const [l,a]=b.dataset.calPr.split("|"); openArt(l,a); $("#fbank").value="all"; $("#fart").checked=true; $("#fstat").value="all"; $("#ftopic").value="all"; $("#fexam").value="all"; buildQueue(); return showTab("q"); }
  if(b=g("cal-bank")){ $("#fbank").value=b.dataset.calBank; $("#fstat").value="pend"; $("#fart").checked=false; $("#ftopic").value="all"; $("#fexam").value="all"; $("#ford").value="seq"; buildQueue(); return showTab("q"); }
  if(b=g("cal-exam")){ $("#fbank").value="real"; $("#fexam").value=b.dataset.calExam; $("#fstat").value="all"; $("#fart").checked=false; $("#ftopic").value="all"; $("#ford").value="seq"; buildQueue(); return showTab("q"); }
  if(b=g("cal-fail")){ $("#fbank").value="all"; $("#fstat").value="fail"; $("#fart").checked=false; $("#ftopic").value="all"; $("#fexam").value="all"; buildQueue(); return showTab("q"); }
  if(b=g("cal-notes")){ return showRanking(); }
  if(b=g("cal-pill")){ return window.showPildoras(); }
  if(b=g("cal-rev")||g("cal-revf")){ const k=b.dataset.calRev||b.dataset.calRevf; $("#fbank").value="all"; $("#ftopic").value=window.TEMAS[k]; $("#fstat").value=b.dataset.calRevf?"fail":"all"; $("#fart").checked=false; $("#fexam").value="all"; $("#fsrc").value="all"; $("#ford").value="rnd"; buildQueue(); return showTab("q"); }
  if(b=g("cal-sup")){ return $("#bSup").click(); }
  if(b=g("cal-tipo")){ return $("#bExam").click(); }
});
$("#center").addEventListener("change",e=>{
  const c=e.target.closest("[data-cal-done]"); if(!c) return;
  const p=plan(); if(c.checked) p.done[c.dataset.calDone]=Date.now(); else delete p.done[c.dataset.calDone];
  Store.save(); const y=$("#center").scrollTop; render(); $("#center").scrollTop=y;
});

/* fusión al importar un archivo de progreso: devuelve true si cambia algo */
window.mergePlan=function(inc, apply){
  if(!inc||typeof inc!=="object"||!inc.done) return false;
  const p=plan(); let ch=false;
  if((inc.t||0)>(p.t||0) && (inc.exam!==p.exam||inc.start!==p.start||JSON.stringify(inc.hours)!==JSON.stringify(p.hours))){ ch=true; if(apply){ p.start=inc.start; p.exam=inc.exam; p.hours=inc.hours; p.t=inc.t; } }
  for(const [k,v] of Object.entries(inc.done)){ if(!p.done[k]){ ch=true; if(apply) p.done[k]=v; } }
  return ch;
};
})();
