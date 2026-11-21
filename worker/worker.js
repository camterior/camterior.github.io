import { pack } from "./pack-ai.js";
import { pushOp, pushDaily } from "./pack-push.js";
// 캠테리어 AI 중계 서버 v3 (Cloudflare Worker) — 2026-10-30: 몰릴 때 한 번 더 시도, 오류 이유 기록
// - Gemini 키: Secret GEMINI_API_KEY
// - 초대 코드: Secret INVITE_CODE (여러 개면 쉼표로: abc,def)
// - 하루 횟수 세기: KV 바인딩 RL (없으면 제한 없이 동작)
// - 내 코드(계정): 같은 KV의 'acct:XXXX-XXXX' 키 (내 장비 목록, 초대 회원 여부)
// - 게시판: 같은 KV(RL)에 사이트별로 저장 (캠테리어 'reqs'·'notices', CARO 'caro:reqs'·'caro:notices'). 관리용 Secret ADMIN_KEY
// - Camping Check(/pack) AI: pack-ai.js (Secret ANTHROPIC_API_KEY, 하루 횟수는 pack-ai.js 맨 위)
// - Camping Check 알림: pack-push.js (Secret VAPID_PRIVATE_JWK, 크론 '0 0 * * *' = 매일 09:00 KST)
const MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest"]; // 앞에서부터 시도
const MODELS_IMAGE = ["gemini-flash-lite-latest", "gemini-flash-latest"]; // 사진도 lite 먼저 (flash는 긴 장비 목록+사진에 20초 넘게 걸려서 실사용 불가, 2026-10-30 측정)
const ALLOWED_ORIGINS = ["https://camterior.github.io", "https://caro-camp.github.io"];
const BOARD_ONLY = ["https://caro-camp.github.io"]; // CARO는 게시판만 (AI·계정·후기·pack은 막음)
const LIMIT_FREE = 5, LIMIT_CODE = 50, LIMIT_ADMIN = 100000; // 하루 횟수 (한국 시간 기준). 관리자 계정은 사실상 제한 없음
const MAX_INPUT_CHARS = 8000;
const MAX_SYSTEM_CHARS = 40000; // 사진 인식은 장비 목록 전체를 보내서 길어요
const MAX_IMAGE_CHARS = 3000000; // base64 약 2.2MB

function cors(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}
function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json; charset=utf-8", ...cors(origin) },
  });
}
function codeOk(env, code) {
  if (!env.INVITE_CODE || !code) return false;
  return env.INVITE_CODE.split(",").map(s => s.trim()).filter(Boolean).includes(String(code).trim());
}

