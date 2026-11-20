// Camping Check(/pack) 7단계: 캠핑 당일 아침 푸시 알림 (Web Push, 외부 패키지 없이 WebCrypto만 씀)
// - 알림 등록:  {pack:{op:'push_sub', code, sub:{endpoint, keys:{p256dh, auth}}}}  → KV 'push:<코드>' (기기 최대 5대)
// - 알림 끄기:  {pack:{op:'push_unsub', code, endpoint}}
// - 시험 알림:  {pack:{op:'push_test', code}}  (코드당 하루 5번)
// - 매일 아침 7시(한국 시간, 크론 '0 22 * * *' UTC): 오늘 출발하는 캠핑에 안 챙긴 장비가 있으면 알림
// 필요한 설정: Secret VAPID_PRIVATE_JWK (홍중이 Cloudflare에 넣음, 공개 키는 pack/push.js의 PUSH_PUBLIC_KEY)
import { getCatalog } from "./pack-ai.js";

const CODE_RE = /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/;
const SUBJECT = "https://camterior.github.io/pack/"; // VAPID 'sub' (연락처 대신 사이트 주소)
// 알림을 보낼 수 있는 곳: 브라우저 회사의 푸시 서버만 (다른 주소로 요청을 보내는 데 쓰이지 않게)
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /\.notify\.windows\.com$/];
const MAX_DEVICES = 5, LIMIT_TEST = 5, LIMIT_SUB_IP = 30;

