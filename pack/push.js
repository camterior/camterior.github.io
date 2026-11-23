/* =====================================================================
   Camping Check · 캠핑 당일 아침 알림 (7단계) — 서버는 worker/pack-push.js
   - '알림 켜기' → 브라우저 알림 허용 → 이 기기의 알림 주소를 내 코드에 등록 → 고른 시각(기본: 캠핑 가는 날 오전 9시,
     '시간 바꾸기'로 전날/당일 + 5~22시)에 그날 캠핑에 안 챙긴 장비가 있으면 서버가 보냄 (캠핑 일정은 6단계 동기화로 서버에 있음)
   - 아이폰은 홈 화면에 설치한 앱에서만 됨 (iOS 16.4+)
   ===================================================================== */
'use strict';
const PUSH_PUBLIC_KEY = 'BEIdn38HoViDy-CY5i7WxmeURH5GRP9rtNcQrTj7fdE-TTOgczpOWP51Vr4DBvmWjqwugVAonpwzbutAmwlJGcE'; // 공개 키 (비밀 키는 Cloudflare Secret VAPID_PRIVATE_JWK)
const K_PUSH = 'packPush';
const pushOk = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const pushKeyBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
let PUSH_BUSY = false, PUSH_EDIT = false, PUSH_CFG_AT = 0;
// 알림 시간: d 0 = 캠핑 가는 날, 1 = 전날 / h 5~22시. 서버(pcfg:<코드>)가 기준, 이 기기엔 보여주기용으로만
const PUSH_H = Array.from({ length: 18 }, (_, i) => i + 5);
const pushCfg = () => { const s = lsGet(K_PUSH, null); return (s && s.cfg) || { d: 0, h: 9 }; };
const pushHourT = h => (h < 12 ? '오전 ' : '오후 ') + ((h % 12) || 12) + '시';
const pushWhen = c => (c.d ? '출발 전날 ' : '캠핑 가는 날 ') + pushHourT(c.h);
function pushCfgSet(cfg) { const s = lsGet(K_PUSH, null); if (s) { s.cfg = cfg; lsSet(K_PUSH, s); } }

