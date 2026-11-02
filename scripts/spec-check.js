// 제원 일관성 검사: 텐트 도면 외곽·이너·출처, 장비 크기·출처
// 사용: NODE_PATH=... node scripts/spec-check.js  (문제가 있으면 목록을 보여주고 종료 코드 1)
const {chromium}=require('playwright');const http=require('http'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'content-type':f.endsWith('.html')?'text/html':'application/octet-stream'});r.end(d);});}).listen(0,async()=>{
  const port=srv.address().port,b=await chromium.launch(),p=await b.newPage();
  await p.goto(`http://localhost:${port}/`);await p.waitForTimeout(1200);
  const res=await p.evaluate(()=>{const out=[];
    const dEdge=(q,P)=>{let m=1e9;for(let i=0;i<P.length;i++){const a=P[i],c=P[(i+1)%P.length],dx=c[0]-a[0],dy=c[1]-a[1],t=Math.max(0,Math.min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dy)/(dx*dx+dy*dy||1)));m=Math.min(m,Math.hypot(a[0]+t*dx-q[0],a[1]+t*dy-q[1]));}return m;};
    // 출입부·캐노피·전실을 포함한 크기라고 설명(est)에 적힌 텐트는 외곽보다 길 수 있어요
    const EXT=/출입부|캐노피|전실|베스티블|포치|타프 포함|앞 확장/;
    Object.entries(TENTS).forEach(([id,T])=>{if(id==='none')return;
      if(!(T.href||T.src))out.push([id,'출처 링크 없음']);
      if(!T.outer){return;}
      if(!Array.isArray(T.size)||T.size.length<3||T.size.some(v=>!(v>0)))out.push([id,'size(길이·폭·높이) 빠짐']);
      const bb=bbox(T.outer),bx=(bb[1][0]-bb[0][0])/10,by=(bb[1][1]-bb[0][1])/10,[L,W]=T.size,tol=.06;
      const ok=(a,b)=>Math.abs(a-b)<=b*tol;
      const c0=centroid(T.outer),dia=2*Math.max(...T.outer.map(v=>Math.hypot(v[0]-c0[0],v[1]-c0[1])))/10;// 다각형은 꼭짓점 사이 지름으로 적기도 해요
      if(!((ok(bx,L)&&ok(by,W))||(ok(bx,W)&&ok(by,L))||(L===W&&ok(dia,L)))){const ext=EXT.test(T.est||'')&&(ok(by,W)||ok(bx,W)||ok(bx,L)||ok(by,L));
        if(!ext)out.push([id,`도면 외곽 ${bx.toFixed(0)}×${by.toFixed(0)} ≠ 크기 ${L}×${W}`]);}
      Object.entries(T.inners||{}).forEach(([k,v])=>{if(v.poly&&!v.poly.every(q=>pointInPoly(q,T.outer)||dEdge(q,T.outer)<=50))out.push([id,`이너 ${k}가 텐트 밖으로 5cm 넘게 나감`]);});
    });
    Object.entries(GEAR).forEach(([id,g])=>{if(!(g.w>0&&g.d>0&&g.h>0))out.push([id,'장비 크기 빠짐']);if(!(g.href||g.src))out.push([id,'장비 출처 없음']);});
    Object.entries(INNER_PRESETS).forEach(([id,P])=>{if(!(P.w>0&&P.d>0&&P.h>0))out.push(['inner:'+id,'이너 프리셋 크기 빠짐']);});
    return out;});
  await b.close();srv.close();
  if(res.length){console.log(`제원 검사: 문제 ${res.length}개`);res.forEach(([i,m])=>console.log(' -',i,m));process.exit(1);}
  console.log('제원 검사: 문제 없음');});