// 내 코드(계정): 개인정보 없이 코드 하나로 내 장비·초대 회원 여부를 기억
const ACODE = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const ALPH = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function newCode() { const b = crypto.getRandomValues(new Uint8Array(8)); let c = ""; for (let i = 0; i < 8; i++) { c += ALPH[b[i] % ALPH.length]; if (i === 3) c += "-"; } return c; }
async function getAcct(env, code) { if (!env.RL || !ACODE.test(String(code || ""))) return null; const v = await env.RL.get("acct:" + code); return v ? JSON.parse(v) : null; }
async function acct(a, env, request, origin) {
  if (!env.RL) return json({ error: "acct-off" }, 503, origin);
  const ip = request.headers.get("CF-Connecting-IP") || "0";
  const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const bump = async (k, max) => { const n = parseInt(await env.RL.get(k)) || 0; if (n >= max) return false; await env.RL.put(k, String(n + 1), { expirationTtl: 172800 }); return true; };
  if (a.op === "new") {
    if (!(await bump(`an:${day}:${ip}`, 5))) return json({ error: "quota" }, 429, origin);
    let code; for (let i = 0; i < 5; i++) { code = newCode(); if (!(await env.RL.get("acct:" + code))) break; }
    const o = { gear: {}, vip: false, at: day };
    await env.RL.put("acct:" + code, JSON.stringify(o));
    return json({ code, gear: o.gear, vip: false }, 200, origin);
  }
  const code = String(a.code || "").toUpperCase().trim();
  if ((parseInt(await env.RL.get(`am:${day}:${ip}`)) || 0) >= 30) return json({ error: "quota" }, 429, origin); // 코드 맞히기 막기
  const o = await getAcct(env, code);
  if (!o) { await bump(`am:${day}:${ip}`, 30); return json({ error: "nocode" }, 404, origin); }
  if (a.op === "get") return json({ code, gear: o.gear || {}, custom: o.custom || {}, vip: !!o.vip, admin: !!o.admin }, 200, origin);
  if (a.op === "save") {
    const g = a.gear && typeof a.gear === "object" ? a.gear : {}, out = {};
    Object.keys(g).slice(0, 300).forEach(k => { const n = Math.round(+g[k]); if (/^[a-z]+:[a-z0-9_]{1,40}$/.test(k) && n >= 1 && n <= 20) out[k] = n; });
    o.gear = out; o.up = day;
    // 캠핑 챙김(/pack)에서 직접 넣은 장비 이름: gear의 'my:<id>' 키와 짝. custom을 안 보내는 캠테리어 저장은 그대로 둠
    if (a.custom && typeof a.custom === "object") {
      const cu = {};
      Object.keys(a.custom).slice(0, 200).forEach(id => { const v = a.custom[id] || {}, n = String(v.n || "").trim().slice(0, 40);
        if (/^[a-z0-9]{4,12}$/.test(id) && n && out["my:" + id]) cu[id] = { n, c: String(v.c || "etc").replace(/[^a-z]/g, "").slice(0, 12) || "etc" }; });
      o.custom = cu;
    }
    await env.RL.put("acct:" + code, JSON.stringify(o));
    return json({ ok: true, vip: !!o.vip, admin: !!o.admin }, 200, origin);
  }
  // 저장한 세팅(배치) 목록: 같은 코드면 휴대폰·PC 어디서든 같은 목록
  if (a.op === "plans" || a.op === "plan_add" || a.op === "plan_del") {
    const pk = "plans:" + code;
    let L = []; try { L = JSON.parse(await env.RL.get(pk) || "[]"); if (!Array.isArray(L)) L = []; } catch (e) { L = []; }
    if (a.op === "plan_add") {
      if (!(await bump(`pa:${day}:${ip}`, 80))) return json({ error: "quota" }, 429, origin);
      const r = a.plan || {}, c = String(r.code || "");
      if (!/^CAMP-[A-Za-z0-9_\-]{8,8000}$/.test(c)) return json({ error: "plan" }, 400, origin);
      const id = /^[a-z0-9]{2,20}$/.test(String(r.id || "")) ? String(r.id) : "p" + Date.now().toString(36);
      L = L.filter(x => x.id !== id);
      L.unshift({ id, name: String(r.name || "배치").slice(0, 40), summary: String(r.summary || "").slice(0, 120), code: c, savedAt: Math.min(Date.now(), +r.savedAt || Date.now()) });
      L = L.slice(0, 40);
      while (JSON.stringify(L).length > 220000 && L.length > 1) L.pop();
      await env.RL.put(pk, JSON.stringify(L));
    }
    if (a.op === "plan_del") { L = L.filter(x => x.id !== String(a.id || "")); await env.RL.put(pk, JSON.stringify(L)); }
    return json({ ok: true, plans: L }, 200, origin);
  }
  // 캠핑 챙김(/pack) 캠핑 일정: 같은 코드면 휴대폰·PC 어디서든 같은 목록.
  // 같은 캠핑을 두 기기가 고치면: 이름·날짜·고른 장비는 mu가 늦은 쪽, 체크는 장비마다 dt가 늦은 쪽 (pack/trips.js의 mergeTrip과 같은 규칙).
  // 지운 캠핑은 {id, del:1, up}로 60일 남겨 다시 살아나지 않게.
  if (a.op === "trips" || a.op === "trips_save") {
    const tk = "trips:" + code;
    let L = []; try { L = JSON.parse(await env.RL.get(tk) || "[]"); if (!Array.isArray(L)) L = []; } catch (e) { L = []; }
    if (a.op === "trips_save") {
      if (!(await bump(`tw:${day}:${ip}`, 600))) return json({ error: "quota" }, 429, origin);
      const now = Date.now(), keyRe = /^[a-z]+:[a-z0-9_]{1,40}$/, dateRe = /^\d{4}-\d{2}-\d{2}$/;
      const clean = t => {
        if (!t || typeof t !== "object" || !/^[a-z0-9]{2,20}$/.test(String(t.id || ""))) return null;
        const up = Math.min(now + 6e4, Math.max(0, +t.up || 0));
        if (t.del) return { id: t.id, del: 1, up };
        if (!dateRe.test(String(t.date || ""))) return null;
        const items = {}, done = {};
        Object.keys(t.items && typeof t.items === "object" ? t.items : {}).slice(0, 300).forEach(k => { const n = Math.round(+t.items[k]); if (keyRe.test(k) && n >= 1 && n <= 20) items[k] = n; });
        Object.keys(t.done && typeof t.done === "object" ? t.done : {}).forEach(k => { if (items[k]) done[k] = 1; });
        const dt = {}, ts = v => Math.min(now + 6e4, Math.max(0, +v || 0));
        Object.keys(t.dt && typeof t.dt === "object" ? t.dt : {}).slice(0, 300).forEach(k => { if (keyRe.test(k) && +t.dt[k] > 0) dt[k] = ts(t.dt[k]); });
        // AI 추천 결과(날씨·조언·없음 목록·장비별 이유·조건)도 같이 보관 (크기 제한)
        let ai;
        if (t.ai && typeof t.ai === "object") {
          const S = (v, n) => String(v == null ? "" : v).slice(0, n), N = v => (typeof v === "number" && isFinite(v) ? Math.round(v * 10) / 10 : null), A = t.ai, why = {};
          Object.keys(A.why && typeof A.why === "object" ? A.why : {}).slice(0, 300).forEach(k => { if (items[k]) why[k] = S(A.why[k], 200); });
          const c = A.cond && typeof A.cond === "object" ? A.cond : {};
          ai = { at: ts(A.at), advice: S(A.advice, 400), plan: S(A.plan, 40), place: S(A.place, 40), source: A.source === "forecast" ? "forecast" : "last-year",
            days: (Array.isArray(A.days) ? A.days : []).slice(0, 15).map(d => ({ date: S(d && d.date, 10), sky: S(d && d.sky, 10), high: N(d && d.high), low: N(d && d.low), rainChance: N(d && d.rainChance), rain: N(d && d.rain), wind: N(d && d.wind) })),
            missing: (Array.isArray(A.missing) ? A.missing : []).slice(0, 8).map(m => ({ name: S(m && m.name, 60), why: S(m && m.why, 200), alt: S(m && m.alt, 200) })),
            why, fp: (Array.isArray(A.fp) ? A.fp : []).filter(k => items[k]).slice(0, 100),
            skip: (Array.isArray(A.skip) ? A.skip : []).filter(x => x && keyRe.test(String(x.key))).slice(0, 50).map(x => ({ key: String(x.key), count: Math.max(1, Math.min(20, Math.round(+x.count) || 1)), why: S(x.why, 200) })),
            cond: { region: S(c.region, 50), ground: S(c.ground, 10), env: (Array.isArray(c.env) ? c.env : []).slice(0, 3).map(x => S(x, 10)), note: S(c.note, 80),
              people: { adults: Math.max(1, Math.min(20, Math.round(+(c.people && c.people.adults)) || 2)), kids: Math.max(0, Math.min(20, Math.round(+(c.people && c.people.kids)) || 0)) } } };
        }
        return { id: t.id, name: String(t.name || "캠핑").slice(0, 30), date: t.date, nights: Math.max(0, Math.min(14, Math.round(+t.nights || 0))),
          place: String(t.place || "").slice(0, 30), items, done, dt, at: Math.max(0, +t.at || 0), up, mu: ts(t.mu), ...(ai ? { ai } : {}) };
      };
      const merge = (a, b) => {
        if (a.del || b.del) return (b.up || 0) > (a.up || 0) ? b : a;
        const base = (b.mu || b.up || 0) > (a.mu || a.up || 0) ? b : a, ad = a.dt || {}, bd = b.dt || {}, dt = {}, done = {};
        [...new Set([...Object.keys(ad), ...Object.keys(bd)])].forEach(k => { dt[k] = Math.max(ad[k] || 0, bd[k] || 0); });
        Object.keys(base.items || {}).forEach(k => { const src = !(k in dt) ? base : (bd[k] || 0) > (ad[k] || 0) ? b : a; if ((src.done || {})[k]) done[k] = 1; });
        return { ...base, done, dt, up: Math.max(a.up || 0, b.up || 0), mu: Math.max(a.mu || 0, b.mu || 0) };
      };
      const by = new Map(L.map(t => [t.id, t]));
      (Array.isArray(a.trips) ? a.trips : []).slice(0, 80).forEach(x => { const t = clean(x); if (!t) return; const o = by.get(t.id); by.set(t.id, o ? merge(o, t) : t); });
      L = [...by.values()].filter(t => !t.del || now - (t.up || 0) < 60 * 864e5)
        .sort((x, y) => (y.up || 0) - (x.up || 0)).slice(0, 120);
      while (JSON.stringify(L).length > 400000 && L.length > 1) L.pop();
      await env.RL.put(tk, JSON.stringify(L));
    }
    return json({ ok: true, trips: L }, 200, origin);
  }
  if (a.op === "invite") {
    // 관리 키(ADMIN_KEY)를 초대 코드 칸에 넣으면 이 코드가 관리자 계정(AI 제한 없음)이 됨
    if (env.ADMIN_KEY && String(a.invite || "").trim() === env.ADMIN_KEY) {
      o.vip = true; o.admin = true; await env.RL.put("acct:" + code, JSON.stringify(o));
      return json({ ok: true, vip: true, admin: true }, 200, origin);
    }
    if (!codeOk(env, a.invite)) return json({ error: "invite" }, 403, origin);
    o.vip = true; await env.RL.put("acct:" + code, JSON.stringify(o));
    return json({ ok: true, vip: true }, 200, origin);
  }
  return json({ error: "op" }, 400, origin);
}