async function pushCurrent() { try { const reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); } catch (e) { return null; } }
async function pushUI() {
  const box = $('pushCard'); if (!box) return;
  const upcoming = TRIPS.some(t => !isPast(t)), saved = lsGet(K_PUSH, null);
  if (!upcoming && !saved) { box.hidden = true; return; }
  box.hidden = false;
  let html;
  if (!pushOk()) {
    html = isIOS() && !isStandalone()
      ? '<span class="pu-ic" aria-hidden="true">🔔</span><div class="pu-t"><b>캠핑 날 아침 알림</b><span>아이폰은 <b>홈 화면에 추가한 앱</b>에서만 알림을 받을 수 있어요. 공유 버튼 → ‘홈 화면에 추가’ 후 거기서 켜 주세요.</span></div>'
      : '<span class="pu-ic" aria-hidden="true">🔔</span><div class="pu-t"><b>캠핑 날 아침 알림</b><span>이 브라우저는 알림을 지원하지 않아요.</span></div>';
  } else if (Notification.permission === 'denied') {
    html = '<span class="pu-ic" aria-hidden="true">🔕</span><div class="pu-t"><b>알림이 막혀 있어요</b><span>휴대폰 설정에서 Camping Check 알림을 허용하면 켤 수 있어요.</span></div>';
  } else {
    const sub = await pushCurrent(), on = !!(sub && saved && saved.endpoint === sub.endpoint);
    const c = pushCfg();
    if (on && Date.now() - PUSH_CFG_AT > 600e3) { PUSH_CFG_AT = Date.now(); pushCfgPull(); } // 다른 기기에서 바꿨을 수 있음
    html = on
      ? `<span class="pu-ic on" aria-hidden="true">🔔</span><div class="pu-t"><b>캠핑 알림 켜짐</b><span><b>${pushWhen(c)}</b>에 안 챙긴 장비를 알려드려요.</span></div><div class="pu-b"><button type="button" class="link" data-pu="edit" aria-expanded="${PUSH_EDIT}">시간 바꾸기</button><button type="button" class="link" data-pu="test">시험 알림</button><button type="button" class="link" data-pu="off">끄기</button></div>`
        + (PUSH_EDIT ? `<div class="pu-cfg"><div class="seg sm" role="group" aria-label="언제">${[[0, '캠핑 가는 날'], [1, '출발 전날']].map(([d, t]) => `<button type="button" data-pd="${d}" aria-pressed="${c.d === d}">${t}</button>`).join('')}</div>`
          + `<label class="pu-h"><span class="sr-only">몇 시</span><select id="pushH">${PUSH_H.map(h => `<option value="${h}"${h === c.h ? ' selected' : ''}>${pushHourT(h)}</option>`).join('')}</select></label>`
          + `<button type="button" class="btn-main sm" data-pu="save">저장</button></div>` : '')
      : '<span class="pu-ic" aria-hidden="true">🔔</span><div class="pu-t"><b>캠핑 날 알림 받을까요?</b><span>캠핑 가는 날 오전 9시, 안 챙긴 장비가 있으면 알려드려요. 켠 다음 시간을 바꿀 수 있어요.</span></div><button type="button" class="btn-main sm" data-pu="on">알림 켜기</button>';
  }
  box.innerHTML = html;
}
async function pushOn() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('알림을 허용하지 않았어요'); return; }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pushKeyBytes(PUSH_PUBLIC_KEY) });
  const code = await ensureCode(); if (!code) throw new Error('인터넷 연결을 확인해 주세요.');
  const d = await aiApi({ op: 'push_sub', code, sub: sub.toJSON() });
  const cfg = (d && d.cfg) || { d: 0, h: 9 };
  lsSet(K_PUSH, { endpoint: sub.endpoint, code, cfg });
  if (TRIPS.length) tripsPush(); // 서버가 캠핑 일정을 알아야 그 시각에 보낼 수 있음
  toast(`알림을 켰어요 · ${pushWhen(cfg)}`);
}
async function pushOff() {
  const sub = await pushCurrent(), saved = lsGet(K_PUSH, null);
  if (saved && saved.code) aiApi({ op: 'push_unsub', code: saved.code, endpoint: saved.endpoint }).catch(() => {});
  if (sub) await sub.unsubscribe().catch(() => {});
  try { localStorage.removeItem(K_PUSH); } catch (e) {}
  toast('알림을 껐어요');
}
async function pushTest() {
  const saved = lsGet(K_PUSH, null); if (!saved) return;
  const d = await aiApi({ op: 'push_test', code: saved.code });
  toast(d.sent ? '시험 알림을 보냈어요' : '알림을 보내지 못했어요. 끄고 다시 켜 보세요');
}
async function pushCfgSave() {
  const saved = lsGet(K_PUSH, null); if (!saved) return;
  const dBtn = $('pushCard').querySelector('[data-pd][aria-pressed="true"]');
  const want = { d: dBtn ? Number(dBtn.dataset.pd) : pushCfg().d, h: Number($('pushH').value) };
  const d = await aiApi({ op: 'push_cfg', code: saved.code, ...want });
  pushCfgSet(d.cfg || want); PUSH_EDIT = false;
  toast(`알림 시간을 바꿨어요 · ${pushWhen(d.cfg || want)}`);
}
async function pushCfgPull() {
  const saved = lsGet(K_PUSH, null); if (!saved) return;
  try { const d = await aiApi({ op: 'push_cfg', code: saved.code }); const o = pushCfg(); if (d.cfg && (d.cfg.d !== o.d || d.cfg.h !== o.h)) { pushCfgSet(d.cfg); if (!PUSH_EDIT) pushUI(); } } catch (e) {}
}
// 내 코드를 바꿔 불러왔으면 그 코드로 다시 등록
async function pushRecheck() {
  const saved = lsGet(K_PUSH, null), c = codeGet();
  if (!saved || !c || saved.code === c || !pushOk() || Notification.permission !== 'granted') return;
  const sub = await pushCurrent(); if (!sub) return;
  try { const d = await aiApi({ op: 'push_sub', code: c, sub: sub.toJSON() }); aiApi({ op: 'push_unsub', code: saved.code, endpoint: sub.endpoint }).catch(() => {}); lsSet(K_PUSH, { endpoint: sub.endpoint, code: c, cfg: (d && d.cfg) || { d: 0, h: 9 } }); } catch (e) {}
}
(function pushInit() {
  $('pushCard').addEventListener('click', async e => {
    const pd = e.target.closest('[data-pd]');
    if (pd) { pd.parentElement.querySelectorAll('[data-pd]').forEach(x => x.setAttribute('aria-pressed', String(x === pd))); return; }
    const b = e.target.closest('[data-pu]'); if (!b || PUSH_BUSY) return;
    if (b.dataset.pu === 'edit') { PUSH_EDIT = !PUSH_EDIT; pushUI(); return; }
    PUSH_BUSY = true; b.disabled = true;
    try { if (b.dataset.pu === 'on') await pushOn(); else if (b.dataset.pu === 'off') { PUSH_EDIT = false; await pushOff(); } else if (b.dataset.pu === 'save') await pushCfgSave(); else await pushTest(); }
    catch (ex) { toast(ex.message || '알림을 켜지 못했어요'); }
    finally { PUSH_BUSY = false; pushUI(); }
  });
  addEventListener('storage', e => { if (e.key === K_ACCT) pushRecheck(); });
  setTimeout(pushRecheck, 3000);
})();
