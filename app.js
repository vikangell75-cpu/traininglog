(() => {
  'use strict';

  const TG = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const KEY_PLANS = 'tl_plans_v1';
  const KEY_SKILLS = 'tl_skills_v1';
  const KEY_SESSION_INDEX = 'tl_session_index_v1';
  const KEY_BODY_INDEX = 'tl_body_index_v1';
  const SESSION_PREFIX = 'tl_s_';
  const BODY_PREFIX = 'tl_b_';

  const DEFAULT_PLANS = {
    A: { name: 'Strength A', day: 'Tue', sections: [
      {name:'PRIMER', exercises:[
        {id:'max-hang-20', name:'Max hang 20 mm', target:'5 × 10 s', note:'+18–20 kg'}
      ]},
      {name:'STRENGTH A', exercises:[
        {id:'double-kb-rdl', name:'Double-KB RDL', target:'3 × 8', note:''},
        {id:'weighted-pull-up', name:'Weighted pull-up', target:'3 × 5', note:''},
        {id:'kb-hip-thrust', name:'KB hip thrust', target:'3 × 12', note:''},
        {id:'half-kneeling-kb-press', name:'Half-kneeling KB press', target:'3 × 8/side', note:''},
        {id:'trx-ham-curl', name:'TRX hamstring curl', target:'2 × 10–12', note:''},
        {id:'db-lateral-raise', name:'DB lateral raise', target:'2 × 15', note:''},
        {id:'db-curl', name:'DB curl', target:'2 × 12', note:''}
      ]},
      {name:'CORE', exercises:[
        {id:'hanging-leg-raise', name:'Hanging leg raise', target:'2 × 10', note:'bent knees'},
        {id:'ring-rollout', name:'Ring rollout', target:'2 × 8', note:'short range'}
      ]}
    ]},
    B: { name: 'Climbing + OFP', day: 'Thu', sections: [
      {name:'CLIMBING', exercises:[
        {id:'climbing-projects', name:'Projects / performance', target:'90–120 min', note:''}
      ]},
      {name:'OFP', exercises:[
        {id:'band-rear-delt', name:'Band rear delt', target:'3 × 15–20', note:''},
        {id:'external-rotation', name:'External rotation', target:'2 × 12–15', note:''},
        {id:'calf-raise', name:'Calf raise', target:'3 × 12–15', note:''},
        {id:'ankle-band', name:'Ankle band 4 ways', target:'2 × 15', note:''}
      ]}
    ]},
    C: { name: 'Power + Strength B', day: 'Sat', sections: [
      {name:'POWER', exercises:[
        {id:'high-pull-up', name:'High pull-up', target:'3 × 3', note:''},
        {id:'power-climbing', name:'Power climbing', target:'90–120 min', note:''}
      ]},
      {name:'STRENGTH B', exercises:[
        {id:'bulgarian-split-squat', name:'Bulgarian split squat', target:'3 × 8–10/side', note:''},
        {id:'rdl', name:'RDL', target:'3 × 8–12', note:''},
        {id:'neutral-db-press', name:'Neutral DB press', target:'3 × 8–12', note:''},
        {id:'db-lateral-raise', name:'DB lateral raise', target:'3 × 12–20', note:''},
        {id:'hammer-curl', name:'Hammer curl', target:'3 × 10–15', note:''},
        {id:'core-choice', name:'Core choice', target:'2–3 sets', note:'L-sit / leg raise / hollow'}
      ]}
    ]},
    OTHER: { name:'Other', day:'', sections:[{name:'SESSION', exercises:[]}] }
  };

  const DEFAULT_SKILLS = [
    {id:'muscle-up', name:'Muscle-up', group:'ACTIVE', note:'High pull / transition progression'},
    {id:'l-sit', name:'L-sit', group:'MAINTAIN', note:'Occasional maintenance'},
    {id:'headstand', name:'Headstand', group:'MAINTAIN', note:'Occasional maintenance'},
    {id:'dragon-squat', name:'Dragon squat', group:'MAINTAIN', note:'Only pain-free'},
    {id:'bridge', name:'Bridge', group:'MAINTAIN', note:'Avoid while wrist is irritated'},
    {id:'wrist', name:'Wrist rehab', group:'REHAB', note:'Pain-guided; diagnosis first'},
    {id:'ankle', name:'Ankle impact prep', group:'REHAB', note:'Calf → pogo → line hops → landings'}
  ];

  const state = {
    plans: structuredClone(DEFAULT_PLANS), skills: structuredClone(DEFAULT_SKILLS),
    sessionIndex: [], bodyIndex: [], selectedSession: 'A', selectedDate: todayISO(),
    currentSession: null, modalContext: null
  };

  const $ = (id) => document.getElementById(id);
  const qsa = (s,root=document) => [...root.querySelectorAll(s)];
  function todayISO(){ const d=new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); }
  function safeJSON(v,fallback){ try{return JSON.parse(v)}catch{return fallback} }
  function uid(prefix='x'){ return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7); }
  function escapeHTML(s=''){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function slug(s=''){ return String(s).toLowerCase().trim().replace(/[^a-z0-9а-яё]+/gi,'-').replace(/(^-|-$)/g,'') || uid('ex'); }

  const Storage = {
    CHUNK: 3400,
    inTelegram(){ return !!(TG && TG.initData && TG.CloudStorage); },
    rawGet(key){ return new Promise(resolve => TG.CloudStorage.getItem(key,(err,val)=>resolve(err?null:(val||null)))); },
    rawSet(key,val){ return new Promise(resolve => TG.CloudStorage.setItem(key,String(val),(err,ok)=>resolve(!err && ok!==false))); },
    rawRemove(key){ return new Promise(resolve => TG.CloudStorage.removeItem(key,(err)=>resolve(!err))); },
    async get(key){
      if(!this.inTelegram()) return localStorage.getItem(key);
      const meta = await this.rawGet(key+'_meta');
      if(meta){
        const m=safeJSON(meta,null);
        if(m?.chunks){
          const parts=[];
          for(let i=0;i<m.chunks;i++) parts.push((await this.rawGet(key+'_'+i))||'');
          return parts.join('');
        }
      }
      return await this.rawGet(key);
    },
    async set(key,val){
      const str=String(val);
      if(!this.inTelegram()){ localStorage.setItem(key,str); return true; }
      const oldMeta=safeJSON(await this.rawGet(key+'_meta'),null);
      if(str.length<=this.CHUNK){
        await this.rawSet(key,str);
        if(oldMeta?.chunks){ for(let i=0;i<oldMeta.chunks;i++) await this.rawRemove(key+'_'+i); }
        await this.rawRemove(key+'_meta');
        return true;
      }
      const chunks=[]; for(let i=0;i<str.length;i+=this.CHUNK) chunks.push(str.slice(i,i+this.CHUNK));
      for(let i=0;i<chunks.length;i++) await this.rawSet(key+'_'+i,chunks[i]);
      if(oldMeta?.chunks && oldMeta.chunks>chunks.length){ for(let i=chunks.length;i<oldMeta.chunks;i++) await this.rawRemove(key+'_'+i); }
      await this.rawSet(key+'_meta',JSON.stringify({chunks:chunks.length}));
      await this.rawRemove(key);
      return true;
    },
    async remove(key){
      if(!this.inTelegram()){ localStorage.removeItem(key); return true; }
      const meta=safeJSON(await this.rawGet(key+'_meta'),null);
      if(meta?.chunks){ for(let i=0;i<meta.chunks;i++) await this.rawRemove(key+'_'+i); }
      await this.rawRemove(key+'_meta'); await this.rawRemove(key); return true;
    }
  };

  async function init(){
    setupTelegram();
    bindUI();
    $('dayInput').value = state.selectedDate;
    $('bodyDate').value = state.selectedDate;
    await loadCore();
    await loadSession();
    renderAll();
  }

  function setupTelegram(){
    if(TG){
      TG.ready(); TG.expand();
      try{ TG.disableVerticalSwipes(); }catch(e){}
      const safe = TG.contentSafeAreaInset || TG.safeAreaInset || {};
      document.documentElement.style.setProperty('--tg-safe-top',(safe.top||0)+'px');
      document.documentElement.style.setProperty('--tg-safe-bottom',(safe.bottom||0)+'px');
      $('tgStatus').textContent = TG.initData ? 'Telegram · cloud sync' : 'Preview mode';
      $('closeApp').textContent = 'Close';
    } else {
      $('tgStatus').textContent = 'Browser preview · local storage';
      $('closeApp').textContent = 'Close';
    }
  }

  async function loadCore(){
    const [plans,skills,sIdx,bIdx] = await Promise.all([
      Storage.get(KEY_PLANS), Storage.get(KEY_SKILLS), Storage.get(KEY_SESSION_INDEX), Storage.get(KEY_BODY_INDEX)
    ]);
    if(plans) state.plans = safeJSON(plans,state.plans);
    if(skills) state.skills = safeJSON(skills,state.skills);
    state.sessionIndex = safeJSON(sIdx,[]) || [];
    state.bodyIndex = safeJSON(bIdx,[]) || [];
  }

  async function saveCore(){
    await Promise.all([
      Storage.set(KEY_PLANS,JSON.stringify(state.plans)),
      Storage.set(KEY_SKILLS,JSON.stringify(state.skills)),
      Storage.set(KEY_SESSION_INDEX,JSON.stringify(state.sessionIndex)),
      Storage.set(KEY_BODY_INDEX,JSON.stringify(state.bodyIndex))
    ]);
  }

  function sessionKey(date,session){ return SESSION_PREFIX + date.replaceAll('-','') + '_' + session; }
  function bodyKey(date){ return BODY_PREFIX + date.replaceAll('-',''); }

  async function loadSession(){
    const raw = await Storage.get(sessionKey(state.selectedDate,state.selectedSession));
    state.currentSession = raw ? safeJSON(raw,null) : null;
    if(!state.currentSession){
      state.currentSession = {date:state.selectedDate, session:state.selectedSession, logs:{}, finished:false, updatedAt:null};
    }
  }

  async function saveSession(){
    state.currentSession.updatedAt = new Date().toISOString();
    const key = sessionKey(state.selectedDate,state.selectedSession);
    await Storage.set(key,JSON.stringify(state.currentSession));
    const descriptor = {key,date:state.selectedDate,session:state.selectedSession,updatedAt:state.currentSession.updatedAt};
    const i = state.sessionIndex.findIndex(x=>x.key===key);
    if(i>=0) state.sessionIndex[i]=descriptor; else state.sessionIndex.push(descriptor);
    state.sessionIndex.sort((a,b)=>b.date.localeCompare(a.date));
    await Storage.set(KEY_SESSION_INDEX,JSON.stringify(state.sessionIndex));
  }

  function bindUI(){
    qsa('.tab').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.tab)));
    $('closeApp').addEventListener('click',()=>{ if(TG && TG.initData) TG.close(); else history.length>1 ? history.back() : showToast('Open inside Telegram to close the Mini App'); });
    $('dayInput').addEventListener('change',async e=>{state.selectedDate=e.target.value; await loadSession(); renderTrain();});
    qsa('#sessionPicker button').forEach(btn=>btn.addEventListener('click',async()=>{
      state.selectedSession=btn.dataset.session;
      qsa('#sessionPicker button').forEach(x=>x.classList.toggle('active',x===btn));
      await loadSession(); renderTrain();
    }));
    $('editPlanBtn').addEventListener('click',openPlanEditor);
    $('finishSessionBtn').addEventListener('click',async()=>{state.currentSession.finished=!state.currentSession.finished; await saveSession(); renderTrain(); haptic('success');});
    $('modalClose').addEventListener('click',closeModal);
    $('modalBackdrop').addEventListener('click',e=>{ if(e.target===$('modalBackdrop')) closeModal(); });
    $('saveBodyBtn').addEventListener('click',saveBody);
    $('addSkillBtn').addEventListener('click',()=>openSkillEditor());
    $('progressExercise').addEventListener('change',renderProgress);
    $('progressMetric').addEventListener('change',renderProgress);
  }

  function switchTab(tab){
    qsa('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));
    qsa('.panel').forEach(x=>x.classList.toggle('active-panel',x.id==='tab-'+tab));
    if(tab==='body') renderBody(); if(tab==='skills') renderSkills(); if(tab==='progress') renderProgress();
  }

  function renderAll(){ renderTrain(); renderBody(); renderSkills(); populateProgressExercises(); renderProgress(); }

  function renderTrain(){
    const plan = state.plans[state.selectedSession] || state.plans.OTHER;
    $('sessionTitle').textContent = plan.name || ('Session '+state.selectedSession);
    const loggedCount = Object.keys(state.currentSession.logs||{}).length;
    $('sessionMeta').textContent = `${state.selectedDate} · ${loggedCount} logged${state.currentSession.finished?' · finished':''}`;
    $('finishSessionBtn').textContent = state.currentSession.finished ? 'Reopen' : 'Finish';

    const host=$('exerciseSections'); host.innerHTML='';
    (plan.sections||[]).forEach(section=>{
      const wrap=document.createElement('div'); wrap.className='exercise-section';
      const h=document.createElement('h3'); h.textContent=section.name||'EXERCISES'; wrap.appendChild(h);
      const grid=document.createElement('div'); grid.className='exercise-grid';
      (section.exercises||[]).forEach(ex=>{
        const log=state.currentSession.logs[ex.id];
        const btn=document.createElement('button'); btn.className='exercise-card'+(log?' done':''); btn.type='button';
        const summary=log?formatSetSummary(log.sets):'';
        btn.innerHTML=`${log?'<span class="status-dot"></span>':''}<div class="name">${escapeHTML(ex.name)}</div><div class="plan">${escapeHTML(ex.target||'')}</div>${ex.note?`<div class="plan">${escapeHTML(ex.note)}</div>`:''}${log?`<div class="actual">${escapeHTML(summary||'logged')}</div>`:''}`;
        btn.addEventListener('click',()=>openExerciseLogger(ex)); grid.appendChild(btn);
      });
      if(!(section.exercises||[]).length){ const p=document.createElement('div'); p.className='muted'; p.textContent='No exercises yet. Tap “Edit plan”.'; grid.appendChild(p); }
      wrap.appendChild(grid); host.appendChild(wrap);
    });
    renderLoggedToday(); populateProgressExercises();
  }

  function formatSetSummary(sets=[]){
    const valid=sets.filter(s=>s.weight!==''||s.reps!=='');
    if(!valid.length) return '';
    const weights=[...new Set(valid.map(s=>s.weight).filter(x=>x!==''))];
    const reps=valid.map(s=>s.reps).filter(x=>x!=='').join('/');
    return `${weights.length===1?weights[0]+' kg · ':''}${reps?reps+' reps':valid.length+' sets'}`;
  }

  function renderLoggedToday(){
    const entries=Object.entries(state.currentSession.logs||{});
    $('loggedSummary').textContent=entries.length?`${entries.length} exercise${entries.length===1?'':'s'} logged.`:'Nothing logged yet. Tap an exercise above.';
    const host=$('loggedToday'); host.innerHTML='';
    entries.forEach(([id,log])=>{
      const row=document.createElement('div'); row.className='logged-row';
      row.innerHTML=`<strong>${escapeHTML(log.name||id)}</strong><span>${escapeHTML(formatSetSummary(log.sets)||log.note||'Logged')}</span><button class="ghost-btn" type="button">Edit</button>`;
      row.querySelector('button').addEventListener('click',()=>openExerciseLogger(findExerciseById(id)||{id,name:log.name,target:''})); host.appendChild(row);
    });
  }

  function findExerciseById(id){
    for(const p of Object.values(state.plans)) for(const s of (p.sections||[])) for(const e of (s.exercises||[])) if(e.id===id) return e;
    return null;
  }

  async function getPreviousExerciseLog(exId){
    const candidates = state.sessionIndex.filter(x=>x.date<state.selectedDate).sort((a,b)=>b.date.localeCompare(a.date));
    for(const item of candidates.slice(0,60)){
      const raw=await Storage.get(item.key); if(!raw) continue;
      const ses=safeJSON(raw,null); if(ses && ses.logs && ses.logs[exId]) return {date:item.date, log:ses.logs[exId]};
    }
    return null;
  }

  async function openExerciseLogger(ex){
    state.modalContext={type:'exercise',ex};
    $('modalKicker').textContent=state.plans[state.selectedSession]?.name||'SESSION'; $('modalTitle').textContent=ex.name;
    const existing=state.currentSession.logs[ex.id] || {name:ex.name, sets:[], rpe:'', pain:'', note:'', skipped:false};
    const sets=existing.sets?.length?structuredClone(existing.sets):defaultSetsFromTarget(ex.target);
    const previous=await getPreviousExerciseLog(ex.id);
    $('modalBody').innerHTML=`
      ${previous?`<div class="previous-box"><strong>Last · ${escapeHTML(previous.date)}</strong>${escapeHTML(formatSetSummary(previous.log.sets)||'Logged')}</div>`:''}
      <table class="set-table"><thead><tr><th>#</th><th>Weight, kg</th><th>Reps / sec</th><th></th></tr></thead><tbody id="setRows"></tbody></table>
      <div class="modal-actions"><button id="addSetBtn" class="secondary-btn" type="button">+ Set</button>${previous?'<button id="usePrevBtn" class="secondary-btn" type="button">Use previous</button>':''}<button id="skipBtn" class="secondary-btn" type="button">Skip</button></div>
      <div class="grid-card" style="margin-top:14px"><div class="field"><label>RPE</label><input id="logRpe" inputmode="decimal" value="${escapeHTML(existing.rpe||'')}"></div><div class="field"><label>Pain 0–10</label><input id="logPain" inputmode="numeric" value="${escapeHTML(existing.pain||'')}"></div><div class="field span-2"><label>Note</label><textarea id="logNote" rows="2">${escapeHTML(existing.note||'')}</textarea></div></div>
      <div class="modal-actions"><button id="saveExerciseBtn" class="primary-btn" type="button">Save exercise</button><button id="deleteExerciseLogBtn" class="secondary-btn" type="button">Clear log</button></div>`;
    renderSetRows(sets);
    $('addSetBtn').onclick=()=>{sets.push({weight:'',reps:''}); renderSetRows(sets)};
    if(previous) $('usePrevBtn').onclick=()=>{sets.splice(0,sets.length,...structuredClone(previous.log.sets||[]));renderSetRows(sets)};
    $('skipBtn').onclick=async()=>{ state.currentSession.logs[ex.id]={name:ex.name,sets:[],rpe:'',pain:'',note:'Skipped',skipped:true}; await saveSession(); closeModal(); renderTrain(); };
    $('saveExerciseBtn').onclick=async()=>{
      const out=readSetRows();
      state.currentSession.logs[ex.id]={name:ex.name,sets:out,rpe:$('logRpe').value.trim(),pain:$('logPain').value.trim(),note:$('logNote').value.trim(),skipped:false};
      await saveSession(); closeModal(); renderTrain(); haptic('success'); showToast('Saved');
    };
    $('deleteExerciseLogBtn').onclick=async()=>{delete state.currentSession.logs[ex.id]; await saveSession(); closeModal(); renderTrain(); showToast('Log cleared');};
    openModal();
  }

  function defaultSetsFromTarget(target=''){
    const m=String(target).match(/(\d+)\s*[×x]/i); const n=m?Math.min(8,Math.max(1,+m[1])):3;
    return Array.from({length:n},()=>({weight:'',reps:''}));
  }
  function renderSetRows(sets){
    const body=$('setRows'); body.innerHTML='';
    sets.forEach((s,i)=>{
      const tr=document.createElement('tr'); tr.innerHTML=`<td class="set-num">${i+1}</td><td><input data-k="weight" data-i="${i}" inputmode="decimal" value="${escapeHTML(s.weight??'')}"></td><td><input data-k="reps" data-i="${i}" inputmode="decimal" value="${escapeHTML(s.reps??'')}"></td><td><button class="remove-set" data-remove="${i}" type="button">×</button></td>`;
      body.appendChild(tr);
    });
    qsa('#setRows input').forEach(inp=>inp.addEventListener('input',()=>{sets[+inp.dataset.i][inp.dataset.k]=inp.value;}));
    qsa('#setRows [data-remove]').forEach(btn=>btn.addEventListener('click',()=>{sets.splice(+btn.dataset.remove,1);renderSetRows(sets)}));
  }
  function readSetRows(){ return qsa('#setRows tr').map(tr=>({weight:tr.querySelector('[data-k="weight"]').value.trim(),reps:tr.querySelector('[data-k="reps"]').value.trim()})).filter(s=>s.weight!==''||s.reps!==''); }

  function openPlanEditor(){
    const plan=state.plans[state.selectedSession]; state.modalContext={type:'plan'};
    $('modalKicker').textContent='EDIT PLAN'; $('modalTitle').textContent=`${state.selectedSession} · ${plan.name}`;
    $('modalBody').innerHTML=`<div class="grid-card"><div class="field span-2"><label>Plan name</label><input id="planName" value="${escapeHTML(plan.name||'')}"></div></div><div id="planSections"></div><div class="modal-actions"><button id="addPlanSection" class="secondary-btn" type="button">+ Section</button><button id="savePlanBtn" class="primary-btn" type="button">Save plan</button></div>`;
    const draft=structuredClone(plan); renderPlanSections(draft);
    $('addPlanSection').onclick=()=>{draft.sections.push({name:'NEW SECTION',exercises:[]});renderPlanSections(draft)};
    $('savePlanBtn').onclick=async()=>{ draft.name=$('planName').value.trim()||('Session '+state.selectedSession); state.plans[state.selectedSession]=draft; await Storage.set(KEY_PLANS,JSON.stringify(state.plans)); closeModal(); renderTrain(); showToast('Plan saved'); haptic('success'); };
    openModal();
  }

  function renderPlanSections(draft){
    const host=$('planSections'); host.innerHTML='';
    draft.sections.forEach((section,si)=>{
      const wrap=document.createElement('div'); wrap.className='card'; wrap.style.margin='14px 0 0';
      wrap.innerHTML=`<div class="section-head compact"><div class="field grow"><label>Section</label><input class="section-name" value="${escapeHTML(section.name||'')}"></div><button class="ghost-btn del-section" type="button">Delete</button></div><div class="plan-list"></div><div class="modal-actions"><button class="secondary-btn add-ex" type="button">+ Exercise</button></div>`;
      wrap.querySelector('.section-name').addEventListener('input',e=>section.name=e.target.value);
      wrap.querySelector('.del-section').onclick=()=>{draft.sections.splice(si,1);renderPlanSections(draft)};
      const list=wrap.querySelector('.plan-list');
      section.exercises.forEach((ex,ei)=>{
        const row=document.createElement('div'); row.className='plan-row';
        row.innerHTML=`<span class="drag">☰</span><input class="wide ex-name" value="${escapeHTML(ex.name)}" placeholder="Exercise"><input class="ex-target" value="${escapeHTML(ex.target||'')}" placeholder="3 × 8"><input class="ex-note" value="${escapeHTML(ex.note||'')}" placeholder="note"><button class="ghost-btn del-ex" type="button">×</button>`;
        row.querySelector('.ex-name').addEventListener('input',e=>ex.name=e.target.value);
        row.querySelector('.ex-target').addEventListener('input',e=>ex.target=e.target.value);
        row.querySelector('.ex-note').addEventListener('input',e=>ex.note=e.target.value);
        row.querySelector('.del-ex').onclick=()=>{section.exercises.splice(ei,1);renderPlanSections(draft)};
        list.appendChild(row);
      });
      wrap.querySelector('.add-ex').onclick=()=>{section.exercises.push({id:uid('ex'),name:'New exercise',target:'3 × 8',note:''});renderPlanSections(draft)};
      host.appendChild(wrap);
    });
  }

  async function saveBody(){
    const date=$('bodyDate').value||todayISO();
    const obj={date,weight:$('bodyWeight').value.trim(),sleep:$('bodySleep').value.trim(),energy:$('bodyEnergy').value.trim(),wrist:$('bodyWrist').value.trim(),ankle:$('bodyAnkle').value.trim(),knee:$('bodyKnee').value.trim(),back:$('bodyBack').value.trim(),note:$('bodyNote').value.trim(),updatedAt:new Date().toISOString()};
    await Storage.set(bodyKey(date),JSON.stringify(obj));
    if(!state.bodyIndex.includes(date)) state.bodyIndex.push(date);
    state.bodyIndex.sort((a,b)=>b.localeCompare(a)); await Storage.set(KEY_BODY_INDEX,JSON.stringify(state.bodyIndex));
    showToast('Body check-in saved'); haptic('success'); renderBody();
  }

  async function renderBody(){
    const date=$('bodyDate').value||state.selectedDate||todayISO();
    const raw=await Storage.get(bodyKey(date)); const obj=raw?safeJSON(raw,{}):{};
    ['Weight','Sleep','Energy','Wrist','Ankle','Knee','Back','Note'].forEach(k=>{ const el=$('body'+k); if(el) el.value=obj[k.toLowerCase()]||''; });
    const host=$('bodyHistory'); host.innerHTML='';
    for(const d of state.bodyIndex.slice(0,14)){
      const r=await Storage.get(bodyKey(d)); const x=safeJSON(r,{});
      const row=document.createElement('div'); row.className='history-row'; row.innerHTML=`<strong>${escapeHTML(d)}</strong><span>${x.weight?escapeHTML(x.weight)+' kg · ':''}${x.sleep?escapeHTML(x.sleep)+' h sleep · ':''}${x.wrist!==''&&x.wrist!=null?'wrist '+escapeHTML(x.wrist)+'/10':''}</span><span>${escapeHTML(x.note||'')}</span>`; host.appendChild(row);
    }
    if(!host.children.length) host.innerHTML='<div class="muted">No check-ins yet.</div>';
  }

  function renderSkills(){
    const host=$('skillsList'); host.innerHTML='';
    state.skills.forEach(skill=>{
      const card=document.createElement('button'); card.type='button'; card.className='library-card'; card.style.textAlign='left';
      card.innerHTML=`<div class="tag">${escapeHTML(skill.group||'LIBRARY')}</div><h3>${escapeHTML(skill.name)}</h3><p>${escapeHTML(skill.note||'')}</p>`;
      card.onclick=()=>openSkillEditor(skill.id); host.appendChild(card);
    });
  }

  function openSkillEditor(id=null){
    const existing=id?state.skills.find(x=>x.id===id):null; const draft=existing?structuredClone(existing):{id:uid('skill'),name:'',group:'ACTIVE',note:''};
    state.modalContext={type:'skill'}; $('modalKicker').textContent='SKILLS & REHAB'; $('modalTitle').textContent=existing?'Edit item':'Add item';
    $('modalBody').innerHTML=`<div class="grid-card"><div class="field span-2"><label>Name</label><input id="skillName" value="${escapeHTML(draft.name)}"></div><div class="field"><label>Group</label><select id="skillGroup"><option>ACTIVE</option><option>MAINTAIN</option><option>REHAB</option><option>PARKING</option></select></div><div class="field span-2"><label>Note</label><textarea id="skillNote" rows="3">${escapeHTML(draft.note||'')}</textarea></div></div><div class="modal-actions"><button id="saveSkillBtn" class="primary-btn" type="button">Save</button>${existing?'<button id="deleteSkillBtn" class="secondary-btn" type="button">Delete</button>':''}</div>`;
    $('skillGroup').value=draft.group||'ACTIVE';
    $('saveSkillBtn').onclick=async()=>{draft.name=$('skillName').value.trim()||'Untitled';draft.group=$('skillGroup').value;draft.note=$('skillNote').value.trim();const i=state.skills.findIndex(x=>x.id===draft.id);if(i>=0)state.skills[i]=draft;else state.skills.push(draft);await Storage.set(KEY_SKILLS,JSON.stringify(state.skills));closeModal();renderSkills();showToast('Saved')};
    if(existing) $('deleteSkillBtn').onclick=async()=>{state.skills=state.skills.filter(x=>x.id!==id);await Storage.set(KEY_SKILLS,JSON.stringify(state.skills));closeModal();renderSkills();};
    openModal();
  }

  function allExercises(){
    const m=new Map(); Object.values(state.plans).forEach(p=>(p.sections||[]).forEach(s=>(s.exercises||[]).forEach(e=>m.set(e.id,e)))); return [...m.values()].sort((a,b)=>a.name.localeCompare(b.name));
  }
  function populateProgressExercises(){
    const sel=$('progressExercise'), current=sel.value; sel.innerHTML='';
    allExercises().forEach(e=>{const o=document.createElement('option');o.value=e.id;o.textContent=e.name;sel.appendChild(o)}); if([...sel.options].some(o=>o.value===current)) sel.value=current;
  }

  async function getExerciseHistory(exId){
    const out=[]; const sorted=[...state.sessionIndex].sort((a,b)=>a.date.localeCompare(b.date));
    for(const item of sorted){ const raw=await Storage.get(item.key); const ses=safeJSON(raw,null); if(ses?.logs?.[exId] && !ses.logs[exId].skipped) out.push({date:item.date,session:item.session,...ses.logs[exId]}); }
    return out;
  }

  function metricValue(entry,metric){
    const sets=(entry.sets||[]).map(s=>({w:parseFloat(String(s.weight).replace(',','.'))||0,r:parseFloat(String(s.reps).replace(',','.'))||0}));
    if(!sets.length) return 0;
    if(metric==='topWeight') return Math.max(...sets.map(s=>s.w));
    if(metric==='bestReps') return Math.max(...sets.map(s=>s.r));
    if(metric==='volume') return sets.reduce((a,s)=>a+s.w*s.r,0);
    if(metric==='e1rm') return Math.max(...sets.map(s=>s.w>0&&s.r>0?s.w*(1+s.r/30):0));
    return 0;
  }

  async function renderProgress(){
    const exId=$('progressExercise').value; if(!exId) return;
    const metric=$('progressMetric').value; const hist=await getExerciseHistory(exId); const pts=hist.map(h=>({date:h.date,value:metricValue(h,metric),raw:h})).filter(x=>Number.isFinite(x.value)&&x.value>0);
    $('progressEmpty').style.display=pts.length?'none':'block'; $('progressChart').style.display=pts.length?'block':'none';
    const svg=$('progressChart'); svg.innerHTML='';
    if(pts.length){
      const W=800,H=280,pad={l:52,r:18,t:20,b:42}; const vals=pts.map(p=>p.value); let min=Math.min(...vals),max=Math.max(...vals); if(min===max){min*=.9;max*=1.1||1} const range=max-min||1;
      const x=i=>pad.l+(pts.length===1?(W-pad.l-pad.r)/2:i*(W-pad.l-pad.r)/(pts.length-1)); const y=v=>pad.t+(max-v)/range*(H-pad.t-pad.b);
      for(let i=0;i<4;i++){const yy=pad.t+i*(H-pad.t-pad.b)/3; const val=max-i*range/3; svg.insertAdjacentHTML('beforeend',`<line class="chart-grid" x1="${pad.l}" y1="${yy}" x2="${W-pad.r}" y2="${yy}"/><text class="chart-label" x="4" y="${yy+4}">${Math.round(val*10)/10}</text>`)}
      const d=pts.map((p,i)=>`${i?'L':'M'} ${x(i)} ${y(p.value)}`).join(' '); svg.insertAdjacentHTML('beforeend',`<path class="chart-line" d="${d}"/>`);
      pts.forEach((p,i)=>svg.insertAdjacentHTML('beforeend',`<circle class="chart-dot" cx="${x(i)}" cy="${y(p.value)}" r="5"/><text class="chart-label" x="${x(i)}" y="${H-12}" text-anchor="middle">${p.date.slice(5)}</text>`));
    }
    const host=$('progressHistory'); host.innerHTML=''; hist.slice().reverse().forEach(h=>{const row=document.createElement('div');row.className='history-row';row.innerHTML=`<strong>${escapeHTML(h.date)} · ${escapeHTML(h.session)}</strong><span>${escapeHTML(formatSetSummary(h.sets)||'Logged')}</span><span>${h.rpe?'RPE '+escapeHTML(h.rpe):''}${h.pain?' · pain '+escapeHTML(h.pain):''}</span>`;host.appendChild(row)}); if(!hist.length) host.innerHTML='<div class="muted">No history yet.</div>';
  }

  function openModal(){
    $('modalBackdrop').classList.remove('hidden'); $('modalBackdrop').setAttribute('aria-hidden','false'); document.body.style.overflow='hidden';
    if(TG?.BackButton){ TG.BackButton.show(); TG.BackButton.onClick(closeModal); }
  }
  function closeModal(){
    $('modalBackdrop').classList.add('hidden'); $('modalBackdrop').setAttribute('aria-hidden','true'); document.body.style.overflow='';
    if(TG?.BackButton){ try{TG.BackButton.offClick(closeModal);TG.BackButton.hide();}catch(e){} }
    state.modalContext=null;
  }
  function haptic(type='light'){ try{ if(!TG?.HapticFeedback)return; if(type==='success')TG.HapticFeedback.notificationOccurred('success'); else TG.HapticFeedback.impactOccurred(type); }catch(e){} }
  let toastTimer=null; function showToast(msg){clearTimeout(toastTimer);$('toast').textContent=msg;$('toast').classList.remove('hidden');toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),1700)}

  init();
})();
