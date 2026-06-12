const STORAGE_KEY = 'foundation_os_v2_entries';
const THEME_KEY = 'foundation_os_theme';

const domains = {
  exercise: { label:'Exercise', signal:'Movement', prompts:['30 min walk','Basketball','Swim','Strength circuit','Run'] },
  nutrition: { label:'Nutrition', signal:'Fuel', prompts:['Coffee','Ground beef + salad','Oatmeal','Protein meal','Hydration'] },
  sleep: { label:'Sleep', signal:'Recovery', prompts:['Slept well','Interrupted sleep','Nap','Early wake','High quality'] },
  connection: { label:'Connection', signal:'Closeness', prompts:['Quality talk','Walk together','Affection','Intimacy','Family time'] }
};

let entries = loadEntries();
let activeDate = todayKey();

function todayKey(d=new Date()){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function parseKey(key){ return new Date(`${key}T12:00:00`); }
function shiftDate(key, delta){ const d=parseKey(key); d.setDate(d.getDate()+delta); return todayKey(d); }
function timeText(iso){ return new Date(iso).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12:false}); }
function dateLabel(key){
  if(key === todayKey()) return 'Today';
  const d=parseKey(key);
  return d.toLocaleDateString([], {weekday:'short', month:'short', day:'numeric'});
}
function fullDateLabel(key){ return parseKey(key).toLocaleDateString([], {weekday:'short', month:'short', day:'numeric', year:'numeric'}); }
function loadEntries(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } }
function persist(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }
function getEntries(domain, key=activeDate){ return entries.filter(e => e.date === key && (!domain || e.domain === domain)); }
function escapeHtml(str=''){ return String(str).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function setText(id,val){ const el=document.getElementById(id); if(el) el.textContent=val; }

function init(){
  const savedTheme = localStorage.getItem(THEME_KEY);
  if(savedTheme === 'dark') document.documentElement.classList.add('dark');

  document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
  document.querySelectorAll('.quick-form').forEach(form => form.addEventListener('submit', handleSubmit));
  document.getElementById('themeBtn')?.addEventListener('click', toggleTheme);
  document.querySelectorAll('input[type="time"]').forEach(i=>i.addEventListener('input', updateSleepTotal));
  document.querySelectorAll('#qualityBtns button').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('#qualityBtns button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); updateSleepTotal();
  }));
  document.querySelectorAll('.date-pill').forEach(pill=>{
    const [prev,next] = pill.querySelectorAll('button');
    prev?.addEventListener('click',()=>changeDate(-1));
    next?.addEventListener('click',()=>changeDate(1));
  });
  document.getElementById('exportBtn')?.addEventListener('click', exportData);
  document.getElementById('importFile')?.addEventListener('change', importData);
  document.getElementById('clearBtn')?.addEventListener('click', clearAll);
  renderChips(); render();
}

function switchView(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.view===id));
  window.scrollTo({top:0, behavior:'smooth'});
}
function changeDate(delta){ activeDate = shiftDate(activeDate, delta); render(); }

