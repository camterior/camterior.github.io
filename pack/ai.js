/* =====================================================================
   Camping Check · AI 추천 (4단계) — 서버는 worker/pack-ai.js ({pack:{op:...}})
   - 캠핑 하나에: 지역·바닥·주변 환경·사이트 특징(+캠테리어 저장 세팅) → 날씨 → Claude가 내 장비에서 고름
   - 결과는 그 캠핑에 저장: items(가져갈 개수) + ai{advice, days, missing, why, cond, plan} → 6단계 동기화로 다른 기기에도
   ===================================================================== */
'use strict';
const AI_GROUNDS = ['데크', '파쇄석'];
const AI_ENVS = [['산', '⛰'], ['계곡', '💧'], ['바다', '🌊'], ['강·호수', '🛶'], ['숲', '🌲'], ['들판·잔디', '🌾'], ['도심·공원', '🏙'], ['섬', '🏝']];
const K_AILAST = 'packAiLast';
let AI = { trip: null, ground: '', env: [], adults: 2, kids: 0, plans: [], planPicked: false, busy: false };

async function aiApi(p) {
  let r, d;
  try { r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pack: p }) }); d = await r.json().catch(() => ({})); }
  catch (e) { throw new Error('인터넷 연결을 확인해 주세요.'); }
  if (!r.ok) { const e = new Error(d.message || '문제가 생겼어요. 잠시 후 다시 시도해 주세요.'); e.code = d.error; throw e; }
  return d;
}

/* ---------- 날짜 ---------- */
const aiRange = t => { const s = parseD(t.date), e = addD(s, t.nights || 0), today = today0(); return { start: ymd(s < today ? today : s), end: ymd(e), past: e < today }; };
// 세팅 이름·요약에 이번 캠핑 날짜가 들어 있으면 자동으로 고르기 (camping-app의 dateTokens와 같은 규칙)
function aiDateTokens(iso) {
  const [y, m, d] = iso.split('-').map(Number), mm = pad(m), dd = pad(d);
  return [`${m}/${d}`, `${mm}/${dd}`, `${m}.${d}`, `${mm}.${dd}`, `${m}월 ${d}일`, `${m}월${d}일`, `${mm}${dd}`, iso, `${String(y).slice(2)}${mm}${dd}`];
}
function aiPlanMatches(plan, t) {
  const text = `${plan.name} ${plan.summary}`.replace(/\s+/g, ' '), s = parseD(t.date), days = [];
  for (let i = 0; i <= (t.nights || 0) && i < 15; i++) days.push(ymd(addD(s, i)));
  return days.some(iso => aiDateTokens(iso).some(tok => new RegExp(`(^|[^0-9])${tok.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}($|[^0-9])`).test(text)));
}

