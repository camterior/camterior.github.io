
/* =====================================================================
   내 장비: 가진 장비를 등록해 두고 (이 기기에 저장), 사진으로 AI가 장비를 찾아주고,
   등록한 장비로 바로 AI 세팅을 시작
   ===================================================================== */
const MYG_KEY='camMine';
let MYG={};try{MYG=JSON.parse(localStorage.getItem(MYG_KEY)||'{}')||{};}catch(e){MYG={};}
const mineSaveLocal=()=>{try{localStorage.setItem(MYG_KEY,JSON.stringify(MYG));}catch(e){}};
const mineSave=()=>{mineSaveLocal();if(typeof acctQueue==='function')acctQueue();};
// 장비 제원 탭과 같은 분류 + 따로 쓰는 이너텐트
function mineSecs(){const s=GSEC.map(x=>({k:x.k,t:x.t,ids:x.items().map(i=>i.id)}));
  s.splice(2,0,{k:'inner',t:'이너텐트',ids:Object.keys(INNER_PRESETS)});return s;}
function mineName(k,id){try{
  if(k==='tent')return aiTentName(id);if(k==='tarp')return '스노우피크 '+TARPS[id].name;
  if(k==='parts')return getItem(id).name;if(k==='inner')return INNER_PRESETS[id].name;return CATALOG[id].name;}catch(e){return id;}}
function mineModel(k,id){try{const o=k==='tent'?TENTS[id]:k==='tarp'?TARPS[id]:k==='parts'?getItem(id):k==='inner'?INNER_PRESETS[id]:CATALOG[id];return o.model||'';}catch(e){return '';}}
let MINE_ALL=null;const mineAll=()=>MINE_ALL||(MINE_ALL=mineSecs().flatMap(s=>s.ids.map(id=>({key:s.k+':'+id,k:s.k,id,sec:s.t,name:mineName(s.k,id),model:mineModel(s.k,id)}))));
const mineByKey=k=>mineAll().find(x=>x.key===k);
const mineCount=()=>Object.values(MYG).reduce((a,b)=>a+b,0);
function mineAdd(key,n){MYG[key]=Math.max(0,Math.min(20,(MYG[key]||0)+(n||1)));if(!MYG[key])delete MYG[key];mineSave();mineRender();if(document.getElementById('minePick'))minePickUI();}
function mineRender(){const box=document.getElementById('mineList');if(!box)return;
  const keys=Object.keys(MYG).filter(k=>mineByKey(k));document.getElementById('mineCnt').textContent=keys.length?`${keys.length}종 · ${mineCount()}개`:'';
  document.getElementById('mineUse').disabled=!keys.length;
  if(!keys.length){box.innerHTML='<p class="mn-empty">아직 등록한 장비가 없어요. 사진을 올리거나 이름으로 찾아서 넣어 보세요.</p>';return;}
  const by={};keys.forEach(k=>{const it=mineByKey(k);(by[it.sec]=by[it.sec]||[]).push(it);});
  box.innerHTML=mineSecs().filter(s=>by[s.t]).map(s=>`<section class="mn-sec"><h3>${aiEsc(s.t)} <small>${by[s.t].length}</small></h3><ul>${by[s.t].map(it=>`<li><span class="mn-n"><b>${aiEsc(it.name)}</b>${it.model?`<small>${aiEsc(it.model)}</small>`:''}</span>
    <span class="mn-q"><button type="button" aria-label="${aiEsc(it.name)} 하나 빼기" onclick="mineAdd('${it.key}',-1)">−</button><b>${MYG[it.key]}</b><button type="button" aria-label="${aiEsc(it.name)} 하나 더" onclick="mineAdd('${it.key}',1)">+</button></span></li>`).join('')}</ul></section>`).join('');}
