
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
// 장비 제원 탭과 같은 사진(없으면 도면 그림)을 작게
const MINE_PV={};
function mineThumb(it){if(!it)return '';const ph=it.k!=='tent'&&typeof GEAR_ART!=='undefined'&&GEAR_ART.has(it.id);
  if(ph)return `<span class="mn-th"><img src="img/gear/${it.id}.webp" alt="" loading="lazy"></span>`;
  if(!(it.key in MINE_PV)){let svg='';try{const s=GSEC.find(x=>x.k===it.k),g=s&&s.items().find(i=>i.id===it.id);const m=g&&g.html.match(/<svg[\s\S]*?<\/svg>/);svg=m?m[0]:'';}catch(e){}MINE_PV[it.key]=svg;}
  return `<span class="mn-th">${MINE_PV[it.key]}</span>`;}
const mineByKey=k=>mineAll().find(x=>x.key===k);
const mineCount=()=>Object.values(MYG).reduce((a,b)=>a+b,0);
function mineAdd(key,n){MYG[key]=Math.max(0,Math.min(20,(MYG[key]||0)+(n||1)));if(!MYG[key])delete MYG[key];mineSave();mineRender();if(document.getElementById('minePick'))minePickUI();}
function mineRender(){const box=document.getElementById('mineList');if(!box)return;
  const keys=Object.keys(MYG).filter(k=>mineByKey(k));document.getElementById('mineCnt').textContent=keys.length?`${keys.length}종 · ${mineCount()}개`:'';
  document.getElementById('mineUse').disabled=!keys.length;
  if(!keys.length){box.innerHTML='<p class="mn-empty">아직 등록한 장비가 없어요. 사진을 올리거나 이름으로 찾아서 넣어 보세요.</p>';return;}
  const by={};keys.forEach(k=>{const it=mineByKey(k);(by[it.sec]=by[it.sec]||[]).push(it);});
  box.innerHTML=mineSecs().filter(s=>by[s.t]).map(s=>`<section class="mn-sec"><h3>${aiEsc(s.t)} <small>${by[s.t].length}</small></h3><ul>${by[s.t].map(it=>`<li>${mineThumb(it)}<span class="mn-n"><b>${aiEsc(it.name)}</b>${it.model?`<small>${aiEsc(it.model)}</small>`:''}</span>
    <span class="mn-q"><button type="button" aria-label="${aiEsc(it.name)} 하나 빼기" onclick="mineAdd('${it.key}',-1)">−</button><b>${MYG[it.key]}</b><button type="button" aria-label="${aiEsc(it.name)} 하나 더" onclick="mineAdd('${it.key}',1)">+</button></span></li>`).join('')}</ul></section>`).join('');}