/* ---------- 창 열기 ---------- */
function aiPeopleUI() { $('aiAdults').textContent = AI.adults; $('aiKids').textContent = AI.kids; }
function aiPillsUI() {
  $('aiGround').innerHTML = AI_GROUNDS.map(g => `<button type="button" data-g="${g}" aria-pressed="${AI.ground === g}">${g}</button>`).join('');
  $('aiEnv').innerHTML = AI_ENVS.map(([e, i]) => `<button type="button" data-e="${esc(e)}" aria-pressed="${AI.env.includes(e)}"><span aria-hidden="true">${i}</span>${esc(e)}</button>`).join('');
}
function aiOpen(tripId) {
  const t = tripById(tripId); if (!t) return;
  const r = aiRange(t);
  if (r.past) { toast('지난 캠핑은 추천을 받을 수 없어요'); return; }
  const last = lsGet(K_AILAST, {}) || {}, c = (t.ai && t.ai.cond) || {};
  const pp = c.people || last.people || {};
  AI = { trip: t.id, ground: c.ground || last.ground || '', env: (c.env && c.env.length ? c.env : last.env) || [], adults: pp.adults || 2, kids: pp.kids || 0, plans: [], planPicked: false, busy: false };
  $('aiTrip').textContent = `${t.name} · ${whenT(t)}`;
  $('aiRegion').value = c.region || last.region || '';
  $('aiSite').value = t.place || '';
  $('aiNote').value = c.note || '';
  $('aiErr').textContent = ''; $('aiWait').hidden = true; $('aiFields').hidden = false; $('aiGo').disabled = false; $('aiCancel').disabled = false;
  $('aiPlanBox').hidden = true; $('aiLeft').textContent = '';
  aiPillsUI(); aiPeopleUI();
  const d = $('aiDlg'); try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
  aiLoadSide(t);
}
// 남은 횟수 + (내 코드가 있으면) 캠테리어에 저장한 세팅 목록
async function aiLoadSide(t) {
  const c = codeGet();
  aiApi({ op: 'left', code: c || undefined }).then(d => { $('aiLeft').textContent = `오늘 남은 추천 ${d.left}번 (하루 ${d.limit}번)`; }).catch(() => {});
  if (!c) return;
  try {
    const d = await aiApi({ op: 'plans', code: c });
    if (AI.trip !== t.id) return;
    AI.plans = (d.plans || []).sort((a, b) => b.savedAt - a.savedAt);
    if (!AI.plans.length) return;
    $('aiPlan').innerHTML = '<option value="">세팅 없이</option>' + AI.plans.map(p => `<option value="${esc(p.id)}">${esc(p.name)}${p.summary ? ' · ' + esc(p.summary) : ''}</option>`).join('');
    const prev = t.ai && t.ai.planId && AI.plans.find(p => p.id === t.ai.planId);
    const match = prev || AI.plans.find(p => aiPlanMatches(p, t));
    $('aiPlan').value = match ? match.id : '';
    $('aiPlanNote').textContent = match && !prev ? '이번 캠핑 날짜가 들어 있는 세팅을 골라 뒀어요.' : '';
    $('aiPlanBox').hidden = false;
  } catch (e) { /* 세팅을 못 불러와도 추천은 됨 */ }
}
const aiClose = () => { if (AI.busy) return; const d = $('aiDlg'); if (d.open) d.close(); };