// 이름으로 찾기
function mineSearch(){const q=aiNorm(document.getElementById('mineQ').value||''),out=document.getElementById('mineFind');
  if(q.length<2){out.innerHTML='';return;}
  const hit=mineAll().filter(x=>aiNorm(x.name+' '+x.model+' '+x.sec).includes(q)).slice(0,12);
  out.innerHTML=hit.length?hit.map(x=>`<li><span class="mn-n"><b>${aiEsc(x.name)}</b><small>${aiEsc(x.sec)}${x.model?' · '+aiEsc(x.model):''}</small></span><button type="button" class="mn-add" onclick="mineAdd('${x.key}',1);this.textContent='넣었어요 ✓'">${MYG[x.key]?'하나 더':'+ 넣기'}</button></li>`).join('')
    :`<li class="mn-none">장비 제원에 없는 장비예요. <button type="button" class="rq-ask" data-n="${aiEsc(document.getElementById('mineQ').value.trim())}" onclick="reqAsk(this)">추가 요청</button></li>`;}
// 사진으로 찾기: 긴 변 1280px JPEG로 줄여서 AI(Gemini)에 보냄
function mineShrink(file){return new Promise((ok,no)=>{const img=new Image(),u=URL.createObjectURL(file);img.onload=()=>{const s=Math.min(1,1280/Math.max(img.width,img.height)),c=document.createElement('canvas');
  c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(u);ok(c.toDataURL('image/jpeg',.82).split(',')[1]);};img.onerror=()=>{URL.revokeObjectURL(u);no();};img.src=u;});}
function mineSystem(){return `너는 캠핑 장비 사진을 보고 아래 [목록]에서 같은 제품을 찾는 도우미야. JSON만 출력:
{"seen":["사진에 실제로 보이는 물건을 하나씩 짧게 묘사"],"found":[{"key":"목록의 키","count":1,"sure":"high|mid|low","why":"seen 중 어떤 물건인지"}],"unknown":["목록에 없는 장비의 이름(브랜드·종류)"],"tip":"한 문장"}
순서: 먼저 seen에 사진 속 물건을 모양·재질·색으로 적고, 그다음 seen의 각 물건을 [목록]과 맞춰.
규칙:
- found에는 seen에 적은 물건만. 사진에 없는 장비를 목록에서 골라 넣지 마. 확실하지 않으면 sure를 low로.
- 목록에 없는 장비는 비슷한 걸로 바꾸지 말고 unknown에 적어.
- 같은 제품이 여러 개 보이면 count로.
- 텐트·타프는 사진에 텐트·타프가 실제로 보이고 모양·색이 맞을 때만. 사람·자동차·나무·잔디·음식·그릇은 무시.
- 스노우피크 IGT 구별법: IGT 프레임은 스테인리스 사각 틀에 유닛(플랫버너=틀에 끼운 버너, 멀티펑션 테이블=대나무 판·구멍 뚫린 판, 스테인리스 트레이)을 끼워 쓰는 테이블. 세퍼레이트 IGT는 틀이 2~4칸으로 나뉜 것(칸 수=유닛). 코너테이블 L/R은 IGT 끝에 붙는 1/4 원 모양 대나무 판. 행잉랙은 IGT 위에 세우는 걸이 선반.
[목록] (키: 이름 / 모델 / 분류)
${mineAll().map(x=>`${x.key}: ${x.name} / ${x.model} / ${x.sec}`).join('\n')}`;}
let MINE_FOUND=[];
async function minePhoto(){const inp=document.getElementById('minePic'),st=document.getElementById('mineSt'),btn=document.getElementById('mineGo'),out=document.getElementById('mineRes');
  const files=[...(inp.files||[])].slice(0,3);if(!files.length){st.textContent='사진을 먼저 골라 주세요';return;}
  btn.disabled=true;st.textContent='AI가 사진 속 장비를 찾는 중…';out.innerHTML='';MINE_FOUND=[];const unk=new Set();let fail=null;
  for(const f of files){let data;try{data=await mineShrink(f);}catch(e){fail='photo';continue;}
    try{const r=await fetch(AI_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({system:mineSystem(),prompt:'이 사진 속 캠핑 장비를 찾아줘',image:{mime:'image/jpeg',data},acct:acctCode()||undefined})});
      const d=await r.json().catch(()=>({}));if(!r.ok||!d.text){fail=d.error||'error';continue;}
      const o=JSON.parse(d.text.replace(/^```(json)?|```$/g,'').trim());
      (o.found||[]).forEach(x=>{if(!x||(Array.isArray(o.seen)&&o.seen.length&&!x.why))return;const it=mineByKey(String(x.key||''));if(!it)return;const c=Math.min(8,Math.max(1,+x.count||1)),old=MINE_FOUND.find(y=>y.key===it.key);if(old)old.count=Math.max(old.count,c);else MINE_FOUND.push({...it,count:c,sure:x.sure});});
      (o.unknown||[]).forEach(u=>typeof u==='string'&&u.trim()&&unk.add(u.trim().slice(0,40)));}catch(e){fail='error';}}
  // AI가 목록에 없다고 한 이름도 장비 제원 이름과 같으면 찾은 장비로 옮김 (예: '스노우피크 플랫버너' → 플랫버너)
  const bare=t=>aiNorm(String(t).replace(/스노우피크|snow\s*peak/gi,''));
  [...unk].forEach(u=>{const n=bare(u);if(n.length<2)return;let best=null,bl=0;
    mineAll().forEach(it=>{const m=bare(it.name);if(m.length<3)return;if((m===n||(it.k!=='tent'&&n.includes(m)))&&m.length>bl){best=it;bl=m.length;}});
    if(best){unk.delete(u);if(!MINE_FOUND.find(y=>y.key===best.key))MINE_FOUND.push({...best,count:1,sure:'mid'});}});
  btn.disabled=false;if(typeof camEv==='function')camEv('mine-photo','내 장비 사진 인식');
  if(!MINE_FOUND.length&&!unk.size){st.textContent=fail==='limit'?'오늘 AI 사용량이 많아요. 잠시 뒤 다시 해보세요.':fail?'사진 인식은 서버 설정이 끝나면 열려요. 지금은 이름으로 찾아서 넣어 주세요.':'사진에서 장비를 찾지 못했어요. 장비가 크게 보이게 다시 찍어 보세요.';return;}
  st.textContent=`찾은 장비 ${MINE_FOUND.length}가지 · 맞는 것만 체크해서 넣어 주세요`;
  out.innerHTML=(MINE_FOUND.length?`<ul class="mn-found">${MINE_FOUND.map((x,i)=>`<li><label><input type="checkbox" data-i="${i}" ${x.sure==='low'?'':'checked'}><span class="mn-n"><b>${aiEsc(x.name)}</b><small>${aiEsc(x.sec)} · ${x.count}개${x.sure==='low'?' · 확실하지 않음':''}</small></span></label></li>`).join('')}</ul>
    <button type="button" class="btn-dark" onclick="mineTake()">체크한 장비 넣기</button>`:'')+
    (unk.size?`<p class="mn-other">장비 제원에 없어서 뺀 것: ${[...unk].map(aiEsc).join(', ')}</p>`:'');}
