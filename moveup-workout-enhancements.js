(function(){
  'use strict';

  const PROFILE_KEY='moveup_profile_v1';
  const SESSION_HISTORY_KEY='moveup_session_history_v1';
  const INTENSITY_LABELS={light:'Leve',moderate:'Moderado',intense:'Intenso'};
  const INTENSITY_MULTIPLIERS={light:0.75,moderate:1,intense:1.25};
  const REP_TARGETS={
    'Sit-Up':20,
    'Push Ups':25,
    'Pull-Up / Chin-Up':8
  };
  const BASE_MET={
    'Lymphatic Hops':5.0,
    'Body Waves':2.5,
    'Trunk Twist':3.0,
    'Arm Swings':2.8,
    'Jumping Jacks':8.0,
    'Dead Arms':2.5,
    'Golf Swing':4.0,
    'Marches':4.5,
    'Ballet Squats':5.0,
    'Horseback Stance':4.0,
    'Sit-Up':5.0,
    'Abdominal Plank':3.5,
    'Push Ups':6.0,
    'Pull-Up / Chin-Up':8.0
  };

  let activeSession=null;
  let observedSessionStartedAt=null;
  let finalRatingRest=false;

  function getProfile(){
    try{return JSON.parse(localStorage.getItem(PROFILE_KEY)||'{}')||{}}catch(_){return {}}
  }

  function localDateKey(date=new Date()){
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }

  function readSessionHistory(){
    try{
      const value=JSON.parse(localStorage.getItem(SESSION_HISTORY_KEY)||'{}');
      return value&&typeof value==='object'?value:{};
    }catch(_){return {}}
  }

  function repetitionFactor(name,reps){
    const target=REP_TARGETS[name];
    if(!target)return 1;
    const count=Math.max(1,Number(reps)||target);
    return Math.max(.7,Math.min(1.3,.7+.3*(count/target)));
  }

  function calculateKcal(name,intensity,weightKg,reps=null){
    if(!weightKg||!BASE_MET[name]||!INTENSITY_MULTIPLIERS[intensity])return 0;
    const met=BASE_MET[name]*INTENSITY_MULTIPLIERS[intensity];
    const factor=repetitionFactor(name,reps);
    return Math.round((met*3.5*weightKg/200)*factor*10)/10;
  }

  function beginSession(){
    const profile=getProfile();
    activeSession={
      id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      startedAt:new Date().toISOString(),
      completedAt:null,
      weightKg:Number(profile.weightKg)||0,
      age:Number(profile.age)||null,
      heightCm:Number(profile.heightCm)||null,
      sex:profile.sex||null,
      exercises:EXERCISES.map(e=>({
        name:e.name,
        status:'pending',
        intensity:null,
        reps:null,
        targetReps:REP_TARGETS[e.name]||null,
        kcal:0
      })),
      totalKcal:0,
      saved:false
    };
    finalRatingRest=false;
    removeCompleteSummary();
    hideRatingPanel();
  }

  function ensureSession(){
    if(!activeSession)beginSession();
    return activeSession;
  }

  function exerciseRecord(name){
    return ensureSession().exercises.find(x=>x.name===name);
  }

  function recalcTotal(){
    activeSession.totalKcal=Math.round(activeSession.exercises.reduce((sum,x)=>sum+(Number(x.kcal)||0),0)*10)/10;
  }

  function setPerformed(name,intensity='moderate',repsOverride=null){
    const record=exerciseRecord(name);
    if(!record)return;
    record.status='done';
    record.intensity=intensity;
    if(REP_TARGETS[name]){
      const fallback=record.reps||REP_TARGETS[name];
      record.reps=Math.max(1,Math.round(Number(repsOverride??fallback)||REP_TARGETS[name]));
    }else{
      record.reps=null;
    }
    record.kcal=calculateKcal(name,intensity,activeSession.weightKg,record.reps);
    recalcTotal();
  }

  function setSkipped(name){
    const record=exerciseRecord(name);
    if(!record)return;
    record.status='skipped';
    record.intensity=null;
    record.reps=REP_TARGETS[name]?0:null;
    record.kcal=0;
    recalcTotal();
  }

  function clearExercise(name){
    const record=exerciseRecord(name);
    if(!record)return;
    record.status='pending';
    record.intensity=null;
    record.reps=null;
    record.kcal=0;
    recalcTotal();
  }

  function formatKcal(value){
    const n=Number(value)||0;
    return Number.isInteger(n)?String(n):n.toFixed(1).replace('.',',');
  }

  function ensureRatingPanel(){
    let panel=document.getElementById('moveupIntensityPanel');
    if(panel)return panel;
    const timerArea=document.querySelector('.timer-area');
    if(!timerArea||!timerArea.parentElement)return null;
    panel=document.createElement('div');
    panel.id='moveupIntensityPanel';
    panel.className='moveup-intensity-panel';
    panel.innerHTML=`
      <div class="moveup-intensity-question" id="moveupIntensityQuestion">Como foi?</div>
      <div class="moveup-intensity-options">
        <button type="button" data-intensity="light">Leve</button>
        <button type="button" data-intensity="moderate">Moderado</button>
        <button type="button" data-intensity="intense">Intenso</button>
      </div>
      <div id="moveupRepControl" class="moveup-rep-control">
        <span class="moveup-rep-label">Repetições</span>
        <div class="moveup-rep-stepper">
          <button type="button" id="moveupRepMinus" aria-label="Diminuir repetições">−</button>
          <input id="moveupRepValue" type="number" min="1" max="200" inputmode="numeric" aria-label="Número de repetições" />
          <button type="button" id="moveupRepPlus" aria-label="Aumentar repetições">+</button>
        </div>
      </div>
      <div class="moveup-intensity-kcal" id="moveupIntensityKcal"></div>`;
    timerArea.parentElement.insertBefore(panel,timerArea);

    panel.querySelectorAll('[data-intensity]').forEach(btn=>btn.addEventListener('click',()=>{
      const name=panel.dataset.exercise;
      if(!name)return;
      const record=exerciseRecord(name);
      setPerformed(name,btn.dataset.intensity,record?.reps);
      updateRatingPanel(name);
    }));

    const updateReps=delta=>{
      const name=panel.dataset.exercise;
      if(!name||!REP_TARGETS[name])return;
      const record=exerciseRecord(name);
      const current=Math.max(1,Number(record?.reps)||REP_TARGETS[name]);
      setPerformed(name,record?.intensity||'moderate',Math.max(1,current+delta));
      updateRatingPanel(name);
    };
    document.getElementById('moveupRepMinus').addEventListener('click',()=>updateReps(-1));
    document.getElementById('moveupRepPlus').addEventListener('click',()=>updateReps(1));
    document.getElementById('moveupRepValue').addEventListener('change',e=>{
      const name=panel.dataset.exercise;
      if(!name||!REP_TARGETS[name])return;
      const record=exerciseRecord(name);
      const reps=Math.max(1,Math.min(200,Math.round(Number(e.target.value)||REP_TARGETS[name])));
      setPerformed(name,record?.intensity||'moderate',reps);
      updateRatingPanel(name);
    });
    return panel;
  }

  function updateRatingPanel(name){
    const panel=ensureRatingPanel();
    if(!panel)return;
    const record=exerciseRecord(name);
    if(!record)return;
    panel.dataset.exercise=name;
    panel.classList.add('show');
    document.getElementById('moveupIntensityQuestion').textContent=`Como foi ${name}?`;
    panel.querySelectorAll('[data-intensity]').forEach(btn=>btn.classList.toggle('selected',btn.dataset.intensity===record.intensity));

    const repControl=document.getElementById('moveupRepControl');
    const repValue=document.getElementById('moveupRepValue');
    if(REP_TARGETS[name]&&record.status!=='skipped'){
      repControl.classList.add('show');
      repValue.value=record.reps||REP_TARGETS[name];
    }else{
      repControl.classList.remove('show');
    }

    const details=record.status==='skipped'
      ?'Pulado · 0 kcal'
      :`${record.reps?`${record.reps} reps · `:''}~${formatKcal(record.kcal)} kcal estimadas`;
    document.getElementById('moveupIntensityKcal').textContent=details;
  }

  function showRatingPanel(name){
    const record=exerciseRecord(name);
    if(record&&record.status==='pending')setPerformed(name,'moderate',REP_TARGETS[name]||null);
    updateRatingPanel(name);
  }

  function hideRatingPanel(){
    document.getElementById('moveupIntensityPanel')?.classList.remove('show');
  }

  function finalizeSession(){
    const session=ensureSession();
    session.exercises.forEach(item=>{
      if(item.status==='pending'){
        item.status='skipped';
        item.intensity=null;
        item.reps=REP_TARGETS[item.name]?0:null;
        item.kcal=0;
      }
    });
    recalcTotal();
    session.completedAt=new Date().toISOString();
    return session;
  }

  function saveSession(){
    const session=finalizeSession();
    if(session.saved)return session;
    const history=readSessionHistory();
    const key=localDateKey(new Date(session.completedAt));
    if(!Array.isArray(history[key]))history[key]=[];
    history[key].push({
      id:session.id,
      startedAt:session.startedAt,
      completedAt:session.completedAt,
      weightKg:session.weightKg,
      age:session.age,
      heightCm:session.heightCm,
      sex:session.sex,
      exercises:session.exercises.map(x=>({...x})),
      totalKcal:session.totalKcal
    });
    localStorage.setItem(SESSION_HISTORY_KEY,JSON.stringify(history));
    session.saved=true;
    return session;
  }

  function removeCompleteSummary(){
    document.getElementById('moveupSessionSummary')?.remove();
  }

  function renderCompleteSummary(){
    const session=activeSession;
    if(!session)return;
    removeCompleteSummary();
    const complete=document.getElementById('complete');
    const actions=complete?.querySelector('.finish-actions');
    if(!complete||!actions)return;

    const summary=document.createElement('div');
    summary.id='moveupSessionSummary';
    summary.className='moveup-session-summary';
    const rows=session.exercises.map(item=>{
      const status=item.status==='skipped'?'Pulado':INTENSITY_LABELS[item.intensity]||'Moderado';
      const detail=item.status==='skipped'?status:`${status}${item.reps?` · ${item.reps} reps`:''}`;
      return `<div class="moveup-summary-row ${item.status==='skipped'?'skipped':''}"><span class="moveup-summary-name">${item.name}</span><span class="moveup-summary-intensity">${detail}</span><strong>${item.status==='skipped'?'0':`~${formatKcal(item.kcal)}`} kcal</strong></div>`;
    }).join('');
    summary.innerHTML=`
      <div class="moveup-summary-head">
        <div><span>Calorias estimadas</span><strong>~${formatKcal(session.totalKcal)} kcal</strong></div>
        <small>Estimativa baseada em peso, duração, intensidade e, quando aplicável, número de repetições.</small>
      </div>
      <div class="moveup-summary-list">${rows}</div>`;
    complete.insertBefore(summary,actions);
  }

  function currentRatingExercise(){
    if(phase!=='rest')return null;
    if(finalRatingRest)return EXERCISES[current]?.name||null;
    return EXERCISES[current-1]?.name||null;
  }

  const originalRenderWorkout=renderWorkout;
  renderWorkout=function(rem){
    if(phase==='countdown'&&current===0&&sessionStartedAt!==observedSessionStartedAt){
      observedSessionStartedAt=sessionStartedAt;
      beginSession();
    }
    originalRenderWorkout(rem);
    if(phase==='rest'){
      const ratingName=currentRatingExercise();
      if(finalRatingRest){
        $('phaseLabel').textContent='Descanso final';
        $('metaValue').textContent='Registre o último exercício';
      }
      if(ratingName)showRatingPanel(ratingName);
    }else{
      hideRatingPanel();
    }
  };

  const originalAdvancePhase=advancePhase;
  advancePhase=function(previousDeadline){
    if(phase==='exercise'){
      const name=EXERCISES[current]?.name;
      if(name){
        const record=exerciseRecord(name);
        setPerformed(name,record?.intensity||'moderate',record?.reps||REP_TARGETS[name]||null);
      }
      if(current===EXERCISES.length-1){
        finalRatingRest=true;
        lastBeepSecond=null;
        phase='rest';
        phaseDuration=REST;
        deadline=previousDeadline+REST*1000;
        transitionBeep();
        return;
      }
    }else if(phase==='rest'&&finalRatingRest){
      finalRatingRest=false;
      finishRoutine();
      return;
    }
    originalAdvancePhase(previousDeadline);
  };

  const originalFinishRoutine=finishRoutine;
  finishRoutine=function(){
    saveSession();
    originalFinishRoutine();
    setTimeout(renderCompleteSummary,0);
  };

  function wrapJumpWhenReady(){
    if(typeof window.moveupJumpExercise!=='function'){
      setTimeout(wrapJumpWhenReady,50);
      return;
    }
    if(window.moveupJumpExercise.__moveupTrackingWrapped)return;
    const originalJump=window.moveupJumpExercise;
    const wrapped=function(delta){
      const d=Number(delta)||0;
      if(!d)return;
      ensureSession();

      if(d>0&&current===EXERCISES.length-1){
        if(phase==='exercise'||phase==='countdown'||phase==='paused'){
          setSkipped(EXERCISES[current].name);
        }
        finalRatingRest=false;
        hideRatingPanel();
        clearInterval(timerId);
        finishRoutine();
        return;
      }

      if(d>0){
        const name=EXERCISES[current]?.name;
        if(name)setSkipped(name);
      }else if(d<0){
        const target=Math.max(0,current-1);
        const name=EXERCISES[target]?.name;
        if(name)clearExercise(name);
      }
      finalRatingRest=false;
      hideRatingPanel();
      return originalJump(delta);
    };
    wrapped.__moveupTrackingWrapped=true;
    window.moveupJumpExercise=wrapped;
  }

  wrapJumpWhenReady();
})();