// 이름으로 찾기
function mineSearch(){const q=aiNorm(document.getElementById('mineQ').value||''),out=document.getElementById('mineFind');
  if(q.length<2){out.innerHTML='';return;}
  const hit=mineAll().filter(x=>aiNorm(x.name+' '+x.model+' '+x.sec).includes(q)).slice(0,12);
  out.innerHTML=hit.length?hit.map(x=>`<li>${mineThumb(x)}<span class="mn-n"><b>${aiEsc(x.name)}</b><small>${aiEsc(x.sec)}${x.model?' · '+aiEsc(x.model):''}</small></span><button type="button" class="mn-add" onclick="mineAdd('${x.key}',1);this.textContent='넣었어요 ✓'">${MYG[x.key]?'하나 더':'+ 넣기'}</button></li>`).join('')
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
- 텐트·타프는 전체 모양이 보이고 모양·색·로고가 맞을 때만. 배경에 천 일부만 보이면 넣지 마. 사람·자동차·나무·잔디·음식·그릇·컵·랜턴은 무시.
- 크기·방향만 다른 형제 제품(일반/롱, L/R, 25/50, 240~300, 2·3·4유닛 등)은 사진만으로 구별이 어려워. 가장 비슷한 하나만 고르고 sure는 mid로 (사용자가 화면에서 크기를 고를 수 있어). 형제 제품을 여러 개 동시에 넣지 마.
- 구별법:
  · IGT: 검은/스테인리스 사각 틀에 유닛(대나무 판·버너·트레이)을 끼우는 테이블. 한 장짜리 틀이면 IGT 프레임(3유닛)·롱(4유닛), 틀이 칸마다 따로 조립된 것(칸 사이 이음새·접이 다리)은 세퍼레이트 IGT(칸 수=유닛). 칸 수를 세어서 골라.
  · IGT에 붙는 대나무 판: 1/4 원(둥근 모서리) 판=코너테이블, 직사각형 판=멀티펑션 테이블, 가운데가 뚫려 버너를 넣는 판=오픈멀티펑션. 플랫버너=틀 칸에 끼운 납작한 스테인리스 버너, 설봉원=그릴 모양 버너.
  · 따로 서는 테이블: X자 접이 다리+대나무 상판=원액션테이블(낮으면 로우), 접이 다리 낮은 대나무 상판=싱글액션 로우, 알루미늄 롤 상판=알루텍, 천 받침 프레임+하드탑=헬리녹스 테이블원. 마이테이블=작은 1인용 접이 테이블(큰 테이블에 쓰지 마). 원목·월넛·나무 살(롤) 상판처럼 대나무가 아닌 테이블은 목록에 같은 게 없으면 unknown으로.
  · 체어: 팔걸이가 나무인 낮은 천 의자=스노우피크 로우체어, 접이식 감독 의자(팔걸이 쿠션·X 프레임)=FD체어, 등받이 높은 접이 의자=테이크체어, 폴 프레임에 천 씌운 의자=헬리녹스.
  · 매트·침대: 바닥에 까는 에어매트·자충매트는 목록의 매트(제백 에어리스=두꺼운 직사각 에어매트, 엑스페드 메가매트, 스패로우)에서, 다리 달린 침대=코트.
  · 난방: 연통 달린 검은 철제 화목난로=스노우피크 MK스토브, 원통형 석유난로=토요토미 옴니, 상자형 팬히터=신일·파세코·토요토미 팬히터.
  · 버너: 다리 셋 달린 둥근 스테인리스 버너=강염버너. 냉장고: 회색 상자형 컴프레서 냉장고=도메틱 CFX3.
- 사진에 상표(snow peak, Helinox, 라디트 등)나 가격표 글씨가 보이면 참고해.
[목록] (키: 이름 / 모델 / 분류)
${mineAll().map(x=>`${x.key}: ${x.name} / ${x.model} / ${x.sec}`).join('\n')}`;}
let MINE_FOUND=[];
// 크기·방향만 다른 형제 제품: 사진 결과에서 고를 수 있게
const MINE_FAMS=[['igt:reg3','igt:long4','igt:sep2','igt:sep3','igt:sep4'],['igt:mf_reg','igt:mf_long'],['igt:open_L','igt:open_R'],['igt:corner_L','igt:corner_R'],['igt:slide_h','igt:slide_hl'],['parts:mesh_d1','parts:mesh_s1','parts:mesh_hd','parts:mesh_hs'],['parts:steel1','parts:lid_half','parts:box_half'],['parts:wood_s','parts:wood_w'],['parts:flat','parts:seppou'],['gear:sc25','gear:sc50'],['gear:fshelf','gear:fshelf_l','gear:fshelf_m'],['gear:mytable','gear:mytable_s'],['gear:sp_oat','gear:sp_oat_l','gear:sp_oat_low','gear:sp_chabu'],['gear:hx_t1','gear:hx_t1l','gear:hx_t0lt','gear:noga_table','gear:hx_cafe'],['gear:alu48','gear:alu68','gear:alu93'],['sleep:megamat','sleep:megamat_duo','sleep:sparrow50'],['sleep:zebec_pro240','sleep:zebec_pro260','sleep:zebec_pro280','sleep:zebec_pro300'],['chair:sp_low30','chair:sp_lowshort'],['chair:hx_one','chair:hx_zero','chair:noga_chair','chair:hx_sunset'],['heat:sfh1200','heat:sfh300','heat:sfh_bh900','heat:camp5000','heat:toyotomi_lcl53'],['cool:cfx3_35','cool:cfx3_45','cool:cfx3_55'],['tarp:hexa_m','tarp:hexa_l','tarp:recta_m','tarp:recta_l']];
const mineFam=k=>(MINE_FAMS.find(a=>a.includes(k))||[]).filter(x=>mineByKey(x));
// AI가 'hx_t1'처럼 분류 없이 준 키도 받기
const mineKeyFix=k=>{k=String(k||'').trim();if(mineByKey(k))return k;const id=k.split(':').pop(),it=mineAll().find(x=>x.id===id);return it?it.key:k;};
function mineFamPick(i,k){const it=mineByKey(k);if(!it)return;const old=MINE_FOUND[i];MINE_FOUND[i]={...it,count:old.count,sure:'high'};
  const li=document.querySelector(`#mineRes li[data-i="${i}"]`);if(!li)return;li.querySelector('.mn-n b').textContent=it.name;const th=li.querySelector('.mn-th');if(th)th.outerHTML=mineThumb(it);const cb=li.querySelector('input[type=checkbox]');if(cb)cb.checked=true;}
async function minePhoto(){const inp=document.getElementById('minePic'),st=document.getElementById('mineSt'),btn=document.getElementById('mineGo'),out=document.getElementById('mineRes');
  const files=[...(inp.files||[])].slice(0,3);if(!files.length){st.textContent='사진을 먼저 골라 주세요';return;}
  btn.disabled=true;st.textContent='AI가 사진 속 장비를 찾는 중…';out.innerHTML='';MINE_FOUND=[];const unk=new Set();let fail=null;
  for(const f of files){let data;try{data=await mineShrink(f);}catch(e){fail='photo';continue;}
    try{const r=await fetch(AI_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({system:mineSystem(),prompt:'이 사진 속 캠핑 장비를 찾아줘',image:{mime:'image/jpeg',data},acct:acctCode()||undefined})});
      const d=await r.json().catch(()=>({}));if(!r.ok||!d.text){fail=d.error||'error';continue;}
      const o=JSON.parse(d.text.replace(/^```(json)?|```$/g,'').trim());
      (o.found||[]).forEach(x=>{if(!x||(Array.isArray(o.seen)&&o.seen.length&&!x.why))return;const it=mineByKey(mineKeyFix(x.key));if(!it)return;const c=Math.min(8,Math.max(1,+x.count||1)),old=MINE_FOUND.find(y=>y.key===it.key);if(old)old.count=Math.max(old.count,c);else MINE_FOUND.push({...it,count:c,sure:x.sure});});
      (o.unknown||[]).forEach(u=>typeof u==='string'&&u.trim()&&unk.add(u.trim().slice(0,40)));}catch(e){fail='error';}}
  // AI가 목록에 없다고 한 이름도 장비 제원 이름과 같으면 찾은 장비로 옮김 (예: '스노우피크 플랫버너' → 플랫버너)
  const bare=t=>aiNorm(String(t).replace(/스노우피크|snow\s*peak/gi,''));
  [...unk].forEach(u=>{const n=bare(u);if(n.length<2)return;let best=null,bl=0;
    mineAll().forEach(it=>{const m=bare(it.name);if(m.length<3)return;if((m===n||(it.k!=='tent'&&n.includes(m)))&&m.length>bl){best=it;bl=m.length;}});
    if(!best&&n.length>=4)mineAll().forEach(it=>{if(it.k==='tent')return;const m=bare(it.name);if(m.startsWith(n)&&(!best||m.length<bare(best.name).length))best=it;});
    if(best){unk.delete(u);if(!MINE_FOUND.find(y=>y.key===best.key||mineFam(y.key).includes(best.key)))MINE_FOUND.push({...best,count:1,sure:'mid'});}});
  btn.disabled=false;if(typeof camEv==='function')camEv('mine-photo','내 장비 사진 인식');
  if(!MINE_FOUND.length&&!unk.size){st.textContent=fail==='limit'?'오늘 AI 사용량이 많아요. 잠시 뒤 다시 해보세요.':fail?'사진 인식은 서버 설정이 끝나면 열려요. 지금은 이름으로 찾아서 넣어 주세요.':'사진에서 장비를 찾지 못했어요. 장비가 크게 보이게 다시 찍어 보세요.';return;}
  st.textContent=`찾은 장비 ${MINE_FOUND.length}가지 · 맞는 것만 체크해서 넣어 주세요`;
  out.innerHTML=(MINE_FOUND.length?`<ul class="mn-found">${MINE_FOUND.map((x,i)=>`<li data-i="${i}"><label><input type="checkbox" data-i="${i}" ${x.sure==='low'?'':'checked'}>${mineThumb(x)}<span class="mn-n"><b>${aiEsc(x.name)}</b><small>${aiEsc(x.sec)} · ${x.count}개${x.sure==='low'?' · 확실하지 않음':''}</small></span></label>${mineFam(x.key).length>1?`<label class="mn-fam"><span>크기·종류</span><select onchange="mineFamPick(${i},this.value)">${mineFam(x.key).map(k=>`<option value="${k}"${k===x.key?' selected':''}>${aiEsc(mineByKey(k).name)}</option>`).join('')}</select></label>`:''}</li>`).join('')}</ul>
    <p class="mn-other">크기만 다른 제품은 사진으로 구별이 어려워요. 다르면 '크기·종류'에서 골라 주세요.</p>
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
let ACCT_VIP=false,ACCT_ADMIN=false,ACCT_OFF=false,acctTimer=null;
async function acctCall(a){try{const r=await fetch(AI_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({acct:a})});const d=await r.json().catch(()=>({}));
  if(!r.ok){if(!d.error||d.error==='acct-off'||d.error==='empty'||d.error==='bad')ACCT_OFF=true;return {fail:d.error||'error'};}ACCT_OFF=false;return d;}catch(e){ACCT_OFF=true;return {fail:'network'};}}
async function acctEnsure(){if(acctCode())return acctCode();const d=await acctCall({op:'new'});if(d.code){acctSet(d.code);ACCT_VIP=false;acctUI();return d.code;}return '';}
// 장비가 바뀌면 1.5초 뒤 한 번에 서버에 저장 (무료 저장 횟수 아끼기)
function acctQueue(){clearTimeout(acctTimer);acctTimer=setTimeout(async()=>{const c=await acctEnsure();if(!c)return;const d=await acctCall({op:'save',code:c,gear:MYG});if(d.ok){ACCT_VIP=!!d.vip;ACCT_ADMIN=!!d.admin;acctUI();}},1500);}
async function acctPull(){const c=acctCode();if(!c){acctUI();return;}const d=await acctCall({op:'get',code:c});
  if(d.code){ACCT_VIP=!!d.vip;ACCT_ADMIN=!!d.admin;const srv=d.gear||{};if(Object.keys(srv).length){MYG=srv;mineSaveLocal();mineRender();}else if(Object.keys(MYG).length)acctQueue();}
  else if(d.fail==='nocode'){acctSet('');}acctUI();}
function acctUI(){const el=document.getElementById('acctBox');if(!el)return;const c=acctCode();
  el.innerHTML=`<div class="ac-row"><span class="ac-lab">내 코드</span>${c?`<b class="ac-code">${aiEsc(c)}</b><button type="button" onclick="acctCopy()">복사</button><button type="button" class="ac-out" onclick="acctOut(this)">이 기기에서 빼기</button>${ACCT_ADMIN?'<span class="ac-vip">관리자 · AI 제한 없음</span>':ACCT_VIP?'<span class="ac-vip">초대 회원 · AI 하루 50회</span>':''}`
    :`<span class="ac-none">${ACCT_OFF?'서버 설정이 끝나면 코드가 만들어져요 (지금은 이 기기에만 저장)':'장비를 넣으면 자동으로 만들어져요'}</span>`}</div>
   <p class="ac-help">${c?'이 기기에서는 자동으로 들어와요. 다른 기기에서는 아래에 이 코드를 넣으면 같은 장비가 나와요. 캡처해 두세요.':''}</p>
   <form class="ac-form" onsubmit="event.preventDefault();acctUse()"><label class="sr-only" for="acIn">다른 기기의 내 코드</label><input id="acIn" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="다른 기기의 코드 (예: 7KQ2-X9MD)"><button type="submit">불러오기</button></form>
   ${ACCT_ADMIN?'':`<form class="ac-form" onsubmit="event.preventDefault();acctInvite()"><label class="sr-only" for="acInv">초대 코드</label><input id="acInv" maxlength="40" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="초대 코드가 있으면 넣어 주세요"><button type="submit">적용</button></form>`}
   <p class="ac-msg" id="acMsg" role="status"></p>`;}
// 잘못 불러온 코드를 이 기기에서 빼기(로그아웃): 두 번 눌러야 빠짐. 서버의 장비는 그대로
function acctOut(b){if(!b.dataset.sure){b.dataset.sure='1';b.textContent='한 번 더 누르면 빠져요';setTimeout(()=>{if(b.isConnected){delete b.dataset.sure;b.textContent='이 기기에서 빼기';}},4000);return;}
  clearTimeout(acctTimer);acctSet('');ACCT_VIP=false;ACCT_ADMIN=false;MYG={};mineSaveLocal();mineRender();acctUI();if(typeof mineOnlyBtns==='function')mineOnlyBtns();if(typeof aiCheckLeft==='function')aiCheckLeft();
  acMsg('이 기기에서 코드를 뺐어요. 코드를 다시 넣으면 그 코드의 장비가 나와요');}
const acMsg=t=>{const m=document.getElementById('acMsg');if(m)m.textContent=t;};
function acctCopy(){const c=acctCode();(navigator.clipboard?navigator.clipboard.writeText(c):Promise.reject()).then(()=>acMsg('코드를 복사했어요'),()=>acMsg('코드: '+c));}
// 코드 하나로: 다른 기기의 내 코드(XXXX-XXXX)면 불러오고, 아니면 초대 코드로 적용. 결과 문장을 돌려줌
async function acctLoad(raw){const v8=String(raw||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(v8.length!==8)return {ok:false,msg:'코드는 8글자예요 (예: 7KQ2-X9MD)'};
  const v=v8.slice(0,4)+'-'+v8.slice(4);const d=await acctCall({op:'get',code:v});
  if(!d.code)return {ok:false,miss:d.fail==='nocode',msg:d.fail==='nocode'?'없는 코드예요':d.fail==='quota'?'오늘은 더 시도할 수 없어요':'서버에 연결하지 못했어요'};
  acctSet(d.code);ACCT_VIP=!!d.vip;ACCT_ADMIN=!!d.admin;MYG=d.gear||{};mineSaveLocal();mineRender();acctUI();if(typeof mineOnlyBtns==='function')mineOnlyBtns();return {ok:true,msg:'불러왔어요. 이제 이 기기도 같은 코드를 써요'};}
async function acctInviteCode(raw){const v=String(raw||'').trim();if(!v)return {ok:false,msg:'코드를 넣어 주세요'};const c=await acctEnsure();if(!c)return {ok:false,msg:'서버에 연결하지 못했어요. 잠시 뒤 다시 해보세요'};
  const d=await acctCall({op:'invite',code:c,invite:v});if(d.ok){ACCT_VIP=true;ACCT_ADMIN=!!d.admin;acctUI();if(typeof aiCheckLeft==='function')aiCheckLeft();return {ok:true,msg:d.admin?'관리자 계정이 됐어요. AI를 제한 없이 쓸 수 있어요':'초대 코드가 적용됐어요. AI를 하루 50회까지 쓸 수 있어요'};}
  return {ok:false,msg:d.fail==='invite'?'맞지 않는 코드예요':'서버에 연결하지 못했어요'};}
async function acctAny(raw){const v=String(raw||'').trim();if(!v)return {ok:false,msg:'코드를 넣어 주세요'};
  if(/^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/.test(v)){const r=await acctLoad(v);if(r.ok||!r.miss)return r;}
  return acctInviteCode(v);}
async function acctUse(){acMsg('확인하는 중…');acMsg((await acctLoad(document.getElementById('acIn').value)).msg);}
async function acctInvite(){acMsg('확인하는 중…');acMsg((await acctInviteCode(document.getElementById('acInv').value)).msg);}
// ===== 처음 들어왔을 때 '코드 있어요?' 팝업 (한 번만) =====
const ASK_KEY='camCodeAsked';
function codeAskDone(){try{localStorage.setItem(ASK_KEY,'1');}catch(e){}}
function codeAskOpen(){let dl=document.getElementById('codeAsk');if(!dl){dl=document.createElement('dialog');dl.id='codeAsk';dl.className='code-ask';dl.setAttribute('aria-labelledby','caT');document.body.appendChild(dl);
    dl.addEventListener('close',codeAskDone);}
  dl.innerHTML=`<form method="dialog" class="ca-in" onsubmit="return codeAskGo(event)">
    <h2 id="caT" tabindex="-1" autofocus style="outline:none">코드가 있나요?</h2>
    <p>초대 코드나, 다른 기기에서 쓰던 <b>내 코드</b>가 있으면 넣어 주세요. 없어도 바로 쓸 수 있어요.</p>
    <label class="sr-only" for="caIn">코드</label><input id="caIn" maxlength="40" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="예: 7KQ2-X9MD 또는 초대 코드">
    <p class="ca-msg" id="caMsg" role="status"></p>
    <div class="ca-btns"><button type="button" class="ca-no" onclick="document.getElementById('codeAsk').close()">코드 없어요</button><button type="submit" class="ca-go" id="caGo">넣기</button></div>
    <small>나중에 <b>내 장비</b> 탭 아래에서도 넣을 수 있어요.</small></form>`;
  try{dl.showModal();}catch(e){dl.setAttribute('open','');}}
async function codeAskGo(ev){ev.preventDefault();const m=document.getElementById('caMsg'),b=document.getElementById('caGo');b.disabled=true;m.textContent='확인하는 중…';
  const r=await acctAny(document.getElementById('caIn').value);b.disabled=false;m.textContent=r.msg;m.classList.toggle('ok',!!r.ok);
  if(r.ok){codeAskDone();setTimeout(()=>{const d=document.getElementById('codeAsk');if(d&&d.open)d.close();},1400);}return false;}
function codeAskMaybe(){try{if(IN_CLAUDE||acctCode()||localStorage.getItem(ASK_KEY))return;}catch(e){return;}setTimeout(codeAskOpen,700);}
codeAskMaybe();
// ===== 장비 제원에서 고르기 =====
let PICK_SEC=null;
function minePickUI(){const el=document.getElementById('minePick');if(!el)return;const secs=mineSecs();if(!PICK_SEC)PICK_SEC=secs[0].k;
  el.innerHTML=`<div class="mp-chips" role="group" aria-label="장비 종류">${secs.map(s=>`<button type="button" aria-pressed="${s.k===PICK_SEC}" onclick="PICK_SEC='${s.k}';minePickUI()">${aiEsc(s.t)} <small>${s.ids.length}</small></button>`).join('')}</div>
   <ul class="mn-find mp-list">${mineAll().filter(x=>x.k===PICK_SEC).map(x=>`<li>${mineThumb(x)}<span class="mn-n"><b>${aiEsc(x.name)}</b>${x.model?`<small>${aiEsc(x.model)}</small>`:''}</span>${MYG[x.key]?`<span class="mn-q"><button type="button" aria-label="${aiEsc(x.name)} 하나 빼기" onclick="mineAdd('${x.key}',-1)">−</button><b>${MYG[x.key]}</b><button type="button" aria-label="${aiEsc(x.name)} 하나 더" onclick="mineAdd('${x.key}',1)">+</button></span>`:`<button type="button" class="mn-add" onclick="mineAdd('${x.key}',1)">+ 넣기</button>`}</li>`).join('')}</ul>`;}
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
