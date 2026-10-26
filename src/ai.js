/* =====================================================================
   캠테리어 AI 세팅 추천 (1단계: 장비 글 → 자동 배치)
   - 사용자가 적은 장비를 AI(Gemini, Cloudflare 중계)가 카탈로그 id로 바꿔줌
   - 실제 자리 잡기는 여기 코드가 함 (텐트 안·이너룸·출입구·겹침 검사)
   - AI가 막히면(무료 한도 등) 이름 맞추기로 바로 배치
   ===================================================================== */
const AI_URL='https://camterior-ai.ghdwnd2.workers.dev';
const AI_ROOTS=['reg3','long4','sep2','sep3','sep4'];
const AI_MAX_EACH=6,AI_MAX_TOTAL=24;
const aiTentName=id=>{const T=TENTS[id];return ((T.brand?T.brand+' ':'')+T.name).trim();};
const aiIds=()=>AI_ROOTS.concat(GEAR_ORDER).filter(id=>CATALOG[id]);
const aiEsc=s=>String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function aiZone(id){const c=CATALOG[id];
  if(c.sleep||c.gtype==='mat'||c.gtype==='cot')return 'inner';
  if(c.kind==='frame'||['shelf','box'].includes(c.gtype)||c.group==='알루미늄 박스'||id==='sp_kitchen')return 'wall';
  return 'center';}

function aiSystem(){
  const tents=TENT_ORDER.filter(id=>id!=='none').map(id=>`${id}|${aiTentName(id)}`).join('\n');
  const gear=aiIds().map(id=>`${id}|${CATALOG[id].name}|${CATALOG[id].group}`).join('\n');
  return `너는 캠핑 텐트 안 배치 도우미야. 사용자가 가진 장비 글을 읽고 아래 목록의 id로만 바꿔.
JSON만 출력: {"tent":"텐트 id 또는 null","items":[{"type":"장비 id","count":1}],"unknown":["목록에 없는 장비"],"tip":"배치 팁 한두 문장(한국어, 존댓말)"}
규칙: 수량이 없으면 1. 비슷한 이름은 가장 가까운 id로(예: IGT 롱=long4, 체어원=hx_one). 목록에 없으면 unknown에 원래 이름 그대로. 텐트를 말하지 않으면 null. 같은 id는 한 번만 쓰고 count로 합쳐.
[텐트]
${tents}
[장비]
${gear}`;}

/* --- AI 없이: 이름 맞추기 --- */
const aiNorm=s=>String(s).toLowerCase().replace(/[\s·×x\-_,./()]+/g,'');
function aiLocal(text){
  let t=aiNorm(text.replace(/[x×*]\s*(\d)/gi,'$1'));
  const res={tent:null,items:[],unknown:[],tip:''};
  const tents=TENT_ORDER.filter(id=>id!=='none').flatMap(id=>[[id,aiNorm(TENTS[id].name)],[id,aiNorm(TENTS[id].model||'')]]).filter(x=>x[1].length>=3).sort((a,b)=>b[1].length-a[1].length);
  for(const [id,n] of tents){if(t.includes(n)){res.tent=id;t=t.replace(n,'#');break;}}
  // 이름 일부로도 찾기: '토요토미 옴니 230' → '옴니 230', '엑스페드 메가매트 듀오 10 LW+' → '메가매트 듀오'
  const own={},map={};
  aiIds().forEach(id=>{const w=CATALOG[id].name.split(/\s+/);own[aiNorm(CATALOG[id].name)]=id;
    const ks=new Set([aiNorm(CATALOG[id].model||'')]);
    for(let a=0;a<Math.min(2,w.length);a++)for(let b=w.length;b>a;b--)ks.add(aiNorm(w.slice(a,b).join(' ')));
    ks.forEach(k=>{if(k.length<3)return;(map[k]=map[k]||new Set()).add(id);});});
  const keys=Object.entries(map).map(([k,s])=>own[k]?[own[k],k]:s.size===1?[[...s][0],k]:null).filter(Boolean).sort((a,b)=>b[1].length-a[1].length);
  const cnt={};
  for(const [id,n] of keys){let i;while((i=t.indexOf(n))>=0){const m=t.slice(i+n.length).match(/^(\d+)(개|장|대|ea)?/);const k=m?Math.max(1,+m[1]):1;
    cnt[id]=(cnt[id]||0)+k;t=t.slice(0,i)+'#'+t.slice(i+n.length+(m?m[0].length:0));}}
  res.items=Object.entries(cnt).map(([type,count])=>({type,count}));return res;}

