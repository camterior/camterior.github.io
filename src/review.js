/* =====================================================================
   캠핑 후기 — 배치 사진 + 실제 사진 + 댓글 (워커 KV에 저장)
   ===================================================================== */
const RV_IMG=k=>AI_URL+'/img/'+k;
let RV={items:null,page:0,more:false,open:null,photos:[]};
const rvNick=v=>{try{if(v!==undefined)localStorage.setItem('camNick',v);return localStorage.getItem('camNick')||'';}catch(e){return '';}};
const rvOwn=(id,v)=>{try{const o=JSON.parse(localStorage.getItem('camRvOwn')||'{}');if(v!==undefined){o[id]=v;localStorage.setItem('camRvOwn',JSON.stringify(o));}return o[id]||'';}catch(e){return '';}};
async function rvCall(v){try{const r=await fetch(AI_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({review:v})});const d=await r.json().catch(()=>({}));return r.ok?d:{fail:d.error||'error'};}catch(e){return {fail:'error'};}}
const rvStars=n=>'★'.repeat(n||0)+'☆'.repeat(5-(n||0));
const rvDate=t=>{const d=new Date(t);return `${d.getMonth()+1}월 ${d.getDate()}일`;};
const rvCover=r=>r.nimg?RV_IMG(r.id+'/0'):(r.hasPlanImg?RV_IMG(r.id+'/p'):'');

