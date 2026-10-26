/* =====================================================================
   캠테리어 AI 세팅 추천 (1단계: 장비 글 → 자동 배치)
   - 사용자가 적은 장비·위치 설명을 AI(Gemini, Cloudflare 중계)가 카탈로그 id로 바꿔줌
   - 실제 자리 잡기는 여기 코드가 함 (텐트 안·이너룸·출입구·겹침 검사, IGT에 멀티펑션 결합)
   - AI가 막히면(무료 한도 등) 이름 맞추기로 바로 배치
   ===================================================================== */
const AI_URL='https://camterior-ai.ghdwnd2.workers.dev';
const AI_ROOTS=['reg3','long4','sep2','sep3','sep4'];
const AI_EXTS=['mf_reg','mf_long','open_L','open_R','corner_L','corner_R','slide_h','slide_hl'];
const AI_SLOTS=SLOT_ITEMS.map(t=>t.id);
const aiSlotName=id=>getItem(id).name;
const AI_ZONES=['wall','center','inner','left','right','top','bottom'];
const AI_MAX_EACH=6,AI_MAX_TOTAL=24;
// 사람들이 흔히 부르는 이름 (AI 안내 + 이름 맞추기 둘 다 씀)
const AI_ALIAS={reg3:['IGT 3유닛','IGT 프레임 3유닛','아이지티 3유닛'],long4:['IGT 롱','IGT 4유닛','IGT 프레임 롱'],
  sep2:['세퍼레이트 2유닛','세퍼레이트 하프'],sep3:['세퍼레이트 3유닛','세퍼레이트 레귤러','세퍼레이트 IGT'],sep4:['세퍼레이트 4유닛','세퍼레이트 롱'],
  mf_reg:['멀티펑션','멀티펑션 테이블'],slide_h:['하프슬라이드','슬라이드하프','슬라이드 트레이'],slide_hl:['하프슬라이드 롱','슬라이드하프롱'],
  mytable_s:['스텐 마이테이블','스탠 마이테이블','스텐마이테이블','스탠마이테이블','스테인리스 마이테이블'],
  flat:['플랫버너'],seppou:['설봉','그릴버너'],steel1:['원유닛 트레이','1유닛 트레이','스텐트레이','스텐 트레이','스탠트레이'],lid_half:['리드트레이'],box_half:['스텐박스'],
  wood_s:['우드테이블 S','우드 S'],wood_w:['우드테이블 W','우드 W'],mesh_d1:['메쉬트레이 딥'],mesh_s1:['메쉬트레이'],mf_long:['멀티펑션 롱','멀티펑션롱'],open_L:['오픈멀티펑션 L'],open_R:['오픈멀티펑션 R'],corner_L:['코너테이블 L'],corner_R:['코너테이블 R'],
  sp_fd:['FD체어','에프디체어'],hx_one:['체어원'],omni230:['옴니','옴니230'],camp5000:['파세코 팬히터','캠프5000','파세코'],
  megamat_duo:['메가매트 듀오'],megamat:['메가매트'],cot_one:['코트원'],sp_oat_low:['원액션 로우'],sp_oat:['원액션테이블'],
  merak_pro:['메락'],landlock:['랜드락'],living_shell_long_pro:['리빙쉘 롱 프로','리빙쉘롱'],living_shell:['리빙쉘']};
const aiTentName=id=>{const T=TENTS[id];return ((T.brand?T.brand+' ':'')+T.name).trim();};
const aiIds=()=>AI_ROOTS.concat(GEAR_ORDER).filter(id=>CATALOG[id]);
const aiEsc=s=>String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const aiAl=id=>AI_ALIAS[id]?' (='+AI_ALIAS[id].join(', ')+')':'';

function aiZone(id){const c=CATALOG[id];
  if(c.sleep||c.gtype==='mat'||c.gtype==='cot')return 'inner';
  if(c.kind==='frame'||['shelf','box'].includes(c.gtype)||c.group==='알루미늄 박스'||id==='sp_kitchen')return 'wall';
  return 'center';}