function handleSubmit(e){
  e.preventDefault();
  const form=e.currentTarget;
  const domain=form.dataset.domain;
  let text='';
  let meta={};

  if(domain === 'sleep'){
    const bed=form.querySelector('input[name="bed"]').value;
    const wake=form.querySelector('input[name="wake"]').value;
    const note=form.querySelector('textarea').value.trim();
    const quality=document.querySelector('#qualityBtns button.active')?.textContent || 'Good';
    const total=calcSleep(bed,wake);
    text = [bed && `Bed ${bed}`, wake && `Wake ${wake}`, total && `Total ${total}`, `Quality ${quality}`, note].filter(Boolean).join(' · ');
    meta={bed,wake,total,quality};
    if(!bed && !wake && !note) return;
  } else {
    const textarea=form.querySelector('textarea');
    text = textarea.value.trim();
    if(!text) { textarea.focus(); return; }
    form.querySelectorAll('input').forEach(input=>{
      const name=input.name || 'extra';
      const val=input.value.trim();
      if(val) meta[name]=val;
    });
  }

  entries.unshift({ id: uid(), domain, text, meta, date: activeDate, createdAt: new Date().toISOString() });
  persist();
  form.reset();
  document.querySelectorAll('#qualityBtns button').forEach(x=>x.classList.remove('active'));
  document.querySelector('#qualityBtns button:nth-child(3)')?.classList.add('active');
  render();
}
function uid(){ return (crypto && crypto.randomUUID) ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

function calcSleep(bed,wake){
  if(!bed||!wake) return '';
  const [bh,bm]=bed.split(':').map(Number), [wh,wm]=wake.split(':').map(Number);
  let mins=(wh*60+wm)-(bh*60+wm); // fixed below deliberately overwritten
  mins=(wh*60+wm)-(bh*60+bm);
  if(mins<0) mins+=1440;
  const h=Math.floor(mins/60), m=mins%60;
  return `${h}h ${String(m).padStart(2,'0')}m`;
}
function updateSleepTotal(){
  const bed=document.querySelector('input[name="bed"]')?.value;
  const wake=document.querySelector('input[name="wake"]')?.value;
  const total=calcSleep(bed,wake);
  setText('sleepTotal', total||'—');
  setText('sleepBadge', total?'Good':'Not set');
}

function exerciseMinutes(key=activeDate){
  return getEntries('exercise', key).reduce((a,e)=>{
    const explicit = parseInt(e.meta?.minutes || '', 10);
    const fromText = parseInt((e.text.match(/(\d+)\s*min/i)||[])[1] || '', 10);
    return a + (explicit || fromText || 0);
  },0);
}
function latestSleepSummary(key=activeDate){ const e=getEntries('sleep', key)[0]; return e?.meta?.total || (e?'Logged':'Not logged'); }
function getDomainScore(domain, key=activeDate){
  const dayEntries=getEntries(domain, key); const n=dayEntries.length;
  if(domain==='exercise'){ const mins=exerciseMinutes(key); return Math.min(100, mins ? Math.round(mins/45*80) : n*35); }
  if(domain==='sleep'){ const total=dayEntries[0]?.meta?.total; return total ? 85 : Math.min(100, n*75); }
  return Math.min(100, n*75);
}
function foundationScore(key=activeDate){ const vals=Object.keys(domains).map(d=>getDomainScore(d,key)); return Math.round(vals.reduce((a,b)=>a+b,0)/vals.length); }

function render(){ renderDates(); renderDashboard(); renderDomainEntries(); renderMetrics(); updateSleepTotal(); }
function renderDates(){
  setText('todayDate', fullDateLabel(activeDate));
  document.querySelectorAll('.date-pill span').forEach(s=>s.textContent=dateLabel(activeDate));
}
function renderMetrics(){
  const mins=exerciseMinutes(); const exCount=getEntries('exercise').length;
  setText('exerciseMetric', `${mins || 0} min`);
  setText('exerciseSub', exCount?`${exCount} session${exCount===1?'':'s'}`:'No sessions yet');
  setText('exerciseScore', getDomainScore('exercise'));
  const nutCount=getEntries('nutrition').length;
  setText('nutritionMetric', `${nutCount} entr${nutCount===1?'y':'ies'}`);
  setText('nutritionScore', getDomainScore('nutrition'));
  const conCount=getEntries('connection').length;
  setText('connectionSub', conCount?`${conCount} connection entr${conCount===1?'y':'ies'}`:'No connection entries yet');
  setText('connectionScore', getDomainScore('connection'));
}
function renderDashboard(){
  const score=foundationScore();
  setText('todayScore', `${score}%`); setText('ringValue', score);
  const mainRing=document.querySelector('.ring'); if(mainRing) mainRing.style.opacity=.45+(score/100)*.55;
  const icons={sleep:'☾',exercise:'↔',nutrition:'◒',connection:'♡'}; const names={nutrition:'Fuel'}; const cardWrap=document.getElementById('domainCards');
  if(cardWrap) cardWrap.innerHTML=['sleep','exercise','nutrition','connection'].map(key=>{
    const d=domains[key]; const count=getEntries(key).length; const score=getDomainScore(key);
    const meta=key==='sleep'?latestSleepSummary():key==='exercise'?`${exerciseMinutes()} min`:key==='nutrition'?`${count} entries`:count?'Meaningful time':'Not logged';
    const color=key==='sleep'?'#dbeafe':key==='exercise'?'#dcfce7':key==='nutrition'?'#ffedd5':'#fce7f3';
    return `<article class="summary-row" onclick="switchView('${key}')"><div class="summary-icon" style="background:${color}">${icons[key]}</div><div><div class="summary-title">${names[key]||d.label}</div><div class="summary-meta">${meta} ${count?'· '+dateLabel(activeDate):''}</div></div><div class="summary-score">${score}<div class="small muted">/100</div></div><div class="chev">›</div></article>`;
  }).join('');
  const dayEntries=getEntries(); setText('entryCount', `${dayEntries.length} ${dayEntries.length===1?'entry':'entries'}`);
  const list=document.getElementById('todayEntries');
  if(list){ list.classList.toggle('empty', !dayEntries.length); list.innerHTML=dayEntries.length ? dayEntries.map(entryHtml).join('') : 'No entries yet.'; }
  renderWeekBars();
}
function renderWeekBars(){
  const wrap=document.getElementById('weekBars'); if(!wrap) return;
  const now=parseKey(activeDate); const days=[];
  for(let i=6;i>=0;i--){ const d=new Date(now); d.setDate(now.getDate()-i); const key=todayKey(d); const completed=Object.keys(domains).filter(domain=>entries.some(e=>e.date===key && e.domain===domain)).length; days.push({key,completed}); }
  wrap.innerHTML=days.map(day=>`<div class="bar-wrap"><div class="bar" style="height:${Math.max(6, day.completed/4*78)}px"></div><span>${dateLabel(day.key).split(' ')[0]}</span></div>`).join('');
  setText('trendLabel', days.at(-1).completed>=3?'Great momentum':'Building signal');
}
function renderDomainEntries(){
  document.querySelectorAll('.domain-view').forEach(view=>{
    const domain=view.dataset.domain; const target=view.querySelector('.domain-entries'); if(!target) return;
    const items=entries.filter(e=>e.domain===domain && e.date===activeDate).slice(0,50);
    target.innerHTML=items.length ? items.map(entryHtml).join('') : `<div class="empty-card muted">No ${domains[domain].label.toLowerCase()} entries for ${dateLabel(activeDate).toLowerCase()}.</div>`;
  });
}
function entryHtml(e){
  const title=e.domain==='nutrition'?'Fuel':domains[e.domain].label;
  const extra = Object.entries(e.meta||{}).filter(([k,v])=>v && !['bed','wake','total','quality'].includes(k)).map(([k,v])=>`${k}: ${v}`).join(' · ');
  return `<article class="entry"><div class="entry-top"><span>${title}</span><span>${e.date===todayKey()?timeText(e.createdAt):dateLabel(e.date)}</span></div><div class="entry-main">${escapeHtml(e.text)}</div>${extra?`<p class="muted small">${escapeHtml(extra)}</p>`:''}<div class="entry-actions"><button class="delete" type="button" onclick="deleteEntry('${e.id}')">Delete</button></div></article>`;
}
function deleteEntry(id){ entries=entries.filter(e=>e.id!==id); persist(); render(); }

function renderChips(){
  document.querySelectorAll('.chips').forEach(chipWrap=>{
    const domain=chipWrap.dataset.target;
    chipWrap.innerHTML=domains[domain].prompts.map(p=>`<button type="button">${p}</button>`).join('');
    chipWrap.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>fillPrompt(domain,btn.textContent)));
  });
}
function fillPrompt(domain,text){
  const view=document.querySelector(`.domain-view[data-domain="${domain}"]`); const ta=view?.querySelector('textarea'); if(!ta) return;
  ta.value = ta.value ? `${ta.value}\n${text}` : text; ta.focus();
}
function toggleTheme(){ document.documentElement.classList.toggle('dark'); localStorage.setItem(THEME_KEY, document.documentElement.classList.contains('dark')?'dark':'light'); }
function exportData(){ const blob=new Blob([JSON.stringify({app:'Foundation OS',version:2,exportedAt:new Date().toISOString(),entries}, null, 2)], {type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`foundation-os-export-${todayKey()}.json`; a.click(); URL.revokeObjectURL(a.href); }
function importData(ev){ const file=ev.target.files[0]; if(!file) return; const reader=new FileReader(); reader.onload=()=>{ try{ const data=JSON.parse(reader.result); if(Array.isArray(data.entries)){ entries=[...data.entries, ...entries]; persist(); render(); alert('Import complete.'); } else alert('Import file did not contain entries.'); }catch{ alert('Could not import JSON.'); } }; reader.readAsText(file); ev.target.value=''; }
function clearAll(){ if(confirm('Clear all Foundation OS entries on this device?')){ entries=[]; persist(); render(); } }

window.deleteEntry=deleteEntry; window.switchView=switchView; init();
