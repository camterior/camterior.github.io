// Camping Check(/pack) 근처 등유(실내등유) 주유소 — 오피넷(한국석유공사) 무료 API
// - 키: Cloudflare Secret OPINET_KEY (홍중이 등록). 코드·GitHub에 넣지 않음
// - {pack:{op:'oil', campsite, region}} → 캠핑장(없으면 지역) 위치 반경 5km 안 등유 파는 주유소(가까운 순)
//   {lat, lng, name, sd, sg}가 오면(CARO+카카오로 고른 캠핑장 · 지금 내 위치) 위치 검색 없이 그 좌표에서 바로
//   5km 안에 없으면 그 시·군에서 등유가 싼 주유소 10곳(거리 같이)
// - 오피넷 좌표는 KATEC(TM128, 베셀 타원체) → 위경도와 서로 바꿔 씀 (아래 toKatec/fromKatec)
// - IP당 하루 LIMIT_OIL_IP번, 오피넷 호출은 모두 합쳐 하루 LIMIT_OIL_ALL번(무료 키 300건), 같은 위치 결과는 6시간 저장
import { geocode, count, bumpKey, ipOf, kstDay, PackError } from "./pack-ai.js";
import { inKorea, regionOf } from "./pack-place.js";

export const LIMIT_OIL_IP = 40;
export const LIMIT_OIL_ALL = 250; // 오피넷 무료 키는 하루 300건 → 모두 합쳐 250건에서 멈춤 (남는 50건은 여유)
const API = "https://www.opinet.co.kr/api/";
const BRAND = { SKE: "SK에너지", GSC: "GS칼텍스", HDO: "HD현대오일뱅크", SOL: "S-OIL", RTE: "자영알뜰", RTX: "고속도로알뜰", NHO: "농협알뜰", ETC: "자가상표", E1G: "E1", SKG: "SK가스" };