// 게시판: 공지사항(관리자만) · 요청 2종 (캠테리어: 장비·개발 / CARO: 캠핑장·개발)
const SITES = { camterior: { pre: "", kinds: ["gear", "dev"] }, caro: { pre: "caro:", kinds: ["camp", "dev"] } };
const ST = ["new", "ok", "sun", "done", "no"]; // 확인 중 · 확인됨 · 일요일 반영 예정 · 반영됨 · 어려움
const clip = (v, n) => String(v || "").replace(/[<>\u0000-\u0009\u000b-\u001f]/g, " ").trim().slice(0, n);
const norm = s => s.toLowerCase().replace(/[\s·\-_,./()]+/g, "");
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
async function board(b, env, request, origin) {
  if (!env.RL) return json({ error: "board-off" }, 503, origin);
  // 사이트 구분: CARO 페이지에서 오면 항상 caro. 캠테리어 쪽에서는 목록 보기와 관리 키가 있는 요청(관리실)만 caro를 고를 수 있음
  const site = BOARD_ONLY.includes(origin) ? "caro" : (b.site === "caro" && (b.op === "list" || b.key)) ? "caro" : "camterior", S = SITES[site];
  const K_REQ = S.pre + "reqs", K_NT = S.pre + "notices";
  const list = JSON.parse((await env.RL.get(K_REQ)) || "[]");
  const notices = JSON.parse((await env.RL.get(K_NT)) || "[]");
  const pub = () => list.filter(r => r.st !== "hide").map(({ id, kind, name, link, note, reply, n, st, at }) => ({ id, kind: kind || S.kinds[0], name, link, note, reply, n, st, at }));
  const pubN = () => notices.slice().sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || (b.at > a.at ? 1 : -1));
  if (b.op === "list") return json({ items: pub(), notices: pubN() }, 200, origin);
  if (b.op === "add" || b.op === "plus") {
    const ip = request.headers.get("CF-Connecting-IP") || "0";
    const rk = `b:${site === "caro" ? "caro:" : ""}${today()}:${ip}`, used = parseInt(await env.RL.get(rk)) || 0;
    if (used >= 10) return json({ error: "quota" }, 429, origin);
    let r;
    if (b.op === "plus") r = list.find(x => x.id === b.id);
    else {
      const kind = S.kinds.includes(b.kind) ? b.kind : S.kinds[0], name = clip(b.name, 40);
      if (name.length < 2) return json({ error: "empty" }, 400, origin);
      r = list.find(x => (x.kind || S.kinds[0]) === kind && norm(x.name) === norm(name) && x.st !== "hide");
      if (!r) {
        if (list.length >= 800) return json({ error: "full" }, 507, origin);
        r = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), kind, name, link: /^https?:\/\//.test(b.link || "") ? clip(b.link, 300) : "", note: clip(b.note, 300), n: 0, st: "new", at: today(), from: ["ai", "search"].includes(b.from) ? b.from : "form" };
        list.unshift(r);
      }
    }
    if (!r) return json({ error: "none" }, 404, origin);
    r.n = (r.n || 0) + 1;
    await env.RL.put(K_REQ, JSON.stringify(list));
    await env.RL.put(rk, String(used + 1), { expirationTtl: 172800 });
    return json({ ok: true, id: r.id, items: pub() }, 200, origin);
  }
  // 관리자: 상태·답글 바꾸기, 공지 쓰기·지우기
  if (!env.ADMIN_KEY || b.key !== env.ADMIN_KEY) return json({ error: "key" }, 403, origin);
  if (b.op === "admin") {
    const r = list.find(x => x.id === b.id);
    if (r) {
      if (ST.includes(b.st) || b.st === "hide") r.st = b.st;
      if (typeof b.reply === "string") r.reply = clip(b.reply, 200);
      await env.RL.put(K_REQ, JSON.stringify(list));
    }
    return json({ ok: true, items: list, notices: pubN() }, 200, origin);
  }
  if (b.op === "notice") {
    if (b.act === "add") {
      const title = clip(b.title, 60);
      if (!title) return json({ error: "empty" }, 400, origin);
      const n = { id: Date.now().toString(36), title, body: clip(b.body, 2000), pin: !!b.pin, at: today() };
      const ni = await ntImgs(n, b.imgs, env); if (ni === false) return json({ error: "image" }, 400, origin);
      notices.unshift(n);
    } else if (b.act === "img") {
      // 이미 올린 공지에 사진 더하기 (최대 4장)
      const n = notices.find(n => n.id === b.id); if (!n) return json({ error: "none" }, 404, origin);
      const ni = await ntImgs(n, b.imgs, env); if (ni === false) return json({ error: "image" }, 400, origin);
    } else if (b.act === "imgdel") {
      const n = notices.find(n => n.id === b.id); if (n) { for (let k = 0; k < 4; k++) await env.RL.delete(`nimg:${n.id}:${k}`); n.ni = 0; }
    } else if (b.act === "del") {
      const k = notices.findIndex(n => n.id === b.id);
      if (k >= 0) { for (let q = 0; q < 4; q++) await env.RL.delete(`nimg:${notices[k].id}:${q}`); notices.splice(k, 1); }
    } else if (b.act === "pin") {
      const n = notices.find(n => n.id === b.id); if (n) n.pin = !n.pin;
    }
    await env.RL.put(K_NT, JSON.stringify(notices.slice(0, 100)));
    return json({ ok: true, items: list, notices: pubN() }, 200, origin);
  }
  return json({ error: "op" }, 400, origin);
}


