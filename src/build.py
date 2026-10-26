#!/usr/bin/env python3
"""캠테리어 빌드: v18 단일 파일 플래너 → 탭 4개 앱.
출력 1) site/index.html (+ img/, assets/) : GitHub Pages용, 파일 분리
출력 2) camterior.artifact.html : Claude 아티팩트용, 이미지·폰트 인라인"""
import re, base64, pathlib, shutil, sys

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE / 'planner-v18.html'  # 플래너 원본 (v18)
if not (HERE / 'img').exists():  # 저장소 안에서 돌릴 때는 루트의 img/assets 사용
    for _d in ('img', 'assets'):
        (HERE / _d).symlink_to(HERE.parent / _d)
L = SRC.read_text(encoding='utf-8').split('\n')

def find(prefix, start=0):
    for i in range(start, len(L)):
        if L[i].lstrip().startswith(prefix):
            return i
    raise SystemExit('marker not found: ' + prefix)

i_body = find('<body>')
i_bar = find('<header class="appbar"')
i_marq = find('<div class="marquee"')
i_feat = find('<section class="night sec" id="features"')
i_line = find('<section class="sec" id="lineup"')
i_ws = find('<section class="ws-sec"')
i_jr = find('<section class="night rv-band" id="journal"')
i_cm = find('<section class="sec gal-sec"')
i_ft = find('<footer class="site-foot"')
i_rest = find('<div id="scenery"')

head = L[:i_body]
marquee = '\n'.join(L[i_marq:i_marq + 1])
features = '\n'.join(L[i_feat:i_line]).rstrip()
ws = '\n'.join(L[i_ws:i_jr]).rstrip()
journal = '\n'.join(L[i_jr:i_cm]).rstrip()
commons = '\n'.join(L[i_cm:i_ft]).rstrip()
rest = '\n'.join(L[i_rest:])

# --- strip inline images from reused sections -> files
features = features.replace('<h3>난로 1m, 바로 알려줘요</h3><p>텐트 벽, 이너룸, 다른 장비가 안전거리 안에 들어오면 경고해요.</p>', '<h3>난로는 조심해서</h3><p>난로를 놓으면 환기·일산화탄소 경보기 같은 배치 주의사항을 바로 띄워요.</p>')
features = re.sub(r'src="data:image/webp;base64,[^"]+"', 'src="img/top.webp"', features)
journal = re.sub(r'src="data:image/webp;base64,[^"]+"', 'src="img/night.webp"', journal)

# --- head: title, font file, meta
head = '\n'.join(head)
head = head.replace('<title>캠프 배치도</title>', '<title>캠테리어 · 캠핑 인테리어 플래너</title>')
head = re.sub(r'url\(data:font/woff2;base64,[^)]+\)', 'url(assets/pretendard.woff2)', head)
assert 'base64' not in head, 'leftover base64 in head'
META = '''<meta name="description" content="캠테리어(CAMTERIOR) — 텐트 바닥 도면 위에 IGT·선반·난로를 실제 크기로 배치해보는 캠핑 인테리어 플래너">
<meta name="theme-color" content="#0C1813">
<meta property="og:title" content="캠테리어 · 캠핑 인테리어 플래너">
<meta property="og:description" content="텐트 도면 위에 장비를 mm 단위로 먼저 놓아보고 떠나세요.">
<meta property="og:image" content="img/intro.webp">
<link rel="icon" href="assets/icon.svg" type="image/svg+xml">
<link rel="manifest" href="manifest.webmanifest">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://cdn.jsdelivr.net https://camterior-ai.ghdwnd2.workers.dev; worker-src 'self'; base-uri 'self'; form-action 'none'">
<meta name="referrer" content="no-referrer">'''
head = head.replace('<meta name="viewport" content="width=device-width, initial-scale=1">',
                    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + META)
head = head.replace('</head>', (HERE / 'tabs.css').read_text(encoding='utf-8') + '\n' + (HERE / 'ai.css').read_text(encoding='utf-8') + '\n</head>')

# --- body text renames
def rename(s):
    return (s.replace('캠프 배치도', '캠테리어').replace("'IRON_CAMP'", "'CAMTERIOR'"))