function aiSystem(){
  const tents=TENT_ORDER.filter(id=>id!=='none').map(id=>`${id}|${aiTentName(id)}${aiAl(id)}`).join('\n');
  const gear=aiIds().map(id=>`${id}|${CATALOG[id].name}|${CATALOG[id].group}${aiAl(id)}`).join('\n');
  const ext=AI_EXTS.map(id=>`${id}|${CATALOG[id].name}${aiAl(id)}`).join('\n');
  const slots=SLOT_ITEMS.map(t=>`${t.id}|${t.name}|${t.halves/2}유닛${aiAl(t.id)}`).join('\n');
  return `너는 캠핑 텐트 안 배치 도우미야. 사용자 글에서 장비와 원하는 위치를 읽고 아래 목록의 id로만 바꿔.
JSON만 출력: {"tent":"텐트 id 또는 null","items":[{"type":"장비 id","count":1,"zone":"wall|center|inner|left|right|top|bottom","attach":[{"type":"결합 id","shape":"T|line"}],"slots":[{"id":"칸 파츠 id","count":1}],"leg":660}],"unknown":["목록에 없는 장비"],"tip":"배치 팁 한두 문장(한국어, 존댓말)"}
규칙:
- 사용자 글에 없는 장비는 절대 추가하지 마. 띄어쓰기·오타가 있어도 (=별칭)을 보고 맞춰 (예: 스탠마이테이블=mytable_s).
- 수량이 없으면 1. 같은 id는 count로 합쳐. 목록에 없으면 unknown에 원래 이름 그대로.
- zone: 사용자가 말한 위치를 따름. 가운데/중앙=center, 벽쪽=wall, 오른쪽(끝)=right, 왼쪽=left, 위쪽/뒤쪽=top, 아래쪽/앞쪽=bottom, 이너룸/침실=inner. 말이 없으면 매트·코트=inner, IGT·선반·박스=wall, 체어·테이블·난로=center.
- [결합] 목록의 멀티펑션·코너·오픈멀티펑션은 혼자 두지 말고 IGT 프레임 항목의 attach에 넣어. "T자/T모양"이면 shape "T", 일자/옆으로 이으면 "line". IGT를 말하지 않았으면 reg3을 하나 만들어 붙여.
- [IGT 칸] 목록(버너·트레이·상판·수납)은 장비가 아니라 IGT 프레임 칸에 끼우는 파츠라 IGT 항목의 slots에 넣어. 슬라이드 트레이는 attach(shape line).
- leg: IGT 다리 높이(300/400/660/830)를 말하면 IGT 항목에 넣어. 없으면 생략.
- 텐트를 말하지 않으면 null.
[텐트]
${tents}
[장비]
${gear}
[결합]
${ext}
[IGT 칸]
${slots}`;}

/* --- AI 없이: 이름 맞추기 --- */
const aiNorm=s=>String(s).toLowerCase().replace(/[\s·×x\-_,./()]+/g,'');
function aiKeys(ids,nameOf,modelOf){const own={},map={};
  ids.forEach(id=>{const nm=nameOf(id),w=nm.split(/\s+/);own[aiNorm(nm)]=id;
    const ks=new Set([aiNorm(modelOf(id)||'')]);(AI_ALIAS[id]||[]).forEach(a=>{const k=aiNorm(a);own[k]=id;ks.add(k);});
    for(let a=0;a<Math.min(2,w.length);a++)for(let b=w.length;b>a;b--)ks.add(aiNorm(w.slice(a,b).join(' ')));
    ks.forEach(k=>{if(k.length<2)return;(map[k]=map[k]||new Set()).add(id);});});
  return Object.entries(map).map(([k,s])=>own[k]?[own[k],k]:s.size===1?[[...s][0],k]:null).filter(Boolean).sort((a,b)=>b[1].length-a[1].length);}
