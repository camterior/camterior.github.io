/* =====================================================================
   CAMTERIOR — app tabs, gear spec catalog, share links
   ===================================================================== */
const VIEWS=['intro','plan','gear','hub'];
const LEGACY={top:'intro',features:'intro',how:'intro',lineup:'gear',journal:'hub',commons:'hub'};
let CUR='intro',planFitted=false;
const IN_CLAUDE=!!window.claude||!!document.querySelector('[data-art]');
const appbar=document.getElementById('appbar');
function updBar(){const h=document.getElementById('top');appbar.classList.toggle('solid',CUR!=='intro'||window.scrollY>(h?h.offsetHeight-80:0));}
addEventListener('scroll',updBar,{passive:true});
function go(v,opts){opts=opts||{};v=LEGACY[v]||v;if(!VIEWS.includes(v))v='intro';
  const changed=v!==CUR;CUR=v;document.body.dataset.view=v;
  VIEWS.forEach(k=>{document.getElementById('v-'+k).hidden=k!==v;});
  document.querySelectorAll('[data-tab]').forEach(a=>{if(a.dataset.tab===v)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  if(!opts.noHash&&!IN_CLAUDE&&location.hash!=='#'+v)history.pushState(null,'','#'+v);
  if(changed&&!opts.keepScroll)window.scrollTo(0,0);
  if(v==='plan')requestAnimationFrame(()=>{if(!planFitted){fitView();planFitted=true;}render();});
  if(v==='gear')renderGear();
  try{LS.set('camterior.view',v);}catch(e){}
  updBar();}
document.addEventListener('click',e=>{const a=e.target.closest('[data-go]');if(!a)return;e.preventDefault();go(a.dataset.go);
  if(a.getAttribute('href')==='#how'){}});
document.querySelector('.scrollcue')?.addEventListener('click',e=>{e.preventDefault();document.getElementById('how').scrollIntoView({behavior:'smooth'});});
addEventListener('popstate',()=>go(location.hash.slice(1)||'intro',{noHash:true}));
const afterPaint=f=>requestAnimationFrame(()=>requestAnimationFrame(f));

/* planner hooks → tabs instead of page scroll */
useTent=function(id){go('plan');afterPaint(()=>{pickTent(id);showTab('tent');renderLineup();fitView();render();});};
goPost=function(){go('hub');afterPaint(()=>{const c=document.getElementById('commons');c.scrollIntoView({behavior:'smooth',block:'start'});
  if(galleryOn&&galleryWrite)setTimeout(()=>document.getElementById('postTitle').focus(),400);});};
const _loadPlanCode=loadPlanCode;
loadPlanCode=async function(code,label){if(CUR!=='plan')go('plan');return _loadPlanCode(code,label);};

/* ---------- gear spec catalog ---------- */
const PARTS_COL={wood:'#CFA265',steel:'#B9BDC1',lid:'#C9CDD0',box:'#A7ACB0',mesh:'#8E949A',meshh:'#8E949A',flat:'#2B2E31',seppou:'#3B3F3A'};
const confBadge=c=>c?`<span class="cf ${c==='official'?'ok':(isWeak(c)?'weak':'')}">${CONF_LABEL[c]||c}</span>`:'';
const fmt=n=>Number(n).toLocaleString('ko-KR');
function partSvg(w,d,col,deep){const p=Math.max(w,d)*.12;
  return `<svg viewBox="${-p} ${-p} ${w+p*2} ${d+p*2}" aria-hidden="true"><rect width="${w}" height="${d}" rx="${Math.min(w,d)*.06}" fill="${col}" stroke="rgba(26,32,28,.55)" stroke-width="${Math.max(w,d)/90}"/>${deep?`<rect x="${w*.12}" y="${d*.1}" width="${w*.76}" height="${d*.8}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="${Math.max(w,d)/120}" stroke-dasharray="${w/18} ${w/24}"/>`:''}</svg>`;}
function tentLink(T){return T.href||(T.src?SRC+T.src:null);}
const GSEC=[
  {k:'tent',t:'텐트',img:'img/g-shelter.webp',d:'바닥 도면을 그대로 옮긴 리빙쉘·돔 텐트. 도어 위치와 이너룸까지 그렸어요.',
   items:()=>TENT_ORDER.filter(id=>TENTS[id].outer).map(id=>{const T=TENTS[id],inn=T.inners[T.innerDefault];
     return {id,b:T.brand||'기타',q:`${T.name} ${T.model} ${T.brand}`,html:`<div class="gpv"><span class="bt">${T.brand||''}</span>${T.est?(T.drawn?'<span class="cf ok">공식 도면</span>':'<span class="cf weak">도면 추정</span>'):'<span class="cf ok">판매처 도면</span>'}${tentThumb(T,inn)}</div>
      <div class="gb"><div><h3>${T.name}</h3><span class="md">${T.model}</span></div>
      <dl><dt>크기 (가로×세로×높이)</dt><dd>${T.size[0]}×${T.size[1]}×${T.size[2]}cm</dd><dt>바닥 면적</dt><dd>${tentArea(T).toFixed(1)}㎡</dd>
      <dt>정원</dt><dd>${T.cap}</dd><dt>무게</dt><dd>${T.weight}</dd>${inn?`<dt>${inn.label}</dt><dd>${inn.size||'도면 표기'}</dd>`:''}<dt>도어</dt><dd>${T.doors.length}곳</dd></dl>
      <div class="ga"><button type="button" onclick="gearUse('tent','${id}')">이 텐트로 배치</button>${tentLink(T)?`<a href="${tentLink(T)}" target="_blank" rel="noopener">출처 ↗</a>`:''}</div></div>`};})},
  {k:'tarp',t:'타프',img:'img/g-tarp.webp',d:'펙과 스트링까지 포함한 설영 면적으로 필요한 사이트 크기를 계산해요.',
   items:()=>TARP_ORDER.map(id=>{const t=TARPS[id];return {id,b:'스노우피크',q:`${t.name} ${t.model} 타프`,html:`<div class="gpv"><span class="bt">스노우피크</span><span class="cf">판매처</span>${tarpThumb(id)}</div>
      <div class="gb"><div><h3>${t.name}</h3><span class="md">${t.model}</span></div>
      <dl><dt>원단 크기</dt><dd>${fmt(t.L)}×${fmt(t.W)}mm</dd><dt>설영 면적</dt><dd>${(t.F[0]/1000).toFixed(1)}×${(t.F[1]/1000).toFixed(1)}m</dd><dt>폴</dt><dd>${t.poles.map(p=>fmt(p)).join(' / ')}mm</dd><dt>무게</dt><dd>${t.weight}</dd>${t.cap?`<dt>정원</dt><dd>${t.cap}</dd>`:''}</dl>
      ${t.note?`<p class="nt">${t.note}</p>`:''}
      <div class="ga"><button type="button" onclick="gearUse('tarp','${id}')">이 타프로 배치</button>${t.src?`<a href="${SRC+t.src}" target="_blank" rel="noopener">출처 ↗</a>`:''}</div></div>`};})},
  {k:'igt',t:'IGT 프레임·테이블',img:'img/g-igt.webp',d:'0.5유닛(124mm) 단위로 이어 붙는 아이언 그릴 테이블 시스템. 프레임과 확장 테이블의 실제 윤곽이에요.',
   items:()=>Object.keys(CATALOG).filter(k=>CATALOG[k].kind!=='gear').map(id=>{const c=CATALOG[id],b=bbox(c.verts),w=Math.round(b[1][0]-b[0][0]),d=Math.round(b[1][1]-b[0][1]);
     return {id,b:c.group,q:`${c.name} ${c.model} ${c.group} igt`,html:`<div class="gpv"><span class="bt">${c.group}</span>${confBadge(c.conf)}${catPreview(id)}</div>
      <div class="gb"><div><h3>${c.name}</h3><span class="md">${c.model}</span></div>
      <dl><dt>외곽</dt><dd>${fmt(w)}×${fmt(d)}mm</dd><dt>규격 표기</dt><dd>${c.spec}</dd>${c.units?`<dt>유닛</dt><dd>${c.units}유닛 · 칸 ${c.units*2}개</dd>`:''}</dl>
      <div class="ga"><button type="button" onclick="gearUse('item','${id}')">배치에 놓기</button></div></div>`};})},
  {k:'parts',t:'IGT 파츠',img:'img/g-parts.webp',d:'프레임 칸에 끼우는 상판·수납·화기와 행잉랙, 다리 높이. 배치 화면에서 IGT를 고른 뒤 ‘파츠·붙이기’로 넣어요.',
   items:()=>SLOT_ITEMS.map(p=>({id:p.id,b:p.grp,q:`${p.name} ${p.model} ${p.grp} 파츠`,html:`<div class="gpv"><span class="bt">${p.grp}</span>${confBadge(p.conf)}${partSvg(p.w,p.d,PARTS_COL[p.draw]||'#B9BDC1',p.deep)}</div>
      <div class="gb"><div><h3>${p.name}</h3><span class="md">${p.model}</span></div>
      <dl><dt>크기</dt><dd>${p.w}×${p.d}mm</dd><dt>차지하는 칸</dt><dd>${p.halves===1?'하프 1칸':`${p.halves/2}유닛 (${p.halves}칸)`}</dd></dl>
      <div class="ga"><button type="button" onclick="gearUse('parts','${p.id}')">IGT에 넣으러 가기</button></div></div>`}))
     .concat(Object.entries(RACKS).map(([m,r])=>({id:m,b:'행잉랙',q:`${r.name} ${m} 행잉랙`,html:`<div class="gpv"><span class="bt">행잉랙</span>${confBadge(r.conf)}${partSvg(r.w,r.d,'#2B2E31')}</div>
      <div class="gb"><div><h3>${r.name}</h3><span class="md">${m}</span></div><dl><dt>크기</dt><dd>${r.w}×${r.d}mm</dd><dt>맞는 다리</dt><dd>${r.legs}</dd></dl>
      <div class="ga"><button type="button" onclick="gearUse('parts','${m}')">IGT에 걸러 가기</button></div></div>`})))
     .concat([{id:'legs',b:'다리',q:'igt 다리 높이 300 400 660 830',html:`<div class="gpv"><span class="bt">다리</span><span class="cf ok">공식</span><svg viewBox="0 0 220 120" aria-hidden="true">${Object.keys(LEGS).map((h,i)=>`<rect x="${20+i*52}" y="${110-h/8}" width="10" height="${h/8}" rx="3" fill="#2B2E31"/><text x="${25+i*52}" y="${104-h/8}" text-anchor="middle" font-size="11" fill="#575C57">${h}</text>`).join('')}</svg></div>
      <div class="gb"><div><h3>IGT 다리</h3><span class="md">${Object.values(LEGS).map(l=>l.model).join(' · ')}</span></div>
      <dl>${Object.entries(LEGS).map(([h,l])=>`<dt>${l.name}</dt><dd>${h}mm</dd>`).join('')}</dl>
      <p class="nt">입체 보기에서 다리 높이에 맞춰 테이블 높이가 바뀌어요.</p></div>`}])},
  {k:'gear',t:'수납·테이블·선반',img:'img/g-table.webp',d:'쉘프컨테이너, 마이테이블, 폴딩쉘프, 그리고 스노우피크·헬리녹스·커밋 테이블. 바닥 크기와 상판 높이까지 실제 값이에요. 의자 좌면 높이와 맞춰 고르세요.',
   items:()=>GEAR_ORDER.filter(id=>!GEAR[id].heat&&!GEAR[id].sleep&&GEAR[id].gtype!=='chair'&&GEAR[id].gtype!=='fridge'&&GEAR[id].gtype!=='burner').map(id=>gearCard(id))},
  {k:'sleep',t:'매트·야전침대',img:'img/g-sleep.webp',d:'자충매트와 야전침대. 이너룸 안에 놓아도 경고가 뜨지 않아요. 매트 폭으로 이너룸에 몇 명이 누울 수 있는지 확인해보세요.',
   items:()=>GEAR_ORDER.filter(id=>GEAR[id].sleep).map(id=>gearCard(id))},
  {k:'chair',t:'체어',img:'img/g-chair.webp',d:'스노우피크·헬리녹스·커밋체어. 펼친 크기와 좌면 높이를 실제 값으로 넣었어요. 좌면이 낮은 로우체어는 낮은 테이블과 맞춰보세요.',
   items:()=>GEAR_ORDER.filter(id=>GEAR[id].gtype==='chair').map(id=>gearCard(id))},
  {k:'heat',t:'난방',img:'img/g-heat.webp',d:'팬히터·가스난로·화목난로의 크기예요.',
   items:()=>GEAR_ORDER.filter(id=>GEAR[id].heat).map(id=>gearCard(id))},
  {k:'fire',t:'버너',img:'img/g-fire.webp',d:'바닥에 세우는 버너예요. IGT에 끼우는 플랫버너·설봉원은 IGT 파츠에 있어요.',
   items:()=>GEAR_ORDER.filter(id=>GEAR[id].gtype==='burner').map(id=>gearCard(id))},
  {k:'cool',t:'냉장고',img:'img/g-cool.webp',d:'캠핑용 컴프레서 냉장고. 바닥 크기와 높이를 실제 값으로 넣었어요. 테이블 아래 공간에 들어가는지 확인해보세요.',
   items:()=>GEAR_ORDER.filter(id=>GEAR[id].gtype==='fridge').map(id=>gearCard(id))},
];
function gearCard(id){const g=GEAR[id];
  return {id,b:gearBrand(g),q:`${g.name} ${g.model} ${g.group} ${g.gtype==='stove'||g.gtype==='fan'||g.gtype==='wood'?'난로 히터 화목난로 장작':''}${g.gtype==='fridge'?'냉장고 쿨러 아이스박스':''}${g.gtype==='burner'?'버너 스토브 강염 화구 ':''}${g.gtype==='chair'?'의자 체어 '+(g.srcName||''):''}${g.sleep?'매트 침대 야전침대 코트 자충':''}${g.alu?'알루텍 알루미늄 박스 수납':''}`,html:`<div class="gpv"><span class="bt">${g.group}</span>${confBadge(g.conf)}${catPreview(id)}</div>
    <div class="gb"><div><h3>${g.name}</h3><span class="md">${g.model}</span></div>
    <dl><dt>가로×세로</dt><dd>${fmt(g.w)}×${fmt(g.d)}mm</dd><dt>높이</dt><dd>${fmt(g.h)}mm</dd>${g.sh?`<dt>좌면 높이</dt><dd>${fmt(g.sh)}mm</dd>`:''}${g.kg?`<dt>무게</dt><dd>${g.kg}kg</dd>`:''}</dl>
    ${g.note?`<p class="nt">${g.note}</p>`:''}
    <div class="ga"><button type="button" onclick="gearUse('item','${id}')">배치에 놓기</button>${gLink(g)?`<a href="${gLink(g)}" target="_blank" rel="noopener">출처 ↗</a>`:''}</div></div>`};}
const GBRANDS=['스노우피크','헬리녹스','커밋','토요토미','파세코','신일','엑스페드','스패로우','도메틱','알루텍','코베아'];
function gearBrand(g){const n=g.name||'';return GBRANDS.find(b=>n.startsWith(b))||'스노우피크';}
let GEAR_F='all';const G_OPEN=new Set();
/* 장비 카드 그림: 힉스필드로 만든 제품 사진풍 그림이 있으면 도형 대신 보여줌 (텐트·타프는 도면 그대로) */
const GEAR_ART=new Set(["reg3", "long4", "sep2", "sep3", "sep4", "mf_reg", "mf_long", "open_L", "open_R", "corner_L", "corner_R", "slide_h", "slide_hl", "h020", "wood_s", "wood_w", "steel1", "lid_half", "box_half", "mesh_d1", "mesh_s1", "mesh_hd", "mesh_hs", "flat", "seppou", "CK-230", "CK-220", "legs", "sc25", "sc50", "mytable", "mytable_s", "fshelf", "fshelf_l", "fshelf_m", "sp_oat", "sp_oat_l", "sp_oat_low", "sp_chabu", "sp_kitchen", "hx_t1", "hx_t1l", "hx_t0lt", "hx_cafe", "kermit_t", "noga_table", "alu48", "alu68", "alu93", "sp_jikaro", "megamat", "megamat_duo", "sparrow50", "cot_one", "sp_low30", "sp_lowshort", "sp_fd", "sp_take", "hx_one", "hx_zero", "hx_sunset", "kermit", "noga_chair", "omni230", "camp5000", "sfh1200", "sfh300", "mk_stove", "toyotomi_lcl53", "sfh_bh900", "sp_gs1000", "cfx3_35", "cfx3_45", "cfx3_55"]);
function gArt(it){if(!GEAR_ART.has(it.id))return it.html;
  return it.html.replace(/<svg[\s\S]*?<\/svg>/,`<img class="gart" src="img/gear/${it.id}.webp" alt="" loading="lazy"><span class="gart-ai">AI 그림</span>`);}
function renderGear(){const nav=document.getElementById('gearNav'),body=document.getElementById('gearBody');if(!body)return;
  const q=(document.getElementById('gearQ').value||'').trim().toLowerCase();
  const secs=GSEC.map(s=>({...s,list:s.items().filter(it=>!q||it.q.toLowerCase().includes(q))}));
  nav.innerHTML=[['all','전체',secs.reduce((n,s)=>n+s.list.length,0)]].concat(secs.map(s=>[s.k,s.t,s.list.length]))
    .map(([k,t,n])=>`<button type="button" aria-pressed="${GEAR_F===k}" onclick="GEAR_F='${k}';renderGear();window.scrollTo({top:document.querySelector('.gnav').offsetTop-56,behavior:'smooth'})">${t}<small>${n}</small></button>`).join('');
  let html='';
  secs.forEach(s=>{if(GEAR_F!=='all'&&GEAR_F!==s.k)return;if(!s.list.length)return;
    let groups=new Map();s.list.forEach(it=>{const b=it.b||'기타';if(!groups.has(b))groups.set(b,[]);groups.get(b).push(it);});
    if(s.k==='tent'){const {main,minor}=tentBrandOrder(),g2=new Map();main.forEach(b=>{if(groups.has(b))g2.set(b,groups.get(b));});
      const etc=minor.flatMap(b=>groups.get(b)||[]);if(etc.length)g2.set(T_ETC,etc);groups.forEach((v,b)=>{if(!g2.has(b)&&!minor.includes(b))g2.set(b,v);});groups=g2;}
    const solo=GEAR_F===s.k&&groups.size===1;
    html+=`<section class="gsec" id="g-${s.k}"><div class="ghead"><img src="${s.img}" alt="" loading="lazy"><div class="gtt"><h2>${s.t}</h2><span>${s.list.length}</span></div></div>
      ${[...groups].map(([b,items])=>{const key=s.k+'|'+b,open=q||solo||G_OPEN.has(key);
        return `<details class="gbrand" data-k="${esc(key)}"${open?' open':''}><summary><b>${esc(b)}</b><span>${items.length}</span></summary>
        <div class="ggrid">${items.map(it=>`<article class="gcard">${gArt(it)}</article>`).join('')}</div></details>`;}).join('')}</section>`;});
  body.innerHTML=html||`<div class="gempty">‘${esc(q)}’에 맞는 장비가 없어요.</div>`;
  if(!q)body.querySelectorAll('details.gbrand').forEach(d=>d.addEventListener('toggle',()=>{d.open?G_OPEN.add(d.dataset.k):G_OPEN.delete(d.dataset.k);}));
}
function gearUse(kind,id){go('plan');afterPaint(()=>{
  if(kind==='tent'){pickTent(id);showTab('tent');fitView();render();}
  else if(kind==='tarp'){pickTarp(id);showTab('tarp');fitView();render();}
  else if(kind==='item'){showTab('gear');addMain(id);}
  else{showTab('gear');const hasIgt=state.pieces.some(p=>CATALOG[p.type]&&CATALOG[p.type].kind==='frame');
    if(!hasIgt)addMain('reg3');setStatus(hasIgt?'IGT를 누르고 아래 도구의 ‘파츠·붙이기’에서 칸을 채워요.':'IGT 프레임을 하나 놓았어요. 아래 도구의 ‘파츠·붙이기’로 칸을 채워요.');
    const h=document.getElementById('hint');if(h){h.textContent='IGT를 누르고 ‘파츠·붙이기’로 칸을 채워요';h.hidden=false;}}});}

/* ---------- share link (GitHub 판) ---------- */
async function shareLinkGo(){if(IN_CLAUDE){copyCode();return;}
  const c=CURRENT_CODE||await encodePlan(planObj());const url=location.origin+location.pathname+'?p='+encodeURIComponent(c)+'#plan';
  try{if(navigator.share&&matchMedia('(pointer:coarse)').matches){await navigator.share({title:'캠테리어 배치',url});setStatus('공유했어요.');return;}}catch(e){if(e&&e.name==='AbortError')return;}
  try{await navigator.clipboard.writeText(url);setStatus('링크를 복사했어요. 받은 사람이 열면 이 배치가 그대로 보여요.');}catch(e){const box=document.getElementById('codeOut');document.getElementById('codeWrap').hidden=false;box.value=url;box.select();setStatus('링크를 위 칸에서 복사해 주세요.');}}
(function shareLink(){if(IN_CLAUDE){const l=document.getElementById('ssLink');if(l)l.hidden=true;return;}
  const p=new URLSearchParams(location.search).get('p');
  if(p&&/^CAMP-/.test(p)){setTimeout(async()=>{const ok=await loadPlanCode(p,'공유 링크로 받은 배치');history.replaceState(null,'',location.pathname+'#plan');if(ok)go('plan',{noHash:true});},250);}
})();

/* ---------- 2026-10-27 간소화: 저장 시트, 접는 목록 ---------- */
function openSave(){const sh=document.getElementById('saveSheet');if(!sh)return;
  ['codeWrap','importWrap'].forEach(id=>{const e=document.getElementById(id);if(e)e.hidden=true;});
  document.getElementById('sheetSt').innerHTML='';sh.classList.add('open');
  setTimeout(()=>{if(!matchMedia('(pointer:coarse)').matches)document.getElementById('saveName').focus();},60);}
function closeSave(){document.getElementById('saveSheet')?.classList.remove('open');}
addEventListener('keydown',e=>{if(e.key==='Escape')closeSave();});
const _setStatus=setStatus;
setStatus=function(...a){_setStatus(...a);const sh=document.getElementById('sheetSt'),st=document.getElementById('saveStatus');if(sh&&st)sh.innerHTML=st.innerHTML;};
const _startFresh=startFresh;startFresh=async function(){await _startFresh();closeSave();};
const _loadPlanCode2=loadPlanCode;loadPlanCode=async function(...a){const ok=await _loadPlanCode2(...a);if(ok)closeSave();return ok;};
const _renderMine=renderMine;renderMine=function(){_renderMine();const e=document.querySelector('#myList .empty');if(e)e.textContent='아직 없어요. 위의 저장하기를 눌러보세요.';};

/* 텐트 브랜드 정리: 스노우피크 먼저, 나머지는 텐트 많은 순. 3종 이하 브랜드는 '그 외 브랜드' 하나로 묶음 */
const T_MINOR=3,T_ETC='그 외 브랜드';
function tentBrandOrder(){const n={};TENT_ORDER.forEach(id=>{const b=TENTS[id].brand;if(b)n[b]=(n[b]||0)+1;});
  const main=Object.keys(n).filter(b=>n[b]>T_MINOR).sort((a,b)=>(b==='스노우피크')-(a==='스노우피크')||n[b]-n[a]);
  const minor=Object.keys(n).filter(b=>n[b]<=T_MINOR).sort((a,b)=>n[b]-n[a]||a.localeCompare(b,'ko'));return {main,minor};}
/* 텐트 목록: 브랜드별 접기 + 찾기 */
const T_OPEN=new Set();
const tentBtn=id=>{const T=TENTS[id];return `<button class="tent" aria-pressed="${id===tent.id}" onclick="pickTent('${id}')">
  ${tentThumb(T,T.inners[T.innerDefault])}<span><span class="nm">${T.name}${T.est&&!T.drawn?'<span class="bdg est">도면 추정</span>':''}</span><br><span class="md">${T.outer?`${T.model}, ${T.size[0]}×${T.size[1]}cm`:'타프나 테이블만 놓을 때'}</span></span></button>`;};
renderTentList=function(){const el=document.getElementById('tentList');if(!el)return;
  const q=((document.getElementById('tentQ')||{}).value||'').trim().toLowerCase();
  const hit=id=>{const T=TENTS[id];return !q||`${T.name} ${T.model} ${T.brand||''}`.toLowerCase().includes(q);};
  let html='';
  const {main,minor}=tentBrandOrder();
  main.forEach(b=>{const ids=TENT_ORDER.filter(id=>TENTS[id].brand===b&&hit(id));if(!ids.length)return;
    const open=!!q||T_OPEN.has(b),cur=ids.includes(tent.id);
    html+=`<details class="fold" data-k="${esc(b)}"${open?' open':''}><summary><b>${esc(b)}</b>${cur?`<em>${esc(TENTS[tent.id].name)}</em>`:''}<span>${ids.length}</span></summary><div class="fold-in">${ids.map(tentBtn).join('')}</div></details>`;});
  const mg=minor.map(b=>[b,TENT_ORDER.filter(id=>TENTS[id].brand===b&&hit(id))]).filter(x=>x[1].length);
  if(mg.length){const all=mg.flatMap(x=>x[1]),open=!!q||T_OPEN.has(T_ETC),cur=all.includes(tent.id);
    html+=`<details class="fold" data-k="${T_ETC}"${open?' open':''}><summary><b>${T_ETC}</b><small class="fold-sub">${mg.map(x=>esc(x[0])).join(' · ')}</small>${cur?`<em>${esc(TENTS[tent.id].name)}</em>`:''}<span>${all.length}</span></summary><div class="fold-in">${mg.map(([b,ids])=>`<p class="fold-h">${esc(b)}</p>${ids.map(tentBtn).join('')}`).join('')}</div></details>`;}
  const rest=TENT_ORDER.filter(id=>!TENTS[id].brand&&hit(id));if(rest.length)html+=`<div class="fold-rest">${rest.map(tentBtn).join('')}</div>`;
  el.innerHTML=html||`<div class="cat-empty">‘${esc(q)}’에 맞는 텐트가 없어요.</div>`;
  if(!q)el.querySelectorAll('details.fold').forEach(d=>d.addEventListener('toggle',()=>{d.open?T_OPEN.add(d.dataset.k):T_OPEN.delete(d.dataset.k);}));
  if(typeof renderLineup==='function')renderLineup();};
/* 장비 목록: 분류별 접기 + 찾기 */
const C_OPEN=new Set();
renderCatalog=function(){const el=document.getElementById('catalog');if(!el)return;
  const q=(document.getElementById('catQ').value||'').trim().toLowerCase();let html='';
  CAT_GROUPS.forEach(([g,ids])=>{
    const list=ids.filter(t=>{const c=CATALOG[t];return !q||(c.name+' '+c.model+' '+g+' '+(c.note||'')+' '+({stove:'난로 스토브',fan:'팬히터 히터 난로',wood:'화목난로 장작 난로',fridge:'냉장고 쿨러',box:'수납 박스',shelf:'선반 쉘프',table:'테이블',chair:'의자 체어',mat:'매트 자충 에어 침구',cot:'야전침대 코트 침대'}[c.gtype]||'')).toLowerCase().includes(q);});if(!list.length)return;
    const open=!!q||C_OPEN.has(g);
    html+=`<details class="fold" data-k="${esc(g)}"${open?' open':''}><summary><b>${esc(g)}</b><span>${list.length}</span></summary><div class="fold-in catalog-in">`;
    list.forEach(t=>{const c=CATALOG[t],b=bbox(c.verts),w=Math.round(b[1][0]-b[0][0]),d=Math.round(b[1][1]-b[0][1]);
      const size=c.kind==='gear'?`${c.w}×${c.d}×${c.h}`:`${w}×${d}`;
      html+=`<button type="button" class="pc" onclick="catAdd('${t}')" aria-label="${esc(c.name)} 놓기"><span class="pv">${catPreview(t)}</span>
        <span><span class="pn">${esc(c.name)}</span><br><span class="pm">${size}mm</span></span></button>`;});
    html+='</div></details>';});
  el.innerHTML=html||`<div class="cat-empty">‘${esc(q)}’에 맞는 장비가 없어요.</div>`;
  if(!q)el.querySelectorAll('details.fold').forEach(d=>d.addEventListener('toggle',()=>{d.open?C_OPEN.add(d.dataset.k):C_OPEN.delete(d.dataset.k);}));};
renderTentList();renderCatalog();renderMine();
(function introCounts(){const n=document.getElementById('nTent');if(n)n.textContent=Math.floor(TENT_ORDER.filter(id=>TENTS[id].outer).length/10)*10;})();

/* ---------- boot ---------- */
(function camteriorBoot(){
  const fromHash=(location.hash||'').slice(1);
  let start=fromHash||'intro';
  if(new URLSearchParams(location.search).get('p'))start='plan';
  go(start,{noHash:true,keepScroll:true});
  if(!IN_CLAUDE&&!fromHash)history.replaceState(null,'','#'+CUR);
  if('serviceWorker' in navigator&&!IN_CLAUDE&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
})();

/* ---------- v19.1 touch gestures: one finger = move piece / pan, two fingers = zoom ----------
   Each gesture follows only its own pointer, stops on pointercancel, and yields to a pinch.
   On touch, a tap near a small piece grabs it (26px tolerance). */
const TOUCH_TOL=26;
function trackPointer(e,onMove,onEnd){const id=e.pointerId,seq=gestSeq;let done=false;
  const fin=(ev,cancel)=>{if(done)return;done=true;removeEventListener('pointermove',mv);removeEventListener('pointerup',up);removeEventListener('pointercancel',cn);onEnd(ev,cancel||seq!==gestSeq);};
  const mv=ev=>{if(ev.pointerId!==id)return;if(seq!==gestSeq||PT.size>1){fin(ev,true);return;}onMove(ev);};
  const up=ev=>{if(ev.pointerId===id)fin(ev,false);};const cn=ev=>{if(ev.pointerId===id)fin(ev,true);};
  addEventListener('pointermove',mv);addEventListener('pointerup',up);addEventListener('pointercancel',cn);}
const multiTouch=e=>e.pointerType!=='mouse'&&PT.size>1;
function toWorld(ev){const r=document.getElementById('svgHost').getBoundingClientRect();return [viewX+(ev.clientX-r.left)/SCALE,viewY+(ev.clientY-r.top)/SCALE];}
function nearPiece(e){const w=toWorld(e),tol=TOUCH_TOL/SCALE;let best=null,bd=Infinity;
  state.pieces.forEach(p=>{if(!p._v)return;let d=pointInPoly(w,p._v)?0:Infinity;
    if(d)for(let k=0;k<p._v.length;k++)d=Math.min(d,segDist(w,p._v[k],p._v[(k+1)%p._v.length]));
    if(d<bd){bd=d;best=rootOf(p).uid;}});
  return bd<=tol?best:null;}
startPan=function(e,onClick){if(e.button>0||multiTouch(e))return;
  if(e.pointerType!=='mouse'&&!onClick){const hit=nearPiece(e);if(hit!=null){startDrag(e,hit);return;}}
  const sx=e.clientX,sy=e.clientY,vx0=viewX,vy0=viewY,svg=document.querySelector('#svgHost svg');let moved=false;
  trackPointer(e,ev=>{if(!moved&&Math.hypot(ev.clientX-sx,ev.clientY-sy)<4)return;moved=true;viewX=vx0-(ev.clientX-sx)/SCALE;viewY=vy0-(ev.clientY-sy)/SCALE;setViewBox();},
    (ev,cancel)=>{if(cancel){if(moved)render();return;}
      if(moved){justDragged=true;setTimeout(()=>justDragged=false,80);render();}else if(onClick)onClick();else if(sel!=null){sel=null;render();}});};
startDrag=function(e,rootUid){if(e.button>0||multiTouch(e))return;e.stopPropagation();
  drag={rootUid,sx:e.clientX,sy:e.clientY,moved:false};const g=document.getElementById('isl-'+rootUid);let raf=0,lx=0,ly=0;
  trackPointer(e,ev=>{if(!drag)return;const dx=ev.clientX-drag.sx,dy=ev.clientY-drag.sy;if(!drag.moved&&Math.hypot(dx,dy)<6)return;drag.moved=true;g&&g.classList.add('drag');
      lx=dx;ly=dy;if(!raf)raf=requestAnimationFrame(()=>{raf=0;g&&g.setAttribute('transform',`translate(${(lx/SCALE).toFixed(2)} ${(ly/SCALE).toFixed(2)})`);});},
    (ev,cancel)=>{if(raf)cancelAnimationFrame(raf);const d=drag;drag=null;if(!d)return;
      if(cancel){if(g){g.removeAttribute('transform');g.classList.remove('drag');}return;}
      if(d.moved){const r=byId(d.rootUid);r.ox=snap((r.ox||0)+(ev.clientX-d.sx)/SCALE);r.oy=snap((r.oy||0)+(ev.clientY-d.sy)/SCALE);sel=d.rootUid;
        justDragged=true;setTimeout(()=>justDragged=false,80);render();}
      else if(sel!==d.rootUid){sel=d.rootUid;justDragged=true;setTimeout(()=>justDragged=false,80);render();}});};
tarpDown=function(e){if(e.button>0||multiTouch(e))return;
  if(sel!=='tarp'){const hit=e.pointerType!=='mouse'?nearPiece(e):null;if(hit!=null){startDrag(e,hit);return;}startPan(e,()=>{sel='tarp';render();});return;}
  const sx=e.clientX,sy=e.clientY,g=document.getElementById('tarpG');let moved=false;
  trackPointer(e,ev=>{const dx=ev.clientX-sx,dy=ev.clientY-sy;if(!moved&&Math.hypot(dx,dy)<6)return;moved=true;g.setAttribute('transform',`translate(${(dx/SCALE).toFixed(1)} ${(dy/SCALE).toFixed(1)})`);},
    (ev,cancel)=>{if(cancel){g&&g.removeAttribute('transform');return;}
      if(moved){tarp.x+=(ev.clientX-sx)/SCALE;tarp.y+=(ev.clientY-sy)/SCALE;justDragged=true;setTimeout(()=>justDragged=false,80);render();}});};
const _rotDown=rotDown;
rotDown=function(e,uid){if(multiTouch(e))return;_rotDown(e,uid);};
/* phones: fit to the tent and gear only (the tarp runs off-screen; drag to see it) so pieces are big enough to grab */
const _fitView=fitView;
fitView=function(){const [hw,hh]=hostSize();if(!hw)return;if(hw>=600)return _fitView();
  const T=TENTS[tent.id];let pts=[];if(T.outer)pts=pts.concat(T.outer);
  state.pieces.forEach(p=>{if(p._v)pts=pts.concat(p._v);});
  if(!pts.length)return _fitView();const b=bbox(pts),m=18,bottom=64,w=b[1][0]-b[0][0],h=b[1][1]-b[0][1];
  SCALE=Math.min((hw-2*m)/w,(hh-2*m-bottom)/h);viewX=(b[0][0]+b[1][0])/2-hw/SCALE/2;viewY=(b[0][1]+b[1][1])/2-(hh-bottom)/SCALE/2;};
/* iOS: keep the page / app sheet from scrolling or zooming while a finger is on the board */
(function(){const bd=document.getElementById('board');if(!bd)return;
  bd.addEventListener('touchmove',e=>{e.preventDefault();},{passive:false});
  ['gesturestart','gesturechange','gestureend'].forEach(t=>document.addEventListener(t,e=>{if(e.target&&e.target.closest&&e.target.closest('#board'))e.preventDefault();},{passive:false}));
  bd.addEventListener('contextmenu',e=>e.preventDefault());})();

/* v19.2 난로를 놓으면 짧은 주의 문구 */
const _addMain=addMain;
addMain=function(t,...a){const r=_addMain(t,...a);if(CATALOG[t]&&CATALOG[t].heat)setTimeout(()=>{const el=document.getElementById('hint');if(!el)return;
  el.textContent='🔥 난로는 텐트 천·이너룸과 넉넉히 띄우고 환기하세요';el.style.display='block';clearTimeout(toastT);toastT=setTimeout(()=>{el.style.display='none';el.textContent=HINT0;},3200);},400);return r;};

/* 사용 집계 (GoatCounter, 쿠키 없음): 관리실(admin.html)에서 봄. 이름·장비 글자는 안 보내고, 목록에 없던 장비 이름만 보냄 */
function camEv(path,title){try{if(window.goatcounter&&goatcounter.count)goatcounter.count({path:path,title:title||path,event:true});}catch(e){}}
(function(){const wrap=(name,ev)=>{const f=window[name];if(typeof f!=='function')return;window[name]=function(...a){try{ev(...a);}catch(e){}return f.apply(this,a);};};
  wrap('open3D',()=>camEv('view-3d','입체 보기'));
  wrap('saveMine',()=>camEv('save','내 배치 저장'));
  wrap('shareLinkGo',()=>camEv('share-link','링크 보내기'));
  wrap('exportCard',()=>camEv('export-card','사진 카드'));
  wrap('exportPNG',()=>camEv('export-png','평면도 이미지'));
  wrap('copyCode',()=>camEv('copy-code','코드 복사'));
  wrap('pickTent',id=>{if(TENTS[id]&&id!=='none'&&id!==tent.id)camEv('tent/'+id,aiTentName?aiTentName(id):TENTS[id].name);});
  wrap('setInner',v=>{if(typeof v==='string'&&v.startsWith('p:')&&INNER_PRESETS[v.slice(2)])camEv('inner/'+v.slice(2),INNER_PRESETS[v.slice(2)].name);});
})();
