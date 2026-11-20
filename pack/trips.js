/* =====================================================================
   캠핑 챙김 · 캠핑 일정 + 체크리스트 (3단계)
   - 캠핑 목록: localStorage 'packTrips' = [{id, name, date:'YYYY-MM-DD', nights, place, items:{장비키:가져갈 개수}, done:{장비키:1}, at}]
     + 지운 캠핑 packTripsDel=[{id,del:1,up}] (서버와 합칠 때 다시 살아나지 않게)
   - 장비 이름·사진·분류는 pack.js의 info()/groups()/thumb()를 같이 씀 (같은 '내 장비' 목록)
   - 화면 주소: #(캠핑 목록) · #t/<id>(체크리스트) · #gear(내 장비함)
   - 6단계: 내 코드로 서버에 저장·합치기 (아래 '캠핑 일정 동기화')
   ===================================================================== */
'use strict';
const K_TRIPS = 'packTrips', K_TDEL = 'packTripsDel', K_TCODE = 'packTripsCode', K_TDIRTY = 'packTripsDirty';
let TRIPS = [], TDELS = [], CUR = null, MODE = 'check', TRIPS_READY = false;
const WD = ['일', '월', '화', '수', '목', '금', '토'];

/* ---------- 날짜 ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseD = s => { const [y, m, d] = String(s || '').split('-').map(Number); return y ? new Date(y, m - 1, d) : null; };
const today0 = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); };
const addD = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayDiff = (a, b) => Math.round((a - b) / 864e5);
const nightsT = n => n ? `${n}박 ${n + 1}일` : '당일';
function whenT(t) {
  const s = parseD(t.date); if (!s) return '';
  const e = addD(s, t.nights || 0), a = `${s.getMonth() + 1}월 ${s.getDate()}일 (${WD[s.getDay()]})`;
  if (!t.nights) return a + ' · 당일';
  const b = (e.getMonth() === s.getMonth() ? '' : `${e.getMonth() + 1}월 `) + `${e.getDate()}일 (${WD[e.getDay()]})`;
  return `${a} – ${b} · ${nightsT(t.nights)}`;
}
// 남은 날: 'D-3' / '오늘 출발' / '캠핑 중' / '지난 캠핑'
function dday(t) {
  const s = parseD(t.date); if (!s) return { t: '', k: 'none' };
  const d = dayDiff(s, today0()), end = dayDiff(addD(s, t.nights || 0), today0());
  if (end < 0) return { t: '지난 캠핑', k: 'past' };
  if (d > 0) return { t: `D-${d}`, k: d <= 3 ? 'soon' : 'later' };
  if (d === 0) return { t: '오늘 출발', k: 'today' };
  return { t: '캠핑 중', k: 'today' };
}
function nextSat() { const t = today0(); return addD(t, ((6 - t.getDay()) + 7) % 7 || 7); }

/* ---------- 저장 ---------- */
function loadTrips() {
  const v = lsGet(K_TRIPS, []); TRIPS = Array.isArray(v) ? v.filter(t => t && t.id && !t.del) : [];
  TRIPS.forEach(t => { t.items = t.items || {}; t.done = t.done || {}; t.up = t.up || t.at || 0; });
  const d = lsGet(K_TDEL, []); TDELS = Array.isArray(d) ? d.filter(x => x && x.id) : [];
}
// t를 주면 '고친 시각'을 남기고 서버에도 저장 (6단계 동기화)
// kind: 'meta'(이름·날짜·고른 장비 → mu), 'done'(체크 → 장비마다 dt), 'both'. 두 기기가 같은 캠핑을 고쳐도 체크는 장비별로 합쳐짐
function saveTrips(t, kind = 'meta', keys) {
  if (t) {
    const now = Date.now(); t.up = now;
    if (!t.del && kind !== 'done') t.mu = now;
    if (!t.del && kind !== 'meta') { t.dt = t.dt || {}; (keys || Object.keys(t.items || {})).forEach(k => { t.dt[k] = now; }); }
  }
  lsSet(K_TRIPS, TRIPS); lsSet(K_TDEL, TDELS);
  if (t) tripsQueue();
}
const tripById = id => TRIPS.find(t => t.id === id);
const tripStat = t => { const ks = Object.keys(t.items); return { n: ks.length, d: ks.filter(k => t.done[k]).length }; };
function tripId() { const A = 'abcdefghijkmnpqrstuvwxyz23456789'; let s; do { s = ''; crypto.getRandomValues(new Uint8Array(6)).forEach(x => s += A[x % A.length]); } while (tripById(s)); return s; }
const isPast = t => dday(t).k === 'past';
// 이 캠핑의 장비 (가져갈 개수 순서 그대로) — 내 장비에서 빠진 것도 남겨서 보여줌
const tripKeys = t => Object.keys(t.items);
// CSP(style 속성 막힘) 때문에 막대 길이는 스크립트로
const fillBars = root => root.querySelectorAll('[data-pct]').forEach(e => { e.style.width = e.dataset.pct + '%'; });