journal = journal.replace('class="night rv-band"', 'class="night rv-band hub-band"')
# AI 세팅 추천 카드 (추천 세팅 아래)
AI_CARD = '''<div class="aiset" id="aiset" aria-labelledby="aiTitle">
  <div class="ai-head"><span class="ai-badge">✨ AI</span><div><h3 id="aiTitle">내 장비만 적으면 자동으로 세팅해요</h3><p>텐트·테이블·체어를 적으면 캠테리어 목록에서 찾아 바닥에 놓아드려요. 놓인 뒤엔 끌어서 다듬으면 돼요.</p></div></div>
  <label class="sr-only" for="aiIn">가진 장비</label>
  <textarea id="aiIn" rows="3" maxlength="600" placeholder="예: 랜드록, IGT 롱 1개, 폴딩쉘프 2개, 헬리녹스 체어원 2개, 메가매트 듀오, 옴니 230"></textarea>
  <div class="ai-row"><button class="btn primary" id="aiGo" type="button" onclick="aiRun()">✨ AI로 세팅하기</button><span class="ai-st" id="aiSt" role="status" aria-live="polite"></span>
    <p class="ai-priv">적은 내용은 추천을 위해 Google Gemini로 보내져요. 이름·연락처 같은 개인정보는 적지 마세요.</p></div>
  <div class="ai-meta"><span class="ai-left" id="aiLeft"></span>
    <details class="ai-codebox"><summary>초대 코드가 있어요</summary>
      <form class="ai-coderow" onsubmit="event.preventDefault();aiCodeSave()"><label class="sr-only" for="aiCode">초대 코드</label><input id="aiCode" type="text" maxlength="40" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="초대 코드"><button class="btn small" type="submit">적용</button></form>
      <p class="ai-codemsg" id="aiCodeMsg" role="status" aria-live="polite"></p></details></div>
  <div class="ai-out" id="aiOut" hidden></div>
</div>'''
_pm = '<div class="presets" id="presets"></div>'
assert ws.count(_pm) == 1, 'presets marker'
ws = ws.replace(_pm, _pm + '\n' + AI_CARD)
markup = (HERE / 'shell.html').read_text(encoding='utf-8')
markup = (markup.replace('{{MARQUEE}}', marquee).replace('{{FEATURES}}', features)
          .replace('{{WORKSPACE}}', ws).replace('{{JOURNAL}}', journal).replace('{{COMMONS}}', commons))

js = rename(rest)
# v19.2 난방 안전거리 표시 삭제 → 배치 주의 문구만
HEAT_I = "<b>난방 주의</b> 난로는 텐트 천·이너룸·가구와 넉넉히 띄우고, 환기구를 열고 일산화탄소 경보기를 함께 두세요. 이격 거리는 제품 설명서를 따라주세요"
js = js.replace("function heatLocal(c){const h=c.heat;if(!h)return null;", "function heatLocal(c){return null;const h=c.heat;", 1)
m = re.search(r"  // heaters: keep 1m from fabric and gear\n.*?\n(  state\.pieces\.forEach\(p=>\{const c=CATALOG\[p\.type\];if\(c\.kind!=='frame'\)return;)", js, re.S)
assert m, 'heater block'
js = js[:m.start()] + ("  const heaters=state.pieces.filter(p=>CATALOG[p.type].heat);\n"
  "  if(heaters.length)I.push('" + HEAT_I + "');\n"
  "  heaters.forEach(h=>{const c=CATALOG[h.type],ce=centroid(h._v);\n"
  "    if(TW&&pointInPoly(ce,TW.fabric))I.push(`${pName(h)}: 타프 아래예요. 타프 천이 난로에서 충분히 높은지 확인하세요`);\n"
  "    if(c.gtype==='fan')I.push(`${pName(h)}: 전원(220V)이 필요해요. 파워뱅크나 전기 사이트를 챙기세요`);});\n") + js[m.start(1):]
for a,b in [("const heats=state.pieces.filter(p=>p._heat)","const heats=state.pieces.filter(p=>CATALOG[p.type].heat)"),
            ("출입구 막힘, 난로 안전거리를 여기서 알려줘요","출입구 막힘을 알려주고, 난로를 놓으면 주의사항을 띄워요"),
            ("' · <span class=\"pw\">안전거리 1m</span>'","' · <span class=\"pw\">배치 주의</span>'")]:
    assert js.count(a)==1, a; js=js.replace(a,b)