function aiLocal(text){
  let t=aiNorm(text.replace(/[x×*]\s*(\d)/gi,'$1'));
  const res={tent:null,items:[],unknown:[],tip:''};
  const tid=TENT_ORDER.filter(id=>id!=='none');
  for(const [id,n] of aiKeys(tid,id=>TENTS[id].name,id=>TENTS[id].model)){if(n.length>=2&&t.includes(n)){res.tent=id;t=t.replace(n,'#');break;}}
  const cnt={},ext=[],pos={};
  const slotCnt={};
  for(const [id,n] of aiKeys(aiIds().concat(AI_EXTS,AI_SLOTS),id=>CATALOG[id]?CATALOG[id].name:aiSlotName(id),id=>CATALOG[id]?CATALOG[id].model:getItem(id).model)){let i;
    while((i=t.indexOf(n))>=0){const m=t.slice(i+n.length).match(/^(\d+)(개|장|대|ea)?/);const k=m?Math.max(1,+m[1]):1;
      if(pos[id]==null)pos[id]=i;t=t.slice(0,i)+'#'.repeat(n.length)+t.slice(i+n.length+(m?m[0].length:0));
      if(AI_SLOTS.includes(id))slotCnt[id]=(slotCnt[id]||0)+k;else if(AI_EXTS.includes(id)){for(let q=0;q<k;q++)ext.push(id);}else cnt[id]=(cnt[id]||0)+k;}}
  // 위치 말: 장비 이름 바로 앞뒤 12자 안의 방향어
  const raw=aiNorm(text),zoneOf=id=>{const i=pos[id];if(i==null)return null;const near=raw.slice(Math.max(0,i-12),i+20);
    return /오른쪽/.test(near)?'right':/왼쪽/.test(near)?'left':/(중앙|가운데)/.test(near)?'center':/벽/.test(near)?'wall':null;};
  const tshape=/t(모양|자)/.test(raw)?'T':'line',legM=raw.match(/(300|400|660|830)/);
  res.items=Object.entries(cnt).map(([type,count])=>({type,count,zone:zoneOf(type)}));
  if(ext.length||Object.keys(slotCnt).length){let f=res.items.find(it=>AI_ROOTS.includes(it.type));if(!f){f={type:'reg3',count:1};res.items.unshift(f);}
    f.attach=ext.map(type=>({type,shape:CATALOG[type].kind==='tray'?'line':tshape}));if(!f.zone&&ext.length)f.zone=zoneOf(ext[0]);
    f.slots=Object.entries(slotCnt).map(([id,count])=>({id,count}));}
  if(legM)res.items.filter(it=>AI_ROOTS.includes(it.type)).forEach(it=>it.leg=+legM[1]);
  return res;}

/* --- AI 호출 --- */
async function aiAsk(text){
  const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),25000);
  try{const r=await fetch(AI_URL,{method:'POST',headers:{'Content-Type':'application/json'},signal:ctl.signal,
      body:JSON.stringify({system:aiSystem(),prompt:'내 장비: '+text})});
    const d=await r.json().catch(()=>({}));if(!r.ok||!d.text)return {fail:d.error==='limit'?'limit':'error'};
    const o=JSON.parse(d.text.replace(/^```(json)?|```$/g,'').trim());return {ok:o};}
  catch(e){return {fail:'error'};}finally{clearTimeout(to);}}

function aiClean(o){const ids=new Set(aiIds()),exts=new Set(AI_EXTS),out={tent:null,items:[],unknown:[],tip:''};
  if(o&&typeof o.tent==='string'&&TENTS[o.tent]&&o.tent!=='none')out.tent=o.tent;
  const items=[],loose=[],looseS=[];
  (Array.isArray(o&&o.items)?o.items:[]).forEach(it=>{if(!it)return;
    if(exts.has(it.type)){for(let q=0;q<Math.min(4,Math.max(1,+it.count||1));q++)loose.push({type:it.type,shape:'line'});return;}
    if(AI_SLOTS.includes(it.type)||AI_SLOTS.includes(it.id)){looseS.push({id:it.type||it.id,count:Math.min(8,Math.max(1,+it.count||1))});return;}
    if(!ids.has(it.type))return;
    const x={type:it.type,count:Math.min(AI_MAX_EACH,Math.max(1,Math.round(+it.count||1))),zone:AI_ZONES.includes(it.zone)?it.zone:null};
    if(AI_ROOTS.includes(it.type)){x.attach=(Array.isArray(it.attach)?it.attach:[]).filter(a=>a&&exts.has(a.type)).slice(0,6).map(a=>({type:a.type,shape:a.shape==='T'?'T':'line'}));
      if([300,400,660,830].includes(+it.leg))x.leg=+it.leg;
      x.slots=(Array.isArray(it.slots)?it.slots:[]).filter(a=>a&&AI_SLOTS.includes(a.id)).slice(0,8).map(a=>({id:a.id,count:Math.min(8,Math.max(1,Math.round(+a.count||1)))}));}
    const same=items.find(y=>y.type===x.type&&!x.attach?.length&&!y.attach?.length&&y.zone===x.zone);
    if(same)same.count=Math.min(AI_MAX_EACH,same.count+x.count);else items.push(x);});
  if(loose.length||looseS.length){let f=items.find(i=>AI_ROOTS.includes(i.type));if(!f){f={type:'reg3',count:1,zone:null,attach:[],slots:[]};items.unshift(f);}
    f.attach=(f.attach||[]).concat(loose).slice(0,6);f.slots=(f.slots||[]).concat(looseS);}
  out.items=items;
  out.unknown=(Array.isArray(o&&o.unknown)?o.unknown:[]).filter(x=>typeof x==='string').slice(0,8).map(x=>x.slice(0,40));
  out.tip=typeof (o&&o.tip)==='string'?o.tip.slice(0,200):'';return out;}