function mineTake(){document.querySelectorAll('#mineRes input[type=checkbox]').forEach(c=>{if(!c.checked)return;const x=MINE_FOUND[+c.dataset.i];MYG[x.key]=Math.max(MYG[x.key]||0,x.count);});
  mineSave();mineRender();document.getElementById('mineRes').innerHTML='';document.getElementById('mineSt').textContent='내 장비에 넣었어요';document.getElementById('minePic').value='';minePicked();}
let MINE_PREV=[];
function minePicked(){const f=[...(document.getElementById('minePic').files||[])].slice(0,3),l=document.getElementById('minePicN'),pv=document.getElementById('minePrev');
  if(l)l.textContent=f.length?`사진 ${f.length}장 선택됨`:'';MINE_PREV.forEach(u=>URL.revokeObjectURL(u));MINE_PREV=f.map(x=>URL.createObjectURL(x));
  if(pv)pv.innerHTML=MINE_PREV.map((u,i)=>`<img src="${u}" alt="고른 사진 ${i+1}">`).join('');}
// 내 장비로 AI 세팅: 장비 이름을 AI 입력칸에 채워서 내부 구성으로
function mineUse(){const keys=Object.keys(MYG).filter(k=>mineByKey(k));if(!keys.length)return;
  const txt=keys.map(k=>{const it=mineByKey(k),n=MYG[k];return it.name+(n>1?` ${n}개`:'');}).join(', ');
  go('plan');const inp=document.getElementById('aiIn');if(typeof aiNew==='function'&&AI_CHAT.last)aiNew();inp.value=txt+'. ';const st=document.getElementById('aiSt');if(st)st.textContent='내 장비를 넣었어요. 뒤에 원하는 위치를 덧붙이고 세팅해 보세요';
  setTimeout(()=>{inp.scrollIntoView({block:'center'});inp.focus();inp.setSelectionRange(inp.value.length,inp.value.length);},300);}
