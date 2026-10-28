// 캠테리어 AI 중계 서버 v2 (Cloudflare Worker)
// - Gemini 키: Secret GEMINI_API_KEY
// - 초대 코드: Secret INVITE_CODE (여러 개면 쉼표로: abc,def)
// - 하루 횟수 세기: KV 바인딩 RL (없으면 제한 없이 동작)
// - 장비 추가요청 게시판: 같은 KV(RL)의 'reqs' 키에 저장. 관리용 Secret ADMIN_KEY
const MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest"]; // 앞에서부터 시도
const ALLOWED_ORIGINS = ["https://camterior.github.io"];
const LIMIT_FREE = 10, LIMIT_CODE = 50; // 하루 횟수 (한국 시간 기준)
const MAX_INPUT_CHARS = 8000;
const MAX_SYSTEM_CHARS = 20000;

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

// 장비 추가요청 게시판
const ST = ["new", "ok", "sun", "done", "no"]; // 확인 중 · 확인됨 · 일요일 추가 예정 · 추가됨 · 추가 어려움
const clip = (v, n) => String(v || "").replace(/[<>\u0000-\u001f]/g, " ").trim().slice(0, n);
const norm = s => s.toLowerCase().replace(/[\s·\-_,./()]+/g, "");
async function board(b, env, request, origin) {
  if (!env.RL) return json({ error: "board-off" }, 503, origin);
  const list = JSON.parse((await env.RL.get("reqs")) || "[]");
  const pub = () => list.filter(r => r.st !== "hide").map(({ id, name, brand, link, note, n, st, at }) => ({ id, name, brand, link, note, n, st, at }));
  if (b.op === "list") return json({ items: pub() }, 200, origin);
  if (b.op === "add" || b.op === "plus") {
    const ip = request.headers.get("CF-Connecting-IP") || "0";
    const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    const rk = `b:${day}:${ip}`, used = parseInt(await env.RL.get(rk)) || 0;
    if (used >= 10) return json({ error: "quota" }, 429, origin);
    let r;
    if (b.op === "plus") r = list.find(x => x.id === b.id);
    else {
      const name = clip(b.name, 40);
      if (name.length < 2) return json({ error: "empty" }, 400, origin);
      r = list.find(x => norm(x.name) === norm(name) && x.st !== "hide");
      if (!r) {
        if (list.length >= 500) return json({ error: "full" }, 507, origin);
        r = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, brand: clip(b.brand, 30), link: /^https?:\/\//.test(b.link || "") ? clip(b.link, 300) : "", note: clip(b.note, 200), n: 0, st: "new", at: day, from: b.from === "ai" ? "ai" : "form" };
        list.unshift(r);
      }
    }
    if (!r) return json({ error: "none" }, 404, origin);
    r.n = (r.n || 0) + 1;
    await env.RL.put("reqs", JSON.stringify(list));
    await env.RL.put(rk, String(used + 1), { expirationTtl: 172800 });
    return json({ ok: true, id: r.id, items: pub() }, 200, origin);
  }
  if (b.op === "admin") {
    if (!env.ADMIN_KEY || b.key !== env.ADMIN_KEY) return json({ error: "key" }, 403, origin);
    const r = list.find(x => x.id === b.id);
    if (r && (ST.includes(b.st) || b.st === "hide")) { r.st = b.st; await env.RL.put("reqs", JSON.stringify(list)); }
    return json({ ok: true, items: list }, 200, origin);
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

    // 하루 횟수
    const vip = codeOk(env, body.code);
    const limit = vip ? LIMIT_CODE : LIMIT_FREE;
    const ip = request.headers.get("CF-Connecting-IP") || "0";
    const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    const rk = `${vip ? "c" : "f"}:${day}:${ip}`;
    let used = 0;
    if (env.RL) used = parseInt(await env.RL.get(rk)) || 0;
    if (body.check) return json({ left: Math.max(0, limit - used), limit, vip }, 200, origin); // 남은 횟수만 확인
    if (env.RL && used >= limit) return json({ error: "quota", left: 0, limit, vip }, 429, origin);

    const prompt = String(body.prompt || "").slice(0, MAX_INPUT_CHARS);
    const system = String(body.system || "").slice(0, MAX_SYSTEM_CHARS); // 장비·텐트 목록과 예시가 들어가서 길게
    if (!prompt) return json({ error: "empty" }, 400, origin);

    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    };
    if (system) payload.systemInstruction = { parts: [{ text: system }] };

    let res = null;
    for (const m of MODELS) {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify(payload),
      });
      if (res.status !== 404) break; // 모델 이름이 없을 때만 다음 모델로
    }
    if (res.status === 429) return json({ error: "limit" }, 429, origin);
    if (res.status === 404) return json({ error: "model" }, 502, origin);
    if (res.status === 400 || res.status === 403) return json({ error: "key", status: res.status }, 502, origin);
    if (!res.ok) return json({ error: "server", status: res.status }, 502, origin);

    if (env.RL) await env.RL.put(rk, String(used + 1), { expirationTtl: 172800 });
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
    return json({ text, left: Math.max(0, limit - used - 1), limit, vip }, 200, origin);
  },
};
