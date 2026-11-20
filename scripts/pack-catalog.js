// 캠핑 챙김(/pack)용 장비 목록 만들기: 캠테리어(index.html)를 브라우저로 열어 '내 장비' 탭과 같은 목록을 pack/catalog.json으로 저장
// 캠테리어에 장비·텐트를 새로 넣으면 한 번 돌려 주세요: node scripts/pack-catalog.js  (playwright 필요)
const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const ROOT=path.resolve(__dirname,'..');const TYPES={'.html':'text/html','.js':'text/javascript','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split('?')[0]);if(u.endsWith('/'))u+='index.html';const f=path.join(ROOT,u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'content-type':TYPES[path.extname(f)]||'application/octet-stream'});r.end(d);});}).listen(8798);
(async()=>{const b=await chromium.launch(process.env.PW_CHANNEL?{channel:process.env.PW_CHANNEL}:{});const p=await b.newPage();
  await p.route('https://**',r=>r.abort());
  await p.goto('http://127.0.0.1:8798/#mine');await p.waitForTimeout(1500);
  const out=await p.evaluate(()=>({
    secs:mineSecs().map(s=>[s.k,s.t]),
    items:mineAll().map(x=>{const r=[x.key,x.name];if(x.model)r[2]=x.model;if(x.k!=='tent'&&typeof GEAR_ART!=='undefined'&&GEAR_ART.has(x.id))r[3]=1;
      // 등유 난방기: 캠테리어 제원의 fuel(탱크·시간당 소비량) → 챙김의 등유 계산
      const F=typeof GEAR!=='undefined'&&GEAR[x.id]&&GEAR[x.id].fuel;if(F&&F.lph){r[2]=r[2]||'';r[3]=r[3]||0;r[4]={t:F.tank||0,a:F.lph[0],b:F.lph[1]||F.lph[0],c:F.conf||'retailer'};}
      return r;})}));
  await b.close();srv.close();
  if(out.items.length<100)throw new Error('장비 목록이 너무 적어요: '+out.items.length);
  const body='{"v":"'+new Date(Date.now()+9*3600e3).toISOString().slice(0,10)+'",\n"secs":'+JSON.stringify(out.secs)+',\n"items":[\n'+out.items.map(r=>JSON.stringify(r)).join(',\n')+'\n]}\n';
  fs.writeFileSync(path.join(ROOT,'pack','catalog.json'),body);
  console.log('pack/catalog.json',out.secs.length,'분류',out.items.length,'장비');})();
