// 배포 전 검사: 실제 브라우저로 모든 탭을 열어 JS 오류 없이 그려지는지, 휴대폰 폭에서 가로로 넘치지 않는지 확인
const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const ROOT=path.resolve(__dirname,'..');const TYPES={'.html':'text/html','.js':'text/javascript','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,r)=>{let f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';
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
  console.log('JS 오류',errs.length,JSON.stringify(r),'휴대폰 넘침',wide.length?wide.join(','):'없음');await b.close();srv.close();
  if(errs.length||wide.length||!r.intro||!r.plan||!r.hub||r.gear<40||!r.svg||r.tents<10){console.log(errs.join('\n'));process.exit(1);}})();
