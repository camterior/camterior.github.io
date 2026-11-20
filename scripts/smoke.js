// 배포 전 검사: 실제 브라우저로 모든 탭을 열어 JS 오류 없이 그려지는지, 휴대폰 폭에서 가로로 넘치지 않는지, 주소(#탭)로 바로 열어도 되는지 확인
const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const ROOT=path.resolve(__dirname,'..');const TYPES={'.html':'text/html','.js':'text/javascript','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split('?')[0]);if(u.endsWith('/'))u+='index.html';const f=path.join(ROOT,u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'content-type':TYPES[path.extname(f)]||'application/octet-stream'});r.end(d);});}).listen(8799);
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:860}});const errs=[];
  p.on('pageerror',e=>errs.push(e.message));
  await p.route('https://cdn.jsdelivr.net/**',r=>r.abort());
  await p.goto('http://127.0.0.1:8799/');await p.waitForTimeout(1500);
  const r=await p.evaluate(async()=>{const out={};for(const v of ['intro','plan','mine','gear','board','hub']){go(v);await new Promise(s=>setTimeout(s,300));
    out[v]=!document.getElementById('v-'+v).hidden;}
    out.gear=document.querySelectorAll('.gcard').length;go('plan');await new Promise(s=>setTimeout(s,300));
    out.svg=!!document.querySelector('#svgHost svg');out.tents=Object.keys(TENTS).length;return out;});
  // 휴대폰 폭(390px)에서 탭마다 가로로 넘치는 화면이 없는지 (넘치면 페이지가 축소돼 보여요)
  const m=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});m.on('pageerror',e=>errs.push(e.message));
  await m.route('https://cdn.jsdelivr.net/**',q=>q.abort());await m.goto('http://127.0.0.1:8799/');await m.waitForTimeout(1200);
  const wide=[];for(const v of ['intro','plan','mine','gear','board','hub']){await m.evaluate(v=>go(v),v);await m.waitForTimeout(350);
    const w=await m.evaluate(()=>document.documentElement.scrollWidth);if(w>392)wide.push(v+':'+w);}
  // 주소로 탭을 바로 열어도(새로고침·공유 링크 #mine 등) 깨지지 않는지
  const direct=[];for(const v of ['intro','plan','mine','gear','board','hub']){const d=await b.newPage({viewport:{width:390,height:844}});const de=[];d.on('pageerror',e=>de.push(e.message));
    await d.route('https://cdn.jsdelivr.net/**',q=>q.abort());await d.goto('http://127.0.0.1:8799/#'+v);await d.waitForTimeout(700);
    const ok=await d.evaluate(v=>!document.getElementById('v-'+v).hidden&&typeof mineAll==='function'&&mineAll().length>0,v).catch(()=>false);
    if(de.length||!ok)direct.push(v+(de.length?':'+de[0]:''));await d.close();}
  // 캠핑 챙김(/pack): 휴대폰 폭에서 오류 없이 장비 목록이 불러와지고 넘치지 않는지
  const pk=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const pe=[];pk.on('pageerror',e=>pe.push(e.message));
  await pk.route('https://camterior-ai.ghdwnd2.workers.dev/**',q=>q.abort());await pk.goto('http://127.0.0.1:8799/pack/');await pk.waitForTimeout(900);
  const pack=await pk.evaluate(async()=>{const home=!document.getElementById('v-home').hidden;
    // 캠핑 만들기 → 장비 고르기 → 체크 (장비 하나 넣고)
    location.hash='#gear';await new Promise(r=>setTimeout(r,200));
    const q=document.getElementById('q');q.value='랜드록';q.dispatchEvent(new Event('input'));const hit=document.querySelectorAll('#res [data-act=add]').length;
    const add=document.querySelector('#res [data-act=add]');add&&add.click();
    location.hash='#';await new Promise(r=>setTimeout(r,200));document.getElementById('newTrip').click();document.getElementById('tdOk').click();await new Promise(r=>setTimeout(r,300));
    const pick=document.querySelector('#tripBody label.pk');pick&&pick.click();document.querySelector('#tripFoot [data-go=check]').click();
    const ck=document.querySelector('#tripBody button.ck');ck&&ck.click();
    return {home,chips:document.querySelectorAll('#chips button').length,hit,checked:document.querySelectorAll('#tripBody button.ck[aria-pressed=true]').length,w:document.documentElement.scrollWidth};}).catch(e=>({err:e.message}));
  const packBad=pe.length||!(pack.home&&pack.chips>5&&pack.hit>0&&pack.checked===1&&pack.w<=392);await pk.close();
  console.log('캠핑 챙김',packBad?'문제 '+JSON.stringify(pack)+' '+pe.join(' | '):'정상');
  console.log('JS 오류',errs.length,JSON.stringify(r),'휴대폰 넘침',wide.length?wide.join(','):'없음','주소로 바로 열기',direct.length?direct.join(' | '):'모두 정상');await b.close();srv.close();
  if(packBad||errs.length||wide.length||direct.length||!r.intro||!r.plan||!r.hub||r.gear<40||!r.svg||r.tents<10){console.log(errs.join('\n'));process.exit(1);}})();