// ===== 내 코드(계정): 코드 하나로 다른 기기에서도 같은 장비·초대 회원 =====
const ACCT_KEY='camAcct';
const acctCode=()=>{try{return localStorage.getItem(ACCT_KEY)||'';}catch(e){return '';}};
const acctSet=v=>{try{v?localStorage.setItem(ACCT_KEY,v):localStorage.removeItem(ACCT_KEY);}catch(e){}};
let ACCT_VIP=false,ACCT_OFF=false,acctTimer=null;
async function acctCall(a){try{const r=await fetch(AI_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({acct:a})});const d=await r.json().catch(()=>({}));
  if(!r.ok){if(!d.error||d.error==='acct-off'||d.error==='empty'||d.error==='bad')ACCT_OFF=true;return {fail:d.error||'error'};}ACCT_OFF=false;return d;}catch(e){ACCT_OFF=true;return {fail:'network'};}}
async function acctEnsure(){if(acctCode())return acctCode();const d=await acctCall({op:'new'});if(d.code){acctSet(d.code);ACCT_VIP=false;acctUI();return d.code;}return '';}
// 장비가 바뀌면 1.5초 뒤 한 번에 서버에 저장 (무료 저장 횟수 아끼기)
function acctQueue(){clearTimeout(acctTimer);acctTimer=setTimeout(async()=>{const c=await acctEnsure();if(!c)return;const d=await acctCall({op:'save',code:c,gear:MYG});if(d.ok){ACCT_VIP=!!d.vip;acctUI();}},1500);}
async function acctPull(){const c=acctCode();if(!c){acctUI();return;}const d=await acctCall({op:'get',code:c});
  if(d.code){ACCT_VIP=!!d.vip;const srv=d.gear||{};if(Object.keys(srv).length){MYG=srv;mineSaveLocal();mineRender();}else if(Object.keys(MYG).length)acctQueue();}
  else if(d.fail==='nocode'){acctSet('');}acctUI();}
function acctUI(){const el=document.getElementById('acctBox');if(!el)return;const c=acctCode();
  el.innerHTML=`<div class="ac-row"><span class="ac-lab">내 코드</span>${c?`<b class="ac-code">${aiEsc(c)}</b><button type="button" onclick="acctCopy()">복사</button>${ACCT_VIP?'<span class="ac-vip">초대 회원 · AI 하루 50회</span>':''}`
    :`<span class="ac-none">${ACCT_OFF?'서버 설정이 끝나면 코드가 만들어져요 (지금은 이 기기에만 저장)':'장비를 넣으면 자동으로 만들어져요'}</span>`}</div>
   <p class="ac-help">${c?'이 기기에서는 자동으로 들어와요. 다른 기기에서는 아래에 이 코드를 넣으면 같은 장비가 나와요. 캡처해 두세요.':''}</p>
   <form class="ac-form" onsubmit="event.preventDefault();acctUse()"><label class="sr-only" for="acIn">다른 기기의 내 코드</label><input id="acIn" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="다른 기기의 코드 (예: 7KQ2-X9MD)"><button type="submit">불러오기</button></form>
   ${ACCT_VIP?'':`<form class="ac-form" onsubmit="event.preventDefault();acctInvite()"><label class="sr-only" for="acInv">초대 코드</label><input id="acInv" maxlength="40" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="초대 코드가 있으면 넣어 주세요"><button type="submit">적용</button></form>`}
   <p class="ac-msg" id="acMsg" role="status"></p>`;}