/* --- AI 호출 --- */
async function aiAsk(text){
  const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),20000);
  try{const r=await fetch(AI_URL,{method:'POST',headers:{'Content-Type':'application/json'},signal:ctl.signal,
      body:JSON.stringify({system:aiSystem(),prompt:'내 장비: '+text})});
    const d=await r.json().catch(()=>({}));if(!r.ok||!d.text)return {fail:d.error==='limit'?'limit':'error'};
    const o=JSON.parse(d.text.replace(/^```(json)?|```$/g,'').trim());return {ok:o};}
  catch(e){return {fail:'error'};}finally{clearTimeout(to);}}

function aiClean(o){const ids=new Set(aiIds()),out={tent:null,items:[],unknown:[],tip:''};
  if(o&&typeof o.tent==='string'&&TENTS[o.tent]&&o.tent!=='none')out.tent=o.tent;
  const cnt={};(Array.isArray(o&&o.items)?o.items:[]).forEach(it=>{if(!it||!ids.has(it.type))return;
    cnt[it.type]=Math.min(AI_MAX_EACH,(cnt[it.type]||0)+Math.max(1,Math.round(+it.count||1)));});
  out.items=Object.entries(cnt).map(([type,count])=>({type,count}));
  out.unknown=(Array.isArray(o&&o.unknown)?o.unknown:[]).filter(x=>typeof x==='string').slice(0,8).map(x=>x.slice(0,40));
  out.tip=typeof (o&&o.tip)==='string'?o.tip.slice(0,200):'';return out;}

/* --- 자리 잡기 --- */
function aiVerts(type,rot,P){const c=CATALOG[type],ce=centroid(c.verts),th=rot*Math.PI/180,co=Math.cos(th),si=Math.sin(th);
  return c.verts.map(v=>{const x=v[0]-ce[0],y=v[1]-ce[1];return [P[0]+co*x-si*y,P[1]+si*x+co*y];});}
function aiEdgeDist(p,poly){let m=Infinity;for(let k=0;k<poly.length;k++)m=Math.min(m,segDist(p,poly[k],poly[(k+1)%poly.length]));return m;}
function aiRegion(){const T=TENTS[tent.id];const a=allowedPolys(T);if(a.length)return {polys:a,wall:T.outer,center:T.living};
  if(TW)return {polys:[TW.fabric],wall:TW.fabric,center:centroid(TW.fabric)};
  const r=[[-2000,-1500],[2000,-1500],[2000,1500],[-2000,1500]];return {polys:[r],wall:r,center:[0,0]};}

function aiPlace(list){
  const R=aiRegion(),inner=tentInner(),ip=inner?inner.poly:null,doors=doorZones().map(z=>z.poly);
  const bb=bbox(R.polys.flat()),placed=[],out=[],miss=[];
  const area=t=>polyArea(CATALOG[t].verts),rank={inner:0,wall:1,center:2};
  const queue=list.slice().sort((a,b)=>rank[a.zone]-rank[b.zone]||area(b.type)-area(a.type));
  const STEP=100;
  for(const it of queue){const c=CATALOG[it.type],heat=!!c.heat,gapO=heat?700:60,gapW=heat?600:40;let best=null;
    for(const rot of [0,90])for(let x=bb[0][0];x<=bb[1][0];x+=STEP)for(let y=bb[0][1];y<=bb[1][1];y+=STEP){
      const V=aiVerts(it.type,rot,[x,y]);
      if(!V.every(v=>R.polys.some(pl=>pointInPoly(v,pl))))continue;
      if(it.zone==='inner'&&ip){if(!V.every(v=>pointInPoly(v,ip)))continue;}
      else if(ip&&(satPen(V,ip)>3||V.some(v=>pointInPoly(v,ip))))continue;
      if(doors.some(d=>satPen(V,d)>3))continue;
      if(polyGap(V,R.wall)<gapW)continue;
      if(placed.some(q=>satPen(V,q.v)>3||polyGap(V,q.v)<Math.max(gapO,q.heat?700:60)))continue;
      const ce=centroid(V);let s;
      if(it.zone==='wall')s=V.reduce((a,v)=>a+aiEdgeDist(v,R.wall),0)/V.length;
      else if(it.zone==='inner'&&ip)s=V.reduce((a,v)=>a+aiEdgeDist(v,ip),0)/V.length;
      else s=dist(ce,R.center)+(heat?-Math.min(...placed.map(q=>dist(ce,centroid(q.v))),1500)*.3:0);
      if(!best||s<best.s)best={s,rot,P:[x,y],V};}
    if(best){placed.push({v:best.V,heat});out.push({type:it.type,rot:best.rot,P:best.P});}else miss.push(it.type);}
  // 자리가 없는 장비는 바깥 오른쪽에 줄 세움
  let mx=bb[1][0]+700,my=bb[0][1];
  miss.forEach(t=>{const b=bbox(CATALOG[t].verts),w=b[1][0]-b[0][0],h=b[1][1]-b[0][1];out.push({type:t,rot:0,P:[mx+w/2,my+h/2]});my+=h+150;});
  return {out,miss};}