// ───────── 좌표 변환 (WGS84 위경도 ↔ KATEC) ─────────
// proj4: +proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999 +x_0=400000 +y_0=600000 +ellps=bessel +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43
const D2R = Math.PI / 180, AS = D2R / 3600;
const WGS = { a: 6378137, f: 1 / 298.257223563 }, BES = { a: 6377397.155, f: 1 / 299.1528128 };
const H = { tx: -115.80, ty: 474.99, tz: 674.11, rx: 1.16 * AS, ry: -2.31 * AS, rz: -1.63 * AS, s: 6.43e-6 };
const TM = { lat0: 38 * D2R, lon0: 128 * D2R, k0: 0.9999, x0: 400000, y0: 600000 };
function toXYZ(lat, lon, e) { const e2 = e.f * (2 - e.f), s = Math.sin(lat), N = e.a / Math.sqrt(1 - e2 * s * s); return [N * Math.cos(lat) * Math.cos(lon), N * Math.cos(lat) * Math.sin(lon), N * (1 - e2) * s]; }
function fromXYZ([x, y, z], e) {
  const e2 = e.f * (2 - e.f), p = Math.hypot(x, y); let lat = Math.atan2(z, p * (1 - e2));
  for (let i = 0; i < 6; i++) { const s = Math.sin(lat), N = e.a / Math.sqrt(1 - e2 * s * s); lat = Math.atan2(z + e2 * N * s, p); }
  return [lat, Math.atan2(y, x)];
}
// 베셀 → WGS84 (위치 벡터 방식, proj4와 같음)
const besToWgs = ([x, y, z]) => { const k = 1 + H.s; return [H.tx + k * (x - H.rz * y + H.ry * z), H.ty + k * (H.rz * x + y - H.rx * z), H.tz + k * (-H.ry * x + H.rx * y + z)]; };
const wgsToBes = ([X, Y, Z]) => { const k = 1 + H.s, x = (X - H.tx) / k, y = (Y - H.ty) / k, z = (Z - H.tz) / k; return [x + H.rz * y - H.ry * z, -H.rz * x + y + H.rx * z, H.ry * x - H.rx * y + z]; };
function meridian(lat, e) {
  const e2 = e.f * (2 - e.f), e4 = e2 * e2, e6 = e4 * e2;
  return e.a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * lat - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * lat) + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * lat) - (35 * e6 / 3072) * Math.sin(6 * lat));
}
function tmFwd(lat, lon, e) {
  const e2 = e.f * (2 - e.f), ep2 = e2 / (1 - e2), s = Math.sin(lat), c = Math.cos(lat), t = Math.tan(lat);
  const N = e.a / Math.sqrt(1 - e2 * s * s), T = t * t, C = ep2 * c * c, A = (lon - TM.lon0) * c;
  const M = meridian(lat, e), M0 = meridian(TM.lat0, e);
  const x = TM.x0 + TM.k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120);
  const y = TM.y0 + TM.k0 * (M - M0 + N * t * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
  return [x, y];
}
function tmInv(x, y, e) {
  const e2 = e.f * (2 - e.f), ep2 = e2 / (1 - e2), e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const M = meridian(TM.lat0, e) + (y - TM.y0) / TM.k0, mu = M / (e.a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const s = Math.sin(p1), c = Math.cos(p1), t = Math.tan(p1), C = ep2 * c * c, T = t * t;
  const N = e.a / Math.sqrt(1 - e2 * s * s), R = e.a * (1 - e2) / (1 - e2 * s * s) ** 1.5, D = (x - TM.x0) / (N * TM.k0);
  const lat = p1 - (N * t / R) * (D * D / 2 - (5 + 3 * T + 10 * C - 4 * C * C - 9 * ep2) * D ** 4 / 24 + (61 + 90 * T + 298 * C + 45 * T * T - 252 * ep2 - 3 * C * C) * D ** 6 / 720);
  const lon = TM.lon0 + (D - (1 + 2 * T + C) * D ** 3 / 6 + (5 - 2 * C + 28 * T - 3 * C * C + 8 * ep2 + 24 * T * T) * D ** 5 / 120) / c;
  return [lat, lon];
}
export function toKatec(lat, lon) { const [la, lo] = fromXYZ(wgsToBes(toXYZ(lat * D2R, lon * D2R, WGS)), BES); return tmFwd(la, lo, BES); }
export function fromKatec(x, y) { const [la, lo] = tmInv(x, y, BES); const [a, b] = fromXYZ(besToWgs(toXYZ(la, lo, BES)), WGS); return [a / D2R, b / D2R]; }

// ───────── 오피넷 ─────────
async function opinet(env, path, q) {
  const ak = `po:all:${kstDay()}`; // 오피넷 실제 호출 수 (모든 사람 합계)
  if ((await count(env, ak)) >= LIMIT_OIL_ALL) throw new PackError("quota", "오늘 주유소 찾기가 많아 마감됐어요. 내일 다시 시도해 주세요.", 429);
  await bumpKey(env, ak);
  const url = new URL(API + path);
  url.search = new URLSearchParams({ code: env.OPINET_KEY, out: "json", ...q });
  const res = await fetch(url, { cf: { cacheTtl: 600 } });
  if (!res.ok) throw new PackError("oilapi", "주유소 정보 서비스(오피넷)에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.", 502);
  const d = await res.json().catch(() => null);
  const list = d && d.RESULT && d.RESULT.OIL;
  return Array.isArray(list) ? list : [];
}
// 시·도 이름 맞추기: '충청북도'·'충북' → '충북', '강원특별자치도' → '강원'
const shortSido = (n) => {
  n = String(n || "").replace(/\s/g, "");
  const m = [["충청북", "충북"], ["충청남", "충남"], ["전라북", "전북"], ["전북특", "전북"], ["전라남", "전남"], ["경상북", "경북"], ["경상남", "경남"]].find(([a]) => n.startsWith(a));
  return m ? m[1] : n.slice(0, 2);
};
const shortSigun = (n) => String(n || "").replace(/\s/g, "").replace(/(특별시|광역시|특별자치시)$/, "").replace(/[시군구]$/, "");
async function areaList(env, area) {
  const ck = "oilarea:" + (area || "top");
  if (env.RL) { const hit = await env.RL.get(ck); if (hit) return JSON.parse(hit); }
  const list = (await opinet(env, "areaCode.do", area ? { area } : {})).map((a) => ({ cd: String(a.AREA_CD), nm: String(a.AREA_NM) }));
  if (env.RL && list.length) await env.RL.put(ck, JSON.stringify(list), { expirationTtl: 30 * 86400 });
  return list;
}
async function sigunCode(env, place) {
  const sd = (await areaList(env, "")).find((a) => shortSido(a.nm) === shortSido(place.sido));
  if (!sd) return null;
  const want = shortSigun(place.sigun);
  if (!want) return null;
  const sg = (await areaList(env, sd.cd)).find((a) => { const n = shortSigun(a.nm); return n === want || n.startsWith(want) || want.startsWith(n); });
  return sg ? sg.cd : null;
}
const station = (o, x0, y0) => {
  const x = Number(o.GIS_X_COOR), y = Number(o.GIS_Y_COOR), ok = Number.isFinite(x) && Number.isFinite(y) && x > 0;
  const [lat, lon] = ok ? fromKatec(x, y) : [null, null];
  const dist = o.DISTANCE != null ? Number(o.DISTANCE) : ok ? Math.hypot(x - x0, y - y0) : null;
  return { id: String(o.UNI_ID || ""), name: String(o.OS_NM || "").slice(0, 40), brand: BRAND[o.POLL_DIV_CD] || "", price: Number(o.PRICE) || null,
    dist: dist != null ? Math.round(dist) : null, lat: lat && Math.round(lat * 1e6) / 1e6, lon: lon && Math.round(lon * 1e6) / 1e6, addr: String(o.NEW_ADR || o.VAN_ADR || "").slice(0, 80) };
};

export async function opOil(p, env, request) {
  if (!env.OPINET_KEY) throw new PackError("nokey", "근처 주유소 찾기는 준비 중이에요.", 503);
  const region = String(p.region || "").trim().slice(0, 50), campsite = String(p.campsite || "").trim().slice(0, 50);
  const lat = Number(p.lat), lng = Number(p.lng), exact = p.lat != null && p.lng != null && inKorea(lat, lng);
  if (!exact && !region && !campsite) throw new PackError("empty", "캠핑장이나 지역을 알려 주세요.");
  const k = `po:${kstDay()}:${ipOf(request)}`;
  if ((await count(env, k)) >= LIMIT_OIL_IP) throw new PackError("quota", "오늘 주유소 찾기 횟수를 다 썼어요. 내일 다시 시도해 주세요.", 429);
  await bumpKey(env, k);

  // 정확한 좌표(캠핑장·내 위치)면 그대로, 아니면 이름으로 위치 검색(대략적인 위치)
  const place = exact
    ? { lat, lon: lng, name: String(p.name || "").trim().slice(0, 40) || "고른 위치", sido: "", sigun: "" }
    : (campsite && (await geocode(env, campsite))) || (region && (await geocode(env, region)));
  if (!place) throw new PackError("noplace", "캠핑장 위치를 찾지 못했어요. 지역을 시·군 이름으로 넣어 주세요.", 404);
  // 정확한 좌표는 약 100m 칸(소수 셋째 자리), 이름 검색은 약 1km 칸으로 결과 저장
  const ck = exact ? `oil:${lat.toFixed(3)}:${lng.toFixed(3)}` : `oil:${place.lat.toFixed(2)}:${place.lon.toFixed(2)}`;
  if (env.RL) { const hit = await env.RL.get(ck); if (hit) return { ...JSON.parse(hit), place: place.name, approx: !exact || p.approx === true }; }

  const [x0, y0] = toKatec(place.lat, place.lon);
  let mode = "near", list = (await opinet(env, "aroundAll.do", { x: x0.toFixed(1), y: y0.toFixed(1), radius: "5000", prodcd: "C004", sort: "2" })).map((o) => station(o, x0, y0));
  list = list.filter((s) => s.price).sort((a, b) => a.dist - b.dist).slice(0, 5);
  let shared = true; // 다른 사람과 같이 쓰는 저장(oil:)에 넣어도 되는지
  if (!list.length) {
    // 좌표로 찾았으면 시·군은 서버가 카카오로 직접 (보낸 sd·sg는 공유 저장에 섞지 않음). 카카오가 안 되면 보낸 값을 쓰되 저장은 안 함
    if (exact) {
      const r = await regionOf(env, request, place.lat, place.lon);
      if (r) Object.assign(place, r);
      else { Object.assign(place, { sido: String(p.sd || "").slice(0, 15), sigun: String(p.sg || "").slice(0, 15) }); shared = false; }
    }
    const area = place.sido && place.sigun ? await sigunCode(env, place) : null;
    if (area) {
      mode = "area";
      list = (await opinet(env, "lowTop10.do", { prodcd: "C004", area, cnt: "10" })).map((o) => station(o, x0, y0)).filter((s) => s.price)
        .sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9)).slice(0, 5);
    }
  }
  const out = { place: place.name, area: place.sigun || "", mode, list, at: Date.now(), approx: !exact || p.approx === true };
  if (env.RL && shared) await env.RL.put(ck, JSON.stringify(out), { expirationTtl: 6 * 3600 });
  return out;
}