/* --- 조립: IGT + 결합 파츠를 한 덩어리로 --- */
function aiBuild(it){
  const c=CATALOG[it.type],ce=centroid(c.verts),root=newPiece(it.type,{ox:-ce[0],oy:-ce[1],rot:0,z:0});
  if(c.kind!=='gear')root.leg=it.leg||660;
  const set=[root],keep=state.pieces,over=[];state.pieces=set;
  if(root.slots)(it.slots||[]).forEach(sl=>{const t=getItem(sl.id);for(let q=0;q<sl.count;q++){let i=-1;
      for(let k=0;k<root.slots.length;k++)if(freeRun(root.slots,k)>=t.halves){i=k;break;}
      if(i<0){over.push(sl.id);continue;}for(let k=0;k<t.halves;k++)root.slots[i+k]={id:sl.id,head:k===0};}});
  try{const clash=q=>{computeAll();return set.some(o=>o!==q&&o.uid!==q.parent&&satPen(o._v,q._v)>3);};
    (it.attach||[]).forEach(a=>{const ac=CATALOG[a.type],tray=ac.kind==='tray';
      const longs=c.edges.filter(e=>e.long),shorts=c.edges.filter(e=>!e.long);
      // 빈 긴 변을 먼저: 트레이는 다른 결합이 없는 변, 멀티펑션은 아무것도 없는 변
      const busy=e=>edgeKids(root,e.name).filter(k=>tray?CATALOG[k.type].kind!=='tray':true).length;
      const tries=(a.shape==='T'?longs:longs.concat(shorts)).slice().sort((x,y)=>busy(x)-busy(y));
      for(const pe of tries){if(!canTake(root,pe,a.type))continue;
        const ok=ac.edges.filter(ce2=>mateKind(pe.types,ce2.types));if(!ok.length)continue;
        const len=e=>{const v=ac.verts;return dist(v[e.i],v[e.j]);};
        ok.sort((x,y)=>a.shape==='T'?len(x)-len(y):len(y)-len(x));
        let m=ok[0].name;if(a.shape!=='T'&&ok.some(e=>e.name===OPP[pe.name]))m=OPP[pe.name];
        const q=newPiece(a.type,{parent:root.uid,pEdge:pe.name,mEdge:m});set.push(q);if(pe.long)distributeLong(root,pe.name);
        if(!clash(q))return;set.pop();if(pe.long)distributeLong(root,pe.name);}
      over.push(a.type);});
    computeAll();}
  finally{state.pieces=keep;}
  return {pieces:set,polys:set.map(p=>p._v.map(v=>v.slice())),heat:!!c.heat,over};}

/* --- 자리 잡기 --- */
function aiRotPolys(polys,rot,P){const th=rot*Math.PI/180,co=Math.cos(th),si=Math.sin(th);
  return polys.map(pl=>pl.map(v=>[P[0]+co*v[0]-si*v[1],P[1]+si*v[0]+co*v[1]]));}
function aiEdgeDist(p,poly){let m=Infinity;for(let k=0;k<poly.length;k++)m=Math.min(m,segDist(p,poly[k],poly[(k+1)%poly.length]));return m;}
function aiRegion(){const T=TENTS[tent.id];const a=allowedPolys(T);if(a.length)return {polys:a,wall:T.outer,center:T.living};
  if(TW)return {polys:[TW.fabric],wall:TW.fabric,center:centroid(TW.fabric)};
  const r=[[-2000,-1500],[2000,-1500],[2000,1500],[-2000,1500]];return {polys:[r],wall:r,center:[0,0]};}

