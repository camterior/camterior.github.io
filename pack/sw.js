// 캠핑 챙김 서비스워커 (범위: /pack/)
// - 화면(index.html)·장비 목록(catalog.json): 인터넷 먼저, 안 되면 저장해 둔 것 (캠핑장에서 인터넷이 약해도 열림)
// - 버전 붙은 파일(?v=)·아이콘·글꼴·장비 사진: 저장해 둔 것 먼저
// - 서버(워커) 요청은 건드리지 않음
// 파일을 고치면 index.html의 ?v= 숫자와 아래 V를 같이 올려 주세요.
const V = 'pack-v7';
const SHELL = ['./', 'pack.css?v=7', 'pack.js?v=7', 'trips.js?v=7', 'catalog.json', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-180.png', 'icons/icon-64.png', '../assets/pretendard.woff2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('pack-') && k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  const fresh = r.mode === 'navigate' || /\/pack\/(index\.html)?$|catalog\.json$|\.webmanifest$/.test(u.pathname);
  if (fresh) {
    e.respondWith(fetch(r, { cache: 'no-store' })
      .then(res => { if (res.ok) { const c = res.clone(); caches.open(V).then(x => x.put(r.mode === 'navigate' ? './' : r, c)); } return res; })
      .catch(() => caches.match(r.mode === 'navigate' ? './' : r, { ignoreSearch: r.mode === 'navigate' })));
    return;
  }
  e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => {
    if (res.ok && (/\/pack\//.test(u.pathname) || /\/img\/gear\/|\/assets\//.test(u.pathname))) { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); }
    return res;
  })));
});
