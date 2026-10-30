// 캠테리어 AI 중계 서버 v3 (Cloudflare Worker) — 2026-10-30: 몰릴 때 한 번 더 시도, 오류 이유 기록
// - Gemini 키: Secret GEMINI_API_KEY
// - 초대 코드: Secret INVITE_CODE (여러 개면 쉼표로: abc,def)
// - 하루 횟수 세기: KV 바인딩 RL (없으면 제한 없이 동작)
// - 내 코드(계정): 같은 KV의 'acct:XXXX-XXXX' 키 (내 장비 목록, 초대 회원 여부)
// - 장비 추가요청 게시판: 같은 KV(RL)의 'reqs' 키에 저장. 관리용 Secret ADMIN_KEY
const MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest"]; // 앞에서부터 시도
const MODELS_IMAGE = ["gemini-flash-lite-latest", "gemini-flash-latest"]; // 사진도 lite 먼저 (flash는 긴 장비 목록+사진에 20초 넘게 걸려서 실사용 불가, 2026-10-30 측정)
const ALLOWED_ORIGINS = ["https://camterior.github.io"];
const LIMIT_FREE = 10, LIMIT_CODE = 50, LIMIT_ADMIN = 100000; // 하루 횟수 (한국 시간 기준). 관리자 계정은 사실상 제한 없음
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
  if (a.op === "get") return json({ code, gear: o.gear || {}, vip: !!o.vip, admin: !!o.admin }, 200, origin);
  if (a.op === "save") {
    const g = a.gear && typeof a.gear === "object" ? a.gear : {}, out = {};
    Object.keys(g).slice(0, 300).forEach(k => { const n = Math.round(+g[k]); if (/^[a-z]+:[a-z0-9_]{1,40}$/.test(k) && n >= 1 && n <= 20) out[k] = n; });
    o.gear = out; o.up = day;
    await env.RL.put("acct:" + code, JSON.stringify(o));
    return json({ ok: true, vip: !!o.vip, admin: !!o.admin }, 200, origin);
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

// 게시판: 공지사항(관리자만) · 장비 요청 · 개발 요청
const ST = ["new", "ok", "sun", "done", "no"]; // 확인 중 · 확인됨 · 일요일 반영 예정 · 반영됨 · 어려움
const clip = (v, n) => String(v || "").replace(/[<>\u0000-\u0009\u000b-\u001f]/g, " ").trim().slice(0, n);
const norm = s => s.toLowerCase().replace(/[\s·\-_,./()]+/g, "");
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
async function board(b, env, request, origin) {
  if (!env.RL) return json({ error: "board-off" }, 503, origin);
  const list = JSON.parse((await env.RL.get("reqs")) || "[]");
  const notices = JSON.parse((await env.RL.get("notices")) || "[]");
  const pub = () => list.filter(r => r.st !== "hide").map(({ id, kind, name, link, note, reply, n, st, at }) => ({ id, kind: kind || "gear", name, link, note, reply, n, st, at }));
  const pubN = () => notices.slice().sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || (b.at > a.at ? 1 : -1));
  if (b.op === "list") return json({ items: pub(), notices: pubN() }, 200, origin);
  if (b.op === "add" || b.op === "plus") {
    const ip = request.headers.get("CF-Connecting-IP") || "0";
    const rk = `b:${today()}:${ip}`, used = parseInt(await env.RL.get(rk)) || 0;
    if (used >= 10) return json({ error: "quota" }, 429, origin);
    let r;
    if (b.op === "plus") r = list.find(x => x.id === b.id);
    else {
      const kind = b.kind === "dev" ? "dev" : "gear", name = clip(b.name, 40);
      if (name.length < 2) return json({ error: "empty" }, 400, origin);
      r = list.find(x => (x.kind || "gear") === kind && norm(x.name) === norm(name) && x.st !== "hide");
      if (!r) {
        if (list.length >= 800) return json({ error: "full" }, 507, origin);
        r = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), kind, name, link: /^https?:\/\//.test(b.link || "") ? clip(b.link, 300) : "", note: clip(b.note, 300), n: 0, st: "new", at: today(), from: b.from === "ai" ? "ai" : "form" };
        list.unshift(r);
      }
    }
    if (!r) return json({ error: "none" }, 404, origin);
    r.n = (r.n || 0) + 1;
    await env.RL.put("reqs", JSON.stringify(list));
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
      await env.RL.put("reqs", JSON.stringify(list));
    }
    return json({ ok: true, items: list, notices: pubN() }, 200, origin);
  }
  if (b.op === "notice") {
    if (b.act === "add") {
      const title = clip(b.title, 60);
      if (!title) return json({ error: "empty" }, 400, origin);
      notices.unshift({ id: Date.now().toString(36), title, body: clip(b.body, 2000), pin: !!b.pin, at: today() });
    } else if (b.act === "del") {
      const k = notices.findIndex(n => n.id === b.id); if (k >= 0) notices.splice(k, 1);
    } else if (b.act === "pin") {
      const n = notices.find(n => n.id === b.id); if (n) n.pin = !n.pin;
    }
    await env.RL.put("notices", JSON.stringify(notices.slice(0, 100)));
    return json({ ok: true, items: list, notices: pubN() }, 200, origin);
  }
  return json({ error: "op" }, 400, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
    if (request.method !== "POST") return json({ error: "method" }, 405, origin);
    if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: "origin" }, 403, origin);
    if (!env.GEMINI_API_KEY) return json({ error: "key" }, 500, origin);

    let body;
    try { body = await request.json(); } catch { return json({ error: "bad" }, 400, origin); }

    if (body.board) return board(body.board, env, request, origin);
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