// ===== 캠핑 후기: 배치 사진 + 실제 사진 + 댓글 (같은 KV) =====
// rv:<id> 글, rvc:<id> 댓글, rimg:<id>:<k> 사진(JPEG 바이트), rvidx 목록(최신순 id 배열)
const RV_MAX_IMG = 900000; // base64 글자 수(약 650KB) — 사이트에서 1600px JPEG로 한도 안까지 줄여 보냄
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const b64bytes = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
async function bump(env, k, max) { const n = parseInt(await env.RL.get(k)) || 0; if (n >= max) return false; await env.RL.put(k, String(n + 1), { expirationTtl: 172800 }); return true; }
function rvPub(r, full) {
  const o = { id: r.id, title: r.title, site: r.site, date: r.date, rating: r.rating, nick: r.nick, at: r.at, tent: r.tent || "", likes: r.likes || 0, nc: r.nc || 0, plan: !!r.plan, nimg: r.nimg || 0, hasPlanImg: !!r.planImg };
  if (full) Object.assign(o, { good: r.good || "", changed: r.changed || "", next: r.next || "", plan: r.plan || "", gear: r.gear || [] });
  return o;
}
async function review(v, env, request, origin) {
  if (!env.RL) return json({ error: "off" }, 503, origin);
  const ip = request.headers.get("CF-Connecting-IP") || "0", day = today();
  const isAdmin = env.ADMIN_KEY && v.key === env.ADMIN_KEY;
  const idx = JSON.parse((await env.RL.get("rvidx")) || "[]");
  const getR = async id => { const t = await env.RL.get("rv:" + String(id || "").slice(0, 20)); return t ? JSON.parse(t) : null; };
  if (v.op === "list") {
    const page = Math.max(0, parseInt(v.page) || 0), ids = idx.slice(page * 24, page * 24 + 24);
    const rows = (await Promise.all(ids.map(getR))).filter(r => r && (!r.hide || isAdmin)).map(r => Object.assign(rvPub(r), isAdmin ? { hide: !!r.hide, rep: r.rep || 0 } : {}));
    return json({ items: rows, more: idx.length > page * 24 + 24, total: idx.length }, 200, origin);
  }
  if (v.op === "get") {
    const r = await getR(v.id); if (!r || (r.hide && !isAdmin)) return json({ error: "none" }, 404, origin);
    const cm = JSON.parse((await env.RL.get("rvc:" + r.id)) || "[]").filter(c => !c.hide || isAdmin).map(({ id, nick, text, at }) => ({ id, nick, text, at }));
    return json({ item: rvPub(r, true), comments: cm }, 200, origin);
  }
  if (v.op === "add") {
    if (!(await bump(env, `rva:${day}:${ip}`, 3))) return json({ error: "quota" }, 429, origin);
    const title = clip(v.title, 40), nick = clip(v.nick, 16) || "캠퍼";
    if (title.length < 2) return json({ error: "empty" }, 400, origin);
    const imgs = (Array.isArray(v.photos) ? v.photos : []).slice(0, 4).map(x => String(x || ""));
    const planImg = String(v.planImg || "");
    for (const b of imgs.concat(planImg ? [planImg] : [])) if (b.length > RV_MAX_IMG || /[^A-Za-z0-9+/=]/.test(b)) return json({ error: "image" }, 400, origin);
    if (!imgs.length && !planImg) return json({ error: "photo" }, 400, origin);
    const id = rid(), own = crypto.randomUUID();
    const r = { id, own, title, nick, site: clip(v.site, 40), date: /^\d{4}-\d{2}-\d{2}$/.test(v.date || "") ? v.date : "", rating: Math.min(5, Math.max(0, Math.round(+v.rating || 0))),
      tent: clip(v.tent, 40), good: clip(v.good, 600), changed: clip(v.changed, 600), next: clip(v.next, 600),
      plan: /^CAMP-[A-Za-z0-9_\-]{10,6000}$/.test(v.plan || "") ? v.plan : "", gear: (Array.isArray(v.gear) ? v.gear : []).slice(0, 12).map(g => clip(g, 30)).filter(Boolean),
      nimg: imgs.length, planImg: !!planImg, likes: 0, nc: 0, rep: 0, at: Date.now(), ip };
    if (planImg) await env.RL.put(`rimg:${id}:p`, b64bytes(planImg));
    for (let k = 0; k < imgs.length; k++) await env.RL.put(`rimg:${id}:${k}`, b64bytes(imgs[k]));
    await env.RL.put("rv:" + id, JSON.stringify(r));
    idx.unshift(id); await env.RL.put("rvidx", JSON.stringify(idx.slice(0, 2000)));
    return json({ ok: true, id, own }, 200, origin);
  }
  const r = await getR(v.id);
  if (!r) return json({ error: "none" }, 404, origin);
  if (v.op === "comment") {
    if (r.hide) return json({ error: "none" }, 404, origin);
    if (!(await bump(env, `rvm:${day}:${ip}`, 30))) return json({ error: "quota" }, 429, origin);
    const text = clip(v.text, 300); if (text.length < 1) return json({ error: "empty" }, 400, origin);
    const cm = JSON.parse((await env.RL.get("rvc:" + r.id)) || "[]");
    if (cm.length >= 300) return json({ error: "full" }, 507, origin);
    cm.push({ id: rid(), nick: clip(v.nick, 16) || "캠퍼", text, at: Date.now(), ip });
    await env.RL.put("rvc:" + r.id, JSON.stringify(cm)); r.nc = cm.filter(c => !c.hide).length; await env.RL.put("rv:" + r.id, JSON.stringify(r));
    return json({ ok: true, comments: cm.filter(c => !c.hide).map(({ id, nick, text, at }) => ({ id, nick, text, at })) }, 200, origin);
  }
  if (v.op === "like") {
    const lk = `rvl:${r.id}:${ip}`; if (await env.RL.get(lk)) return json({ ok: true, likes: r.likes || 0, already: true }, 200, origin);
    await env.RL.put(lk, "1", { expirationTtl: 31536000 }); r.likes = (r.likes || 0) + 1; await env.RL.put("rv:" + r.id, JSON.stringify(r));
    return json({ ok: true, likes: r.likes }, 200, origin);
  }
  if (v.op === "report") {
    const rk = `rvr:${r.id}:${ip}`; if (!(await env.RL.get(rk))) { await env.RL.put(rk, "1", { expirationTtl: 2592000 }); r.rep = (r.rep || 0) + 1; if (r.rep >= 3) r.hide = true; await env.RL.put("rv:" + r.id, JSON.stringify(r)); }
    return json({ ok: true }, 200, origin);
  }
  if (v.op === "del") { // 쓴 사람(own 토큰) 또는 관리자
    if (!isAdmin && (!v.own || v.own !== r.own)) return json({ error: "key" }, 403, origin);
    for (const k of ["p", 0, 1, 2, 3]) await env.RL.delete(`rimg:${r.id}:${k}`);
    await env.RL.delete("rv:" + r.id); await env.RL.delete("rvc:" + r.id);
    await env.RL.put("rvidx", JSON.stringify(idx.filter(x => x !== r.id)));
    return json({ ok: true }, 200, origin);
  }
  if (!isAdmin) return json({ error: "key" }, 403, origin);
  if (v.op === "hide") { r.hide = !!v.hide; if (!r.hide) r.rep = 0; await env.RL.put("rv:" + r.id, JSON.stringify(r)); return json({ ok: true }, 200, origin); }
  if (v.op === "cdel") { const cm = JSON.parse((await env.RL.get("rvc:" + r.id)) || "[]").filter(c => c.id !== v.cid); await env.RL.put("rvc:" + r.id, JSON.stringify(cm)); r.nc = cm.length; await env.RL.put("rv:" + r.id, JSON.stringify(r)); return json({ ok: true }, 200, origin); }
  return json({ error: "op" }, 400, origin);
}
// 공지 사진: nimg:<공지 id>:<0..3> (JPEG 바이트), 공지에는 장수(ni)만
async function ntImgs(n, imgs, env) {
  if (!Array.isArray(imgs) || !imgs.length) return n.ni || 0;
  const have = n.ni || 0, add = imgs.slice(0, Math.max(0, 4 - have));
  for (const b of add) if (typeof b !== "string" || b.length > RV_MAX_IMG || /[^A-Za-z0-9+/=]/.test(b)) return false;
  for (let k = 0; k < add.length; k++) await env.RL.put(`nimg:${n.id}:${have + k}`, b64bytes(add[k]));
  n.ni = have + add.length; return n.ni;
}
async function noticeImg(m, env) {
  const b = await env.RL.get(`nimg:${m[1]}:${m[2]}`, "arrayBuffer");
  if (!b) return new Response("", { status: 404 });
  return new Response(b, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*", "Cross-Origin-Resource-Policy": "cross-origin" } });
}
// 후기 사진: GET /img/<id>/<k> (k = p | 0..3)
async function reviewImg(url, env) {
  const nm = url.pathname.match(/^\/nimg\/([a-z0-9]{6,20})\/([0-3])$/);
  if (nm && env.RL) return noticeImg(nm, env);
  const m = url.pathname.match(/^\/img\/([a-z0-9]{6,20})\/(p|[0-3])$/);
  if (!m || !env.RL) return new Response("", { status: 404 });
  const r = await env.RL.get("rv:" + m[1]); if (!r || JSON.parse(r).hide) return new Response("", { status: 404 });
  const b = await env.RL.get(`rimg:${m[1]}:${m[2]}`, "arrayBuffer");
  if (!b) return new Response("", { status: 404 });
  return new Response(b, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=604800", "Access-Control-Allow-Origin": "*", "Cross-Origin-Resource-Policy": "cross-origin" } });
}

export default {
  // 매일 아침 9시(한국 시간): 오늘 출발하는 캠핑에 안 챙긴 장비가 있으면 알림 (크론은 worker-deploy.yml에서 붙임)
  async scheduled(event, env, ctx) { ctx.waitUntil(pushDaily(env)); },
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
    if (request.method === "GET") return reviewImg(new URL(request.url), env);
    if (request.method !== "POST") return json({ error: "method" }, 405, origin);
    if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: "origin" }, 403, origin);

    let body;
    try { body = await request.json(); } catch { return json({ error: "bad" }, 400, origin); }
    // CARO(caro-camp.github.io)는 게시판만 씀. Gemini 키와 상관없이 동작
    if (BOARD_ONLY.includes(origin)) return body.board ? board(body.board, env, request, origin) : json({ error: "origin" }, 403, origin);
    // Camping Check(/pack) 날씨·저장한 세팅·Claude 추천 (pack-ai.js). Gemini 키와 상관없이 동작
    if (body.pack && typeof body.pack === "object" && /^push_/.test(String(body.pack.op))) return pushOp(body.pack, env, request, (d, s) => json(d, s, origin)); // 7단계 알림 (pack-push.js)
    if (body.pack && typeof body.pack === "object") return pack(body.pack, env, request, (d, s) => json(d, s, origin));

    if (!env.GEMINI_API_KEY) return json({ error: "key" }, 500, origin);

    if (body.board) return board(body.board, env, request, origin);
    if (body.review) return review(body.review, env, request, origin);
    if (body.acct && typeof body.acct === "object") return acct(body.acct, env, request, origin);

    // 하루 횟수
    // 초대 회원: 요청에 초대 코드가 있거나, 내 코드(계정)가 초대 회원이면 하루 50회 (계정별로 셈)
    const ac = typeof body.acct === "string" ? body.acct.toUpperCase() : "";
    const acc = ac ? await getAcct(env, ac) : null;
    const vip = codeOk(env, body.code) || !!(acc && acc.vip);
    const admin = !!(acc && acc.admin);
    const limit = admin ? LIMIT_ADMIN : vip ? LIMIT_CODE : LIMIT_FREE;
    const ip = request.headers.get("CF-Connecting-IP") || "0";
    const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    const rk = vip && acc ? `a:${day}:${ac}` : `${vip ? "c" : "f"}:${day}:${ip}`;
    let used = 0;
    if (env.RL) used = parseInt(await env.RL.get(rk)) || 0;
    if (body.check) return json({ left: Math.max(0, limit - used), limit, vip, admin }, 200, origin); // 남은 횟수만 확인
    if (env.RL && used >= limit) return json({ error: "quota", left: 0, limit, vip, admin }, 429, origin);

    const prompt = String(body.prompt || "").slice(0, MAX_INPUT_CHARS);
    const system = String(body.system || "").slice(0, MAX_SYSTEM_CHARS); // 장비·텐트 목록과 예시가 들어가서 길게
    if (!prompt) return json({ error: "empty" }, 400, origin);

    const parts = [{ text: prompt }];
    // 사진 인식(내 장비 등록): {image:{mime:'image/jpeg', data:base64}}
    if (body.image) {
      const mime = String(body.image.mime || "");
      const data = String(body.image.data || "");
      if (!/^image\/(jpeg|png|webp)$/.test(mime) || !data || data.length > MAX_IMAGE_CHARS || /[^A-Za-z0-9+/=]/.test(data)) return json({ error: "image" }, 400, origin);
      parts.push({ inline_data: { mime_type: mime, data } });
    }
    const payload = {
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    };
    if (system) payload.systemInstruction = { parts: [{ text: system }] };

    let res = null, why = "";
    // 관리자는 시험용으로 model:'lite'|'flash'를 고를 수 있음
    let order = body.image ? MODELS_IMAGE : MODELS;
    if (admin && body.model === "lite") order = MODELS; else if (admin && body.model === "flash") order = ["gemini-flash-latest", "gemini-flash-lite-latest"];
    let usedModel = "";
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const call = async (m, think, ms) => {
      // ms 안에 답이 없으면 끊고 다음으로 (flash가 붐빌 때 오래 멈추지 않게)
      const ctl = new AbortController(), to = ms ? setTimeout(() => ctl.abort(), ms) : null;
      try {
        return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          // flash는 생각(thinking)을 끄면 훨씬 빨라짐. 모델이 이 설정을 거부(400)하면 설정 없이 다시 보냄
          body: JSON.stringify(think ? { ...payload, generationConfig: { ...payload.generationConfig, thinkingConfig: { thinkingBudget: 0 } } } : payload),
          signal: ctl.signal,
        });
      } catch (e) { return new Response("", { status: 504 }); }
      finally { if (to) clearTimeout(to); }
    };
    for (const m of order) {
      usedModel = m;
      const last = m === order[order.length - 1], lite = m.includes("lite");
      res = await call(m, !lite, last ? 0 : 20000);
      // 사람이 몰려서 막힘(429)·구글 붐빔(503): 잠깐 쉬고 같은 모델로 한 번 더
      if (res.status === 429 || res.status === 503) { await wait(1500); res = await call(m, !lite, last ? 0 : 20000); }
      // 생각 끄기 설정을 거부하면(400) 설정 없이 한 번 더
      if (res.status === 400 && !lite) res = await call(m, false, last ? 0 : 20000);
      if (!res.ok) { why = (await res.text().catch(() => "")).slice(0, 300); console.log("gemini", m, res.status, why); }
      if (res.ok || last) break;
      // 앞 모델이 실패하면(모델 없음·한도·붐빔·시간 초과·설정 거부) 다음 모델로
    }
    // busy: 잠깐 몰림(조금 뒤 다시) / model·key·server: 설정 문제
    if (res.status === 429 || res.status === 503 || res.status === 504) return json({ error: "busy", status: res.status }, 503, origin);
    if (res.status === 404) return json({ error: "model" }, 502, origin);
    if (res.status === 400 || res.status === 403) return json({ error: "key", status: res.status, why }, 502, origin);
    if (!res.ok) return json({ error: "server", status: res.status, why }, 502, origin);

    if (env.RL) await env.RL.put(rk, String(used + 1), { expirationTtl: 172800 });
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
    return json({ text, left: Math.max(0, limit - used - 1), limit, vip, admin, model: usedModel }, 200, origin);
  },
};