function aiPlace(list){
  const R=aiRegion(),inner=tentInner(),ip=inner?inner.poly:null,doors=doorZones().map(z=>z.poly);
  const bb=bbox(R.polys.flat()),placed=[],out=[],miss=[];
  const rank={inner:0,wall:1,left:2,right:2,top:2,bottom:2,center:3};
  const area=x=>x.polys.reduce((s,pl)=>s+polyArea(pl),0);
  const queue=list.slice().sort((a,b)=>rank[a.zone]-rank[b.zone]||area(b)-area(a));
  const STEP=100;
  for(const it of queue){const heat=it.heat,gapO=heat?700:60,gapW=heat?600:40;let best=null;
    for(const rot of [0,90,180,270])for(let x=bb[0][0];x<=bb[1][0];x+=STEP)for(let y=bb[0][1];y<=bb[1][1];y+=STEP){
      const PS=aiRotPolys(it.polys,rot,[x,y]),V=PS.flat();
      if(!V.every(v=>R.polys.some(pl=>pointInPoly(v,pl))))continue;
      if(it.zone==='inner'&&ip){if(!V.every(v=>pointInPoly(v,ip)))continue;}
      else if(ip&&PS.some(pl=>satPen(pl,ip)>3||pl.some(v=>pointInPoly(v,ip))))continue;
      if(PS.some(pl=>doors.some(d=>satPen(pl,d)>3)))continue;
      if(PS.some(pl=>polyGap(pl,R.wall)<gapW))continue;
      if(placed.some(q=>PS.some(pl=>q.polys.some(qp=>satPen(pl,qp)>3||polyGap(pl,qp)<Math.max(gapO,q.heat?700:60)))))continue;
      const b=bbox(V),ce=[(b[0][0]+b[1][0])/2,(b[0][1]+b[1][1])/2];let s;
      if(it.zone==='wall')s=V.reduce((a,v)=>a+aiEdgeDist(v,R.wall),0)/V.length;
      else if(it.zone==='inner'&&ip)s=V.reduce((a,v)=>a+aiEdgeDist(v,ip),0)/V.length;
      else if(it.zone==='right')s=(bb[1][0]-b[1][0])*3+Math.abs(ce[1]-R.center[1]);
      else if(it.zone==='left')s=(b[0][0]-bb[0][0])*3+Math.abs(ce[1]-R.center[1]);
      else if(it.zone==='top')s=(b[0][1]-bb[0][1])*3+Math.abs(ce[0]-R.center[0]);
      else if(it.zone==='bottom')s=(bb[1][1]-b[1][1])*3+Math.abs(ce[0]-R.center[0]);
      else s=dist(ce,R.center)+(heat&&placed.length?-Math.min(...placed.map(q=>dist(ce,centroid(q.polys.flat()))),1500)*.3:0);
      s+=rot%180?1:0; // 같은 점수면 돌리지 않은 쪽
      if(!best||s<best.s)best={s,rot,P:[x,y],PS};}
    if(best){placed.push({polys:best.PS,heat});out.push({it,rot:best.rot,P:best.P});}else miss.push(it);}
  let mx=bb[1][0]+700,my=bb[0][1];
  miss.forEach(it=>{const b=bbox(it.polys.flat()),w=b[1][0]-b[0][0],h=b[1][1]-b[0][1];out.push({it,rot:0,P:[mx-b[0][0],my-b[0][1]]});my+=h+150;});
  return {out,miss:miss.map(m=>m.type)};}

function aiApply(res){
  if(res.tent&&res.tent!==tent.id){const T=TENTS[res.tent];tent={id:res.tent,inner:T.innerDefault,canopy:false,custom:tent.custom};
    if(tarp.id)placeTarpDefault();renderTentList();renderTentOpts();}
  TW=tarpWorld();
  const list=[];res.items.forEach(it=>{for(let k=0;k<it.count&&list.length<AI_MAX_TOTAL;k++){
    const b=aiBuild(it);list.push({type:it.type,zone:it.zone||aiZone(it.type),...b});}});
  const {out,miss}=aiPlace(list);aiApply.over=list.flatMap(x=>x.over||[]);
  state.pieces=[];sel=null;
  out.forEach(({it,rot,P})=>{const root=it.pieces[0],c=centroid(CATALOG[root.type].verts),map={};
    it.pieces.forEach(p=>{const q=newPiece(p.type,{parent:p.parent==null?null:map[p.parent],pEdge:p.pEdge,mEdge:p.mEdge,slide:p.slide});
      if(p.parent==null){q.ox=P[0]-c[0];q.oy=P[1]-c[1];q.rot=rot;q.z=++Z_TOP;if(p.leg)q.leg=p.leg;}
      if(p.slots)q.slots=p.slots.map(x=>x&&{...x});
      map[p.uid]=q.uid;state.pieces.push(q);});});
  fitView();render();return miss;}

