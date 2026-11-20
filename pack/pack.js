/* =====================================================================
   캠핑 챙김 · 내 장비함 (2단계) — 캠핑 일정·체크리스트는 trips.js
   - 캠테리어 '내 장비'와 같은 저장소를 씀
     · 이 기기: localStorage 'camMine' = {"분류:장비번호": 개수}  (캠테리어와 같은 키)
     · 서버: 워커 acct 'get'/'save' (내 코드 = localStorage 'camAcct')
   - 목록에 없는 장비: 키 'my:<id>' 로 같은 목록에 넣고, 이름은 'camMineCustom' = {id:{n:이름, c:분류}}
     (서버에는 save의 custom으로 같이 저장. 캠테리어 화면은 'my:' 키를 모르니 표시하지 않음)
   ===================================================================== */
'use strict';
const API = 'https://camterior-ai.ghdwnd2.workers.dev';
const K_GEAR = 'camMine', K_CUS = 'camMineCustom', K_ACCT = 'camAcct', K_FOLD = 'packFold';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').toLowerCase().replace(/[\s\-_.·,/()]+/g, '');
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const codeGet = () => { try { return localStorage.getItem(K_ACCT) || ''; } catch (e) { return ''; } };
const codeSet = v => { try { v ? localStorage.setItem(K_ACCT, v) : localStorage.removeItem(K_ACCT); } catch (e) {} };

// 직접 넣는 장비의 분류
const CATS = [
  ['tent', '텐트·타프', '⛺'], ['table', '테이블·의자', '💺'], ['sleep', '침구·매트', '🛏'], ['light', '조명·전기', '💡'],
  ['heat', '난방', '🔥'], ['kitchen', '주방·버너', '🍳'], ['store', '수납', '📦'], ['tool', '공구·소품', '🔧'], ['etc', '기타', '🎒']];
const CAT = Object.fromEntries(CATS.map(([k, t, i]) => [k, { t, i }]));
// 캠테리어 분류의 사진 없는 장비용 그림
const SEC_ICON = { tent: '⛺', tarp: '⛱', inner: '🏕', igt: '🍽', parts: '🔩', gear: '📦', sleep: '🛏', chair: '💺', heat: '🔥', fire: '🍳', cool: '❄️' };

let MYG = lsGet(K_GEAR, {}) || {};
let CUS = lsGet(K_CUS, {}) || {};
let SECS = [], ITEMS = [], BY = new Map();
let FOLD = lsGet(K_FOLD, {}) || {};
let SEC_PICK = null;

/* ---------- 장비 정보 ---------- */
function info(key) {
  const it = BY.get(key);
  if (it) return it;
  if (key.startsWith('my:')) {
    const id = key.slice(3), c = CUS[id];
    const cat = CAT[(c && c.c)] ? c.c : 'etc';
    return { key, my: true, id, name: (c && c.n) || '이름 없는 장비', grp: 'my-' + cat, grpT: CAT[cat].t, icon: CAT[cat].i, cat };
  }
  // 캠테리어 목록이 바뀌어 지금은 없는 장비
  return { key, gone: true, id: key.split(':').pop(), name: key.split(':').pop(), grp: 'gone', grpT: '목록에서 찾지 못한 장비', icon: '❔' };
}
function groups() {
  return [...SECS.map(([k, t]) => ({ k, t })), ...CATS.map(([k, t]) => ({ k: 'my-' + k, t })), { k: 'gone', t: '목록에서 찾지 못한 장비' }];
}
const thumb = it => it.ph
  ? `<span class="th"><img src="../img/gear/${esc(it.id)}.webp" alt="" loading="lazy" decoding="async"></span>`
  : `<span class="th ic" aria-hidden="true">${it.icon || '🎒'}</span>`;

/* ---------- 저장 ---------- */
function saveLocal() { lsSet(K_GEAR, MYG); lsSet(K_CUS, CUS); }
function save() { saveLocal(); queue(); }
function setCount(key, n) {
  n = Math.max(0, Math.min(20, n));
  if (n) MYG[key] = n; else { delete MYG[key]; if (key.startsWith('my:')) delete CUS[key.slice(3)]; }
  save();
}

