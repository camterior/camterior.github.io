
/* =====================================================================
   내 장비: 가진 장비를 등록해 두고 (이 기기에 저장), 사진으로 AI가 장비를 찾아주고,
   등록한 장비로 바로 AI 세팅을 시작
   ===================================================================== */
const MYG_KEY='camMine';
let MYG={};try{MYG=JSON.parse(localStorage.getItem(MYG_KEY)||'{}')||{};}catch(e){MYG={};}
const mineSave=()=>{try{localStorage.setItem(MYG_KEY,JSON.stringify(MYG));}catch(e){}};
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
function mineAdd(key,n){MYG[key]=Math.max(0,Math.min(20,(MYG[key]||0)+(n||1)));if(!MYG[key])delete MYG[key];mineSave();mineRender();}
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
{"found":[{"key":"목록의 키","count":1,"sure":"high|mid|low"}],"unknown":["목록에 없는 장비의 이름(브랜드·종류)"],"tip":"한 문장"}
규칙:
- 사진에 실제로 보이는 장비만. 목록에 없는 장비는 비슷한 걸로 바꾸지 말고 unknown에 적어.
- 같은 제품이 여러 개 보이면 count로. 확실하지 않으면 sure를 low로.
- 텐트는 모양·로고·색이 맞을 때만. 사람·자동차·나무는 무시.
[목록] (키: 이름 / 모델 / 분류)
${mineAll().map(x=>`${x.key}: ${x.name} / ${x.model} / ${x.sec}`).join('\n')}`;}
let MINE_FOUND=[];
async function minePhoto(){const inp=document.getElementById('minePic'),st=document.getElementById('mineSt'),btn=document.getElementById('mineGo'),out=document.getElementById('mineRes');
  const files=[...(inp.files||[])].slice(0,3);if(!files.length){st.textContent='사진을 먼저 골라 주세요';return;}
  btn.disabled=true;st.textContent='AI가 사진 속 장비를 찾는 중…';out.innerHTML='';MINE_FOUND=[];const unk=new Set();let fail=null;
  for(const f of files){let data;try{data=await mineShrink(f);}catch(e){fail='photo';continue;}
    try{const r=await fetch(AI_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({system:mineSystem(),prompt:'이 사진 속 캠핑 장비를 찾아줘',image:{mime:'image/jpeg',data}})});
      const d=await r.json().catch(()=>({}));if(!r.ok||!d.text){fail=d.error||'error';continue;}
      const o=JSON.parse(d.text.replace(/^```(json)?|```$/g,'').trim());
      (o.found||[]).forEach(x=>{const it=mineByKey(String(x.key||''));if(!it)return;const c=Math.min(8,Math.max(1,+x.count||1)),old=MINE_FOUND.find(y=>y.key===it.key);if(old)old.count=Math.max(old.count,c);else MINE_FOUND.push({...it,count:c,sure:x.sure});});
      (o.unknown||[]).forEach(u=>typeof u==='string'&&u.trim()&&unk.add(u.trim().slice(0,40)));}catch(e){fail='error';}}
  btn.disabled=false;if(typeof camEv==='function')camEv('mine-photo','내 장비 사진 인식');
  if(!MINE_FOUND.length&&!unk.size){st.textContent=fail==='limit'?'오늘 AI 사용량이 많아요. 잠시 뒤 다시 해보세요.':fail?'사진 인식은 서버 설정이 끝나면 열려요. 지금은 이름으로 찾아서 넣어 주세요.':'사진에서 장비를 찾지 못했어요. 장비가 크게 보이게 다시 찍어 보세요.';return;}
  st.textContent=`찾은 장비 ${MINE_FOUND.length}가지 · 맞는 것만 체크해서 넣어 주세요`;
  out.innerHTML=(MINE_FOUND.length?`<ul class="mn-found">${MINE_FOUND.map((x,i)=>`<li><label><input type="checkbox" data-i="${i}" ${x.sure==='low'?'':'checked'}><span class="mn-n"><b>${aiEsc(x.name)}</b><small>${aiEsc(x.sec)} · ${x.count}개${x.sure==='low'?' · 확실하지 않음':''}</small></span></label></li>`).join('')}</ul>
    <button type="button" class="btn-dark" onclick="mineTake()">체크한 장비 넣기</button>`:'')+
    (unk.size?`<div class="ai-unk"><p class="ai-warn">장비 제원에 아직 없는 장비예요. 비슷한 걸로 바꾸지 않았어요.</p><p>${[...unk].map(u=>`<button type="button" class="rq-ask" data-n="${aiEsc(u)}" onclick="reqAsk(this)">${aiEsc(u)} · 추가 요청</button>`).join('')}</p></div>`:'');}
function mineTake(){document.querySelectorAll('#mineRes input[type=checkbox]').forEach(c=>{if(!c.checked)return;const x=MINE_FOUND[+c.dataset.i];MYG[x.key]=Math.max(MYG[x.key]||0,x.count);});
  mineSave();mineRender();document.getElementById('mineRes').innerHTML='';document.getElementById('mineSt').textContent='내 장비에 넣었어요';document.getElementById('minePic').value='';minePicked();}
function minePicked(){const f=document.getElementById('minePic').files||[],l=document.getElementById('minePicN');if(l)l.textContent=f.length?`사진 ${Math.min(3,f.length)}장 선택됨`:'';}
// 내 장비로 AI 세팅: 장비 이름을 AI 입력칸에 채워서 내부 구성으로
function mineUse(){const keys=Object.keys(MYG).filter(k=>mineByKey(k));if(!keys.length)return;
  const txt=keys.map(k=>{const it=mineByKey(k),n=MYG[k];return it.name+(n>1?` ${n}개`:'');}).join(', ');
  go('plan');const inp=document.getElementById('aiIn');if(typeof aiNew==='function'&&AI_CHAT.last)aiNew();inp.value=txt+'. ';const st=document.getElementById('aiSt');if(st)st.textContent='내 장비를 넣었어요. 뒤에 원하는 위치를 덧붙이고 세팅해 보세요';
  setTimeout(()=>{inp.scrollIntoView({block:'center'});inp.focus();inp.setSelectionRange(inp.value.length,inp.value.length);},300);}
// 백업 코드 (다른 기기로 옮기기)
function mineCopy(){const code='CAMMINE-'+btoa(unescape(encodeURIComponent(JSON.stringify(MYG))));const st=document.getElementById('mineBk');
  (navigator.clipboard?navigator.clipboard.writeText(code):Promise.reject()).then(()=>st.textContent='백업 코드를 복사했어요. 다른 기기의 “코드로 불러오기”에 붙여 넣으세요.',()=>{st.textContent=code;});}
function mineLoad(){const c=(prompt('백업 코드를 붙여 넣어 주세요')||'').trim();if(!c)return;const st=document.getElementById('mineBk');
  try{const o=JSON.parse(decodeURIComponent(escape(atob(c.replace(/^CAMMINE-/,'')))));Object.keys(o).forEach(k=>{if(mineByKey(k))MYG[k]=Math.min(20,Math.max(1,+o[k]||1));});mineSave();mineRender();st.textContent='불러왔어요';}
  catch(e){st.textContent='코드가 맞지 않아요';}}
function mineInit(){mineRender();}
