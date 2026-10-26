// 캠테리어 AI 중계 서버 v2 (Cloudflare Worker)
// - Gemini 키: Secret GEMINI_API_KEY
// - 초대 코드: Secret INVITE_CODE (여러 개면 쉼표로: abc,def)
// - 하루 횟수 세기: KV 바인딩 RL (없으면 제한 없이 동작)
const MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest"]; // 앞에서부터 시도
const ALLOWED_ORIGINS = ["https://camterior.github.io"];
const LIMIT_FREE = 10, LIMIT_CODE = 50; // 하루 횟수 (한국 시간 기준)
const MAX_INPUT_CHARS = 8000;

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

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
    if (request.method !== "POST") return json({ error: "method" }, 405, origin);
    if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: "origin" }, 403, origin);
    if (!env.GEMINI_API_KEY) return json({ error: "key" }, 500, origin);

    let body;
    try { body = await request.json(); } catch { return json({ error: "bad" }, 400, origin); }

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
    const system = String(body.system || "").slice(0, MAX_INPUT_CHARS);
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