/* ---------- 화면 이동 ---------- */
function route() {
  const h = location.hash || '#', m = h.match(/^#t\/([a-z0-9]+)$/);
  const v = m ? 'trip' : h === '#gear' ? 'gear' : 'home';
  if (m && !tripById(m[1])) { location.replace('#'); return; }
  const changed = document.body.dataset.view !== v || (m && CUR !== m[1]);
  document.body.dataset.view = v;
  ['home', 'trip', 'gear'].forEach(x => { $('v-' + x).hidden = x !== v; });
  document.querySelectorAll('.tabs a').forEach(a => a.toggleAttribute('aria-current', a.dataset.tab === (v === 'gear' ? 'gear' : 'home')));
  document.querySelectorAll('.tabs a[aria-current]').forEach(a => a.setAttribute('aria-current', 'page'));
  if (v === 'trip') { if (CUR !== m[1]) { CUR = m[1]; const t = tripById(CUR); MODE = Object.keys(t.items).length ? 'check' : 'pick'; } tripUI(); }
  else { CUR = null; if (v === 'home') homeUI(); else if (changed) render(); }
  document.title = v === 'trip' ? `${tripById(m[1]).name} · Camping Check` : v === 'gear' ? '내 장비함 · Camping Check' : 'Camping Check';
  if (changed) scrollTo(0, 0);
}

/* ---------- 캠핑 목록 ---------- */
function cardT(t) {
  const st = tripStat(t), dd = dday(t), pct = st.n ? Math.round(st.d / st.n * 100) : 0;
  return `<li class="tc-li"><a class="trip-card" href="#t/${t.id}">
    <span class="tc-top"><b class="tc-n">${esc(t.name)}</b><span class="dd" data-k="${dd.k}">${dd.t}</span></span>
    <span class="tc-w">${esc(whenT(t))}${t.place ? ' · ' + esc(t.place) : ''}</span>
    ${st.n ? `<span class="tc-p"><span class="bar"><i data-pct="${pct}"></i></span><small>${st.d === st.n ? '다 챙겼어요' : `${st.d} / ${st.n} 챙김`}</small></span>`
      : '<span class="tc-p"><small class="muted">아직 고른 장비가 없어요</small></span>'}
  </a><button type="button" class="tc-del" data-del="${t.id}" aria-label="${esc(t.name)} 지우기" title="지우기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/></svg></button></li>`;
}
function homeUI() {
  const box = $('tripList');
  const up = TRIPS.filter(t => !isPast(t)).sort((a, b) => a.date.localeCompare(b.date));
  const past = TRIPS.filter(isPast).sort((a, b) => b.date.localeCompare(a.date));
  if (!TRIPS.length) {
    box.innerHTML = `<div class="empty"><img class="empty-art" src="img/empty-trips.webp" alt="" width="140" height="140"><p><b>아직 만든 캠핑이 없어요</b></p><p>‘새 캠핑 만들기’를 누르고 가는 날을 넣어 보세요.${Object.keys(MYG).length ? '' : ' 먼저 <a class="inline" href="#gear">내 장비함</a>에 가진 장비를 넣어 두면 고르기 쉬워요.'}</p></div>`;
    return;
  }
  box.innerHTML = (up.length ? `<h2 class="sec-t">다가오는 캠핑</h2><ul class="trips">${up.map(cardT).join('')}</ul>` : '<p class="muted pad">다가오는 캠핑이 없어요.</p>') +
    (past.length ? `<details class="past"${up.length ? '' : ' open'}><summary>지난 캠핑 <small>${past.length}</small></summary><ul class="trips">${past.map(cardT).join('')}</ul></details>` : '');
  fillBars(box);
  if (typeof pushUI === 'function') pushUI();
}

/* ---------- 캠핑 만들기·고치기 ---------- */
let TD = { edit: null, nights: 1, from: 'empty' };
function tripFormOpen(editId) {
  const t = editId ? tripById(editId) : null;
  TD = { edit: editId || null, nights: t ? t.nights || 0 : 1, from: 'empty' };
  $('tdT').textContent = t ? '일정 고치기' : '새 캠핑';
  $('tdOk').textContent = t ? '저장' : '만들기';
  $('tdName').value = t ? t.name : '';
  $('tdDate').value = t ? t.date : ymd(nextSat());
  $('tdPlace').value = t ? t.place || '' : '';
  $('tdDel').hidden = !t; $('tdFromBox').hidden = !!t; $('tdErr').textContent = '';
  nightsUI();
  if (!t) {
    const prev = TRIPS.filter(x => Object.keys(x.items).length).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
    const nGear = Object.keys(MYG).length;
    TD.from = nGear ? 'ai' : prev.length ? 'trip:' + prev[0].id : 'empty';
    const opts = [...(nGear ? [['ai', '✨ AI가 날씨·환경 보고 골라주기', '지역·바닥·주변 환경을 넣으면 내 장비에서 골라요']] : []),
      ['empty', '빈 목록에서 고르기', '다음 화면에서 내 장비를 하나씩 골라요'],
      ...(nGear ? [['all', `내 장비 전부 (${nGear}종)`, '다 넣어 두고 안 가져갈 것만 빼요']] : []),
      ...prev.map(x => ['trip:' + x.id, `‘${x.name}’ 목록 그대로`, `${whenT(x)} · ${Object.keys(x.items).length}종`])];
    $('tdFrom').innerHTML = opts.map(([v, a, b]) => `<label class="opt"><input type="radio" name="tdFrom" value="${esc(v)}"${v === TD.from ? ' checked' : ''}><span><b>${esc(a)}</b><small>${esc(b)}</small></span></label>`).join('');
  }
  const d = $('tripDlg'); try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
}
const nightsUI = () => { $('tdNights').textContent = TD.nights ? `${TD.nights}박` : '당일'; };
const closeTripDlg = () => { const d = $('tripDlg'); if (d.open) d.close(); };
function tripSubmit(e) {
  e.preventDefault();
  const date = $('tdDate').value;
  if (!parseD(date)) { $('tdErr').textContent = '가는 날을 골라 주세요'; return; }
  const s = parseD(date), name = $('tdName').value.trim().replace(/\s+/g, ' ').slice(0, 30) || `${s.getMonth() + 1}월 ${s.getDate()}일 캠핑`;
  const place = $('tdPlace').value.trim().slice(0, 30);
  if (TD.edit) {
    Object.assign(tripById(TD.edit), { name, date, nights: TD.nights, place });
    saveTrips(tripById(TD.edit)); closeTripDlg(); tripUI(); toast('일정을 고쳤어요'); return;
  }
  const f = (document.querySelector('input[name=tdFrom]:checked') || {}).value || 'empty', items = {};
  if (f === 'all') Object.keys(MYG).forEach(k => { items[k] = MYG[k]; });
  else if (f.startsWith('trip:')) { const src = tripById(f.slice(5)); if (src) Object.keys(src.items).forEach(k => { if (MYG[k]) items[k] = Math.min(src.items[k], 20); }); }
  const t = { id: tripId(), name, date, nights: TD.nights, place, items, done: {}, at: Date.now() };
  TRIPS.push(t); saveTrips(t); closeTripDlg();
  location.hash = '#t/' + t.id;
  if (f === 'ai' && typeof aiOpen === 'function') setTimeout(() => aiOpen(t.id), 250);
}
// 캠핑 지우기 (캠핑 목록의 휴지통 버튼, 일정 고치기 창의 '이 캠핑 지우기' 둘 다). 지운 뒤 되돌리기 가능
function tripRemove(t, fromList) {
  if (!t || !confirm(`이 캠핑을 지울까요? (${t.name})
고른 장비와 체크한 내용도 같이 지워져요.`)) return false;
  const i = TRIPS.indexOf(t), tomb = { id: t.id, del: 1 }; TRIPS.splice(i, 1); TDELS.push(tomb); saveTrips(tomb);
  if (fromList) homeUI(); else location.hash = '#';
  toast(`‘${t.name}’ 지웠어요`, () => { TDELS = TDELS.filter(x => x !== tomb); TRIPS.splice(i, 0, t); saveTrips(t); if (fromList) homeUI(); else location.hash = '#t/' + t.id; });
  return true;
}
function tripDelete() { if (tripRemove(tripById(TD.edit), false)) closeTripDlg(); }

/* ---------- 지도 바로가기: 카카오맵 검색 (키·서버 없이) ---------- */
const KMAP = q => 'https://map.kakao.com/link/search/' + encodeURIComponent(q);
function gasQuery(t) {
  // 캠핑장 이름을 통째로 넣으면 카카오맵이 못 찾아서, 지역(AI) → 장소 첫 단어 순으로 짧게
  const region = ((t.ai && t.ai.cond && t.ai.cond.region) || '').trim();
  if (region) return region + ' 주유소';
  let w = (t.place || '').trim().split(/\s+/)[0] || '';
  const cut = w.replace(/(오토)?캠핑장$|글램핑장?$|야영장$/, '');   // 자라섬캠핑장 → 자라섬
  if (cut.length >= 2) w = cut;
  return w ? w + ' 주유소' : '';
}
function mapsUI(t) {
  const box = $('tripMaps'); if (!box) return;
  const where = (t.place || (t.ai && t.ai.cond && t.ai.cond.region) || '').trim(), gas = gasQuery(t);
  box.hidden = !where;
  if (!where) { box.innerHTML = ''; return; }
  const a = (href, ico, txt, sub) => `<a class="map-btn" href="${esc(href)}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">${ico}</span><b>${txt}</b><small>${sub}</small></a>`;
  box.innerHTML = a(KMAP(where), '🗺️', '지도·길찾기', '카카오맵') + (gas ? a(KMAP(gas), '⛽', '근처 주유소', '휘발유·경유 가격') : '');
}

/* ---------- 캠핑 하나: 체크하기 / 장비 고르기 ---------- */
function tripUI() {
  const t = tripById(CUR); if (!t) return;
  const dd = dday(t), st = tripStat(t);
  $('tripWhen').innerHTML = `${esc(whenT(t))} <span class="dd" data-k="${dd.k}">${dd.t}</span>`;
  $('tripT').textContent = t.name;
  $('tripPlace').hidden = !t.place; $('tripPlace').textContent = t.place ? '📍 ' + t.place : '';
  mapsUI(t);
  const pct = st.n ? Math.round(st.d / st.n * 100) : 0;
  $('tripProg').innerHTML = st.n
    ? `<div class="prog-row"><b>${st.d === st.n ? '다 챙겼어요 🎉' : `${st.d} / ${st.n}`}</b><span>${st.d === st.n ? '즐거운 캠핑 되세요' : `남은 장비 ${st.n - st.d}가지`}</span></div><span class="bar big"><i data-pct="${pct}"></i></span>`
    : '';
  fillBars($('tripProg'));
  document.querySelectorAll('#tripSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === MODE)));
  $('tripFilter').hidden = MODE !== 'check' || !st.n;
  if (typeof aiCardUI === 'function') aiCardUI(t);
  fuelUI(t);
  MODE === 'pick' ? pickUI(t) : checkUI(t);
}
function grouped(keys) {
  const by = {}; keys.forEach(k => { const it = info(k); (by[it.grp] = by[it.grp] || []).push(it); });
  return groups().filter(g => by[g.k]).map(g => ({ ...g, list: by[g.k].sort((a, b) => a.name.localeCompare(b.name, 'ko')) }));
}
function checkUI(t) {
  const box = $('tripBody'), keys = tripKeys(t);
  if (!keys.length) {
    box.innerHTML = `<div class="empty"><img class="empty-art" src="img/empty-trips.webp" alt="" width="140" height="140"><p><b>아직 고른 장비가 없어요</b></p><p>‘장비 고르기’에서 이번 캠핑에 가져갈 장비를 골라 주세요.</p><button type="button" class="btn-main" data-go="pick">장비 고르기</button></div>`;
    $('tripFoot').innerHTML = ''; return;
  }
  const only = $('onlyLeft').checked;
  const gs = grouped(keys).map(g => ({ ...g, list: only ? g.list.filter(it => !t.done[it.key]) : g.list })).filter(g => g.list.length);
  box.innerHTML = gs.length ? gs.map(g => {
    const all = grouped(keys).find(x => x.k === g.k).list, d = all.filter(it => t.done[it.key]).length;
    return `<section class="ck-grp"><h3><span>${esc(g.t)}</span><small${d === all.length ? ' class="ok"' : ''}>${d}/${all.length}</small></h3><ul>${g.list.map(it => {
      const on = !!t.done[it.key], q = t.items[it.key];
      const why = t.ai && t.ai.why && t.ai.why[it.key];
      return `<li><button type="button" class="ck" data-k="${esc(it.key)}" aria-pressed="${on}"><span class="box" aria-hidden="true"></span>${thumb(it)}<span class="nm"><b>${esc(it.name)}</b>${!MYG[it.key] && !it.gone ? (t.ai && (t.ai.fp || []).includes(it.key) ? '<small class="tag">캠테리어 세팅의 장비 · 내 장비함엔 없음</small>' : '<small class="tag">내 장비함에서 빠진 장비</small>') : it.my ? '<small class="tag">직접 넣음</small>' : ''}${why ? `<small class="why">${esc(why)}</small>` : ''}</span>${q > 1 ? `<span class="qty">×${q}</span>` : ''}</button></li>`;
    }).join('')}</ul></section>`;
  }).join('') : `<div class="empty"><p><b>다 챙겼어요 🎉</b></p><p>‘안 챙긴 것만 보기’를 끄면 전체 목록이 보여요.</p></div>`;
  const st = tripStat(t);
  $('tripFoot').innerHTML = st.d ? '<button type="button" class="link" data-act="reset">체크 모두 풀기</button>' : '';
}
function pickUI(t) {
  const box = $('tripBody'), keys = [...new Set([...Object.keys(MYG), ...tripKeys(t)])];
  if (!keys.length) {
    box.innerHTML = `<div class="empty"><img class="empty-art" src="img/empty-gear.webp" alt="" width="140" height="140"><p><b>내 장비함이 비어 있어요</b></p><p>먼저 가진 장비를 넣어 주세요. 캠테리어에서 넣은 장비도 그대로 나와요.</p><a class="btn-main" href="#gear">내 장비함으로</a></div>`;
    $('tripFoot').innerHTML = ''; return;
  }
  const n = tripKeys(t).length;
  box.innerHTML = `<div class="pick-bar"><span>${n ? `<b>${n}</b>가지 골랐어요` : '가져갈 장비를 골라 주세요'}</span><span><button type="button" class="link" data-act="all">전부 고르기</button>${n ? ' · <button type="button" class="link" data-act="none">모두 빼기</button>' : ''}</span></div>` +
    grouped(keys).map(g => `<section class="ck-grp pick"><h3><span>${esc(g.t)}</span><small>${g.list.filter(it => t.items[it.key]).length}/${g.list.length}</small></h3><ul>${g.list.map(it => {
      const q = t.items[it.key] || 0, own = MYG[it.key] || 0;
      return `<li class="${q ? 'on' : ''}"><label class="pk"><input type="checkbox" data-k="${esc(it.key)}"${q ? ' checked' : ''}><span class="box" aria-hidden="true"></span>${thumb(it)}<span class="nm"><b>${esc(it.name)}</b><small>${own ? `가진 개수 ${own}` : '내 장비함에서 빠진 장비'}</small></span></label>
        ${q ? `<span class="step"><button type="button" data-q="-1" data-k="${esc(it.key)}" aria-label="${esc(it.name)} 하나 덜">−</button><b>${q}</b><button type="button" data-q="1" data-k="${esc(it.key)}" aria-label="${esc(it.name)} 하나 더">+</button></span>` : ''}</li>`;
    }).join('')}</ul></section>`).join('');
  $('tripFoot').innerHTML = `<button type="button" class="btn-main wide sticky" data-go="check">${n ? `다 골랐어요 · ${n}가지 체크하러 가기` : '체크하러 가기'}</button>`;
}
function tripClick(e) {
  const t = tripById(CUR); if (!t) return;
  const go = e.target.closest('[data-go]');
  if (go) { MODE = go.dataset.go; tripUI(); scrollTo(0, 0); return; }
  const ck = e.target.closest('button.ck');
  if (ck) { const k = ck.dataset.k; if (t.done[k]) delete t.done[k]; else t.done[k] = 1; saveTrips(t, 'done', [k]); tripUI(); return; }
  const qb = e.target.closest('button[data-q]');
  if (qb) { const k = qb.dataset.k; t.items[k] = Math.max(1, Math.min(20, (t.items[k] || 1) + +qb.dataset.q)); saveTrips(t); tripUI(); return; }
  const a = e.target.closest('button[data-act]'); if (!a) return;
  if (a.dataset.act === 'reset') { const was = t.done; t.done = {}; saveTrips(t, 'done', Object.keys(was)); tripUI(); toast('체크를 모두 풀었어요', () => { t.done = was; saveTrips(t, 'done', Object.keys(was)); tripUI(); }); }
  if (a.dataset.act === 'all') { Object.keys(MYG).forEach(k => { if (!t.items[k]) t.items[k] = MYG[k]; }); saveTrips(t); tripUI(); }
  if (a.dataset.act === 'none') { const was = { items: t.items, done: t.done }; t.items = {}; t.done = {}; saveTrips(t); tripUI(); toast('고른 장비를 모두 뺐어요', () => { Object.assign(t, was); saveTrips(t, 'both', Object.keys(was.done)); tripUI(); }); }
}
function tripChange(e) {
  const c = e.target.closest('input[type=checkbox][data-k]'); if (!c) return;
  const t = tripById(CUR), k = c.dataset.k;
  if (c.checked) t.items[k] = Math.max(1, MYG[k] || 1); else { delete t.items[k]; delete t.done[k]; }
  saveTrips(t); tripUI();
}

/* ---------- 시작 (pack.js가 장비 목록을 불러온 뒤 부름) ---------- */
function tripsInit() {
  loadTrips();
  $('newTrip').addEventListener('click', () => tripFormOpen());
  $('tripList').addEventListener('click', e => { const b = e.target.closest('button[data-del]'); if (b) tripRemove(tripById(b.dataset.del), true); });
  $('tripEdit').addEventListener('click', () => tripFormOpen(CUR));
  $('tripForm').addEventListener('submit', tripSubmit);
  $('tdCancel').addEventListener('click', closeTripDlg);
  $('tdDel').addEventListener('click', tripDelete);
  $('tripDlg').addEventListener('click', e => { if (e.target === $('tripDlg')) closeTripDlg(); });
  $('tdMinus').addEventListener('click', () => { TD.nights = Math.max(0, TD.nights - 1); nightsUI(); });
  $('tdPlus').addEventListener('click', () => { TD.nights = Math.min(14, TD.nights + 1); nightsUI(); });
  $('tripSeg').addEventListener('click', e => { const b = e.target.closest('button[data-mode]'); if (b && b.dataset.mode !== MODE) { MODE = b.dataset.mode; tripUI(); } });
  $('onlyLeft').addEventListener('change', () => tripUI());
  $('tripBody').addEventListener('click', tripClick);
  $('tripFoot').addEventListener('click', tripClick);
  $('tripBody').addEventListener('change', tripChange);
  addEventListener('hashchange', route);
  addEventListener('storage', e => { if (e.key === K_TRIPS || e.key === K_TDEL) { loadTrips(); tripsRefresh(); } if (e.key === K_ACCT) tripsPull(true); });
  TRIPS_READY = true; route(); installUI(); tSyncUI(); tripsPull(true);
}
// 장비 목록이 바뀌면 (서버에서 불러옴·다른 탭에서 고침) 지금 화면 다시 그리기
function tripsRefresh() {
  if (!TRIPS_READY) return;
  const v = document.body.dataset.view;
  if (v === 'trip') tripUI(); else if (v === 'home') homeUI();
}

/* ---------- 홈 화면 설치 (5단계) ---------- */
const K_INST = 'packInstallHide';
let installEvt = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
function installUI() {
  const box = $('install'); if (!box) return;
  let hide = false; try { hide = !!localStorage.getItem(K_INST); } catch (e) {}
  const ios = isIOS(), can = !!installEvt;
  if (isStandalone() || hide || (!ios && !can)) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<img src="icons/icon-64.png" alt="" width="44" height="44">
    <div class="ins-t"><b id="insT">홈 화면에 두고 앱처럼 쓰세요</b>
    ${ios ? '<span>Safari 아래쪽 <b>공유 버튼</b>(네모에 위 화살표)을 누르고 <b>‘홈 화면에 추가’</b>를 고르세요.</span>'
          : '<span>캠핑장에서 인터넷이 약해도 체크리스트가 열려요.</span>'}</div>
    ${can ? '<button type="button" class="btn-main sm" id="insGo">설치</button>' : ''}
    <button type="button" class="ins-x" id="insX" aria-label="설치 안내 닫기">×</button>`;
  const go = $('insGo');
  if (go) go.onclick = async () => { installEvt.prompt(); const r = await installEvt.userChoice.catch(() => null); installEvt = null; if (r && r.outcome === 'accepted') toast('홈 화면에 설치했어요'); installUI(); };
  $('insX').onclick = () => { try { localStorage.setItem(K_INST, '1'); } catch (e) {} box.hidden = true; };
}
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; installUI(); });
addEventListener('appinstalled', () => { installEvt = null; installUI(); });
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

/* ---------- 6단계: 캠핑 일정 동기화 (캠테리어와 같은 '내 코드') ----------
   서버: 워커 acct 'trips'(읽기) / 'trips_save'(합쳐서 저장). 캠핑마다 up(고친 시각)이 더 큰 쪽이 남음.
   인터넷이 안 되면 이 기기에 저장해 두고(packTripsDirty), 연결되면 자동으로 다시 보냄. */
let tTimer = null, tState = 'idle', tLastPull = 0, tBusy = null;
function tSyncUI(s) {
  if (s) tState = s;
  const el = $('tsync'); if (!el) return;
  const has = TRIPS.length > 0;
  const T = { idle: has ? '이 기기에 저장돼요' : '', wait: '저장하는 중…', pull: '다른 기기 일정 불러오는 중…',
    ok: '다른 기기와 맞췄어요', off: '인터넷이 안 돼 이 기기에만 저장했어요 · 연결되면 자동으로 맞춰요' };
  el.textContent = T[tState] || ''; el.dataset.s = tState; el.hidden = !el.textContent;
}
// 같은 캠핑 둘 합치기 (워커 worker.js의 mergeTrip과 같은 규칙)
// 이름·날짜·고른 장비는 mu가 늦은 쪽, 체크는 장비마다 dt가 늦은 쪽, 지운 것(del)은 up으로 비교
function mergeTrip(a, b) {
  if (a.del || b.del) return (b.up || 0) > (a.up || 0) ? b : a;
  const base = (b.mu || b.up || 0) > (a.mu || a.up || 0) ? b : a, dt = {}, done = {};
  const ad = a.dt || {}, bd = b.dt || {};
  [...new Set([...Object.keys(ad), ...Object.keys(bd)])].forEach(k => { dt[k] = Math.max(ad[k] || 0, bd[k] || 0); });
  Object.keys(base.items || {}).forEach(k => {
    const src = !(k in dt) ? base : (bd[k] || 0) > (ad[k] || 0) ? b : a;
    if ((src.done || {})[k]) done[k] = 1;
  });
  return { ...base, done, dt, up: Math.max(a.up || 0, b.up || 0), mu: Math.max(a.mu || 0, b.mu || 0) };
}
// 서버 목록과 이 기기 목록 합치기. 이 기기 쪽에 서버에 없는 변경이 있으면 다시 보내야 함
function tripsMerge(srv) {
  const by = new Map(), mine = [...TRIPS, ...TDELS]; let push = false;
  (srv || []).forEach(t => t && t.id && by.set(t.id, t));
  // 이 기기 쪽 시각이 하나라도 서버보다 늦으면 서버가 모르는 변경
  const newer = (t, o) => !o || (t.up || 0) > (o.up || 0) || (t.mu || 0) > (o.mu || 0) || Object.keys(t.dt || {}).some(k => t.dt[k] > ((o.dt || {})[k] || 0));
  mine.forEach(t => { const o = by.get(t.id); if (newer(t, o)) push = true; by.set(t.id, o ? mergeTrip(o, t) : t); });
  const all = [...by.values()];
  TRIPS = all.filter(t => !t.del).map(t => ({ ...t, items: t.items || {}, done: t.done || {} }));
  TDELS = all.filter(t => t.del);
  lsSet(K_TRIPS, TRIPS); lsSet(K_TDEL, TDELS);
  return push;
}
const tDirty = v => { try { v === undefined ? 0 : v ? localStorage.setItem(K_TDIRTY, '1') : localStorage.removeItem(K_TDIRTY); return !!localStorage.getItem(K_TDIRTY); } catch (e) { return false; } };
function tripsQueue() {
  tDirty(true); clearTimeout(tTimer); tSyncUI('wait');
  tTimer = setTimeout(tripsPush, 1500);
}
async function tripsPush() {
  if (tBusy) { await tBusy.catch(() => {}); }
  tBusy = (async () => {
    const c = await ensureCode(); if (!c) { tSyncUI('off'); return; }
    const d = await call({ op: 'trips_save', code: c, trips: [...TRIPS, ...TDELS] });
    if (!d.ok) { tSyncUI('off'); return; }
    lsSet(K_TCODE, c); tDirty(false);
    tripsMerge(d.trips); tSyncUI('ok'); route(); acctUI();
  })();
  try { await tBusy; } finally { tBusy = null; }
}
async function tripsPull(force) {
  const c = codeGet();
  if (!c) { if (tDirty() && TRIPS.length) tripsPush(); else tSyncUI('idle'); return; }
  if (!force && Date.now() - tLastPull < 20000) return;
  tLastPull = Date.now();
  if (tBusy) return;
  tSyncUI('pull');
  const d = await call({ op: 'trips', code: c });
  if (!d.ok) { tSyncUI('off'); return; }
  // 다른 사람(다른 코드)의 일정이 섞이지 않게: 코드를 바꿔 불러왔으면 이 기기 목록을 그 코드 것으로 바꿈
  const was = lsGet(K_TCODE, '');
  if (was && was !== c) { TRIPS = []; TDELS = []; tDirty(false); }
  const push = tripsMerge(d.trips); lsSet(K_TCODE, c);
  route();
  if (push || tDirty()) tripsPush(); else tSyncUI('ok');
}
addEventListener('online', () => { if (tDirty()) tripsPush(); else tripsPull(true); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && TRIPS_READY) tripsPull(); });

/* ---------- 등유 계산 ----------
   캠테리어 제원(catalog.json의 fuel = {t:탱크 L, a:약 L/h, b:강 L/h, c:'official'|'retailer'|'mixed', n:메모})으로
   이번 캠핑에 고른 등유 난방기의 필요한 양을 계산. 하루 켜는 시간은 이 기기에 저장(packFuelH, 기본 15시간 = 저녁 6시~아침 9시)
   세기: AI 날씨가 있으면 가장 추운 밤 최저기온으로 (10° 이상 = 약, -5° 이하 = 강, 사이는 비례), 없으면 중간 */
const K_FUELH = 'packFuelH';
const fuelH = () => { const v = Number(lsGet(K_FUELH, 15)); return v >= 4 && v <= 24 ? v : 15; };
const l1 = v => (Math.round(v * 10) / 10).toLocaleString('ko-KR');
const l2 = v => String(Math.round(v * 100) / 100);
function fuelUI(t) {
  const box = $('fuelCard'); if (!box) return;
  const hs = tripKeys(t).map(k => ({ it: info(k), q: t.items[k] })).filter(x => x.it.fuel && x.it.fuel.a);
  if (!hs.length) { box.hidden = true; box.innerHTML = ''; return; }
  const H = fuelH(), N = Math.max(1, t.nights || 0);
  const lows = t.ai && Array.isArray(t.ai.days) ? t.ai.days.map(d => Number(d.low)).filter(Number.isFinite) : [];
  const lo = lows.length ? Math.min(...lows) : null;
  const f = lo == null ? 0.5 : Math.max(0, Math.min(1, (10 - lo) / 15));
  let tot = 0, min = 0, max = 0, unsure = false;
  const rows = hs.map(({ it, q }) => {
    const F = it.fuel, b = F.b || F.a, lph = F.a + (b - F.a) * f, need = lph * H * N * q;
    tot += need; min += F.a * H * N * q; max += b * H * N * q; if (F.c !== 'official') unsure = true;
    const run = F.t ? F.t / lph : 0, refill = run && run < H ? Math.ceil(H / run) - 1 : 0;
    return `<li><span class="fu-t"><b>${esc(it.name)}${q > 1 ? ` ×${q}` : ''}</b><small>시간당 ${l2(F.a)}${F.b && F.b !== F.a ? `~${l2(F.b)}` : ''}L${F.t ? ` · 연료통 ${l1(F.t)}L, 가득 채우면 약 ${Math.floor(run)}시간` : ''}${refill ? ` → 밤마다 ${refill}번쯤 더 넣기` : ''}</small>${F.c !== 'official' ? `<small class="fu-warn">${F.c === 'mixed' ? '출처 엇갈림' : '판매처 제원'} · 추정</small>` : ''}</span><span class="fu-n">${Math.ceil(need)}L</span></li>`;
  }).join('');
  const cans = Math.ceil(tot / 20);
  box.hidden = false;
  box.innerHTML = `<div class="fu-head"><b>🛢 등유 약 ${Math.ceil(tot)}L</b><small>말통(20L) ${cans}개${min !== max ? ` · 범위 ${Math.ceil(min)}~${Math.ceil(max)}L` : ''}</small></div>
    <ul class="fu-list">${rows}</ul>
    <div class="fu-opt"><span>하루 켜는 시간</span><div class="step"><button type="button" data-fh="-1" aria-label="한 시간 줄이기">−</button><b>${H}시간</b><button type="button" data-fh="1" aria-label="한 시간 늘리기">+</button></div></div>
    <p class="fu-note">${N}밤 × ${H}시간 · ${lo == null ? '날씨를 몰라 중간 세기로 계산 (AI 추천을 받으면 기온으로 맞춰요)' : `가장 추운 밤 ${lo}° 기준 ${f >= .85 ? '강하게' : f <= .15 ? '약하게' : '중간 세기로'}`}. 실제 소비는 텐트·바람에 따라 달라요.${unsure ? ' ‘추정’ 표시는 제조사 공식 제원으로 아직 확인하지 못한 값이에요.' : ''}</p>
    ${oilUI(t)}`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-fh]'); if (!b) return;
  lsSet(K_FUELH, Math.max(4, Math.min(24, fuelH() + Number(b.dataset.fh))));
  const t = tripById(CUR); if (t) fuelUI(t);
});

/* ---------- 근처 등유 주유소 (오피넷, 워커 pack-oil.js) ----------
   캠핑장(일정의 장소) → 없으면 AI 추천 때 넣은 지역. 버튼을 눌러야 찾음(무료 API 횟수 아끼기), 결과는 이 기기에 3시간 저장 */
const K_OIL = 'packOil', OIL = { busy: '', err: {} };
const oilQ = t => ({ campsite: (t.place || '').trim(), region: ((t.ai && t.ai.cond && t.ai.cond.region) || '').trim() });
const oilKey = q => q.campsite + '|' + q.region;
function oilHit(q) { const c = lsGet(K_OIL, {}) || {}, h = c[oilKey(q)]; return h && Date.now() - h.at < 3 * 3600e3 ? h : null; }
const won = n => Number(n).toLocaleString('ko-KR');
const km = m => m == null ? '' : m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`;
function oilUI(t) {
  const q = oilQ(t), key = oilKey(q);
  if (!q.campsite && !q.region) return `<div class="oil"><p class="oil-hint">⛽ 일정에 캠핑장(장소)을 넣으면 근처 등유 파는 주유소를 찾아 드려요.</p></div>`;
  const h = oilHit(q), where = esc(q.campsite || q.region);
  if (OIL.busy === key) return `<div class="oil"><p class="oil-hint"><span class="spin sm" aria-hidden="true"></span> ${where} 근처 주유소 찾는 중…</p></div>`;
  if (OIL.err[key]) return `<div class="oil"><p class="oil-hint">⛽ ${esc(OIL.err[key])}</p><button type="button" class="link" data-oil="go">다시 찾기</button></div>`;
  if (!h) return `<div class="oil"><button type="button" class="btn-line wide" data-oil="go">⛽ ${where} 근처 등유 주유소 찾기</button></div>`;
  const d = h.d;
  if (!d.list.length) return `<div class="oil"><p class="oil-hint">⛽ ${where} 근처에서 등유 파는 주유소를 찾지 못했어요. 가는 길에 미리 넣어 가세요.</p></div>`;
  return `<div class="oil"><div class="oil-head"><b>⛽ ${d.mode === 'near' ? `${where} 5km 안 등유 주유소` : `5km 안에 없어 ${esc(d.place || where)}에서 등유가 싼 곳`}</b></div>
    <ul class="oil-list">${d.list.map(s => `<li><span class="oil-t"><b>${esc(s.name)}</b><small>${[s.brand, km(s.dist)].filter(Boolean).map(esc).join(' · ')}</small></span><span class="oil-p">${won(s.price)}<small>원/L</small></span>${s.lat ? `<a class="oil-go" href="https://map.kakao.com/link/to/${encodeURIComponent(s.name)},${s.lat},${s.lon}" target="_blank" rel="noopener">길찾기</a>` : ''}</li>`).join('')}</ul>
    <p class="fu-note">오피넷(한국석유공사) 가격 · ${new Date(h.at).getHours()}시 ${pad(new Date(h.at).getMinutes())}분 기준. 영업시간은 주유소에 확인하세요.</p></div>`;
}
async function oilFind() {
  const t = tripById(CUR); if (!t) return;
  const q = oilQ(t), key = oilKey(q); if (OIL.busy) return;
  OIL.busy = key; delete OIL.err[key]; fuelUI(t);
  try {
    const d = await aiApi({ op: 'oil', ...q });
    const c = lsGet(K_OIL, {}) || {}; Object.keys(c).forEach(k => { if (Date.now() - c[k].at > 3 * 3600e3) delete c[k]; });
    c[key] = { at: Date.now(), d }; lsSet(K_OIL, c);
  } catch (e) { OIL.err[key] = e.message || '주유소를 찾지 못했어요.'; }
  OIL.busy = '';
  const n = tripById(CUR); if (n) fuelUI(n);
}
document.addEventListener('click', e => { if (e.target.closest('[data-oil="go"]')) oilFind(); });