/* ---------- 서버 (캠테리어와 같은 내 코드) ---------- */
let syncState = 'idle', timer = null, creating = null;
async function call(a) {
  try {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acct: a }) });
    const d = await r.json().catch(() => ({}));
    return r.ok ? d : { fail: d.error || 'error' };
  } catch (e) { return { fail: 'network' }; }
}
function ensureCode() {
  if (codeGet()) return Promise.resolve(codeGet());
  if (!creating) creating = (async () => { try { const d = await call({ op: 'new' }); if (d.code) { codeSet(d.code); return d.code; } return ''; } finally { creating = null; } })();
  return creating;
}
function syncUI(s) {
  if (s) syncState = s;
  const t = { idle: codeGet() ? '캠테리어와 같은 목록' : '이 기기에 저장돼요', wait: '저장하는 중…', ok: '저장했어요 · 캠테리어와 같은 목록', off: '서버에 연결하지 못했어요 · 이 기기에는 저장됐어요', pull: '불러오는 중…' }[syncState];
  const el = $('sync'); el.textContent = t; el.dataset.s = syncState;
}
// 바뀌면 1.5초 뒤 한 번에 저장 (캠테리어와 같은 방식)
function queue() {
  clearTimeout(timer); syncUI('wait');
  timer = setTimeout(async () => {
    const c = await ensureCode();
    if (!c) { syncUI('off'); acctUI(); return; }
    const d = await call({ op: 'save', code: c, gear: MYG, custom: CUS });
    syncUI(d.ok ? 'ok' : 'off'); acctUI();
  }, 1500);
}
// 서버에 장비가 있으면 서버 쪽을 씀 (캠테리어와 같은 규칙). 직접 넣은 장비 이름은 서버·이 기기 것을 합침
function adopt(d) {
  const srv = d.gear || {};
  if (!Object.keys(srv).length) return false;
  const names = Object.assign({}, CUS, d.custom || {});
  MYG = srv; CUS = {};
  Object.keys(MYG).forEach(k => { if (k.startsWith('my:') && names[k.slice(3)]) CUS[k.slice(3)] = names[k.slice(3)]; });
  saveLocal(); return true;
}
async function pull() {
  const c = codeGet(); if (!c) { syncUI('idle'); acctUI(); return; }
  syncUI('pull');
  const d = await call({ op: 'get', code: c });
  if (d.code) { if (!adopt(d) && Object.keys(MYG).length) queue(); else syncUI('idle'); render(); }
  else if (d.fail === 'nocode') { codeSet(''); syncUI('idle'); }
  else syncUI('off');
  acctUI();
}

/* ---------- 내 장비 목록 ---------- */
function render() {
  if (typeof tripsRefresh === 'function') tripsRefresh(); // 캠핑 체크리스트도 같은 장비 목록을 씀 (trips.js)
  const keys = Object.keys(MYG);
  const kinds = keys.length, total = keys.reduce((a, k) => a + MYG[k], 0);
  $('cnt').innerHTML = kinds ? `<b>${kinds}</b>종 · <b>${total}</b>개` : '아직 장비가 없어요';
  const box = $('list');
  if (!kinds) {
    box.innerHTML = `<div class="empty"><img class="empty-art" src="img/empty-gear.webp" alt="" width="140" height="140"><p><b>아직 등록한 장비가 없어요</b></p><p>위에서 이름으로 찾거나 분류를 눌러 넣어 보세요. 캠테리어에서 넣은 장비도 여기에 그대로 나와요.</p></div>`;
    $('foldAll').hidden = true; return;
  }
  const by = {};
  keys.forEach(k => { const it = info(k); (by[it.grp] = by[it.grp] || []).push(it); });
  const many = kinds > 8;
  box.innerHTML = groups().filter(g => by[g.k]).map(g => {
    const list = by[g.k].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const open = g.k in FOLD ? !!FOLD[g.k] : !many;
    const n = list.reduce((a, it) => a + MYG[it.key], 0);
    return `<details class="grp" data-g="${g.k}"${open ? ' open' : ''}><summary><span class="g-t">${esc(g.t)}${g.k.startsWith('my-') ? '<em>직접 넣음</em>' : ''}</span><small>${n}개</small><span class="g-peek">${esc(list.map(it => it.name).join(', '))}</span></summary>
      <ul>${list.map(row).join('')}</ul></details>`;
  }).join('');
  $('foldAll').hidden = Object.keys(by).length < 2;
  $('foldAll').textContent = box.querySelector('details[open]') ? '모두 접기' : '모두 펼치기';
}
function row(it) {
  const n = MYG[it.key];
  const sub = it.my ? '<small class="tag">직접 넣음</small>' : it.gone ? '<small>캠테리어 목록에서 빠진 장비예요</small>' : it.model ? `<small>${esc(it.model)}</small>` : '';
  return `<li data-k="${esc(it.key)}">${thumb(it)}<span class="nm"><b>${esc(it.name)}</b>${sub}</span>
    ${it.my ? `<button type="button" class="edit" data-act="edit" aria-label="${esc(it.name)} 이름·분류 고치기">✎</button>` : ''}
    <span class="step"><button type="button" data-act="-" aria-label="${esc(it.name)} 하나 빼기">−</button><b aria-label="${n}개">${n}</b><button type="button" data-act="+" aria-label="${esc(it.name)} 하나 더">+</button></span></li>`;
}