js = re.sub(r"const HEAT_NOTE='[^']*';", "const HEAT_NOTE='난로는 텐트 천·이너룸·가구와 넉넉히 띄우고 환기하세요. 이격 거리는 제품 설명서를 따라주세요.';", js)
# v19.3 배치판을 페이지와 다른 톤(세이지 그린 바닥)으로
GROUND = '#C8D2C4'
for a, b in [('height="200000" fill="#FBFBF9" onpointerdown="startPan(event)"', f'height="200000" fill="{GROUND}" onpointerdown="startPan(event)"'),
             ('stroke="#ECEAE4" stroke-width="${k}" fill="none" pointer-events="none"', 'stroke="rgba(255,255,255,.38)" stroke-width="${k}" fill="none" pointer-events="none"'),
             ('stroke="#DEDBD2" stroke-width="${k}" fill="none" pointer-events="none"', 'stroke="rgba(255,255,255,.75)" stroke-width="${1.4*k}" fill="none" pointer-events="none"')]:
    assert js.count(a) == 1, a
    js = js.replace(a, b)
# 탭이 숨겨져 크기가 0일 때는 평면도를 그리지 않음 (보일 때 go('plan')이 다시 그림)
for fn in ('function render(){', 'function fitView(){'):
    assert js.count(fn) == 1, fn
    js = js.replace(fn, fn + 'if(!hostSize()[0])return;')
# GitHub 판에서는 공유 기능 안내를 Claude 버전 링크로
CLAUDE_URL = 'https://claude.ai/artifact/Hs7t6BE96BRWWebJK8Skxc'
js = js.replace("온라인으로 공유된 페이지에서 열려요. 이 파일에서는 공유 코드와 배치 파일로 주고받을 수 있어요.",
                f"<a href=\"{CLAUDE_URL}\" target=\"_blank\" rel=\"noopener\">Claude 함께 쓰기 버전</a>에서 열려요. 여기서는 공유 링크·코드로 주고받을 수 있어요.")
js = js.replace("온라인으로 공유된 페이지에서 쓰고 볼 수 있어요.",
                f"<a href=\"{CLAUDE_URL}\" target=\"_blank\" rel=\"noopener\">Claude 함께 쓰기 버전</a>에서 쓰고 볼 수 있어요.")
js = js.replace("모두의 배치는 공유된 페이지에서 로그인하면 쓸 수 있어요. 지금은 공유 코드를 써주세요.",
                "모두의 배치는 캠핑 허브 탭의 ‘Claude 함께 쓰기’ 버전에서 올릴 수 있어요. 여기서는 공유 링크를 써주세요.")
tail = (HERE / 'tabs.js').read_text(encoding='utf-8')
tail += '\n' + (HERE / 'ai.js').read_text(encoding='utf-8')
js = js.replace('</script>\n</body>', '</script>\n<script>\n' + tail + '\n</script>\n</body>')
assert '<script>\n' + tail in js, 'tail not injected'

page = head + '\n<body data-view="intro">\n' + markup + '\n' + js
assert 'data:image/webp;base64' not in page

out = HERE / 'site'
if out.exists(): shutil.rmtree(out)
(out / 'img').mkdir(parents=True); (out / 'assets').mkdir()
for f in (HERE / 'img').iterdir(): shutil.copy(f, out / 'img' / f.name)
for f in (HERE / 'assets').iterdir(): shutil.copy(f, out / 'assets' / f.name)
for f in ('manifest.webmanifest', 'sw.js', 'README.md', '404.html', 'robots.txt'):
    if (HERE / f).exists(): shutil.copy(HERE / f, out / f)
(out / '.nojekyll').write_text('')
(out / 'index.html').write_text(page, encoding='utf-8')

# --- artifact build: inline everything, drop doc skeleton & site-only bits
def datauri(p, mime):
    return f'data:{mime};base64,' + base64.b64encode(p.read_bytes()).decode()
art = page
for f in sorted((HERE / 'img').iterdir(), key=lambda p: -len(p.name)):
    art = art.replace(f'img/{f.name}', datauri(f, 'image/webp'))
art = art.replace('url(assets/pretendard.woff2)', 'url(' + datauri(HERE / 'assets/pretendard.woff2', 'font/woff2') + ')')
art = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>\n?', '', art)
art = re.sub(r'<link rel="(icon|manifest)"[^>]*>\n?', '', art)
art = re.sub(r'<meta property="og:[^>]*>\n?', '', art)
art = art.replace('<!DOCTYPE html>\n<html lang="ko">\n<head>\n', '').replace('</head>\n<body data-view="intro">', '<div data-art="1"></div>')
art = art.replace('</body>\n</html>', '')
(HERE / 'camterior.artifact.html').write_text(art, encoding='utf-8')
(HERE / 'camterior-standalone.html').write_text(page.replace('src="img/', 'src="site/img/'), encoding='utf-8')
print('site', len(page) // 1024, 'KB  artifact', len(art) // 1024, 'KB')