function aiApply(res){
  if(res.tent&&res.tent!==tent.id){const T=TENTS[res.tent];tent={id:res.tent,inner:T.innerDefault,canopy:false,custom:tent.custom};
    if(tarp.id)placeTarpDefault();renderTentList();renderTentOpts();}
  TW=tarpWorld();
  const list=[];res.items.forEach(it=>{for(let k=0;k<it.count&&list.length<AI_MAX_TOTAL;k++)list.push({type:it.type,zone:aiZone(it.type)});});
  const {out,miss}=aiPlace(list);
  state.pieces=[];sel=null;
  out.forEach(o=>{const c=centroid(CATALOG[o.type].verts);const p=newPiece(o.type,{ox:o.P[0]-c[0],oy:o.P[1]-c[1],rot:o.rot,z:++Z_TOP});
    if(CATALOG[o.type].kind!=='gear')p.leg=660;state.pieces.push(p);});
  fitView();render();return miss;}

/* --- 화면 --- */
async function aiRun(){
  const inp=document.getElementById('aiIn'),btn=document.getElementById('aiGo'),st=document.getElementById('aiSt'),box=document.getElementById('aiOut');
  const text=(inp.value||'').trim().slice(0,600);
  if(text.length<2){st.textContent='가진 장비를 먼저 적어주세요';inp.focus();return;}
  if(state.pieces.length&&!confirm('지금 놓인 장비를 지우고 AI 세팅으로 바꿀까요? 되돌리기(↶)로 돌아갈 수 있어요.'))return;
  btn.disabled=true;st.textContent='AI가 장비를 찾는 중…';box.hidden=true;
  let r=await aiAsk(text),res,via='ai';
  if(r.ok){res=aiClean(r.ok);if(!res.items.length&&!res.tent){const l=aiLocal(text);if(l.items.length){res=l;via='local';}}}
  else{res=aiLocal(text);via=r.fail==='limit'?'limit':'local';}
  btn.disabled=false;
  if(!res.items.length&&!res.tent){st.textContent='';box.hidden=false;
    box.innerHTML=`<p class="ai-warn">목록에서 맞는 장비를 못 찾았어요. ‘장비 제원’ 탭의 이름으로 적어보세요 (예: 폴딩쉘프, IGT 롱, 체어원).</p>`;return;}
  const miss=aiApply(res);
  st.textContent=via==='ai'?'세팅했어요. 끌어서 다듬어 보세요':'기본 자동 배치로 세팅했어요';
  const nm=id=>aiEsc(CATALOG[id].name);
  let h='';
  if(via!=='ai')h+=`<p class="ai-note">${via==='limit'?'오늘 AI 사용량이 많아서':'AI 연결이 안 돼서'} 이름이 같은 장비만 찾아 놓았어요.</p>`;
  h+=`<ul class="ai-got">${res.tent?`<li class="ai-tent">⛺ ${aiEsc(aiTentName(res.tent))}</li>`:''}${res.items.map(it=>`<li>${nm(it.type)}${it.count>1?` <b>×${it.count}</b>`:''}</li>`).join('')}</ul>`;
  if(miss.length)h+=`<p class="ai-warn">자리가 모자라 텐트 밖 오른쪽에 둔 장비: ${[...new Set(miss)].map(nm).join(', ')}</p>`;
  if(res.unknown.length)h+=`<p class="ai-warn">목록에 아직 없어서 빼둔 장비: ${res.unknown.map(aiEsc).join(', ')}</p>`;
  if(res.tip)h+=`<p class="ai-tip">💡 ${aiEsc(res.tip)}</p>`;
  box.innerHTML=h;box.hidden=false;
  const b=document.getElementById('board');if(b&&b.scrollIntoView&&innerWidth<900)setTimeout(()=>b.scrollIntoView({behavior:'smooth',block:'start'}),400);}