/* ---------- 추천 받기 ---------- */
async function aiSubmit(e) {
  e.preventDefault();
  if (AI.busy) return;
  const t = tripById(AI.trip); if (!t) return;
  const err = $('aiErr'); err.textContent = '';
  const region = $('aiRegion').value.trim(), campsite = $('aiSite').value.trim(), siteNote = $('aiNote').value.trim();
  if (!region) { err.textContent = '지역을 적어 주세요 (예: 경기 가평)'; $('aiRegion').focus(); return; }
  if (!AI.ground) { err.textContent = '사이트 바닥을 골라 주세요'; return; }
  if (!AI.env.length) { err.textContent = '주변 환경을 하나 이상 골라 주세요'; return; }
  if (!Object.keys(MYG).length && !$('aiPlan').value) { err.textContent = '내 장비함에 장비가 없어요. 먼저 가진 장비를 넣어 주세요.'; return; }
  if (Object.keys(t.items).length && !confirm('지금 고른 장비를 AI 추천으로 바꿀까요? (이미 체크한 장비는 그대로 체크돼요)')) return;
  const r = aiRange(t), code = codeGet();
  const people = { adults: AI.adults, kids: AI.kids };
  const trip = { region, campsite, startDate: r.start, endDate: r.end, ground: AI.ground, environments: AI.env, siteNote, people };
  lsSet(K_AILAST, { region, ground: AI.ground, env: AI.env, people });
  AI.busy = true; $('aiGo').disabled = true; $('aiCancel').disabled = true; $('aiFields').hidden = true; $('aiWait').hidden = false;
  const steps = ['날씨 확인 중…', '내 장비에서 고르는 중…', '거의 다 됐어요…']; let si = 0; $('aiStep').textContent = steps[0];
  let tick = null;
  try {
    const weather = await aiApi({ op: 'weather', region, campsite, startDate: r.start, endDate: r.end });
    $('aiStep').textContent = steps[++si]; tick = setInterval(() => { if (si < steps.length - 1) $('aiStep').textContent = steps[++si]; }, 9000);
    const planId = $('aiPlan').value || undefined;
    const req = code ? { op: 'recommend', code, trip, weather, planId, gear: MYG, custom: CUS } : { op: 'recommend', gear: MYG, custom: CUS, trip, weather };
    const rec = await aiApi(req);
    aiApply(t, trip, weather, rec, planId);
    AI.busy = false; aiClose();
    MODE = 'check'; tripUI(); scrollTo(0, 0);
    const nSkip = rec.pick.filter(p => p.skip).length;
    toast(nSkip ? `AI가 ${rec.pick.length - nSkip}가지 골랐어요 · 빼도 되는 ${nSkip}가지` : `AI가 ${rec.pick.length}가지 골랐어요 · 남은 추천 ${rec.left}번`);
  } catch (ex) {
    err.textContent = ex.message; $('aiFields').hidden = false; $('aiWait').hidden = true;
  } finally { clearInterval(tick); AI.busy = false; $('aiGo').disabled = false; $('aiCancel').disabled = false; }
}
function aiApply(t, trip, weather, rec, planId) {
  const items = {}, why = {}, skip = [];
  // '이번엔 빼도 됨'(세팅 장비인데 이번 조건엔 필요 없음)은 체크 목록에 넣지 않고 따로 보여줌 ('그래도 챙기기' 가능)
  rec.pick.forEach(p => { if (p.skip) { skip.push({ key: p.key, count: Math.max(1, Math.min(20, p.count)), why: p.why || '' }); return; } items[p.key] = Math.max(1, Math.min(20, p.count)); if (p.why) why[p.key] = p.why; });
  Object.keys(t.items).forEach(k => { if (k.startsWith('x:')) items[k] = t.items[k]; }); // 이번 캠핑에만 직접 넣은 것은 그대로
  const done = {}; Object.keys(t.done).forEach(k => { if (items[k]) done[k] = 1; });
  t.items = items; t.done = done;
  if (trip.campsite && !t.place) t.place = trip.campsite.slice(0, 30);
  t.ai = { at: Date.now(), advice: rec.advice, plan: rec.planName || '', planId: planId || '', place: weather.place, source: weather.source,
    days: weather.days, missing: rec.missing || [], why, skip, fp: rec.pick.filter(p => p.fromPlan && !p.inMyGear && !p.skip).map(p => p.key), cond: { region: trip.region, ground: trip.ground, env: trip.environments, note: trip.siteNote, people: trip.people } };
  saveTrips(t, 'meta');
}