/* ---------- 찾기·분류별 보기 ---------- */
function chipsUI() {
  $('chips').innerHTML = SECS.map(([k, t]) => `<button type="button" data-sec="${k}" aria-pressed="${SEC_PICK === k}">${esc(t)}</button>`).join('');
}
function resultRow(it) {
  const n = MYG[it.key] || 0;
  return `<li data-k="${esc(it.key)}">${thumb(it)}<span class="nm"><b>${esc(it.name)}</b><small>${esc(it.secT)}${it.model ? ' · ' + esc(it.model) : ''}</small></span>
    <button type="button" class="add-btn${n ? ' on' : ''}" data-act="add">${n ? `${n}개 · 하나 더` : '+ 넣기'}</button></li>`;
}
function search() {
  const raw = $('q').value.trim(), q = norm(raw), out = $('res');
  if (SEC_PICK && !q) { out.innerHTML = ITEMS.filter(x => x.k === SEC_PICK).map(resultRow).join(''); return; }
  if (q.length < 2) { out.innerHTML = ''; return; }
  let hit = ITEMS.filter(x => x.hay.includes(q));
  if (!hit.length) { // 띄어 쓴 낱말별로 가장 많이 맞는 것
    const toks = [...new Set(raw.split(/[\s,·/]+/).map(norm).filter(t => t.length > 1))];
    if (toks.length > 1) {
      const sc = ITEMS.map(x => [x, toks.filter(t => x.hay.includes(t)).length]), top = Math.max(...sc.map(a => a[1]));
      if (top >= 2) hit = sc.filter(a => a[1] === top).map(a => a[0]);
    }
  }
  if (SEC_PICK) hit = hit.filter(x => x.k === SEC_PICK);
  hit = hit.slice(0, 15);
  out.innerHTML = hit.map(resultRow).join('') +
    `<li class="self"><span>${hit.length ? '찾는 장비가 없나요?' : '캠테리어 목록에 없는 장비예요.'}</span><button type="button" class="add-btn" data-act="self">‘${esc(raw.slice(0, 20))}’ 직접 넣기</button></li>`;
}

