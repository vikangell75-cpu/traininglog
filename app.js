(() => {
  'use strict';

  const TG = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

  const KEY_WORKOUTS = 'tl_workouts_v2';
  const KEY_EXERCISES = 'tl_exercises_v2';
  const KEY_SKILLS = 'tl_skills_v1';
  const KEY_DAY_INDEX = 'tl_day_index_v2';
  const KEY_BODY_INDEX = 'tl_body_index_v1';
  const DAY_PREFIX = 'tl_d2_';
  const BODY_PREFIX = 'tl_b_';

  // v1 keys are read only for one-time migration / history compatibility.
  const OLD_KEY_PLANS = 'tl_plans_v1';
  const OLD_KEY_SESSION_INDEX = 'tl_session_index_v1';

  const DEFAULT_SKILLS = [
    {id:'muscle-up', name:'Muscle-up', group:'ACTIVE', note:'High pull / transition progression'},
    {id:'l-sit', name:'L-sit', group:'MAINTAIN', note:'Occasional maintenance'},
    {id:'headstand', name:'Headstand', group:'MAINTAIN', note:'Occasional maintenance'},
    {id:'dragon-squat', name:'Dragon squat', group:'MAINTAIN', note:'Only pain-free'},
    {id:'bridge', name:'Bridge', group:'MAINTAIN', note:'Avoid while wrist is irritated'},
    {id:'wrist', name:'Wrist rehab', group:'REHAB', note:'Pain-guided; diagnosis first'},
    {id:'ankle', name:'Ankle impact prep', group:'REHAB', note:'Calf → pogo → line hops → landings'}
  ];

  const FALLBACK_EXERCISES = [
    {id:'weighted-pull-up',name:'Weighted pull-up',category:'PULL',note:''},
    {id:'high-pull-up',name:'High pull-up',category:'SKILL',note:'Muscle-up prep'},
    {id:'bulgarian-split-squat',name:'Bulgarian split squat',category:'LEGS',note:''},
    {id:'rdl',name:'RDL',category:'LEGS',note:''},
    {id:'kb-hip-thrust',name:'KB hip thrust',category:'LEGS',note:''},
    {id:'db-lateral-raise',name:'DB lateral raise',category:'SHOULDERS',note:''},
    {id:'hammer-curl',name:'Hammer curl',category:'BICEPS',note:''},
    {id:'hanging-leg-raise',name:'Hanging leg raise',category:'CORE',note:''},
    {id:'calf-raise',name:'Calf raise',category:'ANKLE',note:''},
    {id:'ankle-band',name:'Ankle band 4 ways',category:'ANKLE',note:''},
    {id:'climbing-projects',name:'Projects / performance',category:'CLIMBING',note:''},
    {id:'power-climbing',name:'Power climbing',category:'CLIMBING',note:''}
  ];

  const FALLBACK_WORKOUTS = [
    {id:'workout-strength-a',name:'Strength A',note:'',items:[
      {exerciseId:'weighted-pull-up',target:'3 × 5',note:'',section:'STRENGTH'},
      {exerciseId:'kb-hip-thrust',target:'3 × 12',note:'',section:'STRENGTH'},
      {exerciseId:'db-lateral-raise',target:'3 × 12–20',note:'',section:'SHOULDERS'},
      {exerciseId:'hanging-leg-raise',target:'2 × 10',note:'',section:'CORE'}
    ]},
    {id:'workout-climbing',name:'Climbing + OFP',note:'',items:[
      {exerciseId:'climbing-projects',target:'90–120 min',note:'',section:'CLIMBING'},
      {exerciseId:'calf-raise',target:'3 × 12–15',note:'',section:'ANKLE'},
      {exerciseId:'ankle-band',target:'2 × 15',note:'',section:'ANKLE'}
    ]},
    {id:'workout-power-b',name:'Power + Strength B',note:'',items:[
      {exerciseId:'high-pull-up',target:'3 × 3',note:'',section:'POWER'},
      {exerciseId:'power-climbing',target:'90–120 min',note:'',section:'CLIMBING'},
      {exerciseId:'bulgarian-split-squat',target:'3 × 8–10/side',note:'',section:'LEGS'},
      {exerciseId:'rdl',target:'3 × 8–12',note:'',section:'LEGS'},
      {exerciseId:'db-lateral-raise',target:'3 × 12–20',note:'',section:'SHOULDERS'},
      {exerciseId:'hammer-curl',target:'3 × 10–15',note:'',section:'BICEPS'}
    ]}
  ];

  const state = {
    workouts: [], exercises: [], skills: structuredClone(DEFAULT_SKILLS),
    dayIndex: [], bodyIndex: [], oldSessionIndex: [], selectedDate: todayISO(),
    currentDay: null, modalContext: null, exerciseSearch: '', exerciseCategory: 'ALL', photoCache: {},
    calendarMonth: todayISO().slice(0,7), restTimerEnd: 0, restTimerInterval: null
  };

  const $ = (id) => document.getElementById(id);
  const qsa = (s,root=document) => [...root.querySelectorAll(s)];
  function todayISO(){ const d=new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); }
  function safeJSON(v,fallback){ try{return JSON.parse(v)}catch{return fallback} }
  function uid(prefix='x'){ return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8); }
  function escapeHTML(s=''){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function norm(s=''){ return String(s).trim().toLowerCase(); }

  const EXERCISE_CATEGORY_GROUPS = {
    LEGS:['LEGS','LEG','QUADS','QUAD','HAMSTRINGS','HAMSTRING','GLUTES','GLUTE','LOWER BODY'],
    ARMS:['ARMS','ARM','BICEPS','BICEP','TRICEPS','TRICEP','FOREARMS','FOREARM','SHOULDERS','SHOULDER','DELTS','DELT'],
    CORE:['CORE','ABS','ABDOMINALS'],
    BACK:['BACK','PULL','LATS','LAT'],
    CHEST:['CHEST','PUSH','PECS','PEC'],
    CLIMBING:['CLIMBING','FINGERS','FINGERBOARD','HANGBOARD','CAMPUS'],
    SKILLS:['SKILLS','SKILL','MUSCLE UP','MUSCLE-UP','HANDSTAND','PLANCHE'],
    REHAB:['REHAB','PREHAB','ANKLE','CALF','CALVES','FOOT','WRIST','WRISTS','HAND','HANDS','PHYSIO','LФК','ЛФК']
  };
  function exerciseMatchesCategory(ex, selected){
    if(!selected || selected==='ALL') return true;
    const raw=String(ex.category||'GENERAL').trim().toUpperCase();
    const aliases=EXERCISE_CATEGORY_GROUPS[selected]||[];
    if(selected==='OTHER'){
      return !Object.values(EXERCISE_CATEGORY_GROUPS).flat().includes(raw);
    }
    return raw===selected || aliases.includes(raw);
  }
  function displayCategory(raw){
    const c=String(raw||'GENERAL').trim().toUpperCase();
    if(EXERCISE_CATEGORY_GROUPS.REHAB.includes(c)) return 'REHAB';
    if(['SHOULDERS','SHOULDER','DELTS','DELT'].includes(c)) return 'ARMS';
    return c==='GENERAL'?'OTHER':c;
  }

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
        if(m?.chunks){ const parts=[]; for(let i=0;i<m.chunks;i++) parts.push((await this.rawGet(key+'_'+i))||''); return parts.join(''); }
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
      await this.rawRemove(key); return true;
    },
    async remove(key){
      if(!this.inTelegram()){ localStorage.removeItem(key); return true; }
      const meta=safeJSON(await this.rawGet(key+'_meta'),null);
      if(meta?.chunks){ for(let i=0;i<meta.chunks;i++) await this.rawRemove(key+'_'+i); }
      await this.rawRemove(key+'_meta'); await this.rawRemove(key); return true;
    }
  };

  const MediaStorage = {
    inTelegram(){ return !!(TG && TG.DeviceStorage && (!TG.isVersionAtLeast || TG.isVersionAtLeast('9.0'))); },
    get(key){
      if(!key) return Promise.resolve(null);
      if(!this.inTelegram()) return Promise.resolve(localStorage.getItem('media_'+key));
      return new Promise(resolve=>TG.DeviceStorage.getItem(key,(err,val)=>resolve(err?null:(val||null))));
    },
    set(key,val){
      if(!key) return Promise.resolve(false);
      if(!this.inTelegram()){ try{localStorage.setItem('media_'+key,String(val));return Promise.resolve(true);}catch(e){return Promise.resolve(false);} }
      return new Promise(resolve=>TG.DeviceStorage.setItem(key,String(val),(err,ok)=>resolve(!err&&ok!==false)));
    },
    remove(key){
      if(!key) return Promise.resolve(true);
      if(!this.inTelegram()){ localStorage.removeItem('media_'+key); return Promise.resolve(true); }
      return new Promise(resolve=>TG.DeviceStorage.removeItem(key,(err,ok)=>resolve(!err&&ok!==false)));
    }
  };

  function photoKeyForExercise(exId){ return 'tl_img_'+String(exId).replace(/[^A-Za-z0-9_-]/g,'_'); }
  async function getExercisePhoto(ex){
    if(!ex?.photoKey) return null;
    if(Object.prototype.hasOwnProperty.call(state.photoCache,ex.photoKey)) return state.photoCache[ex.photoKey]||null;
    const data=await MediaStorage.get(ex.photoKey); state.photoCache[ex.photoKey]=data||''; return data||null;
  }
  async function removeExercisePhoto(ex){
    if(!ex?.photoKey) return;
    await MediaStorage.remove(ex.photoKey); delete state.photoCache[ex.photoKey];
  }
  function compressImage(file,maxEdge=760,quality=.76){
    return new Promise((resolve,reject)=>{
      if(!file||!file.type?.startsWith('image/')){ reject(new Error('Choose an image file')); return; }
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error('Could not read image'));
      reader.onload=()=>{
        const img=new Image();
        img.onerror=()=>reject(new Error('Could not open image'));
        img.onload=()=>{
          let w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
          const scale=Math.min(1,maxEdge/Math.max(w,h)); w=Math.max(1,Math.round(w*scale)); h=Math.max(1,Math.round(h*scale));
          const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
          const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#f7f7f3';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
          let q=quality,data=canvas.toDataURL('image/jpeg',q);
          while(data.length>420000&&q>.45){ q-=.08; data=canvas.toDataURL('image/jpeg',q); }
          resolve(data);
        };
        img.src=reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  async function hydratePhoto(img,ex,missingEl=null){
    if(!img||!ex?.photoKey) return;
    const data=await getExercisePhoto(ex);
    if(data&&img.isConnected){ img.src=data; img.classList.remove('hidden'); if(missingEl)missingEl.classList.add('hidden'); }
    else if(!data&&missingEl?.isConnected){ missingEl.classList.remove('hidden'); }
  }

  function dayKey(date){ return DAY_PREFIX + date.replaceAll('-',''); }
  function bodyKey(date){ return BODY_PREFIX + date.replaceAll('-',''); }
  function exerciseById(id){ return state.exercises.find(x=>x.id===id) || null; }
  function workoutById(id){ return state.workouts.find(x=>x.id===id) || null; }
  function itemName(item){ return item.name || exerciseById(item.exerciseId)?.name || 'Exercise'; }

  async function init(){
    setupTelegram(); bindUI();
    $('dayInput').value=state.selectedDate; $('bodyDate').value=state.selectedDate;
    await loadCore(); await loadDay(); renderAll();
  }

  function setupTelegram(){
    if(TG){
      TG.ready(); TG.expand(); try{TG.disableVerticalSwipes();}catch(e){}
      const safe=TG.contentSafeAreaInset||TG.safeAreaInset||{};
      document.documentElement.style.setProperty('--tg-safe-top',(safe.top||0)+'px');
      document.documentElement.style.setProperty('--tg-safe-bottom',(safe.bottom||0)+'px');
      $('tgStatus').textContent=TG.initData?'Telegram · cloud sync':'Preview mode';
    } else $('tgStatus').textContent='Browser preview · local storage';
  }

  async function loadCore(){
    const [workoutsRaw, exercisesRaw, skillsRaw, dayIdxRaw, bodyIdxRaw, oldIdxRaw] = await Promise.all([
      Storage.get(KEY_WORKOUTS),Storage.get(KEY_EXERCISES),Storage.get(KEY_SKILLS),Storage.get(KEY_DAY_INDEX),Storage.get(KEY_BODY_INDEX),Storage.get(OLD_KEY_SESSION_INDEX)
    ]);
    state.skills=safeJSON(skillsRaw,structuredClone(DEFAULT_SKILLS))||structuredClone(DEFAULT_SKILLS);
    state.dayIndex=safeJSON(dayIdxRaw,[])||[]; state.bodyIndex=safeJSON(bodyIdxRaw,[])||[]; state.oldSessionIndex=safeJSON(oldIdxRaw,[])||[];

    if(workoutsRaw && exercisesRaw){
      state.workouts=safeJSON(workoutsRaw,[])||[]; state.exercises=safeJSON(exercisesRaw,[])||[];
    } else {
      await migrateFromV1();
    }
    if(!state.exercises.length) state.exercises=structuredClone(FALLBACK_EXERCISES);
    if(!state.workouts.length) state.workouts=structuredClone(FALLBACK_WORKOUTS);
    await saveLibraries();
  }

  async function migrateFromV1(){
    const oldPlansRaw=await Storage.get(OLD_KEY_PLANS);
    const oldPlans=safeJSON(oldPlansRaw,null);
    if(!oldPlans){
      state.exercises=structuredClone(FALLBACK_EXERCISES); state.workouts=structuredClone(FALLBACK_WORKOUTS); return;
    }
    const exMap=new Map(); const workouts=[];
    Object.entries(oldPlans).forEach(([key,p])=>{
      if(key==='OTHER') return;
      const items=[];
      (p.sections||[]).forEach(section=>{
        (section.exercises||[]).forEach(ex=>{
          if(!exMap.has(ex.id)) exMap.set(ex.id,{id:ex.id,name:ex.name,category:section.name||'GENERAL',note:ex.note||''});
          items.push({exerciseId:ex.id,target:ex.target||'',note:ex.note||'',section:section.name||''});
        });
      });
      workouts.push({id:'migrated-'+key.toLowerCase(),name:p.name||('Workout '+key),note:'Migrated from v1',items});
    });
    state.exercises=[...exMap.values()]; state.workouts=workouts;
  }

  async function saveLibraries(){
    await Promise.all([
      Storage.set(KEY_WORKOUTS,JSON.stringify(state.workouts)),
      Storage.set(KEY_EXERCISES,JSON.stringify(state.exercises)),
      Storage.set(KEY_SKILLS,JSON.stringify(state.skills)),
      Storage.set(KEY_DAY_INDEX,JSON.stringify(state.dayIndex)),
      Storage.set(KEY_BODY_INDEX,JSON.stringify(state.bodyIndex))
    ]);
  }

  async function loadDay(){
    const raw=await Storage.get(dayKey(state.selectedDate));
    state.currentDay=raw?safeJSON(raw,null):null;
    if(!state.currentDay){
      state.currentDay={date:state.selectedDate,title:'',templateId:null,items:[],logs:{},finished:false,updatedAt:null};
    }
  }

  async function saveDay(){
    state.currentDay.date=state.selectedDate; state.currentDay.updatedAt=new Date().toISOString();
    const key=dayKey(state.selectedDate); await Storage.set(key,JSON.stringify(state.currentDay));
    const d={key,date:state.selectedDate,title:state.currentDay.title||'Untitled workout',finished:!!state.currentDay.finished,updatedAt:state.currentDay.updatedAt};
    const i=state.dayIndex.findIndex(x=>x.key===key); if(i>=0) state.dayIndex[i]=d; else state.dayIndex.push(d);
    state.dayIndex.sort((a,b)=>b.date.localeCompare(a.date)); await Storage.set(KEY_DAY_INDEX,JSON.stringify(state.dayIndex));
  }

  function bindUI(){
    qsa('.tab').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.tab)));
    $('closeApp').onclick=()=>{ if(TG&&TG.initData) TG.close(); else history.length>1?history.back():showToast('Open inside Telegram to close the Mini App'); };
    $('dayInput').onchange=async e=>{state.selectedDate=e.target.value;state.calendarMonth=state.selectedDate.slice(0,7); await loadDay(); renderTrain();};
    $('chooseWorkoutBtn').onclick=openWorkoutPicker; $('emptyChooseBtn').onclick=openWorkoutPicker;
    $('addTodayExerciseBtn').onclick=()=>openExercisePicker('today'); $('emptyAddBtn').onclick=()=>openExercisePicker('today');
    $('editCurrentBtn').onclick=openCurrentEditor;
    $('saveTodayAsWorkoutBtn').onclick=saveCurrentAsWorkout;
    $('finishDayBtn').onclick=async()=>{state.currentDay.finished=!state.currentDay.finished; await saveDay(); renderTrain(); haptic('success');};
    $('newWorkoutBtn').onclick=()=>openWorkoutEditor(); $('newExerciseBtn').onclick=()=>openExerciseEditor();
    $('exerciseSearch').oninput=e=>{state.exerciseSearch=e.target.value;renderExerciseLibrary();};
    qsa('.exercise-filter').forEach(btn=>btn.onclick=()=>{
      state.exerciseCategory=btn.dataset.exCategory||'ALL';
      qsa('.exercise-filter').forEach(x=>x.classList.toggle('active',x===btn));
      btn.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
      renderExerciseLibrary();
      haptic('selection');
    });
    $('modalClose').onclick=closeModal; $('modalBackdrop').onclick=e=>{if(e.target===$('modalBackdrop'))closeModal();};
    $('saveBodyBtn').onclick=saveBody; $('addSkillBtn').onclick=()=>openSkillEditor();
    $('progressExercise').onchange=renderProgress; $('progressMetric').onchange=renderProgress;
    $('calendarPrev').onclick=()=>shiftCalendarMonth(-1);$('calendarNext').onclick=()=>shiftCalendarMonth(1);
    $('exportBackupBtn').onclick=exportBackup;$('importBackupInput').onchange=importBackupFile;
    $('restTimerPlus').onclick=()=>addRestTime(30);$('restTimerStop').onclick=stopRestTimer;
  }

  function switchTab(tab){
    qsa('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));
    qsa('.panel').forEach(x=>x.classList.toggle('active-panel',x.id==='tab-'+tab));
    if(tab==='train')renderTrain(); if(tab==='library')renderLibrary(); if(tab==='body')renderBody(); if(tab==='skills')renderSkills(); if(tab==='progress')renderProgress();
  }
  function renderAll(){renderTrain();renderLibrary();renderBody();renderSkills();populateProgressExercises();renderProgress();}

  function groupedDayItems(){
    const groups=[]; const map=new Map();
    (state.currentDay.items||[]).forEach(item=>{
      const label=(item.section||'').trim()||'EXERCISES';
      if(!map.has(label)){ const arr=[]; map.set(label,arr); groups.push([label,arr]); }
      map.get(label).push(item);
    });
    return groups;
  }

  function renderTrain(){
    const d=state.currentDay; const count=(d.items||[]).length; const logged=Object.keys(d.logs||{}).length;
    $('dayWorkoutTitle').textContent=d.title||'TODAY';
    $('dayWorkoutMeta').textContent=`${state.selectedDate} · ${count} planned · ${logged} logged${d.finished?' · finished':''}`;
    $('finishDayBtn').textContent=d.finished?'Reopen workout':'Finish workout';
    $('editCurrentBtn').disabled=!count && !d.title; $('saveTodayAsWorkoutBtn').disabled=!count;
    $('dayEmpty').classList.toggle('hidden',count>0);
    $('addTodayExerciseBtn').style.display=count?'':'none'; $('saveTodayAsWorkoutBtn').style.display=count?'':'none'; $('finishDayBtn').style.display=count?'':'none';

    const host=$('dayExerciseSections'); host.innerHTML='';
    groupedDayItems().forEach(([section,items])=>{
      const wrap=document.createElement('div'); wrap.className='exercise-section';
      const h=document.createElement('h3');h.textContent=section;wrap.appendChild(h);
      const grid=document.createElement('div'); grid.className='day-exercise-grid';
      items.forEach(item=>grid.appendChild(renderDayExercise(item)));
      wrap.appendChild(grid); host.appendChild(wrap);
    });
    renderLoggedToday(); renderRecentTrainingDays(); renderMiniCalendar(); enableDayReorder(); populateProgressExercises();
  }

  function renderDayExercise(item){
    const log=state.currentDay.logs[item.instanceId]; const row=document.createElement('div'); row.className='exercise-row-card'+(log?' done':'');
    row.dataset.instanceId=item.instanceId; row.dataset.section=(item.section||'EXERCISES'); row.draggable=true;
    const summary=log?formatSetSummary(log.sets):''; const ex=exerciseById(item.exerciseId); const photo=!!ex?.photoKey; const ss=(item.superset||'').trim().toUpperCase();
    if(photo)row.classList.add('with-photo'); if(ss){row.classList.add('in-superset','superset-'+ss.toLowerCase());}
    row.innerHTML=`<button class="drag-handle" type="button" aria-label="Drag to reorder" title="Drag to reorder">⋮⋮</button>${photo?'<button class="exercise-row-photo-btn" type="button" aria-label="Exercise photo"><img class="exercise-row-photo hidden" alt=""><span class="exercise-photo-missing hidden">PHOTO</span></button>':''}<div class="exercise-main">${ss?`<div class="superset-badge">SUPERSET ${escapeHTML(ss)}</div>`:''}<div class="name">${escapeHTML(itemName(item))}</div>${item.target?`<div class="sub target-line">${escapeHTML(item.target)}</div>`:''}${item.note?`<div class="sub">${escapeHTML(item.note)}</div>`:''}${log?`<div class="actual">${escapeHTML(summary||log.note||'logged')}</div>`:''}</div><div class="row-actions"><button class="mini-btn log-btn" type="button">${log?'Edit':'Log'}</button><button class="icon-mini history-btn" type="button" aria-label="History" title="Exercise history">↗</button><button class="icon-mini danger remove-today-btn" type="button" aria-label="Remove from today" title="Remove from today">×</button></div>`;
    if(photo){ const img=row.querySelector('.exercise-row-photo'),missing=row.querySelector('.exercise-photo-missing');hydratePhoto(img,ex,missing);row.querySelector('.exercise-row-photo-btn').onclick=()=>openExerciseLogger(item); }
    row.querySelector('.log-btn').onclick=()=>openExerciseLogger(item);
    row.querySelector('.history-btn').onclick=e=>{e.stopPropagation();openExerciseHistory(ex?.id||item.exerciseId);};
    row.querySelector('.remove-today-btn').onclick=e=>{e.stopPropagation();confirmRemoveTodayExercise(item);};
    return row;
  }

  function confirmRemoveTodayExercise(item){
    $('modalKicker').textContent='TODAY';
    $('modalTitle').textContent='Remove exercise?';
    $('modalBody').innerHTML=`<div class="confirm-copy"><strong>${escapeHTML(itemName(item))}</strong><p>This removes it only from ${escapeHTML(state.selectedDate)}. The exercise stays in your library and saved workouts.</p></div><div class="modal-actions"><button id="confirmRemoveToday" class="danger-btn" type="button">Remove from today</button><button id="cancelRemoveToday" class="secondary-btn" type="button">Cancel</button></div>`;
    $('confirmRemoveToday').onclick=async()=>{
      state.currentDay.items=(state.currentDay.items||[]).filter(x=>x.instanceId!==item.instanceId);
      if(state.currentDay.logs) delete state.currentDay.logs[item.instanceId];
      await saveDay(); closeModal(); renderTrain(); showToast('Removed from today'); haptic('light');
    };
    $('cancelRemoveToday').onclick=closeModal;
    openModal();
  }

  function renderLoggedToday(){
    const entries=Object.entries(state.currentDay.logs||{}); $('loggedSummary').textContent=entries.length?`${entries.length} exercise${entries.length===1?'':'s'} logged.`:'Nothing logged yet.';
    const host=$('loggedToday'); host.innerHTML='';
    entries.forEach(([instanceId,log])=>{
      const item=(state.currentDay.items||[]).find(x=>x.instanceId===instanceId) || {instanceId,exerciseId:log.exerciseId,name:log.name};
      const row=document.createElement('div');row.className='logged-row';row.innerHTML=`<strong>${escapeHTML(log.name||itemName(item))}</strong><span>${escapeHTML(formatSetSummary(log.sets)||log.note||'Logged')}</span><button class="ghost-btn" type="button">Edit</button>`;
      row.querySelector('button').onclick=()=>openExerciseLogger(item);host.appendChild(row);
    });
  }

  async function renderRecentTrainingDays(){
    const host=$('recentTrainingDays');host.innerHTML='';
    for(const entry of state.dayIndex.slice(0,8)){
      const row=document.createElement('div');row.className='history-row';
      row.innerHTML=`<strong>${escapeHTML(entry.date)}</strong><span>${escapeHTML(entry.title||'Workout')}</span><span>${entry.finished?'Finished':'In progress'}</span>`;host.appendChild(row);
    }
    if(!host.children.length)host.innerHTML='<div class="muted">No training days saved yet.</div>';
  }

  function formatSetSummary(sets=[]){
    const valid=sets.filter(s=>s.weight!==''||s.reps!==''); if(!valid.length)return'';
    const weights=[...new Set(valid.map(s=>s.weight).filter(x=>x!==''))]; const reps=valid.map(s=>s.reps).filter(x=>x!=='').join('/');
    return `${weights.length===1?weights[0]+' kg · ':''}${reps?reps+' reps':valid.length+' sets'}`;
  }

  async function openWorkoutPicker(){
    $('modalKicker').textContent='WORKOUT LIBRARY'; $('modalTitle').textContent='Choose for '+state.selectedDate;
    $('modalBody').innerHTML=`<div class="picker-list" id="workoutPickerList"></div><div class="modal-actions"><button id="pickerEmptyBtn" class="secondary-btn" type="button">Start empty</button></div>`;
    const host=$('workoutPickerList');
    state.workouts.forEach(w=>{
      const b=document.createElement('button');b.className='picker-item';b.type='button';b.innerHTML=`<strong>${escapeHTML(w.name)}</strong><span>${w.items.length} exercises${w.note?' · '+escapeHTML(w.note):''}</span>`;
      b.onclick=()=>chooseWorkoutMode(w);host.appendChild(b);
    });
    if(!state.workouts.length)host.innerHTML='<div class="muted">No saved workouts yet.</div>';
    $('pickerEmptyBtn').onclick=async()=>{state.currentDay={date:state.selectedDate,title:'',templateId:null,items:[],logs:{},finished:false,updatedAt:null};await saveDay();closeModal();renderTrain();};
    openModal();
  }

  function chooseWorkoutMode(workout){
    const hasAnything=(state.currentDay.items||[]).length || Object.keys(state.currentDay.logs||{}).length;
    if(!hasAnything){applyWorkout(workout,'replace');return;}
    $('modalKicker').textContent='LOAD WORKOUT';$('modalTitle').textContent=workout.name;
    $('modalBody').innerHTML=`<p class="muted">Today already has exercises. Replace the current plan, or append this workout to it?</p><div class="two-buttons"><button id="replaceWorkoutBtn" class="primary-btn" type="button">Replace current</button><button id="appendWorkoutBtn" class="secondary-btn" type="button">Append</button></div>`;
    $('replaceWorkoutBtn').onclick=()=>applyWorkout(workout,'replace'); $('appendWorkoutBtn').onclick=()=>applyWorkout(workout,'append');
  }

  async function applyWorkout(workout,mode='replace'){
    const items=(workout.items||[]).map(x=>({instanceId:uid('item'),exerciseId:x.exerciseId,name:exerciseById(x.exerciseId)?.name||x.name||'Exercise',target:x.target||'',note:x.note||'',section:x.section||'',superset:x.superset||''}));
    if(mode==='replace') state.currentDay={date:state.selectedDate,title:workout.name,templateId:workout.id,items,logs:{},finished:false,updatedAt:null};
    else {state.currentDay.title=state.currentDay.title||workout.name;state.currentDay.items.push(...items);}
    await saveDay();closeModal();renderTrain();showToast(mode==='replace'?'Workout loaded':'Workout appended');haptic('success');
  }

  function openCurrentEditor(){
    const draft=structuredClone(state.currentDay); $('modalKicker').textContent='TODAY';$('modalTitle').textContent='Edit current workout';
    $('modalBody').innerHTML=`<div class="grid-card"><div class="field span-2"><label>Workout title</label><input id="currentTitle" value="${escapeHTML(draft.title||'')}"></div></div><div class="editor-list" id="currentItems"></div><div class="modal-actions"><button id="currentAddBtn" class="secondary-btn" type="button">+ Exercise</button><button id="saveCurrentBtn" class="primary-btn" type="button">Save changes</button></div>`;
    renderCurrentEditorRows(draft);
    $('currentAddBtn').onclick=()=>openExercisePicker('editor',draft);
    $('saveCurrentBtn').onclick=async()=>{draft.title=$('currentTitle').value.trim();state.currentDay=draft;await saveDay();closeModal();renderTrain();showToast('Today updated');};
    state.modalContext={type:'current-editor',draft};openModal();
  }

  function renderCurrentEditorRows(draft){
    const host=$('currentItems'); if(!host)return; host.innerHTML='';
    (draft.items||[]).forEach((item,i)=>{
      const row=document.createElement('div');row.className='editor-row editor-row-superset';
      row.innerHTML=`<div class="name-static">${escapeHTML(itemName(item))}</div><input class="target" value="${escapeHTML(item.target||'')}" placeholder="3 × 8"><input class="section" value="${escapeHTML(item.section||'')}" placeholder="section"><select class="superset"><option value="">No superset</option><option value="A">Superset A</option><option value="B">Superset B</option><option value="C">Superset C</option><option value="D">Superset D</option></select><button class="ghost-btn remove-editor" type="button">×</button>`;
      row.querySelector('.target').oninput=e=>item.target=e.target.value;row.querySelector('.section').oninput=e=>item.section=e.target.value;row.querySelector('.superset').value=item.superset||'';row.querySelector('.superset').onchange=e=>item.superset=e.target.value;
      row.querySelector('.remove-editor').onclick=()=>{draft.items.splice(i,1);delete draft.logs[item.instanceId];renderCurrentEditorRows(draft);};host.appendChild(row);
    });
    if(!draft.items.length)host.innerHTML='<div class="muted">No exercises yet.</div>';
  }

  async function saveCurrentAsWorkout(){
    if(!(state.currentDay.items||[]).length)return;
    const base=state.currentDay.title||'Saved workout';
    $('modalKicker').textContent='WORKOUT LIBRARY';$('modalTitle').textContent='Save current workout';
    $('modalBody').innerHTML=`<div class="grid-card"><div class="field span-2"><label>Name</label><input id="saveWorkoutName" value="${escapeHTML(base)}"></div><div class="field span-2"><label>Note</label><textarea id="saveWorkoutNote" rows="2"></textarea></div></div><div class="modal-actions"><button id="confirmSaveWorkout" class="primary-btn" type="button">Save to library</button></div>`;
    $('confirmSaveWorkout').onclick=async()=>{
      const w={id:uid('workout'),name:$('saveWorkoutName').value.trim()||base,note:$('saveWorkoutNote').value.trim(),items:state.currentDay.items.map(x=>({exerciseId:x.exerciseId,target:x.target||'',note:x.note||'',section:x.section||'',superset:x.superset||''}))};
      state.workouts.push(w);await saveLibraries();closeModal();renderLibrary();showToast('Workout saved');haptic('success');
    };openModal();
  }

  function openExercisePicker(mode='today',draft=null){
    $('modalKicker').textContent='EXERCISE LIBRARY';$('modalTitle').textContent='Add exercise';
    $('modalBody').innerHTML=`<div class="field"><label>Search</label><input id="pickerSearch" placeholder="Search exercise"></div><div class="picker-list" id="exercisePickerList"></div><div class="modal-actions"><button id="pickerNewExercise" class="secondary-btn" type="button">+ New exercise</button></div>`;
    const renderPicker=()=>{
      const term=norm($('pickerSearch').value);const host=$('exercisePickerList');host.innerHTML='';
      state.exercises.filter(e=>!term||norm(e.name+' '+e.category+' '+e.note).includes(term)).slice(0,80).forEach(ex=>{
        const b=document.createElement('button');b.type='button';b.className='picker-item';b.innerHTML=`<strong>${escapeHTML(ex.name)}</strong><span>${escapeHTML(displayCategory(ex.category||'GENERAL'))}${ex.note?' · '+escapeHTML(ex.note):''}</span>`;
        b.onclick=()=>addExerciseToTarget(ex,mode,draft);host.appendChild(b);
      });
      if(!host.children.length)host.innerHTML='<div class="muted">Nothing found.</div>';
    };
    $('pickerSearch').oninput=renderPicker;$('pickerNewExercise').onclick=()=>openExerciseEditor(null,{addMode:mode,draft});renderPicker();openModal();
  }

  async function addExerciseToTarget(ex,mode,draft){
    const item={instanceId:uid('item'),exerciseId:ex.id,name:ex.name,target:'',note:'',section:displayCategory(ex.category||''),superset:''};
    if(mode==='editor'&&draft){draft.items.push(item);$('modalKicker').textContent='TODAY';$('modalTitle').textContent='Edit current workout';closeModal();openCurrentEditorFromDraft(draft);return;}
    state.currentDay.items.push(item); if(!state.currentDay.title)state.currentDay.title='Custom workout';await saveDay();closeModal();renderTrain();showToast('Exercise added');
  }

  function openCurrentEditorFromDraft(draft){
    $('modalKicker').textContent='TODAY';$('modalTitle').textContent='Edit current workout';
    $('modalBody').innerHTML=`<div class="grid-card"><div class="field span-2"><label>Workout title</label><input id="currentTitle" value="${escapeHTML(draft.title||'')}"></div></div><div class="editor-list" id="currentItems"></div><div class="modal-actions"><button id="currentAddBtn" class="secondary-btn" type="button">+ Exercise</button><button id="saveCurrentBtn" class="primary-btn" type="button">Save changes</button></div>`;
    renderCurrentEditorRows(draft);$('currentAddBtn').onclick=()=>openExercisePicker('editor',draft);$('saveCurrentBtn').onclick=async()=>{draft.title=$('currentTitle').value.trim();state.currentDay=draft;await saveDay();closeModal();renderTrain();showToast('Today updated');};openModal();
  }

  async function getPreviousExerciseLog(exerciseId){
    const newDays=[...state.dayIndex].filter(x=>x.date<state.selectedDate).sort((a,b)=>b.date.localeCompare(a.date));
    for(const item of newDays.slice(0,80)){
      const day=safeJSON(await Storage.get(item.key),null); if(!day)continue;
      const found=Object.values(day.logs||{}).find(l=>l.exerciseId===exerciseId&&!l.skipped); if(found)return{date:item.date,log:found};
    }
    for(const item of [...state.oldSessionIndex].filter(x=>x.date<state.selectedDate).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,80)){
      const ses=safeJSON(await Storage.get(item.key),null); if(ses?.logs?.[exerciseId]&&!ses.logs[exerciseId].skipped)return{date:item.date,log:{...ses.logs[exerciseId],exerciseId}};
    }
    return null;
  }

  async function openExerciseLogger(item){
    const exId=item.exerciseId; const ex=exerciseById(exId)||{id:exId,name:itemName(item)};
    $('modalKicker').textContent=state.currentDay.title||'TODAY';$('modalTitle').textContent=itemName(item);
    const existing=state.currentDay.logs[item.instanceId]||{exerciseId:exId,name:itemName(item),sets:[],rpe:'',pain:'',note:'',skipped:false};
    const sets=existing.sets?.length?structuredClone(existing.sets):defaultSetsFromTarget(item.target);const previous=await getPreviousExerciseLog(exId);
    $('modalBody').innerHTML=`${ex.photoKey?'<div class="logger-photo-wrap"><img id="loggerExercisePhoto" class="logger-photo hidden" alt="Exercise reference"><div id="loggerPhotoMissing" class="photo-device-note hidden">Photo is not stored on this device.</div></div>':''}${previous?`<div class="previous-box"><strong>Last · ${escapeHTML(previous.date)}</strong>${escapeHTML(formatSetSummary(previous.log.sets)||'Logged')}</div>`:''}<div class="logger-tools"><button id="loggerHistoryBtn" class="secondary-btn" type="button">History</button><div class="rest-presets"><span>REST</span><button data-rest="60" type="button">60s</button><button data-rest="90" type="button">90s</button><button data-rest="120" type="button">120s</button></div></div><table class="set-table"><thead><tr><th>#</th><th>Weight, kg</th><th>Reps / sec</th><th></th></tr></thead><tbody id="setRows"></tbody></table><div class="modal-actions"><button id="addSetBtn" class="secondary-btn" type="button">+ Set</button>${previous?'<button id="usePrevBtn" class="secondary-btn" type="button">Use previous</button>':''}<button id="skipBtn" class="secondary-btn" type="button">Skip</button></div><div class="grid-card" style="margin-top:14px"><div class="field"><label>RPE</label><input id="logRpe" inputmode="decimal" value="${escapeHTML(existing.rpe||'')}"></div><div class="field"><label>Pain 0–10</label><input id="logPain" inputmode="numeric" value="${escapeHTML(existing.pain||'')}"></div><div class="field span-2"><label>Note</label><textarea id="logNote" rows="2">${escapeHTML(existing.note||'')}</textarea></div></div><div class="modal-actions"><button id="saveExerciseBtn" class="primary-btn" type="button">Save exercise</button><button id="deleteExerciseLogBtn" class="secondary-btn" type="button">Clear log</button></div>`;
    if(ex.photoKey)hydratePhoto($('loggerExercisePhoto'),ex,$('loggerPhotoMissing'));
    renderSetRows(sets);$('addSetBtn').onclick=()=>{sets.push({weight:'',reps:''});renderSetRows(sets);};if(previous)$('usePrevBtn').onclick=()=>{sets.splice(0,sets.length,...structuredClone(previous.log.sets||[]));renderSetRows(sets);};
    $('loggerHistoryBtn').onclick=()=>openExerciseHistory(exId,item);
    qsa('[data-rest]').forEach(btn=>btn.onclick=()=>startRestTimer(+btn.dataset.rest));
    $('skipBtn').onclick=async()=>{state.currentDay.logs[item.instanceId]={exerciseId:exId,name:itemName(item),sets:[],rpe:'',pain:'',note:'Skipped',skipped:true};await saveDay();closeModal();renderTrain();};
    $('saveExerciseBtn').onclick=async()=>{state.currentDay.logs[item.instanceId]={exerciseId:exId,name:itemName(item),sets:readSetRows(),rpe:$('logRpe').value.trim(),pain:$('logPain').value.trim(),note:$('logNote').value.trim(),skipped:false};await saveDay();closeModal();renderTrain();haptic('success');showToast('Saved');};
    $('deleteExerciseLogBtn').onclick=async()=>{delete state.currentDay.logs[item.instanceId];await saveDay();closeModal();renderTrain();showToast('Log cleared');};openModal();
  }

  function defaultSetsFromTarget(target=''){const m=String(target).match(/(\d+)\s*[×x]/i);const n=m?Math.min(8,Math.max(1,+m[1])):3;return Array.from({length:n},()=>({weight:'',reps:''}));}
  function renderSetRows(sets){
    const body=$('setRows');body.innerHTML='';sets.forEach((s,i)=>{const tr=document.createElement('tr');tr.innerHTML=`<td class="set-num">${i+1}</td><td><input data-k="weight" data-i="${i}" inputmode="decimal" value="${escapeHTML(s.weight??'')}"></td><td><input data-k="reps" data-i="${i}" inputmode="decimal" value="${escapeHTML(s.reps??'')}"></td><td><button class="remove-set" data-remove="${i}" type="button">×</button></td>`;body.appendChild(tr);});
    qsa('#setRows input').forEach(inp=>inp.oninput=()=>{sets[+inp.dataset.i][inp.dataset.k]=inp.value;});qsa('#setRows [data-remove]').forEach(btn=>btn.onclick=()=>{sets.splice(+btn.dataset.remove,1);renderSetRows(sets);});
  }
  function readSetRows(){return qsa('#setRows tr').map(tr=>({weight:tr.querySelector('[data-k="weight"]').value.trim(),reps:tr.querySelector('[data-k="reps"]').value.trim()})).filter(s=>s.weight!==''||s.reps!=='');}

  function renderLibrary(){renderWorkoutLibrary();renderExerciseLibrary();}
  function renderWorkoutLibrary(){
    const host=$('workoutLibrary');host.innerHTML='';
    state.workouts.forEach(w=>{
      const card=document.createElement('div');card.className='library-card';card.innerHTML=`<div class="tag">WORKOUT</div><h3>${escapeHTML(w.name)}</h3><p>${escapeHTML(w.note||'')}</p><div class="meta">${w.items.length} exercises</div><div class="library-actions"><button class="secondary-btn use" type="button">Use today</button><button class="secondary-btn edit" type="button">Edit</button></div>`;
      card.querySelector('.use').onclick=()=>{state.selectedDate=$('dayInput').value||todayISO();switchTab('train');openWorkoutPickerWithSelected(w);};card.querySelector('.edit').onclick=()=>openWorkoutEditor(w.id);host.appendChild(card);
    });if(!host.children.length)host.innerHTML='<div class="muted">No saved workouts yet.</div>';
  }

  function openWorkoutPickerWithSelected(w){
    const hasAnything=(state.currentDay.items||[]).length||Object.keys(state.currentDay.logs||{}).length;if(!hasAnything)applyWorkout(w,'replace');else chooseWorkoutMode(w);
  }

  function renderExerciseLibrary(){
    const host=$('exerciseLibrary');host.innerHTML='';const term=norm(state.exerciseSearch);
    const selected=state.exerciseCategory||'ALL';
    state.exercises.filter(e=>exerciseMatchesCategory(e,selected)&&(!term||norm(e.name+' '+e.category+' '+e.note).includes(term))).sort((a,b)=>a.name.localeCompare(b.name)).forEach(ex=>{
      const card=document.createElement('div');card.className='library-card'+(ex.photoKey?' has-photo':'');card.innerHTML=`${ex.photoKey?'<div class="library-photo-wrap"><img class="library-card-photo hidden" alt=""><div class="library-photo-missing hidden">PHOTO · THIS DEVICE</div></div>':''}<div class="tag">${escapeHTML(displayCategory(ex.category||'EXERCISE'))}</div><h3>${escapeHTML(ex.name)}</h3><p>${escapeHTML(ex.note||'')}</p><div class="library-actions"><button class="secondary-btn add" type="button">Add today</button><button class="secondary-btn history" type="button">History</button><button class="secondary-btn edit" type="button">Edit</button></div>`;
      if(ex.photoKey)hydratePhoto(card.querySelector('.library-card-photo'),ex,card.querySelector('.library-photo-missing'));
      card.querySelector('.add').onclick=()=>addExerciseToTarget(ex,'today');card.querySelector('.history').onclick=()=>openExerciseHistory(ex.id);card.querySelector('.edit').onclick=()=>openExerciseEditor(ex.id);host.appendChild(card);
    });if(!host.children.length)host.innerHTML=`<div class="muted">No ${selected==='ALL'?'':selected.toLowerCase()+' '}exercises found.</div>`;
  }

  function openWorkoutEditor(id=null){
    const existing=id?workoutById(id):null;const draft=existing?structuredClone(existing):{id:uid('workout'),name:'',note:'',items:[]};
    $('modalKicker').textContent='WORKOUT LIBRARY';$('modalTitle').textContent=existing?'Edit workout':'New workout';
    $('modalBody').innerHTML=`<div class="grid-card"><div class="field span-2"><label>Name</label><input id="workoutName" value="${escapeHTML(draft.name)}" placeholder="e.g. Thursday OFP"></div><div class="field span-2"><label>Note</label><textarea id="workoutNote" rows="2">${escapeHTML(draft.note||'')}</textarea></div></div><div class="editor-list" id="workoutItems"></div><div class="modal-actions"><button id="workoutAddExisting" class="secondary-btn" type="button">+ From exercise library</button><button id="saveWorkoutBtn" class="primary-btn" type="button">Save workout</button>${existing?'<button id="deleteWorkoutBtn" class="danger-btn" type="button">Delete</button>':''}</div>`;
    renderWorkoutEditorRows(draft);$('workoutAddExisting').onclick=()=>openWorkoutExercisePicker(draft);$('saveWorkoutBtn').onclick=async()=>{draft.name=$('workoutName').value.trim()||'Untitled workout';draft.note=$('workoutNote').value.trim();const i=state.workouts.findIndex(x=>x.id===draft.id);if(i>=0)state.workouts[i]=draft;else state.workouts.push(draft);await saveLibraries();closeModal();renderLibrary();showToast('Workout saved');haptic('success');};
    if(existing)$('deleteWorkoutBtn').onclick=async()=>{state.workouts=state.workouts.filter(x=>x.id!==id);await saveLibraries();closeModal();renderLibrary();showToast('Workout deleted');};openModal();
  }

  function renderWorkoutEditorRows(draft){
    const host=$('workoutItems');if(!host)return;host.innerHTML='';draft.items.forEach((item,i)=>{const ex=exerciseById(item.exerciseId);const row=document.createElement('div');row.className='editor-row editor-row-superset';row.innerHTML=`<div class="name-static">${escapeHTML(ex?.name||'Missing exercise')}</div><input class="target" value="${escapeHTML(item.target||'')}" placeholder="3 × 8"><input class="section" value="${escapeHTML(item.section||'')}" placeholder="section"><select class="superset"><option value="">No superset</option><option value="A">Superset A</option><option value="B">Superset B</option><option value="C">Superset C</option><option value="D">Superset D</option></select><button class="ghost-btn remove-editor" type="button">×</button>`;row.querySelector('.target').oninput=e=>item.target=e.target.value;row.querySelector('.section').oninput=e=>item.section=e.target.value;row.querySelector('.superset').value=item.superset||'';row.querySelector('.superset').onchange=e=>item.superset=e.target.value;row.querySelector('.remove-editor').onclick=()=>{draft.items.splice(i,1);renderWorkoutEditorRows(draft);};host.appendChild(row);});if(!draft.items.length)host.innerHTML='<div class="muted">No exercises yet.</div>';
  }

  function openWorkoutExercisePicker(draft){
    $('modalKicker').textContent='WORKOUT';$('modalTitle').textContent='Add from library';$('modalBody').innerHTML=`<div class="field"><label>Search</label><input id="workoutExSearch" placeholder="Search exercise"></div><div class="picker-list" id="workoutExPicker"></div><div class="modal-actions"><button id="workoutNewEx" class="secondary-btn" type="button">+ New exercise</button></div>`;
    const render=()=>{const term=norm($('workoutExSearch').value),host=$('workoutExPicker');host.innerHTML='';state.exercises.filter(e=>!term||norm(e.name+' '+e.category).includes(term)).slice(0,80).forEach(ex=>{const b=document.createElement('button');b.className='picker-item';b.type='button';b.innerHTML=`<strong>${escapeHTML(ex.name)}</strong><span>${escapeHTML(displayCategory(ex.category||'GENERAL'))}</span>`;b.onclick=()=>{draft.items.push({exerciseId:ex.id,target:'',note:'',section:displayCategory(ex.category||''),superset:''});openWorkoutEditorFromDraft(draft);};host.appendChild(b);});};$('workoutExSearch').oninput=render;$('workoutNewEx').onclick=()=>openExerciseEditor(null,{workoutDraft:draft});render();
  }

  function openWorkoutEditorFromDraft(draft){
    $('modalKicker').textContent='WORKOUT LIBRARY';$('modalTitle').textContent='Edit workout';$('modalBody').innerHTML=`<div class="grid-card"><div class="field span-2"><label>Name</label><input id="workoutName" value="${escapeHTML(draft.name)}"></div><div class="field span-2"><label>Note</label><textarea id="workoutNote" rows="2">${escapeHTML(draft.note||'')}</textarea></div></div><div class="editor-list" id="workoutItems"></div><div class="modal-actions"><button id="workoutAddExisting" class="secondary-btn" type="button">+ From exercise library</button><button id="saveWorkoutBtn" class="primary-btn" type="button">Save workout</button></div>`;renderWorkoutEditorRows(draft);$('workoutAddExisting').onclick=()=>openWorkoutExercisePicker(draft);$('saveWorkoutBtn').onclick=async()=>{draft.name=$('workoutName').value.trim()||'Untitled workout';draft.note=$('workoutNote').value.trim();const i=state.workouts.findIndex(x=>x.id===draft.id);if(i>=0)state.workouts[i]=draft;else state.workouts.push(draft);await saveLibraries();closeModal();renderLibrary();showToast('Workout saved');};openModal();
  }

  function openExerciseEditor(id=null,context=null){
    const existing=id?exerciseById(id):null;const draft=existing?structuredClone(existing):{id:uid('ex'),name:'',category:'GENERAL',note:''};
    let pendingPhotoData=null,pendingRemovePhoto=false;
    $('modalKicker').textContent='EXERCISE LIBRARY';$('modalTitle').textContent=existing?'Edit exercise':'New exercise';
    $('modalBody').innerHTML=`<div class="grid-card"><div class="field span-2"><label>Name</label><input id="exerciseName" value="${escapeHTML(draft.name)}" placeholder="Exercise name"></div><div class="field"><label>Category</label><input id="exerciseCategory" list="exerciseCategoryOptions" value="${escapeHTML(draft.category||'GENERAL')}" placeholder="LEGS / ARMS / CORE…"><datalist id="exerciseCategoryOptions"><option value="LEGS"><option value="ARMS"><option value="CORE"><option value="BACK"><option value="CHEST"><option value="CLIMBING"><option value="SKILLS"><option value="REHAB"><option value="OTHER"></datalist></div><div class="field span-2"><label>Reference photo</label><div class="exercise-photo-editor"><div class="exercise-photo-preview-wrap"><img id="exercisePhotoPreview" class="exercise-photo-preview hidden" alt="Exercise reference"><div id="exercisePhotoPlaceholder" class="exercise-photo-placeholder"><span>＋</span><strong>Add reference photo</strong><small>Useful for technique, setup or rehab drills.</small></div></div><div class="photo-editor-actions"><label class="secondary-btn file-picker-btn">Choose photo<input id="exercisePhotoInput" type="file" accept="image/*"></label><button id="removeExercisePhotoBtn" class="secondary-btn" type="button">Remove photo</button></div><div class="photo-device-note">Compressed automatically. For now photos are stored in Telegram on this device; exercise data itself still syncs normally.</div></div></div><div class="field span-2"><label>Note</label><textarea id="exerciseNote" rows="3">${escapeHTML(draft.note||'')}</textarea></div></div><div class="modal-actions"><button id="saveExerciseLibraryBtn" class="primary-btn" type="button">${context?'Save & add':'Save exercise'}</button>${existing?'<button id="deleteExerciseLibraryBtn" class="danger-btn" type="button">Delete</button>':''}</div>`;
    const preview=$('exercisePhotoPreview'),placeholder=$('exercisePhotoPlaceholder'),removeBtn=$('removeExercisePhotoBtn');
    const showPreview=data=>{if(data){preview.src=data;preview.classList.remove('hidden');placeholder.classList.add('hidden');removeBtn.disabled=false;}else{preview.removeAttribute('src');preview.classList.add('hidden');placeholder.classList.remove('hidden');removeBtn.disabled=true;}};
    if(existing?.photoKey)getExercisePhoto(existing).then(showPreview);else showPreview(null);
    $('exercisePhotoInput').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{showToast('Preparing photo…');pendingPhotoData=await compressImage(file);pendingRemovePhoto=false;showPreview(pendingPhotoData);showToast('Photo ready');}catch(err){showToast(err.message||'Could not add photo');}e.target.value='';};
    removeBtn.onclick=()=>{pendingPhotoData=null;pendingRemovePhoto=true;showPreview(null);};
    $('saveExerciseLibraryBtn').onclick=async()=>{
      draft.name=$('exerciseName').value.trim()||'Untitled exercise';draft.category=$('exerciseCategory').value.trim().toUpperCase()||'OTHER';draft.note=$('exerciseNote').value.trim();
      if(pendingRemovePhoto&&draft.photoKey){await MediaStorage.remove(draft.photoKey);delete state.photoCache[draft.photoKey];delete draft.photoKey;}
      if(pendingPhotoData){const key=draft.photoKey||photoKeyForExercise(draft.id);const ok=await MediaStorage.set(key,pendingPhotoData);if(!ok){showToast('Photo storage is full');return;}draft.photoKey=key;state.photoCache[key]=pendingPhotoData;}
      const i=state.exercises.findIndex(x=>x.id===draft.id);if(i>=0)state.exercises[i]=draft;else state.exercises.push(draft);await saveLibraries();
      if(context?.addMode==='today'){await addExerciseToTarget(draft,'today');return;}
      if(context?.addMode==='editor'&&context.draft){context.draft.items.push({instanceId:uid('item'),exerciseId:draft.id,name:draft.name,target:'',note:'',section:displayCategory(draft.category),superset:''});openCurrentEditorFromDraft(context.draft);return;}
      if(context?.workoutDraft){context.workoutDraft.items.push({exerciseId:draft.id,target:'',note:'',section:displayCategory(draft.category),superset:''});openWorkoutEditorFromDraft(context.workoutDraft);return;}
      closeModal();renderLibrary();renderTrain();populateProgressExercises();showToast('Exercise saved');
    };
    if(existing)$('deleteExerciseLibraryBtn').onclick=async()=>{const inWorkouts=state.workouts.some(w=>w.items.some(x=>x.exerciseId===id));if(inWorkouts){showToast('Remove it from saved workouts first');return;}await removeExercisePhoto(existing);state.exercises=state.exercises.filter(x=>x.id!==id);await saveLibraries();closeModal();renderLibrary();populateProgressExercises();showToast('Exercise deleted');};
    openModal();
  }

  async function saveBody(){
    const date=$('bodyDate').value||todayISO();const obj={date,weight:$('bodyWeight').value.trim(),sleep:$('bodySleep').value.trim(),energy:$('bodyEnergy').value.trim(),wrist:$('bodyWrist').value.trim(),ankle:$('bodyAnkle').value.trim(),knee:$('bodyKnee').value.trim(),back:$('bodyBack').value.trim(),note:$('bodyNote').value.trim(),updatedAt:new Date().toISOString()};
    await Storage.set(bodyKey(date),JSON.stringify(obj));if(!state.bodyIndex.includes(date))state.bodyIndex.push(date);state.bodyIndex.sort((a,b)=>b.localeCompare(a));await Storage.set(KEY_BODY_INDEX,JSON.stringify(state.bodyIndex));showToast('Body check-in saved');haptic('success');renderBody();
  }
  async function renderBody(){
    const date=$('bodyDate').value||state.selectedDate||todayISO();const raw=await Storage.get(bodyKey(date)),obj=raw?safeJSON(raw,{}):{};['Weight','Sleep','Energy','Wrist','Ankle','Knee','Back','Note'].forEach(k=>{const el=$('body'+k);if(el)el.value=obj[k.toLowerCase()]||'';});const host=$('bodyHistory');host.innerHTML='';for(const d of state.bodyIndex.slice(0,14)){const x=safeJSON(await Storage.get(bodyKey(d)),{});const row=document.createElement('div');row.className='history-row';row.innerHTML=`<strong>${escapeHTML(d)}</strong><span>${x.weight?escapeHTML(x.weight)+' kg · ':''}${x.sleep?escapeHTML(x.sleep)+' h sleep · ':''}${x.wrist!==''&&x.wrist!=null?'wrist '+escapeHTML(x.wrist)+'/10':''}</span><span>${escapeHTML(x.note||'')}</span>`;host.appendChild(row);}if(!host.children.length)host.innerHTML='<div class="muted">No check-ins yet.</div>';
  }

  function renderSkills(){const host=$('skillsList');host.innerHTML='';state.skills.forEach(skill=>{const card=document.createElement('button');card.type='button';card.className='library-card';card.style.textAlign='left';card.innerHTML=`<div class="tag">${escapeHTML(skill.group||'LIBRARY')}</div><h3>${escapeHTML(skill.name)}</h3><p>${escapeHTML(skill.note||'')}</p>`;card.onclick=()=>openSkillEditor(skill.id);host.appendChild(card);});}
  function openSkillEditor(id=null){const existing=id?state.skills.find(x=>x.id===id):null,draft=existing?structuredClone(existing):{id:uid('skill'),name:'',group:'ACTIVE',note:''};$('modalKicker').textContent='SKILLS & REHAB';$('modalTitle').textContent=existing?'Edit item':'Add item';$('modalBody').innerHTML=`<div class="grid-card"><div class="field span-2"><label>Name</label><input id="skillName" value="${escapeHTML(draft.name)}"></div><div class="field"><label>Group</label><select id="skillGroup"><option>ACTIVE</option><option>MAINTAIN</option><option>REHAB</option><option>PARKING</option></select></div><div class="field span-2"><label>Note</label><textarea id="skillNote" rows="3">${escapeHTML(draft.note||'')}</textarea></div></div><div class="modal-actions"><button id="saveSkillBtn" class="primary-btn" type="button">Save</button>${existing?'<button id="deleteSkillBtn" class="secondary-btn" type="button">Delete</button>':''}</div>`;$('skillGroup').value=draft.group||'ACTIVE';$('saveSkillBtn').onclick=async()=>{draft.name=$('skillName').value.trim()||'Untitled';draft.group=$('skillGroup').value;draft.note=$('skillNote').value.trim();const i=state.skills.findIndex(x=>x.id===draft.id);if(i>=0)state.skills[i]=draft;else state.skills.push(draft);await Storage.set(KEY_SKILLS,JSON.stringify(state.skills));closeModal();renderSkills();showToast('Saved');};if(existing)$('deleteSkillBtn').onclick=async()=>{state.skills=state.skills.filter(x=>x.id!==id);await Storage.set(KEY_SKILLS,JSON.stringify(state.skills));closeModal();renderSkills();};openModal();}

  function populateProgressExercises(){
    const sel=$('progressExercise'),current=sel.value;sel.innerHTML='';state.exercises.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(e=>{const o=document.createElement('option');o.value=e.id;o.textContent=e.name;sel.appendChild(o);});if([...sel.options].some(o=>o.value===current))sel.value=current;
  }
  async function getExerciseHistory(exId){
    const out=[];const sorted=[...state.dayIndex].sort((a,b)=>a.date.localeCompare(b.date));for(const item of sorted){const day=safeJSON(await Storage.get(item.key),null);if(!day)continue;Object.values(day.logs||{}).forEach(log=>{if(log.exerciseId===exId&&!log.skipped)out.push({date:item.date,workout:day.title||item.title||'Workout',...log});});}
    for(const item of [...state.oldSessionIndex].sort((a,b)=>a.date.localeCompare(b.date))){const ses=safeJSON(await Storage.get(item.key),null);if(ses?.logs?.[exId]&&!ses.logs[exId].skipped)out.push({date:item.date,workout:'Legacy '+(item.session||''),exerciseId:exId,...ses.logs[exId]});}
    return out.sort((a,b)=>a.date.localeCompare(b.date));
  }
  function metricValue(entry,metric){const sets=(entry.sets||[]).map(s=>({w:parseFloat(String(s.weight).replace(',','.'))||0,r:parseFloat(String(s.reps).replace(',','.'))||0}));if(!sets.length)return 0;if(metric==='topWeight')return Math.max(...sets.map(s=>s.w));if(metric==='bestReps')return Math.max(...sets.map(s=>s.r));if(metric==='volume')return sets.reduce((a,s)=>a+s.w*s.r,0);if(metric==='e1rm')return Math.max(...sets.map(s=>s.w>0&&s.r>0?s.w*(1+s.r/30):0));return 0;}
  async function renderProgress(){
    const exId=$('progressExercise').value;if(!exId)return;const metric=$('progressMetric').value,hist=await getExerciseHistory(exId),pts=hist.map(h=>({date:h.date,value:metricValue(h,metric),raw:h})).filter(x=>Number.isFinite(x.value)&&x.value>0);$('progressEmpty').style.display=pts.length?'none':'block';$('progressChart').style.display=pts.length?'block':'none';const svg=$('progressChart');svg.innerHTML='';if(pts.length){const W=800,H=280,pad={l:52,r:18,t:20,b:42},vals=pts.map(p=>p.value);let min=Math.min(...vals),max=Math.max(...vals);if(min===max){min*=.9;max*=1.1||1;}const range=max-min||1,x=i=>pad.l+(pts.length===1?(W-pad.l-pad.r)/2:i*(W-pad.l-pad.r)/(pts.length-1)),y=v=>pad.t+(max-v)/range*(H-pad.t-pad.b);for(let i=0;i<4;i++){const yy=pad.t+i*(H-pad.t-pad.b)/3,val=max-i*range/3;svg.insertAdjacentHTML('beforeend',`<line class="chart-grid" x1="${pad.l}" y1="${yy}" x2="${W-pad.r}" y2="${yy}"/><text class="chart-label" x="4" y="${yy+4}">${Math.round(val*10)/10}</text>`);}const d=pts.map((p,i)=>`${i?'L':'M'} ${x(i)} ${y(p.value)}`).join(' ');svg.insertAdjacentHTML('beforeend',`<path class="chart-line" d="${d}"/>`);pts.forEach((p,i)=>svg.insertAdjacentHTML('beforeend',`<circle class="chart-dot" cx="${x(i)}" cy="${y(p.value)}" r="5"/><text class="chart-label" x="${x(i)}" y="${H-12}" text-anchor="middle">${p.date.slice(5)}</text>`));}
    const host=$('progressHistory');host.innerHTML='';hist.slice().reverse().forEach(h=>{const row=document.createElement('div');row.className='history-row';row.innerHTML=`<strong>${escapeHTML(h.date)} · ${escapeHTML(h.workout||'Workout')}</strong><span>${escapeHTML(formatSetSummary(h.sets)||'Logged')}</span><span>${h.rpe?'RPE '+escapeHTML(h.rpe):''}${h.pain?' · pain '+escapeHTML(h.pain):''}</span>`;host.appendChild(row);});if(!hist.length)host.innerHTML='<div class="muted">No history yet.</div>';
  }

  async function openExerciseHistory(exId,returnItem=null){
    const ex=exerciseById(exId)||{name:'Exercise'};const hist=await getExerciseHistory(exId);
    $('modalKicker').textContent='EXERCISE HISTORY';$('modalTitle').textContent=ex.name;
    const recent=hist.slice().reverse().slice(0,16);const allSets=hist.flatMap(h=>h.sets||[]).map(x=>({w:parseFloat(String(x.weight).replace(',','.'))||0,r:parseFloat(String(x.reps).replace(',','.'))||0}));
    const topWeight=allSets.length?Math.max(...allSets.map(x=>x.w)):0;const bestReps=allSets.length?Math.max(...allSets.map(x=>x.r)):0;
    $('modalBody').innerHTML=`<div class="history-stats"><div><span>SESSIONS</span><strong>${hist.length}</strong></div><div><span>TOP WEIGHT</span><strong>${topWeight||'—'}${topWeight?' kg':''}</strong></div><div><span>BEST REPS</span><strong>${bestReps||'—'}</strong></div></div><div class="history-modal-list" id="exerciseHistoryList"></div><div class="modal-actions">${returnItem?'<button id="historyBackToLog" class="primary-btn" type="button">Back to log</button>':''}</div>`;
    const host=$('exerciseHistoryList');recent.forEach(h=>{const row=document.createElement('div');row.className='history-row history-detail';row.innerHTML=`<strong>${escapeHTML(h.date)} · ${escapeHTML(h.workout||'Workout')}</strong><span>${escapeHTML(formatSetSummary(h.sets)||'Logged')}</span><span>${h.rpe?'RPE '+escapeHTML(h.rpe):''}${h.pain?' · pain '+escapeHTML(h.pain):''}${h.note?' · '+escapeHTML(h.note):''}</span>`;host.appendChild(row);});if(!recent.length)host.innerHTML='<div class="muted">No logged history yet.</div>';
    if(returnItem)$('historyBackToLog').onclick=()=>openExerciseLogger(returnItem);openModal();
  }

  function shiftCalendarMonth(delta){
    const [y,m]=state.calendarMonth.split('-').map(Number);const d=new Date(y,m-1+delta,1);state.calendarMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;renderMiniCalendar();
  }
  function renderMiniCalendar(){
    const label=$('calendarMonthLabel'),grid=$('miniCalendarGrid');if(!label||!grid)return;
    const [y,m]=state.calendarMonth.split('-').map(Number);const first=new Date(y,m-1,1);const days=new Date(y,m,0).getDate();const offset=(first.getDay()+6)%7;
    label.textContent=first.toLocaleDateString(undefined,{month:'long',year:'numeric'}).toUpperCase();grid.innerHTML='';
    for(let i=0;i<offset;i++){const blank=document.createElement('span');blank.className='calendar-day blank';grid.appendChild(blank);}
    const trained=new Set(state.dayIndex.map(x=>x.date));
    for(let d=1;d<=days;d++){
      const iso=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const b=document.createElement('button');b.type='button';b.className='calendar-day';b.textContent=d;b.dataset.date=iso;
      if(iso===state.selectedDate)b.classList.add('selected');if(iso===todayISO())b.classList.add('today');if(trained.has(iso))b.classList.add('has-workout');
      b.onclick=async()=>{state.selectedDate=iso;state.calendarMonth=iso.slice(0,7);$('dayInput').value=iso;$('bodyDate').value=iso;await loadDay();renderTrain();};grid.appendChild(b);
    }
  }

  function syncSectionOrder(section,orderedIds){
    const indexes=[];state.currentDay.items.forEach((x,i)=>{if(((x.section||'').trim()||'EXERCISES')===section)indexes.push(i);});
    const byId=new Map(state.currentDay.items.map(x=>[x.instanceId,x]));indexes.forEach((idx,i)=>{const item=byId.get(orderedIds[i]);if(item)state.currentDay.items[idx]=item;});saveDay();
  }
  function enableDayReorder(){
    qsa('.day-exercise-grid').forEach(grid=>{
      const section=grid.closest('.exercise-section')?.querySelector('h3')?.textContent||'EXERCISES';let dragged=null;
      qsa('.exercise-row-card',grid).forEach(card=>{
        card.addEventListener('dragstart',e=>{if(!e.target.closest('.drag-handle')&&document.activeElement!==card.querySelector('.drag-handle')){}dragged=card;card.classList.add('dragging');try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',card.dataset.instanceId);}catch(_){}});
        card.addEventListener('dragend',()=>{card.classList.remove('dragging');const ids=qsa('.exercise-row-card',grid).map(x=>x.dataset.instanceId);syncSectionOrder(section,ids);});
        const handle=card.querySelector('.drag-handle');if(!handle)return;
        let touchActive=false;
        handle.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')return;touchActive=true;dragged=card;card.classList.add('dragging-touch');handle.setPointerCapture?.(e.pointerId);e.preventDefault();});
        handle.addEventListener('pointermove',e=>{if(!touchActive||!dragged)return;const el=document.elementFromPoint(e.clientX,e.clientY);const over=el?.closest('.exercise-row-card');if(!over||over===dragged||over.parentElement!==grid)return;const r=over.getBoundingClientRect();grid.insertBefore(dragged,e.clientY<r.top+r.height/2?over:over.nextSibling);e.preventDefault();});
        const finish=e=>{if(!touchActive)return;touchActive=false;card.classList.remove('dragging-touch');try{handle.releasePointerCapture?.(e.pointerId);}catch(_){}const ids=qsa('.exercise-row-card',grid).map(x=>x.dataset.instanceId);syncSectionOrder(section,ids);haptic('selection');};handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);
      });
      grid.addEventListener('dragover',e=>{e.preventDefault();if(!dragged)return;const cards=qsa('.exercise-row-card:not(.dragging)',grid);const after=cards.find(c=>{const r=c.getBoundingClientRect();return e.clientY<r.top+r.height/2;});grid.insertBefore(dragged,after||null);});
    });
  }

  function formatTimer(sec){sec=Math.max(0,Math.ceil(sec));return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;}
  function renderRestTimer(){
    const panel=$('restTimerPanel'),display=$('restTimerDisplay');if(!panel||!display)return;const left=(state.restTimerEnd-Date.now())/1000;
    if(state.restTimerEnd<=0){panel.classList.add('hidden');return;}panel.classList.remove('hidden');display.textContent=formatTimer(left);
    if(left<=0){clearInterval(state.restTimerInterval);state.restTimerInterval=null;state.restTimerEnd=0;display.textContent='0:00';panel.classList.add('done');haptic('success');setTimeout(()=>{panel.classList.add('hidden');panel.classList.remove('done');},3500);}
  }
  function startRestTimer(seconds=90){
    clearInterval(state.restTimerInterval);state.restTimerEnd=Date.now()+seconds*1000;$('restTimerPanel').classList.remove('done');renderRestTimer();state.restTimerInterval=setInterval(renderRestTimer,250);showToast(`Rest ${seconds}s`);haptic('light');
  }
  function addRestTime(seconds=30){if(state.restTimerEnd<=0)startRestTimer(seconds);else{state.restTimerEnd+=seconds*1000;renderRestTimer();}}
  function stopRestTimer(){clearInterval(state.restTimerInterval);state.restTimerInterval=null;state.restTimerEnd=0;$('restTimerPanel').classList.add('hidden');$('restTimerPanel').classList.remove('done');}

  async function exportBackup(){
    try{
      showToast('Preparing backup…');const days={},body={},photos={};
      for(const entry of state.dayIndex){const raw=await Storage.get(entry.key||dayKey(entry.date));if(raw)days[entry.date]=safeJSON(raw,null);}
      for(const date of state.bodyIndex){const raw=await Storage.get(bodyKey(date));if(raw)body[date]=safeJSON(raw,null);}
      for(const ex of state.exercises){if(ex.photoKey){const data=await getExercisePhoto(ex);if(data)photos[ex.id]=data;}}
      const payload={app:'TRAINING LOG',version:3,exportedAt:new Date().toISOString(),workouts:state.workouts,exercises:state.exercises,skills:state.skills,dayIndex:state.dayIndex,bodyIndex:state.bodyIndex,days,body,photos};
      const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`training-log-backup-${todayISO()}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);showToast('Backup exported');haptic('success');
    }catch(e){showToast('Backup failed');}
  }
  async function importBackupFile(e){
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    try{
      const data=JSON.parse(await file.text());if(!data||!Array.isArray(data.exercises)||!Array.isArray(data.workouts))throw new Error('Invalid backup');
      $('modalKicker').textContent='BACKUP';$('modalTitle').textContent='Restore backup?';$('modalBody').innerHTML=`<div class="confirm-copy"><strong>${escapeHTML(file.name)}</strong><p>This will replace the current workout library, exercise library, logs and body entries with the backup.</p></div><div class="modal-actions"><button id="confirmImportBackup" class="danger-btn" type="button">Restore backup</button><button id="cancelImportBackup" class="secondary-btn" type="button">Cancel</button></div>`;
      $('cancelImportBackup').onclick=closeModal;$('confirmImportBackup').onclick=async()=>{
        state.workouts=data.workouts||[];state.exercises=data.exercises||[];state.skills=data.skills||[];state.dayIndex=data.dayIndex||Object.keys(data.days||{}).map(date=>({date,key:dayKey(date),title:data.days[date]?.title||'Workout',finished:!!data.days[date]?.finished}));state.bodyIndex=data.bodyIndex||Object.keys(data.body||{});
        await saveLibraries();for(const [date,obj] of Object.entries(data.days||{}))await Storage.set(dayKey(date),JSON.stringify(obj));for(const [date,obj] of Object.entries(data.body||{}))await Storage.set(bodyKey(date),JSON.stringify(obj));
        for(const ex of state.exercises){const photo=data.photos?.[ex.id];if(photo){const key=ex.photoKey||photoKeyForExercise(ex.id);await MediaStorage.set(key,photo);ex.photoKey=key;state.photoCache[key]=photo;}}
        await Storage.set(KEY_EXERCISES,JSON.stringify(state.exercises));await loadDay();closeModal();renderAll();showToast('Backup restored');haptic('success');
      };openModal();
    }catch(err){showToast('Could not read backup');}
  }

  function openModal(){
    $('modalBackdrop').classList.remove('hidden');$('modalBackdrop').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';if(TG?.BackButton){try{TG.BackButton.show();TG.BackButton.onClick(closeModal);}catch(e){}}
  }
  function closeModal(){
    $('modalBackdrop').classList.add('hidden');$('modalBackdrop').setAttribute('aria-hidden','true');document.body.style.overflow='';if(TG?.BackButton){try{TG.BackButton.offClick(closeModal);TG.BackButton.hide();}catch(e){}}state.modalContext=null;
  }
  function haptic(type='light'){try{if(!TG?.HapticFeedback)return;if(type==='success')TG.HapticFeedback.notificationOccurred('success');else TG.HapticFeedback.impactOccurred(type);}catch(e){}}
  let toastTimer=null;function showToast(msg){clearTimeout(toastTimer);$('toast').textContent=msg;$('toast').classList.remove('hidden');toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),1800);}

  init();
})();