const kstDay = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const ipOf = (request) => request.headers.get("CF-Connecting-IP") || "0";
const enc = new TextEncoder();
const b64u = (buf) => { const b = new Uint8Array(buf); let s = ""; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64u = (str) => { const s = atob(String(str).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(str).length + 3) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
const concat = (...a) => { const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; a.forEach((x) => { out.set(x, o); o += x.length; }); return out; };
async function count(env, key) { return parseInt(await env.RL.get(key)) || 0; }
async function bump(env, key) { await env.RL.put(key, String((await count(env, key)) + 1), { expirationTtl: 172800 }); }

class PushError extends Error { constructor(error, message, status = 400) { super(message); this.error = error; this.status = status; } }

/* ---------- VAPID (보내는 쪽 서명) ---------- */
let VAPID = null;
async function vapid(env) {
  if (VAPID) return VAPID;
  if (!env.VAPID_PRIVATE_JWK) throw new PushError("push-off", "알림 설정이 아직 안 됐어요.", 503);
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, d: jwk.d }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  VAPID = { key, pub: b64u(concat(new Uint8Array([4]), unb64u(jwk.x), unb64u(jwk.y))) };
  return VAPID;
}
async function vapidAuth(env, endpoint) {
  const v = await vapid(env), aud = new URL(endpoint).origin;
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, v.key, enc.encode(`${head}.${body}`)); // WebCrypto는 r||s(64바이트) 그대로 = JWT ES256 모양
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${v.pub}`;
}

/* ---------- 내용 암호화 (RFC 8291, aes128gcm) ---------- */
async function hkdf(salt, ikm, info, bytes) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, bytes * 8));
}
export async function encryptPayload(sub, text) {
  const uaPublic = unb64u(sub.keys.p256dh), authSecret = unb64u(sub.keys.auth);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(enc.encode(text), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 레코드 크기 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}
async function sendPush(env, sub, msg) {
  const body = await encryptPayload(sub, JSON.stringify(msg));
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: { Authorization: await vapidAuth(env, sub.endpoint), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "43200", Urgency: "high" },
    body,
  }).catch(() => new Response("", { status: 599 }));
  if (!res.ok) console.log("push", res.status, new URL(sub.endpoint).host, (await res.text().catch(() => "")).slice(0, 200));
  return res.status;
}

/* ---------- 등록·해제·시험 ---------- */
function cleanSub(s) {
  s = s && typeof s === "object" ? s : {};
  let u; try { u = new URL(String(s.endpoint || "")); } catch { u = null; }
  if (!u || u.protocol !== "https:" || !PUSH_HOSTS.some((re) => re.test(u.hostname)) || u.href.length > 1000) throw new PushError("endpoint", "이 브라우저의 알림 주소를 쓸 수 없어요.");
  const p256dh = String((s.keys && s.keys.p256dh) || ""), auth = String((s.keys && s.keys.auth) || "");
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,30}$/.test(auth)) throw new PushError("keys", "알림 키가 올바르지 않아요.");
  return { endpoint: u.href, keys: { p256dh, auth } };
}
async function codeOf(env, request, raw) {
  const code = String(raw || "").trim().toUpperCase();
  if (!CODE_RE.test(code)) throw new PushError("code", "내 코드가 필요해요.");
  const miss = `am:${kstDay()}:${ipOf(request)}`;
  if ((await count(env, miss)) >= 30) throw new PushError("quota", "오늘 코드 확인 횟수를 다 썼어요.", 429);
  if (!(await env.RL.get("acct:" + code))) { await bump(env, miss); throw new PushError("nocode", "이 코드를 찾지 못했어요.", 404); }
  return code;
}
const subsOf = async (env, code) => { try { const L = JSON.parse((await env.RL.get("push:" + code)) || "[]"); return Array.isArray(L) ? L : []; } catch { return []; } };

export async function pushOp(p, env, request, reply) {
  try {
    if (!env.RL) throw new PushError("acct-off", "지금은 알림을 쓸 수 없어요.", 503);
    const code = await codeOf(env, request, p.code);
    if (p.op === "push_sub") {
      const ik = `ps:${kstDay()}:${ipOf(request)}`;
      if ((await count(env, ik)) >= LIMIT_SUB_IP) throw new PushError("quota", "오늘은 더 등록할 수 없어요.", 429);
      await bump(env, ik);
      const s = cleanSub(p.sub);
      const L = (await subsOf(env, code)).filter((x) => x.endpoint !== s.endpoint);
      L.unshift({ ...s, at: Date.now() });
      await env.RL.put("push:" + code, JSON.stringify(L.slice(0, MAX_DEVICES)));
      return reply({ ok: true, devices: Math.min(L.length, MAX_DEVICES) }, 200);
    }
    if (p.op === "push_unsub") {
      const L = (await subsOf(env, code)).filter((x) => x.endpoint !== String(p.endpoint || ""));
      if (L.length) await env.RL.put("push:" + code, JSON.stringify(L)); else await env.RL.delete("push:" + code);
      return reply({ ok: true, devices: L.length }, 200);
    }
    if (p.op === "push_test") {
      const tk = `pt:${kstDay()}:${code}`;
      if ((await count(env, tk)) >= LIMIT_TEST) throw new PushError("quota", "시험 알림은 하루 5번까지예요.", 429);
      await bump(env, tk);
      const L = await subsOf(env, code);
      if (!L.length) throw new PushError("nodevice", "알림을 켠 기기가 없어요.", 404);
      const msg = { title: "🔔 알림이 켜졌어요", body: "캠핑 가는 날 아침 7시에 안 챙긴 장비를 알려드릴게요.", url: "/pack/", tag: "pack-test" };
      const results = await Promise.all(L.map((s) => sendPush(env, s, msg)));
      await dropGone(env, code, L, results);
      return reply({ ok: true, sent: results.filter((r) => r >= 200 && r < 300).length, results }, 200);
    }
    return reply({ error: "op", message: "알 수 없는 요청이에요." }, 400);
  } catch (e) {
    if (e instanceof PushError) return reply({ error: e.error, message: e.message }, e.status);
    console.log("push 오류", e && e.stack || e);
    return reply({ error: "server", message: "문제가 생겼어요. 잠시 후 다시 시도해 주세요." }, 500);
  }
}
// 브라우저가 알림을 끈 기기(404·410)는 목록에서 뺌
async function dropGone(env, code, L, results) {
  const keep = L.filter((_, i) => results[i] !== 404 && results[i] !== 410);
  if (keep.length !== L.length) { if (keep.length) await env.RL.put("push:" + code, JSON.stringify(keep)); else await env.RL.delete("push:" + code); }
}

/* ---------- 매일 아침: 오늘 출발하는 캠핑 ---------- */
export async function tripMessages(trips, nameOf, today) {
  const out = [];
  (Array.isArray(trips) ? trips : []).forEach((t) => {
    if (!t || t.del || t.date !== today) return;
    const keys = Object.keys(t.items || {}), left = keys.filter((k) => !(t.done || {})[k]);
    if (keys.length && !left.length) return; // 다 챙겼으면 안 보냄
    const names = left.slice(0, 3).map(nameOf).filter(Boolean);
    out.push({
      title: `⛺ 오늘 ${t.name}`,
      body: !keys.length ? "아직 챙길 장비를 고르지 않았어요. 출발 전에 체크리스트를 만들어 보세요."
        : `아직 안 챙긴 장비 ${left.length}가지: ${names.join(", ")}${left.length > names.length ? " 외" : ""}`,
      url: `/pack/#t/${t.id}`, tag: `pack-${t.id}-${today}`,
    });
  });
  return out;
}
export async function pushDaily(env) {
  if (!env.RL || !env.VAPID_PRIVATE_JWK) return;
  const today = kstDay();
  let cat = null; try { cat = await getCatalog(); } catch { cat = null; }
  let cursor, sent = 0, codes = 0;
  do {
    const page = await env.RL.list({ prefix: "push:", cursor });
    cursor = page.list_complete ? null : page.cursor;
    for (const { name } of page.keys) {
      const code = name.slice(5); codes++;
      const dk = `pd:${today}:${code}`;
      if (await env.RL.get(dk)) continue; // 오늘 이미 보냄 (크론이 두 번 돌아도 한 번만)
      let trips = [], custom = {};
      try { trips = JSON.parse((await env.RL.get("trips:" + code)) || "[]"); } catch {}
      try { custom = (JSON.parse((await env.RL.get("acct:" + code)) || "{}").custom) || {}; } catch {}
      const nameOf = (k) => k.startsWith("my:") ? (custom[k.slice(3)] || {}).n : cat && cat.byKey.get(k) ? cat.byKey.get(k).name : null;
      const msgs = await tripMessages(trips, nameOf, today);
      if (!msgs.length) continue;
      await env.RL.put(dk, "1", { expirationTtl: 172800 });
      const L = await subsOf(env, code);
      for (const m of msgs) { const results = await Promise.all(L.map((s) => sendPush(env, s, m))); sent += results.filter((r) => r >= 200 && r < 300).length; await dropGone(env, code, L, results); }
    }
  } while (cursor);
  console.log("pushDaily", today, "codes", codes, "sent", sent);
}