const acMsg=t=>{const m=document.getElementById('acMsg');if(m)m.textContent=t;};
function acctCopy(){const c=acctCode();(navigator.clipboard?navigator.clipboard.writeText(c):Promise.reject()).then(()=>acMsg('코드를 복사했어요'),()=>acMsg('코드: '+c));}
async function acctUse(){let v=(document.getElementById('acIn').value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(v.length!==8){acMsg('코드는 8글자예요 (예: 7KQ2-X9MD)');return;}v=v.slice(0,4)+'-'+v.slice(4);
  const d=await acctCall({op:'get',code:v});if(!d.code){acMsg(d.fail==='nocode'?'없는 코드예요':d.fail==='quota'?'오늘은 더 시도할 수 없어요':'서버에 연결하지 못했어요');return;}
  acctSet(d.code);ACCT_VIP=!!d.vip;MYG=d.gear||{};mineSaveLocal();mineRender();acctUI();acMsg('불러왔어요. 이제 이 기기도 같은 코드를 써요');}
async function acctInvite(){const v=(document.getElementById('acInv').value||'').trim();if(!v)return;const c=await acctEnsure();if(!c){acMsg('서버 설정이 끝나면 쓸 수 있어요');return;}
  const d=await acctCall({op:'invite',code:c,invite:v});if(d.ok){ACCT_VIP=true;acctUI();acMsg('초대 코드가 적용됐어요. AI를 하루 50회까지 쓸 수 있어요');if(typeof aiCheckLeft==='function')aiCheckLeft();}else acMsg(d.fail==='invite'?'맞지 않는 초대 코드예요':'서버에 연결하지 못했어요');}
// ===== 장비 제원에서 고르기 =====
let PICK_SEC=null;
function minePickUI(){const el=document.getElementById('minePick');if(!el)return;const secs=mineSecs();if(!PICK_SEC)PICK_SEC=secs[0].k;
  el.innerHTML=`<div class="mp-chips" role="group" aria-label="장비 종류">${secs.map(s=>`<button type="button" aria-pressed="${s.k===PICK_SEC}" onclick="PICK_SEC='${s.k}';minePickUI()">${aiEsc(s.t)} <small>${s.ids.length}</small></button>`).join('')}</div>
   <ul class="mn-find mp-list">${mineAll().filter(x=>x.k===PICK_SEC).map(x=>`<li><span class="mn-n"><b>${aiEsc(x.name)}</b>${x.model?`<small>${aiEsc(x.model)}</small>`:''}</span>${MYG[x.key]?`<span class="mn-q"><button type="button" aria-label="${aiEsc(x.name)} 하나 빼기" onclick="mineAdd('${x.key}',-1)">−</button><b>${MYG[x.key]}</b><button type="button" aria-label="${aiEsc(x.name)} 하나 더" onclick="mineAdd('${x.key}',1)">+</button></span>`:`<button type="button" class="mn-add" onclick="mineAdd('${x.key}',1)">+ 넣기</button>`}</li>`).join('')}</ul>`;}
function mineInit(){mineRender();minePickUI();acctUI();acctPull();}

// ===== 세팅 화면(텐트·장비 목록)에서 '내 장비만 보기' =====
let MINE_ONLY=false;try{MINE_ONLY=localStorage.getItem('camMineOnly')==='1';}catch(e){}
function mineOnlyBtns(){['tentQ','catQ'].forEach(id=>{const inp=document.getElementById(id);if(!inp)return;const lab=inp.closest('label')||inp;
  let b=lab.previousElementSibling&&lab.previousElementSibling.classList.contains('mine-only')?lab.previousElementSibling:null;
  if(!b){b=document.createElement('button');b.type='button';b.className='mine-only';b.onclick=mineOnlyToggle;lab.parentNode.insertBefore(b,lab);}
  const n=Object.keys(MYG).length;b.setAttribute('aria-pressed',MINE_ONLY&&n?'true':'false');b.innerHTML=`<span class="mo-dot"></span>내 장비만 보기${n?` <small>${n}</small>`:''}`;});}
function mineOnlyToggle(){if(!Object.keys(MYG).length){if(confirm('아직 등록한 장비가 없어요. 내 장비 탭에서 등록할까요?'))go('mine');return;}
  MINE_ONLY=!MINE_ONLY;try{localStorage.setItem('camMineOnly',MINE_ONLY?'1':'0');}catch(e){}mineOnlyBtns();renderTentList();renderCatalog();}
(function(){const _r=mineRender;mineRender=function(){_r();mineOnlyBtns();if(MINE_ONLY){renderTentList();renderCatalog();}};
  mineOnlyBtns();if(MINE_ONLY){renderTentList();renderCatalog();}
  if(acctCode())acctPull();})();