/* --- 화면 --- */
async function aiRun(){
  const inp=document.getElementById('aiIn'),btn=document.getElementById('aiGo'),st=document.getElementById('aiSt'),box=document.getElementById('aiOut');
  const text=(inp.value||'').trim().slice(0,600);
  if(text.length<2){st.textContent='가진 장비를 먼저 적어주세요';inp.focus();return;}
  if(state.pieces.length&&!confirm('지금 놓인 장비를 지우고 AI 세팅으로 바꿀까요? 되돌리기(↶)로 돌아갈 수 있어요.'))return;
  btn.disabled=true;st.textContent='AI가 장비를 찾는 중…';box.hidden=true;
  let r=await aiAsk(text),res,via='ai';
  if(r.ok){res=aiClean(r.ok);
    // AI가 모른다고 한 이름도 별칭으로 한 번 더 찾아보기
    res.unknown=res.unknown.filter(u=>{const l=aiLocal(u);if(!l.items.length)return true;
      l.items.forEach(x=>{if(x.slots&&x.slots.length||x.attach&&x.attach.length){let f=res.items.find(i=>AI_ROOTS.includes(i.type));if(f){f.slots=(f.slots||[]).concat(x.slots||[]);f.attach=(f.attach||[]).concat(x.attach||[]);return;}}
        if(x.type==='reg3'&&(x.slots||x.attach))return;const same=res.items.find(i=>i.type===x.type);if(same)return;res.items.push({type:x.type,count:x.count,zone:null});});return false;});if(!res.items.length&&!res.tent){const l=aiLocal(text);if(l.items.length){res=l;via='local';}}}
  else{res=aiLocal(text);via=r.fail==='limit'?'limit':'local';}
  btn.disabled=false;
  if(!res.items.length&&!res.tent){st.textContent='';box.hidden=false;
    box.innerHTML=`<p class="ai-warn">목록에서 맞는 장비를 못 찾았어요. ‘장비 제원’ 탭의 이름으로 적어보세요 (예: 폴딩쉘프, IGT 롱, 체어원).</p>`;return;}
  const miss=aiApply(res);
  st.textContent=via==='ai'?'세팅했어요. 끌어서 다듬어 보세요':'기본 자동 배치로 세팅했어요';
  const nm=id=>aiEsc(CATALOG[id].name),ZN={center:'가운데',wall:'벽쪽',inner:'이너룸',left:'왼쪽',right:'오른쪽',top:'위쪽',bottom:'아래쪽'};
  let h='';
  if(via!=='ai')h+=`<p class="ai-note">${via==='limit'?'오늘 AI 사용량이 많아서':'AI 연결이 안 돼서'} 이름이 같은 장비만 찾아 놓았어요.</p>`;
  h+=`<ul class="ai-got">${res.tent?`<li class="ai-tent">⛺ ${aiEsc(aiTentName(res.tent))}</li>`:''}${res.items.map(it=>`<li>${nm(it.type)}${it.attach&&it.attach.length?' + '+Object.entries(it.attach.reduce((m,a)=>{const k=nm(a.type)+(a.shape==='T'?' (T자)':'');m[k]=(m[k]||0)+1;return m;},{})).map(([k,n])=>k+(n>1?' ×'+n:'')).join(' + '):''}${it.count>1?` <b>×${it.count}</b>`:''}${it.slots&&it.slots.length?' · 칸: '+it.slots.map(sl=>aiEsc(aiSlotName(sl.id))+(sl.count>1?' ×'+sl.count:'')).join(', '):''}${it.leg?` · ${it.leg}다리`:''}${it.zone&&it.zone!==aiZone(it.type)?` · ${ZN[it.zone]}`:''}</li>`).join('')}</ul>`;
  if(aiApply.over&&aiApply.over.length)h+=`<p class="ai-warn">자리가 모자라 IGT에 못 붙인 파츠: ${[...new Set(aiApply.over)].map(id=>aiEsc(CATALOG[id]?CATALOG[id].name:aiSlotName(id))).join(', ')}</p>`;
  if(miss.length)h+=`<p class="ai-warn">자리가 모자라 텐트 밖 오른쪽에 둔 장비: ${[...new Set(miss)].map(nm).join(', ')}</p>`;
  if(res.unknown.length)h+=`<p class="ai-warn">목록에 아직 없어서 빼둔 장비: ${res.unknown.map(aiEsc).join(', ')}</p>`;
  if(res.tip)h+=`<p class="ai-tip">💡 ${aiEsc(res.tip)}</p>`;
  box.innerHTML=h;box.hidden=false;
  const b=document.getElementById('board');if(b&&b.scrollIntoView&&innerWidth<900)setTimeout(()=>b.scrollIntoView({behavior:'smooth',block:'start'}),400);}