/* ---------- 캠핑 화면: 날씨·조언·없음 목록 ---------- */
function aiCardUI(t) {
  const box = $('aiCard'); if (!box) return;
  const past = aiRange(t).past;
  if (!t.ai) {
    box.hidden = past;
    box.className = 'ai-card cta';
    box.innerHTML = past ? '' : `<button type="button" class="ai-cta" data-ai="open"><span class="ai-spark" aria-hidden="true">✨</span><span><b>AI로 챙길 장비 고르기</b><small>지역·바닥·주변 환경과 날씨를 보고 내 장비에서 골라 줘요</small></span></button>`;
    return;
  }
  const a = t.ai, c = a.cond || {}, low = Math.min(...a.days.map(d => d.low)), high = Math.max(...a.days.map(d => d.high));
  box.hidden = false; box.className = 'ai-card';
  const pp = c.people ? `어른 ${c.people.adults}${c.people.kids ? `·아이 ${c.people.kids}` : ''}` : '';
  box.innerHTML = `<div class="ai-head"><b>✨ AI 추천</b><small>${esc([c.region, pp, c.ground, ...(c.env || [])].filter(Boolean).join(' · '))}${a.plan ? ` · 세팅 ‘${esc(a.plan)}’` : ''}</small></div>
    <div class="wx">${a.days.map(d => `<div class="wx-d"><span>${esc(d.date.slice(5).replace('-', '/'))}</span><b>${esc(d.sky)}</b><span>${esc(d.low)}° / ${esc(d.high)}°</span><small>${d.rainChance != null ? `비 ${esc(d.rainChance)}%` : `비 ${esc(d.rain)}mm`} · 바람 ${esc(d.wind)}m/s</small></div>`).join('')}</div>
    <p class="wx-src">${esc(a.place || '')} ${a.source === 'forecast' ? '일기 예보' : '작년 같은 날 기록 (예보 아님)'} · 최저 ${esc(low)}° 최고 ${esc(high)}°</p>
    ${a.advice ? `<p class="advice">${esc(a.advice)}</p>` : ''}
    ${a.skip && a.skip.length ? `<div class="skip"><b>세팅에 있지만 이번엔 빼도 돼요</b><ul>${a.skip.map(x => { const it = info(x.key); return `<li><span class="sk-t"><b>${esc(it.name)}${x.count > 1 ? ` ×${esc(x.count)}` : ''}</b>${x.why ? `<small>${esc(x.why)}</small>` : ''}</span><button type="button" class="btn-line sm" data-keep="${esc(x.key)}">그래도 챙기기</button></li>`; }).join('')}</ul></div>` : ''}
    ${a.missing && a.missing.length ? `<details class="missing"><summary>없음 <small>대여·대체 가능 · ${a.missing.length}가지</small></summary><ul>${a.missing.map(m => `<li><b>${esc(m.name)}</b>${m.why ? `<small>${esc(m.why)}</small>` : ''}${m.alt ? `<small class="alt">대체: ${esc(m.alt)}</small>` : ''}</li>`).join('')}</ul></details>` : ''}
    ${past ? '' : '<button type="button" class="link" data-ai="open">조건 바꿔 다시 추천받기</button>'}`;
}

/* ---------- 시작 ---------- */
(function aiInit() {
  $('aiForm').addEventListener('submit', aiSubmit);
  $('aiCancel').addEventListener('click', aiClose);
  $('aiDlg').addEventListener('click', e => { if (e.target === $('aiDlg')) aiClose(); });
  $('aiDlg').addEventListener('cancel', e => { if (AI.busy) e.preventDefault(); });
  $('aiGround').addEventListener('click', e => { const b = e.target.closest('button[data-g]'); if (!b) return; AI.ground = b.dataset.g; aiPillsUI(); });
  $('aiEnv').addEventListener('click', e => {
    const b = e.target.closest('button[data-e]'); if (!b) return; const v = b.dataset.e;
    if (AI.env.includes(v)) AI.env = AI.env.filter(x => x !== v);
    else if (AI.env.length >= 3) { $('aiErr').textContent = '주변 환경은 3개까지 고를 수 있어요'; return; }
    else AI.env = [...AI.env, v];
    $('aiErr').textContent = ''; aiPillsUI();
  });
  $('aiPlan').addEventListener('change', () => { $('aiPlanNote').textContent = ''; });
  $('aiCard').addEventListener('click', e => {
    if (e.target.closest('[data-ai="open"]')) { aiOpen(CUR); return; }
    const k = e.target.closest('button[data-keep]'); if (!k) return;
    const t = tripById(CUR), x = t && t.ai && (t.ai.skip || []).find(s => s.key === k.dataset.keep); if (!x) return;
    t.items[x.key] = x.count; t.ai.skip = t.ai.skip.filter(s => s !== x); saveTrips(t, 'meta'); tripUI();
    toast(`${info(x.key).name} 챙길 목록에 넣었어요`);
  });
  $('aiForm').addEventListener('click', e => {
    const b = e.target.closest('button[data-pp]'); if (!b) return;
    const v = b.dataset.pp; if (v === 'a-') AI.adults = Math.max(1, AI.adults - 1); if (v === 'a+') AI.adults = Math.min(20, AI.adults + 1);
    if (v === 'k-') AI.kids = Math.max(0, AI.kids - 1); if (v === 'k+') AI.kids = Math.min(20, AI.kids + 1); aiPeopleUI();
  });
})();