/* ---------- 직접 넣기 / 고치기 ---------- */
let selfEdit = null, selfCat = 'etc', selfN = 1, catTouched = false;
function selfOpen(name, editId) {
  selfEdit = editId || null; catTouched = !!editId;
  const c = editId ? CUS[editId] || {} : {};
  $('sName').value = editId ? c.n || '' : (name || '');
  selfCat = editId ? (CAT[c.c] ? c.c : 'etc') : guessCat(name || '');
  selfN = editId ? MYG['my:' + editId] || 1 : 1;
  $('sT').textContent = editId ? '직접 넣은 장비 고치기' : '직접 넣기';
  $('sOk').textContent = editId ? '고치기' : '넣기';
  $('sErr').textContent = '';
  selfCatsUI(); $('sN').textContent = selfN;
  const d = $('selfDlg'); try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
  setTimeout(() => { const i = $('sName'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 50);
}
function selfCatsUI() {
  $('sCats').innerHTML = CATS.map(([k, t, i]) => `<button type="button" data-cat="${k}" aria-pressed="${selfCat === k}"><span aria-hidden="true">${i}</span>${esc(t)}</button>`).join('');
}
// 이름으로 분류 짐작 (고를 수 있음)
function guessCat(s) {
  const t = norm(s);
  const R = [['light', /랜턴|조명|라이트|전구|헤드랜턴|파워뱅크|배터리|릴선|멀티탭|파워/], ['heat', /난로|히터|난방|전기장판|온수매트/], ['kitchen', /버너|코펠|냄비|팬|그리들|주전자|컵|식기|수저|가스|토치|화로|그릴|쿨러|아이스박스/],
    ['sleep', /침낭|매트|베개|담요|이불|코트|야전침대/], ['table', /테이블|의자|체어|스툴|선반|쉘프/], ['tent', /텐트|타프|쉘터|그라운드|방수포|폴|스트링|팩(?!망치)/],
    ['tool', /망치|해머|팩망치|가위|칼|나이프|장갑|빗자루|집게|공구|로프|카라비너/], ['store', /박스|가방|수납|컨테이너|백|파우치|트렁크/]];
  const m = R.find(([, re]) => re.test(t)); return m ? m[0] : 'etc';
}
function selfSubmit(e) {
  e.preventDefault();
  const n = $('sName').value.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!n) { $('sErr').textContent = '이름을 적어 주세요'; return; }
  const dup = Object.keys(CUS).find(id => id !== selfEdit && norm(CUS[id].n) === norm(n));
  if (dup && !selfEdit) { setCount('my:' + dup, (MYG['my:' + dup] || 0) + selfN); closeSelf(); toast(`이미 있는 ‘${n}’에 ${selfN}개 더했어요`); return; }
  const id = selfEdit || newId();
  CUS[id] = { n, c: selfCat }; MYG['my:' + id] = selfN;
  save(); closeSelf(); render(); search();
  toast(selfEdit ? '고쳤어요' : `‘${n}’ 넣었어요`);
}
const closeSelf = () => { const d = $('selfDlg'); if (d.open) d.close(); };
function newId() { const A = 'abcdefghijkmnpqrstuvwxyz23456789'; let s; do { s = ''; const b = crypto.getRandomValues(new Uint8Array(8)); b.forEach(x => s += A[x % A.length]); } while (CUS[s] || MYG['my:' + s]); return s; }

/* ---------- 알림 (되돌리기) ---------- */
let toastT = null;
function toast(msg, undo) {
  const t = $('toast'); clearTimeout(toastT);
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button" id="undo">되돌리기</button>' : ''}`;
  t.hidden = false;
  if (undo) $('undo').onclick = () => { undo(); t.hidden = true; };
  toastT = setTimeout(() => { t.hidden = true; }, undo ? 5000 : 2200);
}

/* ---------- 다른 기기와 같이 쓰기 (내 코드) ---------- */
function acctUI() {
  const c = codeGet();
  $('acct').innerHTML = `${c
    ? `<div class="code-row"><span>내 코드</span><b class="code">${esc(c)}</b><button type="button" class="btn-line sm" id="copy">복사</button></div>
       <p class="hint">캠테리어와 같은 코드예요. 다른 기기에서 이 코드를 넣으면 같은 장비와 캠핑 일정이 나와요.</p>`
    : `<p class="hint">장비를 넣거나 캠핑을 만들면 내 코드가 자동으로 만들어져요. 다른 기기에서 쓰던 코드가 있으면 아래에 넣어 주세요.</p>`}
    <form class="code-form" id="codeForm"><label class="sr-only" for="codeIn">다른 기기의 내 코드</label>
      <input id="codeIn" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="예: 7KQ2-X9MD"><button type="submit" class="btn-main sm">불러오기</button></form>
    <p class="msg" id="codeMsg" role="status"></p>`;
  const cp = $('copy'); if (cp) cp.onclick = () => (navigator.clipboard ? navigator.clipboard.writeText(c) : Promise.reject()).then(() => $('codeMsg').textContent = '복사했어요', () => $('codeMsg').textContent = '코드: ' + c);
  $('codeForm').onsubmit = codeLoad;
}
async function codeLoad(e) {
  e.preventDefault();
  const msg = $('codeMsg'), v8 = $('codeIn').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (v8.length !== 8) { msg.textContent = '코드는 8글자예요 (예: 7KQ2-X9MD)'; return; }
  const v = v8.slice(0, 4) + '-' + v8.slice(4);
  if (v === codeGet()) { msg.textContent = '지금 쓰고 있는 코드예요'; return; }
  if (Object.keys(MYG).length && !confirm('이 기기의 장비 목록이 그 코드의 장비로 바뀌어요. 불러올까요?')) return;
  msg.textContent = '불러오는 중…';
  const d = await call({ op: 'get', code: v });
  if (!d.code) { msg.textContent = d.fail === 'nocode' ? '없는 코드예요' : d.fail === 'quota' ? '오늘은 더 시도할 수 없어요' : '서버에 연결하지 못했어요'; return; }
  codeSet(d.code); clearTimeout(timer);
  MYG = {}; CUS = {}; adopt(d); saveLocal();
  render(); search(); acctUI(); syncUI('idle');
  $('codeMsg').textContent = '불러왔어요. 이제 이 기기도 같은 코드를 써요';
  if (typeof tripsPull === 'function') tripsPull(true); // 그 코드의 캠핑 일정도
}

/* ---------- 시작 ---------- */
function bind() {
  $('q').addEventListener('input', search);
  $('searchForm').addEventListener('submit', e => e.preventDefault());
  $('chips').addEventListener('click', e => {
    const b = e.target.closest('button[data-sec]'); if (!b) return;
    SEC_PICK = SEC_PICK === b.dataset.sec ? null : b.dataset.sec; chipsUI(); search();
  });
  $('res').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    if (b.dataset.act === 'self') { selfOpen($('q').value.trim()); return; }
    const key = b.closest('li').dataset.k, it = BY.get(key);
    setCount(key, (MYG[key] || 0) + 1); render();
    b.classList.add('on'); b.textContent = `${MYG[key]}개 · 하나 더`;
    toast(`${it ? it.name : '장비'} 넣었어요`);
  });
  $('list').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const key = b.closest('li').dataset.k, it = info(key), was = MYG[key] || 0, wasC = key.startsWith('my:') ? CUS[key.slice(3)] : null;
    if (b.dataset.act === 'edit') { selfOpen('', key.slice(3)); return; }
    setCount(key, was + (b.dataset.act === '+' ? 1 : -1)); render(); search();
    if (!MYG[key]) toast(`${it.name} 뺐어요`, () => { MYG[key] = was; if (wasC) CUS[key.slice(3)] = wasC; save(); render(); search(); });
  });
  $('list').addEventListener('toggle', e => {
    const d = e.target; if (!d.matches || !d.matches('details.grp')) return;
    FOLD[d.dataset.g] = d.open ? 1 : 0; lsSet(K_FOLD, FOLD);
    $('foldAll').textContent = $('list').querySelector('details[open]') ? '모두 접기' : '모두 펼치기';
  }, true);
  $('foldAll').addEventListener('click', () => {
    const open = !$('list').querySelector('details[open]');
    $('list').querySelectorAll('details.grp').forEach(d => { d.open = open; FOLD[d.dataset.g] = open ? 1 : 0; });
    lsSet(K_FOLD, FOLD);
  });
  $('selfBtn').addEventListener('click', () => selfOpen($('q').value.trim()));
  $('selfForm').addEventListener('submit', selfSubmit);
  $('sCancel').addEventListener('click', closeSelf);
  $('selfDlg').addEventListener('click', e => { if (e.target === $('selfDlg')) closeSelf(); });
  $('sCats').addEventListener('click', e => { const b = e.target.closest('button[data-cat]'); if (!b) return; selfCat = b.dataset.cat; catTouched = true; selfCatsUI(); });
  $('sName').addEventListener('input', () => { if (catTouched) return; const g = guessCat($('sName').value); if (g !== selfCat) { selfCat = g; selfCatsUI(); } });
  $('sMinus').addEventListener('click', () => { selfN = Math.max(1, selfN - 1); $('sN').textContent = selfN; });
  $('sPlus').addEventListener('click', () => { selfN = Math.min(20, selfN + 1); $('sN').textContent = selfN; });
  // 같은 기기의 다른 탭(캠테리어)에서 바꾸면 바로 반영
  addEventListener('storage', e => {
    if (e.key === K_GEAR || e.key === K_CUS) { MYG = lsGet(K_GEAR, {}) || {}; CUS = lsGet(K_CUS, {}) || {}; render(); search(); }
    if (e.key === K_ACCT) { acctUI(); syncUI('idle'); }
  });
}
async function start() {
  bind(); syncUI('idle'); acctUI();
  try {
    const cat = await (await fetch('catalog.json', { cache: 'no-cache' })).json();
    SECS = cat.secs;
    const secT = Object.fromEntries(SECS);
    ITEMS = cat.items.map(([key, name, model, ph]) => {
      const k = key.split(':')[0], id = key.slice(k.length + 1);
      return { key, k, id, name, model: model || '', ph: !!ph, grp: k, grpT: secT[k], secT: secT[k], icon: SEC_ICON[k], hay: norm([name, model, secT[k]].join(' ')) };
    });
    BY = new Map(ITEMS.map(x => [x.key, x]));
  } catch (e) { $('res').innerHTML = '<li class="self"><span>장비 목록을 불러오지 못했어요. 새로고침해 주세요.</span></li>'; }
  if (typeof tripsInit === 'function') tripsInit();
  chipsUI(); render(); pull();
}
// trips.js까지 다 읽은 뒤 시작 (먼저 시작하면 캠핑 화면이 빈 채로 남을 수 있음)
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start); else start();
