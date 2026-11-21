// Camping Check(/pack) 캠핑장 정확한 위치 — CARO 캠핑장 목록 + 카카오 로컬
// - {pack:{op:'caro', q}}  → CARO(caro-camp.github.io) 캠핑장 중 이름에 q가 들어간 곳 최대 20개 [이름, 시도, 시군구]
//   /pack은 CSP 때문에 CARO 파일을 직접 못 읽어서 워커가 받아 옴 (KV 'caro:list' 하루 저장 + 워커 메모리)
// - {pack:{op:'place', name, sido, sigungu}} → 카카오 키워드 검색으로 정확한 좌표 {lat, lng, name, addr, src:'kakao'}
//   키(Secret KAKAO_REST_KEY)가 없거나 못 찾으면 Nominatim(대략적인 위치, src:'geo')
//   같은 캠핑장은 KV 'kp:' 30일 저장. 카카오 실제 호출만 IP당·전체 하루 상한에 셈 (KV 쓰기 아끼기)
// - regionOf(env, lat, lng): 좌표 → 시·도/시·군 (내 위치 주유소 찾기에서 5km 안에 없을 때 시·군 최저가로 넘어가려고)
import { geocode, count, bumpKey, ipOf, kstDay, PackError } from "./pack-ai.js";

export const LIMIT_PLACE_IP = 60; // 카카오 실제 호출, IP당 하루
export const LIMIT_PLACE_ALL = 3000; // 카카오 실제 호출, 모두 합쳐 하루 (무료 한도보다 훨씬 아래)
const CARO_URL = "https://caro-camp.github.io/data.js";
const KAKAO = "https://dapi.kakao.com/v2/local/";

// 한국 안 좌표인지 (제주 마라도 ~ 강원 고성, 백령도 ~ 독도)
export const inKorea = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
const S = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const nk = (s) => String(s || "").toLowerCase().replace(/[\s·\-_,.()]+/g, ""); // 비교용: 띄어쓰기·기호 무시

// ───────── CARO 캠핑장 목록 ─────────
let CARO = null, CARO_AT = 0;
async function caroList(env) {
  if (CARO && Date.now() - CARO_AT < 6 * 3600e3) return CARO;
  if (env.RL) {
    const hit = await env.RL.get("caro:list");
    if (hit) { CARO = JSON.parse(hit); CARO_AT = Date.now(); return CARO; }
  }
  const res = await fetch(CARO_URL, { cf: { cacheTtl: 3600 } });
  if (!res.ok) throw new PackError("caro", "캠핑장 목록을 불러오지 못했어요. 장소를 글자로 적어 주세요.", 502);
  const txt = await res.text(), i = txt.indexOf("{"), j = txt.lastIndexOf("}");
  let d = null; try { d = JSON.parse(txt.slice(i, j + 1)); } catch (e) { d = null; }
  if (!d || !Array.isArray(d.camps)) throw new PackError("caro", "캠핑장 목록을 불러오지 못했어요. 장소를 글자로 적어 주세요.", 502);
  // [이름, 시도, 시군구]만, 같은 캠핑장(이름+시군구)이 플랫폼마다 있으면 하나로
  const seen = new Set(), list = [];
  d.camps.forEach((c) => {
    if (!Array.isArray(c)) return;
    const row = [S(c[0], 40), S(c[1], 10), S(c[2], 15)], k = nk(row[0]) + "|" + row[2];
    if (row[0] && !seen.has(k)) { seen.add(k); list.push(row); }
  });
  CARO = list; CARO_AT = Date.now();
  if (env.RL && list.length) await env.RL.put("caro:list", JSON.stringify(list), { expirationTtl: 86400 });
  return list;
}

export async function opCaro(p, env) {
  const raw = S(p.q, 30), q = nk(raw), words = raw.split(" ").map(nk).filter(Boolean);
  if (q.length < 2) throw new PackError("short", "두 글자 이상 적어 주세요.");
  const list = await caroList(env);
  // 이름이 q로 시작하는 곳 먼저, 그다음 이름 중간에 들어간 곳 · '가평 자라섬'처럼 지역을 같이 적어도(낱말마다) 찾게
  const scored = [];
  for (const c of list) {
    const n = nk(c[0]), full = nk(c[1] + c[2] + c[0]);
    const s = n.startsWith(q) ? 0 : n.includes(q) ? 1 : words.length > 1 && words.every((w) => full.includes(w)) ? 2 : -1;
    if (s >= 0) scored.push([s, c]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1][0].length - b[1][0].length);
  return { list: scored.slice(0, 20).map((x) => x[1]) };
}

