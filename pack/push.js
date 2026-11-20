/* =====================================================================
   Camping Check · 캠핑 당일 아침 알림 (7단계) — 서버는 worker/pack-push.js
   - '알림 켜기' → 브라우저 알림 허용 → 이 기기의 알림 주소를 내 코드에 등록 → 매일 아침 9시(한국 시간)
     오늘 출발하는 캠핑에 안 챙긴 장비가 있으면 서버가 보냄 (캠핑 일정은 6단계 동기화로 서버에 있음)
   - 아이폰은 홈 화면에 설치한 앱에서만 됨 (iOS 16.4+)
   ===================================================================== */
'use strict';
const PUSH_PUBLIC_KEY = 'BEIdn38HoViDy-CY5i7WxmeURH5GRP9rtNcQrTj7fdE-TTOgczpOWP51Vr4DBvmWjqwugVAonpwzbutAmwlJGcE'; // 공개 키 (비밀 키는 Cloudflare Secret VAPID_PRIVATE_JWK)
const K_PUSH = 'packPush';
const pushOk = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const pushKeyBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
let PUSH_BUSY = false;

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
    html = on
      ? '<span class="pu-ic on" aria-hidden="true">🔔</span><div class="pu-t"><b>캠핑 날 아침 알림 켜짐</b><span>출발하는 날 아침 9시에 안 챙긴 장비를 알려드려요.</span></div><div class="pu-b"><button type="button" class="link" data-pu="test">시험 알림</button><button type="button" class="link" data-pu="off">끄기</button></div>'
      : '<span class="pu-ic" aria-hidden="true">🔔</span><div class="pu-t"><b>캠핑 날 아침에 알려드릴까요?</b><span>출발하는 날 아침 9시, 안 챙긴 장비가 있으면 알림을 보내요.</span></div><button type="button" class="btn-main sm" data-pu="on">알림 켜기</button>';
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
  await aiApi({ op: 'push_sub', code, sub: sub.toJSON() });
  lsSet(K_PUSH, { endpoint: sub.endpoint, code });
  if (TRIPS.length) tripsPush(); // 서버가 캠핑 일정을 알아야 아침에 보낼 수 있음
  toast('알림을 켰어요 · 캠핑 날 아침 9시');
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
// 내 코드를 바꿔 불러왔으면 그 코드로 다시 등록
async function pushRecheck() {
  const saved = lsGet(K_PUSH, null), c = codeGet();
  if (!saved || !c || saved.code === c || !pushOk() || Notification.permission !== 'granted') return;
  const sub = await pushCurrent(); if (!sub) return;
  try { await aiApi({ op: 'push_sub', code: c, sub: sub.toJSON() }); aiApi({ op: 'push_unsub', code: saved.code, endpoint: sub.endpoint }).catch(() => {}); lsSet(K_PUSH, { endpoint: sub.endpoint, code: c }); } catch (e) {}
}
(function pushInit() {
  $('pushCard').addEventListener('click', async e => {
    const b = e.target.closest('[data-pu]'); if (!b || PUSH_BUSY) return;
    PUSH_BUSY = true; b.disabled = true;
    try { if (b.dataset.pu === 'on') await pushOn(); else if (b.dataset.pu === 'off') await pushOff(); else await pushTest(); }
    catch (ex) { toast(ex.message || '알림을 켜지 못했어요'); }
    finally { PUSH_BUSY = false; pushUI(); }
  });
  addEventListener('storage', e => { if (e.key === K_ACCT) pushRecheck(); });
  setTimeout(pushRecheck, 3000);
})();