async function rvLoad(more){const box=document.getElementById('rvList');if(!box)return;
  if(!more&&RV.items){rvRender();return;}
  if(!more){RV.page=0;box.innerHTML='<p class="rv-empty">불러오는 중…</p>';}
  const d=await rvCall({op:'list',page:more?RV.page+1:0});
  if(d.fail){box.innerHTML='<p class="rv-empty">후기를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>';return;}
  if(more){RV.page++;RV.items=RV.items.concat(d.items);}else RV.items=d.items;RV.more=d.more;rvRender();
  const m=location.hash.match(/^#review\/([a-z0-9]+)/);if(m&&!more)rvOpen(m[1]);}
function rvRender(){const box=document.getElementById('rvList');if(!box)return;
  if(!RV.items.length){box.innerHTML='<p class="rv-empty">아직 올라온 후기가 없어요. 첫 후기를 남겨 주세요!</p>';return;}
  box.innerHTML=RV.items.map(r=>`<button type="button" class="rv-card" onclick="rvOpen('${r.id}')">
    <span class="rv-ph">${rvCover(r)?`<img src="${rvCover(r)}" alt="" loading="lazy">`:''}${r.nimg&&r.hasPlanImg?'<span class="rv-badge">배치+실제</span>':r.hasPlanImg?'<span class="rv-badge">배치</span>':''}</span>
    <span class="rv-b"><b>${aiEsc(r.title)}</b><small>${aiEsc([r.site,r.tent].filter(Boolean).join(' · '))}</small>
    <span class="rv-meta"><span class="rv-st">${rvStars(r.rating)}</span><span>${aiEsc(r.nick)} · ${rvDate(r.at)}</span><span>♥ ${r.likes} · 💬 ${r.nc}</span></span></span></button>`).join('')
    +(RV.more?'<button type="button" class="rv-more" onclick="rvLoad(true)">더 보기</button>':'');}

// ----- 후기 보기 -----
async function rvOpen(id){const dl=rvDialog();dl.innerHTML='<div class="rv-in"><p class="rv-empty">불러오는 중…</p></div>';rvShow(dl);
  const d=await rvCall({op:'get',id});if(d.fail){dl.innerHTML=`<div class="rv-in"><p class="rv-empty">후기를 찾지 못했어요.</p><button type="button" class="rv-no" onclick="rvClose()">닫기</button></div>`;return;}
  RV.open=d;if(!IN_CLAUDE&&location.hash!=='#review/'+id)history.replaceState(null,'','#review/'+id);rvDetail();}
function rvDetail(){const {item:r,comments:cm}=RV.open,dl=document.getElementById('rvDlg');
  const pics=(r.hasPlanImg?[['p','계획한 배치']]:[]).concat(Array.from({length:r.nimg},(_,k)=>[k,'실제 사진 '+(k+1)]));
  const sec=(t,v)=>v?`<div class="rv-sec"><h4>${t}</h4><p>${aiEsc(v)}</p></div>`:'';
  dl.innerHTML=`<div class="rv-in">
    <div class="rv-top"><button type="button" class="rv-x" aria-label="닫기" onclick="rvClose()">×</button></div>
    <div class="rv-pics">${pics.map(([k,l])=>`<figure><img src="${RV_IMG(r.id+'/'+k)}" alt="${l}" loading="lazy"><figcaption>${l}</figcaption></figure>`).join('')}</div>
    <h2 id="rvT">${aiEsc(r.title)}</h2>
    <p class="rv-sub"><span class="rv-st">${rvStars(r.rating)}</span> ${aiEsc([r.site,r.date,r.tent].filter(Boolean).join(' · '))}</p>
    <p class="rv-by">${aiEsc(r.nick)} · ${rvDate(r.at)}</p>
    ${r.gear&&r.gear.length?`<p class="rv-gear">${r.gear.map(g=>`<span>${aiEsc(g)}</span>`).join('')}</p>`:''}
    ${sec('좋았던 점',r.good)}${sec('현장에서 바꾼 점',r.changed)}${sec('다음엔 이렇게',r.next)}
    <div class="rv-acts">${r.plan?`<button type="button" class="rv-go" onclick="rvUsePlan()">이 배치 열어보기</button>`:''}
      <button type="button" class="rv-like" onclick="rvLike(this)">♥ <b>${r.likes}</b></button>
      <button type="button" class="rv-link" onclick="rvShare()">링크 복사</button>
      ${rvOwn(r.id)?`<button type="button" class="rv-del" onclick="rvDel(this)">내 후기 지우기</button>`:`<button type="button" class="rv-rep" onclick="rvReport(this)">신고</button>`}</div>
    <div class="rv-cm"><h3>이야기 <small>${cm.length}</small></h3>
      <ul>${cm.map(c=>`<li><b>${aiEsc(c.nick)}</b><span>${aiEsc(c.text)}</span><small>${rvDate(c.at)}</small></li>`).join('')||'<li class="rv-none">첫 이야기를 남겨 보세요.</li>'}</ul>
      <form onsubmit="event.preventDefault();rvComment()"><input id="rvCN" maxlength="16" placeholder="닉네임" value="${aiEsc(rvNick())}" aria-label="닉네임">
        <input id="rvCT" maxlength="300" placeholder="궁금한 점이나 응원 한마디" aria-label="댓글" required><button type="submit" class="rv-go">남기기</button></form>
      <p class="rv-msg" id="rvCMsg" role="status"></p></div></div>`;}
function rvDialog(){let dl=document.getElementById('rvDlg');if(!dl){dl=document.createElement('dialog');dl.id='rvDlg';dl.className='rv-dlg';dl.setAttribute('aria-labelledby','rvT');document.body.appendChild(dl);
  dl.addEventListener('close',()=>{if(location.hash.startsWith('#review/'))history.replaceState(null,'','#board');});
  dl.addEventListener('click',e=>{if(e.target===dl)dl.close();});}return dl;}
function rvShow(dl){if(!dl.open){try{dl.showModal();}catch(e){dl.setAttribute('open','');}}}
function rvClose(){const d=document.getElementById('rvDlg');if(d&&d.open)d.close();}
async function rvUsePlan(){const r=RV.open.item;rvClose();go('plan');if(typeof loadPlanCode==='function')await loadPlanCode(r.plan,r.title);}
async function rvLike(b){b.disabled=true;const d=await rvCall({op:'like',id:RV.open.item.id});if(d.ok){b.querySelector('b').textContent=d.likes;b.classList.add('on');RV.open.item.likes=d.likes;const it=(RV.items||[]).find(x=>x.id===RV.open.item.id);if(it){it.likes=d.likes;rvRender();}}}
async function rvComment(){const nick=document.getElementById('rvCN').value.trim(),text=document.getElementById('rvCT').value.trim(),m=document.getElementById('rvCMsg');if(!text)return;
  rvNick(nick);m.textContent='남기는 중…';const d=await rvCall({op:'comment',id:RV.open.item.id,nick,text});
  if(d.fail){m.textContent=d.fail==='quota'?'오늘은 이야기를 많이 남겼어요. 내일 다시 남겨 주세요.':'남기지 못했어요. 잠시 뒤 다시 해 주세요.';return;}
  RV.open.comments=d.comments;const it=(RV.items||[]).find(x=>x.id===RV.open.item.id);if(it){it.nc=d.comments.length;rvRender();}rvDetail();}
async function rvReport(b){if(!confirm('이 후기를 신고할까요? 여러 명이 신고하면 관리자가 확인할 때까지 숨겨져요.'))return;b.disabled=true;await rvCall({op:'report',id:RV.open.item.id});b.textContent='신고했어요';}
async function rvDel(b){if(!confirm('내 후기를 지울까요? 사진과 댓글도 함께 지워져요.'))return;b.disabled=true;const id=RV.open.item.id;
  const d=await rvCall({op:'del',id,own:rvOwn(id)});if(d.ok){rvClose();RV.items=(RV.items||[]).filter(x=>x.id!==id);rvRender();}else{b.disabled=false;alert('지우지 못했어요.');}}
async function rvShare(){const u=location.origin+location.pathname+'#review/'+RV.open.item.id;try{await navigator.clipboard.writeText(u);}catch(e){prompt('링크를 복사해 주세요',u);return;}
  const b=document.querySelector('#rvDlg .rv-link');if(b){b.textContent='복사했어요';setTimeout(()=>b.textContent='링크 복사',1800);}}

// ----- 후기 쓰기 -----
function rvWrite(){const dl=rvDialog(),T=TENTS[tent.id],hasPlan=state.pieces.length>0||!!T.outer;RV.photos=[];
  dl.innerHTML=`<form class="rv-in rv-form" onsubmit="event.preventDefault();rvSend()">
    <div class="rv-top"><h2 id="rvT">캠핑 후기 쓰기</h2><button type="button" class="rv-x" aria-label="닫기" onclick="rvClose()">×</button></div>
    <label>제목<input id="rvTitle" maxlength="40" required placeholder="예: 가평 B-12, 랜드록 첫 가을 캠핑"></label>
    <div class="rv-row"><label>캠핑장·사이트<input id="rvSite" maxlength="40" placeholder="예: 자라섬 오토캠핑장 A-3"></label><label>다녀온 날<input id="rvDate" type="date"></label></div>
    <div class="rv-row"><label>닉네임<input id="rvNick" maxlength="16" placeholder="캠퍼" value="${aiEsc(rvNick())}"></label>
      <fieldset class="rv-rate"><legend>별점</legend>${[1,2,3,4,5].map(n=>`<label><input type="radio" name="rvRate" value="${n}"${n===5?' checked':''}><span>★</span></label>`).join('')}</fieldset></div>
    <label class="rv-chk"><input type="checkbox" id="rvPlan"${hasPlan?' checked':''}${hasPlan?'':' disabled'}> <span><b>지금 내부 구성 배치</b>를 같이 올리기<small>${hasPlan?aiEsc((T.outer?T.name:'')+(state.pieces.length?` · 장비 ${state.pieces.filter(p=>p.parent==null).length}세트`:'')):'내부 구성에서 배치를 먼저 만들어 주세요'} — 다른 사람이 ‘이 배치 열어보기’로 그대로 열 수 있어요</small></span></label>
    <div class="rv-up"><label class="rv-pick">📷 실제 사진 고르기 (최대 4장)<input type="file" id="rvPics" accept="image/*" multiple hidden onchange="rvPicked(this)"></label><div class="rv-prev" id="rvPrev"></div></div>
    <p class="rv-note">사진은 줄여서 올리고 위치 정보는 지워요. 얼굴·차 번호판이 크게 나온 사진은 피해 주세요.</p>
    <label>좋았던 점<textarea id="rvGood" maxlength="600" rows="2" placeholder="예: IGT를 입구 쪽에 두니 연기가 잘 빠졌어요"></textarea></label>
    <label>현장에서 바꾼 점<textarea id="rvChanged" maxlength="600" rows="2" placeholder="예: 사이트가 좁아서 타프를 옆으로 돌렸어요"></textarea></label>
    <label>다음엔 이렇게<textarea id="rvNext" maxlength="600" rows="2" placeholder="예: 의자는 4개 대신 3개"></textarea></label>
    <p class="rv-msg" id="rvMsg" role="status"></p>
    <div class="rv-acts"><button type="submit" class="rv-go" id="rvGo">후기 올리기</button><button type="button" class="rv-no" onclick="rvClose()">취소</button></div></form>`;
  rvShow(dl);setTimeout(()=>document.getElementById('rvTitle').focus(),50);}
// 사진을 긴 변 1600px JPEG로 줄임 (캔버스로 다시 그려 위치 정보(EXIF)도 빠짐)
function rvShrink(src,max,q){return new Promise((ok,no)=>{const i=new Image();i.onload=()=>{const k=Math.min(1,max/Math.max(i.naturalWidth,i.naturalHeight)),c=document.createElement('canvas');c.width=Math.round(i.naturalWidth*k);c.height=Math.round(i.naturalHeight*k);
  c.getContext('2d').drawImage(i,0,0,c.width,c.height);let d=c.toDataURL('image/jpeg',q);if(d.length>440000)d=c.toDataURL('image/jpeg',.62);ok(d);};i.onerror=no;i.src=src;});}
async function rvPicked(inp){const fs=[...(inp.files||[])].slice(0,4-RV.photos.length);inp.value='';
  for(const f of fs){const u=URL.createObjectURL(f);try{RV.photos.push(await rvShrink(u,1600,.8));}catch(e){}URL.revokeObjectURL(u);}rvPrevRender();}
function rvPrevRender(){const p=document.getElementById('rvPrev');if(p)p.innerHTML=RV.photos.map((d,k)=>`<span><img src="${d}" alt="고른 사진 ${k+1}"><button type="button" aria-label="사진 ${k+1} 빼기" onclick="RV.photos.splice(${k},1);rvPrevRender()">×</button></span>`).join('');}
async function rvSend(){const m=document.getElementById('rvMsg'),b=document.getElementById('rvGo'),v=id=>document.getElementById(id).value.trim();
  const usePlan=document.getElementById('rvPlan').checked;
  if(!usePlan&&!RV.photos.length){m.textContent='배치나 실제 사진 중 하나는 있어야 해요.';return;}
  b.disabled=true;m.textContent='올리는 중… (사진이 많으면 몇 초 걸려요)';
  let plan='',planImg='',gear=[];
  if(usePlan){try{plan=await encodePlan(planObj());const blob=await exportCard(true);if(blob){const u=URL.createObjectURL(blob);planImg=(await rvShrink(u,1200,.82)).split(',')[1];URL.revokeObjectURL(u);}
    gear=[...new Set(state.pieces.map(p=>CATALOG[p.type].name))].slice(0,12);}catch(e){}}
  const T=TENTS[tent.id];rvNick(v('rvNick'));
  const d=await rvCall({op:'add',title:v('rvTitle'),site:v('rvSite'),date:v('rvDate'),nick:v('rvNick'),rating:+(document.querySelector('input[name=rvRate]:checked')||{}).value||0,
    tent:usePlan&&T.outer?T.name:'',good:v('rvGood'),changed:v('rvChanged'),next:v('rvNext'),plan,planImg,gear,photos:RV.photos.map(x=>x.split(',')[1])});
  if(d.fail){b.disabled=false;m.textContent=d.fail==='quota'?'오늘은 후기를 많이 올렸어요. 내일 다시 올려 주세요.':d.fail==='image'?'사진이 너무 커요. 다른 사진으로 해 주세요.':d.fail==='empty'?'제목을 적어 주세요.':'올리지 못했어요. 잠시 뒤 다시 해 주세요.';return;}
  rvOwn(d.id,d.own);if(typeof camEv==='function')camEv('review-add','후기 올리기');RV.items=null;await rvLoad();rvOpen(d.id);}