// ───────── 카카오 로컬 ─────────
async function kakao(env, request, path, q) {
  const ak = `kp:all:${kstDay()}`, ik = `kp:${kstDay()}:${ipOf(request)}`;
  if ((await count(env, ak)) >= LIMIT_PLACE_ALL) return null; // 마감되면 조용히 Nominatim로
  if ((await count(env, ik)) >= LIMIT_PLACE_IP) throw new PackError("quota", "오늘 캠핑장 위치 찾기 횟수를 다 썼어요. 내일 다시 시도해 주세요.", 429);
  await bumpKey(env, ak); await bumpKey(env, ik);
  const url = new URL(KAKAO + path); url.search = new URLSearchParams(q);
  const res = await fetch(url, { headers: { Authorization: "KakaoAK " + env.KAKAO_REST_KEY } }).catch(() => null);
  if (!res || !res.ok) { console.log("kakao 오류", res && res.status); return null; }
  return res.json().catch(() => null);
}
// 시군구 이름 비교용: '용인시' → '용인', '가평군' → '가평'
const sgShort = (s) => String(s || "").replace(/\s/g, "").replace(/[시군구]$/, "");

async function kakaoPlace(env, request, name, sido, sigungu) {
  const d = await kakao(env, request, "search/keyword.json", { query: `${sigungu} ${name}`.trim(), size: "10" });
  const docs = d && Array.isArray(d.documents) ? d.documents : [];
  const want = sgShort(sigungu), inArea = (x) => !want || String(x.address_name || "").replace(/\s/g, "").includes(want);
  const camp = (x) => /캠핑|야영|글램핑|카라반|오토캠/.test(String(x.category_name || "") + String(x.place_name || ""));
  const same = (x) => { const a = nk(x.place_name), b = nk(name); return a.includes(b) || b.includes(a); };
  // 1) 시군구 안 + 이름이 거의 같음 + 캠핑 분류 → 2) 시군구 안 + 이름 비슷 → 3) 시군구 안 캠핑 분류 → 4) 시군구 안 첫 번째
  const hit = docs.find((x) => inArea(x) && same(x) && camp(x)) || docs.find((x) => inArea(x) && same(x)) || docs.find((x) => inArea(x) && camp(x)) || docs.find(inArea);
  if (!hit) return null;
  const lat = Number(hit.y), lng = Number(hit.x);
  if (!inKorea(lat, lng)) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, name: S(hit.place_name, 40), addr: S(hit.road_address_name || hit.address_name, 80), src: "kakao" };
}

export async function opPlace(p, env, request) {
  const name = S(p.name, 40), sido = S(p.sido, 10), sigungu = S(p.sigungu, 15);
  if (name.length < 2) throw new PackError("empty", "캠핑장 이름을 알려 주세요.");
  const ck = "kp:" + sigungu + "|" + nk(name);
  if (env.RL) { const hit = await env.RL.get(ck); if (hit) return { ...JSON.parse(hit), sd: sido, sg: sigungu }; }
  let place = env.KAKAO_REST_KEY ? await kakaoPlace(env, request, name, sido, sigungu) : null;
  if (place) {
    if (env.RL) await env.RL.put(ck, JSON.stringify(place), { expirationTtl: 30 * 86400 });
  } else {
    // 키 없음·못 찾음 → Nominatim (캠핑장 이름 → 안 되면 시군구). 대략적인 위치라 kp:에는 저장 안 함 (geocode가 따로 저장)
    const g = (await geocode(env, `${name}`)) || (sigungu && (await geocode(env, `${sido} ${sigungu}`)));
    if (!g) throw new PackError("noplace", "캠핑장 위치를 찾지 못했어요. 장소 이름만으로 저장할게요.", 404);
    place = { lat: Math.round(g.lat * 1e6) / 1e6, lng: Math.round(g.lon * 1e6) / 1e6, name, addr: S(g.name, 80), src: "geo" };
  }
  return { ...place, sd: sido, sg: sigungu };
}

// 좌표 → {sido, sigun} (카카오 키 있을 때만, 실패하면 null)
export async function regionOf(env, request, lat, lng) {
  if (!env.KAKAO_REST_KEY) return null;
  const ck = `kr:${lat.toFixed(2)}:${lng.toFixed(2)}`;
  if (env.RL) { const hit = await env.RL.get(ck); if (hit) return JSON.parse(hit); }
  const d = await kakao(env, request, "geo/coord2regioncode.json", { x: String(lng), y: String(lat) }).catch(() => null);
  const r = d && Array.isArray(d.documents) && (d.documents.find((x) => x.region_type === "H") || d.documents[0]);
  if (!r) return null;
  const out = { sido: S(r.region_1depth_name, 15), sigun: S(String(r.region_2depth_name || "").split(" ")[0], 15) };
  if (env.RL) await env.RL.put(ck, JSON.stringify(out), { expirationTtl: 30 * 86400 });
  return out;
}
